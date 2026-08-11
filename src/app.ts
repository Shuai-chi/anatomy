import { PointerDragBehavior } from "@babylonjs/core/Behaviors/Meshes/pointerDragBehavior";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
// Without this side-effect import scene.pick() silently returns hit:false forever.
import "@babylonjs/core/Culling/ray";
import { Engine } from "@babylonjs/core/Engines/engine";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Observer } from "@babylonjs/core/Misc/observable";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
// public/ is the single source of truth for exercise and muscle data. src/data/ held a
// stale copy whose citations and two engagement_caveat texts predate the last review
// round, and whose strings therefore miss the i18n catalogue.
import chestExercises from "../public/exercises.json";
import chestMuscles from "../public/muscles.json";
import fullbodyExercises from "../public/fullbody_exercises.json";
import fullbodyMuscles from "../public/fullbody_muscles.json";
import {
  composeQuaternion, createJointModel, effectiveLimit, isAtLimit, resetJoint, setDof, solveSwing,
  type JointAxesFile, type JointModel, type RomContext,
} from "./joints";
import { dofLabel, jointLabel, translate, ui, untranslated, type Language } from "./i18n";

type Layer = "bone" | "muscle" | "fascia";
type Role = "prime_mover" | "synergist" | "stabilizer";
type Facing = "front" | "back" | "left" | "right";

interface Engagement { muscle_id: string; role: Role; note?: string }
interface Exercise {
  exercise_id: string; name_en: string; name_zh: string; equipment_type: string; movement_plane: string;
  joint_actions: string[]; muscle_engagement: Engagement[]; colloquial_region_tag: string; engagement_caveat?: string;
}
interface Muscle { muscle_id: string; common_name_zh?: string; common_name_en?: string; ta_name?: string }
interface MeshMapEntry { prefixes: string[]; meshes: string[] }
interface SegmentConfig { parent: string | null; pivot: [number, number, number] | null; meshes: string[] }
interface RigConfig { segments: Record<string, SegmentConfig>; meta: Record<string, unknown> }
interface SegmentRuntime { config: SegmentConfig; node: TransformNode; control: Mesh | null }
interface PoseEntry {
  start: Record<string, Record<string, number>>;
  end: Record<string, Record<string, number>>;
  camera_hint?: string; note?: string; is_schematic?: boolean; is_isometric?: boolean; confidence?: string;
  /** Closed-kinetic-chain, feet-planted exercises only (squat/deadlift) -- see applyPelvisGrounding(). */
  pelvis_grounded?: boolean;
}
interface JointLimitReport {
  segment: string; joint_type: string; driveable: boolean; reason?: string;
  dof: Array<{ axis: string; min: number; max: number; current: number; at_limit: boolean; confidence?: string }>;
}
interface DebugWindow extends Window {
  __ready?: boolean;
  __scene?: Scene;
  __exercises?: () => string[];
  __selectExercise?: (id: string) => boolean;
  __muscleColorOf?: (id: string) => string | null;
  __caveatVisible?: () => boolean;
  __pickAt?: (x: number, y: number) => string | null;
  __setJointAngle?: (segmentId: string, axisName: string, deg: number) => number | null;
  __getJointLimits?: (segmentId: string) => JointLimitReport | null;
  __jointAngles?: (segmentId: string) => Record<string, number> | null;
  __setPosePhase?: (t: number) => void;
  __playPose?: () => boolean;
  __isPlaying?: () => boolean;
  __cameraFacing?: () => Facing;
  __setLayer?: (layer: Layer, on: boolean) => boolean;
  __visibleCountByLayer?: () => Record<Layer, number>;
  __lang?: (code: string) => boolean;
  __untranslatedStrings?: () => string[];
}

const ROLE_HEX: Record<Role, string> = { prime_mover: "#ef4444", synergist: "#f59e0b", stabilizer: "#3b82f6" };
const INACTIVE_HEX = "#754545";
const GROUPS = ["胸", "背", "肩", "手臂", "腿", "核心"] as const;
const GROUP_EN: Record<string, string> = { 胸: "Chest", 背: "Back", 肩: "Shoulders", 手臂: "Arms", 腿: "Legs", 核心: "Core" };
/** pose_data.json DOF name -> the DOF name used in joint_axes.json `rom`. */
const POSE_DOF: Record<string, string> = {
  flexion: "flexion_extension",
  abduction: "abduction_adduction",
  horizontal_adduction: "horizontal_adduction",
  plantarflexion: "dorsi_plantarflexion",
  internal_rotation: "internal_external_rotation",
  external_rotation: "internal_external_rotation",
};
/** Torso has pivot:null in rig_config.json; this mesh marks the thoracolumbar seam. */
const TORSO_PIVOT_MESH = "Intervertebral disc T12-L1";
/** A muscle whose *name* contains "fascia". Without this it is classified as fascia and hidden. */
const MUSCLE_NAMED_LIKE_FASCIA = /tensor fasciae latae/i;
const PLAY_PERIOD_MS = 2800;

const canvas = required<HTMLCanvasElement>("#renderCanvas");
const languageEl = required<HTMLSelectElement>("#language");
const selectEl = required<HTMLSelectElement>("#exercise");
const poseSlider = required<HTMLInputElement>("#posePhase");
const poseCaption = required<HTMLDivElement>("#poseCaption");
const poseNoteEl = required<HTMLDivElement>("#poseNote");
const playButton = required<HTMLButtonElement>("#playPose");
const metaEl = required<HTMLDivElement>("#meta");
const musclesEl = required<HTMLDivElement>("#muscles");
const caveatEl = required<HTMLDivElement>("#caveat");
const romSelectEl = required<HTMLSelectElement>("#romJoint");
const romListEl = required<HTMLDivElement>("#romList");
const romBadgeEl = required<HTMLDivElement>("#romBadge");
const selectedMeshEl = required<HTMLSpanElement>("#selectedMesh");
const draggedJointEl = required<HTMLSpanElement>("#draggedJoint");
const statusEl = required<HTMLDivElement>("#status");
const hintEl = required<HTMLDivElement>("#hint");
const resetButton = required<HTMLButtonElement>("#resetPose");

const engine = new Engine(canvas, true, { adaptToDeviceRatio: true, preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.043, 0.063, 0.125, 1);
const camera = new ArcRotateCamera("fullBodyCamera", Math.PI / 2, Math.PI / 2.2, 2.65, new Vector3(0, 0.88, 0), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 0.35; camera.upperRadiusLimit = 6; camera.wheelPrecision = 90; camera.panningSensibility = 0;
// The model is at true human scale; the default near plane clips the whole body away.
camera.minZ = 0.001; camera.maxZ = 100;
new HemisphericLight("ambientLight", new Vector3(0.15, 1, -0.3), scene).intensity = 1.05;
new DirectionalLight("keyLight", new Vector3(-0.55, -1, 0.65), scene).intensity = 0.75;

const controlMaterial = material("jointControl", "#fb923c", "#7c2d12", 1);
const activeControlMaterial = material("jointControlActive", "#fde047", "#a16207", 1);
const limitControlMaterial = material("jointControlLimit", "#ef4444", "#7f1d1d", 1);
const lockedControlMaterial = material("jointControlLocked", "#64748b", "#1e293b", 0.55);
const inactiveMaterial = material("inactiveMuscle", INACTIVE_HEX, "#321818", 0.92);
const roleMaterials = new Map<Role, StandardMaterial>();

const anatomyMeshes: AbstractMesh[] = [];
const layerByMesh = new Map<AbstractMesh, Layer>();
const controlSegmentByMesh = new Map<AbstractMesh, string>();
const meshMuscleIds = new Map<AbstractMesh, string[]>();
const meshesByMuscle = new Map<string, AbstractMesh[]>();
const segmentRuntime = new Map<string, SegmentRuntime>();
const jointModels = new Map<string, JointModel>();
const originOverrides = new Map<string, Vector3>();
const layerCheckboxes: Record<Layer, HTMLInputElement> = {
  bone: required<HTMLInputElement>("#layerBone"),
  muscle: required<HTMLInputElement>("#layerMuscle"),
  fascia: required<HTMLInputElement>("#layerFascia"),
};
const muscleById = new Map<string, Muscle>(
  [...(chestMuscles as Muscle[]), ...(fullbodyMuscles as Muscle[])].map((m) => [m.muscle_id, m]),
);
const exercises = [...(chestExercises as Exercise[]), ...(fullbodyExercises as Exercise[])];

let poseData: Record<string, PoseEntry> = {};
let selectedExercise: Exercise | null = null;
let activeDrag: { segmentId: string; pivotWorld: Vector3; controlHome: Vector3; targetWorld: Vector3 } | null = null;
let language: Language = "zh";
let posePhase = 0;
let cameraFacing: Facing = "front";
let playHandle: Observer<Scene> | null = null;
let playStartedAt = 0;
let lastRomRenderAt = 0;
let focusedJoint = "";
let lastPickedMesh: AbstractMesh | null = null;
let loadedMeshCount = 0;
let missingMuscleMaps = 0;
let torsoPivotFound = false;
/** ankle.r's world position at rest (all joints identity), cached once at load. See applyPelvisGrounding(). */
let standingAnkleWorld: Vector3 | null = null;

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
void initialise().catch((error: unknown) => {
  statusEl.textContent = `${ui(language, "Load failed")}：${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});

async function initialise(): Promise<void> {
  const [rigResponse, mapResponse, axesResponse, poseResponse, imported] = await Promise.all([
    fetch("/rig_config.json"), fetch("/mesh_map.json"), fetch("/joint_axes.json"), fetch("/pose_data.json"),
    SceneLoader.ImportMeshAsync("", "/", "fullbody_lite.glb", scene),
  ]);
  for (const [name, response] of [["rig_config", rigResponse], ["mesh_map", mapResponse], ["joint_axes", axesResponse], ["pose_data", poseResponse]] as const) {
    if (!response.ok) throw new Error(`${name}.json ${response.status}`);
  }
  const rig = await rigResponse.json() as RigConfig;
  const meshMap = await mapResponse.json() as Record<string, MeshMapEntry>;
  const jointAxes = await axesResponse.json() as JointAxesFile;
  poseData = await poseResponse.json() as Record<string, PoseEntry>;
  validateRig(rig);

  const importedMeshes = (imported.meshes as AbstractMesh[]).filter((m) => m.name !== "__root__");
  // Anatomy is unpickable by default so joint controls stay the only drag targets;
  // pickAnatomy() flips it on for the duration of a single pick.
  for (const mesh of importedMeshes) mesh.isPickable = false;
  scene.constantlyUpdateMeshUnderPointer = true;

  deriveTorsoPivot(importedMeshes);
  for (const id of Object.keys(rig.segments)) createSegment(id, rig, new Set<string>());
  createJointModels(rig, jointAxes);
  // Every joint is still at rotationQuaternion identity here (selectExercise(), which
  // applies the first pose, hasn't run yet) -- this is the one moment the standing rest
  // pose is guaranteed, so it is the only correct place to cache the reference position.
  const standingAnkle = segmentRuntime.get("ankle.r");
  if (standingAnkle) { standingAnkle.node.computeWorldMatrix(true); standingAnkleWorld = standingAnkle.node.getAbsolutePosition().clone(); }
  loadedMeshCount = assignMeshes(rig, importedMeshes);
  mapMuscles(meshMap);
  createJointControls(rig);
  installLayerControls();
  installPicking();
  installReset();
  installPoseControls();
  installLanguageControls();
  installRomControls();
  populateExercises();
  installDebugHooks();
  applyLayerVisibility();

  missingMuscleMaps = Object.values(meshMap).flatMap((entry) => entry.meshes)
    .filter((prefix) => !importedMeshes.some((m) => m.name.startsWith(prefix))).length;
  selectExercise(exercises[0]?.exercise_id ?? "");
  applyStaticLabels();
  (window as DebugWindow).__scene = scene;
  (window as DebugWindow).__ready = true;
}

// ── rig ───────────────────────────────────────────────────────────────────────

/**
 * rig_config.json gives segment "torso" pivot:null, so torso rotation used to be a
 * silent no-op and every bent-over lift rendered as limbs only. L1-L5 and the sacrum
 * belong to the *pelvis* segment, so the T12-L1 disc is the real seam. Derived from the
 * mesh AABB rather than hardcoded, and applied as a runtime override so
 * public/rig_config.json is not modified.
 */
function deriveTorsoPivot(imported: AbstractMesh[]): void {
  const disc = imported.find((mesh) => mesh.name.startsWith(TORSO_PIVOT_MESH));
  if (!disc) return;
  disc.computeWorldMatrix(true);
  originOverrides.set("torso", disc.getBoundingInfo().boundingBox.centerWorld.clone());
  torsoPivotFound = true;
}

function createSegment(id: string, config: RigConfig, visiting: Set<string>): SegmentRuntime {
  const existing = segmentRuntime.get(id);
  if (existing) return existing;
  if (visiting.has(id)) throw new Error(`rig_config 存在循環 parent：${id}`);
  const segment = config.segments[id];
  if (!segment) throw new Error(`segment 缺失：${id}`);
  visiting.add(id);
  const parent = segment.parent ? createSegment(segment.parent, config, visiting) : null;
  const node = new TransformNode(`segment:${id}`, scene);
  if (parent) node.parent = parent.node;
  const origin = segmentOrigin(id, config);
  const parentOrigin = segment.parent ? segmentOrigin(segment.parent, config) : Vector3.Zero();
  node.position.copyFrom(origin.subtract(parentOrigin));
  node.rotationQuaternion = Quaternion.Identity();
  const runtime: SegmentRuntime = { config: segment, node, control: null };
  segmentRuntime.set(id, runtime);
  visiting.delete(id);
  return runtime;
}

function isJointSegment(id: string, config: RigConfig): boolean {
  return Boolean(config.segments[id]?.pivot) || originOverrides.has(id);
}

function createJointModels(config: RigConfig, jointAxes: JointAxesFile): void {
  for (const id of Object.keys(config.segments)) {
    if (!isJointSegment(id, config)) continue;
    const rom = jointAxes[id]?.rom;
    jointModels.set(id, createJointModel(id, restDirection(id, config), rom));
  }
}

function assignMeshes(config: RigConfig, imported: AbstractMesh[]): number {
  const assigned = new Set<AbstractMesh>();
  for (const [id, segment] of Object.entries(config.segments)) {
    const runtime = segmentRuntime.get(id);
    if (!runtime) continue;
    // glTF export splits an object into <name>_primitive0/1: always match by prefix.
    for (const prefix of segment.meshes) {
      for (const mesh of imported.filter((item) => item.name.startsWith(prefix))) {
        if (assigned.has(mesh)) continue;
        mesh.computeWorldMatrix(true);
        mesh.setParent(runtime.node);
        mesh.isPickable = false;
        const layer = classifyLayer(mesh.name);
        if (layer === "muscle") mesh.material = inactiveMaterial;
        assigned.add(mesh);
        anatomyMeshes.push(mesh);
        layerByMesh.set(mesh, layer);
      }
    }
  }
  return assigned.size;
}

function mapMuscles(meshMap: Record<string, MeshMapEntry>): void {
  for (const [id, entry] of Object.entries(meshMap)) {
    const matches = anatomyMeshes.filter((mesh) => entry.meshes.some((prefix) => mesh.name.startsWith(prefix)));
    meshesByMuscle.set(id, matches);
    for (const mesh of matches) {
      meshMuscleIds.set(mesh, [...(meshMuscleIds.get(mesh) ?? []), id]);
      mesh.material = inactiveMaterial;
    }
  }
}

function createJointControls(config: RigConfig): void {
  for (const [id, segment] of Object.entries(config.segments)) {
    if (!isJointSegment(id, config)) continue;
    const runtime = segmentRuntime.get(id);
    const model = jointModels.get(id);
    if (!runtime || !model) continue;
    const control = MeshBuilder.CreateSphere(`joint-control:${id}`, { diameter: 0.055, segments: 16 }, scene);
    control.material = model.driveable ? controlMaterial : lockedControlMaterial;
    control.isPickable = true;
    control.alwaysSelectAsActiveMesh = true;
    control.renderingGroupId = 2;
    const parent = segment.parent ? segmentRuntime.get(segment.parent) : null;
    if (parent) control.parent = parent.node;
    control.position.copyFrom(runtime.node.position);
    runtime.control = control;
    controlSegmentByMesh.set(control, id);
    if (!model.driveable) continue;

    const drag = new PointerDragBehavior();
    drag.detachCameraControls = true;
    drag.dragDeltaRatio = 1;
    drag.moveAttached = false;
    drag.useObjectOrientationForDragging = false;
    control.addBehavior(drag);
    drag.onDragStartObservable.add(() => {
      stopPlay();
      runtime.node.computeWorldMatrix(true);
      activeDrag = {
        segmentId: id,
        pivotWorld: runtime.node.getAbsolutePosition().clone(),
        controlHome: runtime.node.position.clone(),
        targetWorld: runtime.node.getAbsolutePosition().clone(),
      };
      control.material = activeControlMaterial;
      canvas.style.cursor = "grabbing";
      focusJoint(id);
    });
    drag.onDragObservable.add((event) => {
      if (!activeDrag || activeDrag.segmentId !== id) return;
      activeDrag.targetWorld.addInPlace(event.delta);
      control.setAbsolutePosition(activeDrag.targetWorld);
      rotateJoint(id, control, activeDrag.pivotWorld);
      control.material = isAtLimit(model) ? limitControlMaterial : activeControlMaterial;
      renderRom();
    });
    drag.onDragEndObservable.add(() => {
      if (activeDrag?.segmentId === id) {
        control.position.copyFrom(activeDrag.controlHome);
        activeDrag = null;
      }
      control.material = isAtLimit(model) ? limitControlMaterial : controlMaterial;
      canvas.style.cursor = "default";
      draggedJointEl.textContent = ui(language, "None");
    });
  }
}

/** Drag → clamped (abduction, flexion) inside the joint's cone. */
function rotateJoint(segmentId: string, control: Mesh, pivotWorld: Vector3): void {
  const runtime = segmentRuntime.get(segmentId);
  const model = jointModels.get(segmentId);
  if (!runtime || !model) return;
  const world = control.getAbsolutePosition().subtract(pivotWorld);
  if (world.lengthSquared() < 1e-7) return;
  const local = world.clone();
  if (runtime.node.parent) {
    const inverse = new Matrix();
    (runtime.node.parent as TransformNode).computeWorldMatrix(true).invertToRef(inverse);
    Vector3.TransformNormalToRef(world, inverse, local);
  }
  solveSwing(model, local, contextFor(segmentId));
  applyJointRotation(segmentId);
}

function applyJointRotation(segmentId: string): void {
  const runtime = segmentRuntime.get(segmentId);
  const model = jointModels.get(segmentId);
  if (!runtime || !model) return;
  runtime.node.rotationQuaternion = composeQuaternion(model);
  runtime.node.computeWorldMatrix(true);
  const control = runtime.control;
  // Item 1's visual feedback: the handle turns red the moment the joint is pinned to a
  // limit. Skipped while that same handle is mid-drag, which owns its own colour.
  if (control && model.driveable && activeDrag?.segmentId !== segmentId) {
    control.material = isAtLimit(model) ? limitControlMaterial : controlMaterial;
  }
}

function applyAllJointRotations(): void {
  for (const id of jointModels.keys()) applyJointRotation(id);
}

/** Coupled limits need the same-side knee angle (hamstring / gastrocnemius couplings). */
function contextFor(segmentId: string): RomContext {
  const side = segmentId.split(".")[1];
  const knee = side ? jointModels.get(`knee.${side}`) : null;
  return { kneeFlexion: knee?.angles.get("flexion_extension") ?? 0 };
}

// ── exercise + pose ───────────────────────────────────────────────────────────

function populateExercises(): void {
  selectEl.replaceChildren();
  const grouped = new Map<string, Exercise[]>();
  for (const group of GROUPS) grouped.set(group, []);
  for (const ex of exercises) (grouped.get(groupFor(ex)) ?? grouped.get("核心")!).push(ex);
  for (const group of GROUPS) {
    const items = grouped.get(group) ?? [];
    if (!items.length) continue;
    const optgroup = document.createElement("optgroup");
    optgroup.label = language === "zh" ? group : GROUP_EN[group] ?? group;
    for (const ex of items) {
      const option = document.createElement("option");
      option.value = ex.exercise_id;
      option.textContent = language === "zh" ? ex.name_zh : ex.name_en;
      optgroup.append(option);
    }
    selectEl.append(optgroup);
  }
  selectEl.onchange = () => selectExercise(selectEl.value);
}

function groupFor(exercise: Exercise): string {
  const text = `${exercise.colloquial_region_tag} ${exercise.name_zh}`;
  if (/二頭肌|三頭肌|前臂|彎舉/.test(text)) return "手臂";
  if (/胸/.test(text)) return "胸";
  if (/背|闊|斜方|菱形|划船|引體/.test(text)) return "背";
  if (/肩|三角|束/.test(text)) return "肩";
  if (/腿|臀|股|小腿|蹲|硬舉|推蹬/.test(text)) return "腿";
  return "核心";
}

function selectExercise(id: string): boolean {
  const exercise = exercises.find((item) => item.exercise_id === id);
  if (!exercise) return false;
  stopPlay();
  selectedExercise = exercise;
  selectEl.value = id;
  const roles = new Map(exercise.muscle_engagement.map((item) => [item.muscle_id, item.role]));
  for (const [muscleId, meshes] of meshesByMuscle) {
    const role = roles.get(muscleId);
    for (const mesh of meshes) mesh.material = role ? roleMaterial(role) : inactiveMaterial;
  }
  renderInfo(exercise);
  // Item 2: land on the START pose, never on the anatomical standing pose.
  applyPosePhase(0);
  aimCamera(exercise);
  renderRom();
  return true;
}

function poseFor(exerciseId: string): PoseEntry | null {
  const entry = poseData[exerciseId];
  return entry && entry.start && entry.end ? entry : null;
}

/** Interpolates every DOF between the start and end pose and clamps each to its ROM. */
function applyPosePhase(value: number): void {
  posePhase = clampNumber(value, 0, 1);
  poseSlider.value = String(posePhase);
  for (const model of jointModels.values()) resetJoint(model);

  const pose = selectedExercise ? poseFor(selectedExercise.exercise_id) : null;
  if (pose) {
    const segments = [...new Set([...Object.keys(pose.start), ...Object.keys(pose.end)])];
    // Knees first: the hip and ankle limits are functions of the knee angle.
    segments.sort((a, b) => Number(b.startsWith("knee")) - Number(a.startsWith("knee")));
    for (const segmentId of segments) {
      const model = jointModels.get(segmentId);
      if (!model) continue;
      const start = pose.start[segmentId] ?? {};
      const end = pose.end[segmentId] ?? {};
      for (const dof of new Set([...Object.keys(start), ...Object.keys(end)])) {
        const axis = POSE_DOF[dof];
        if (!axis) continue;
        // Values are per-side absolute magnitudes and are already correct for each side;
        // the axis is mirrored in joints.ts, the numbers are never negated.
        const from = start[dof] ?? 0;
        const to = end[dof] ?? 0;
        setDof(model, axis, from + (to - from) * posePhase, contextFor(segmentId));
      }
    }
  }
  applyAllJointRotations();
  applyPelvisGrounding(pose);
  renderPoseCaption(pose);
  // renderRom() rebuilds DOM; during playback that runs every frame, so throttle it.
  const now = performance.now();
  if (playHandle === null || now - lastRomRenderAt > 100) { lastRomRenderAt = now; renderRom(); }
}

/**
 * v3 follow-up: the pelvis is a fixed root with no translation, so hip flexion swings the
 * leg up/forward instead of lowering the body -- a squat's "bottom" position looks like
 * sitting because the foot lifts off the ground (this was previously disclosed in-app as
 * a known limitation; see the plan doc's Stage H risk table). For exercises explicitly
 * marked pelvis_grounded (closed-kinetic-chain, feet-on-ground movements: squat, deadlift
 * -- NOT seated/lying machine exercises like leg press/extension/curl or hip thrust, where
 * the pelvis rests on a bench/seat rather than the feet), translate the whole pelvis so
 * the ankle returns to its standing world position after the leg's joint rotations are
 * applied. Solved from the right leg only: every pelvis_grounded exercise in the dataset
 * is bilaterally symmetric, so one leg's correction is valid for both.
 */
function applyPelvisGrounding(pose: PoseEntry | null): void {
  const pelvisRuntime = segmentRuntime.get("pelvis");
  if (!pelvisRuntime) return;
  pelvisRuntime.node.position.set(0, 0, 0);
  pelvisRuntime.node.computeWorldMatrix(true);
  const ankleRuntime = segmentRuntime.get("ankle.r");
  if (!pose?.pelvis_grounded || !ankleRuntime || !standingAnkleWorld) return;
  ankleRuntime.node.computeWorldMatrix(true);
  const correction = standingAnkleWorld.subtract(ankleRuntime.node.getAbsolutePosition());
  pelvisRuntime.node.position.copyFrom(correction);
  pelvisRuntime.node.computeWorldMatrix(true);
}

/**
 * `pose_data.json` notes are locked developer-verified content (rig/ROM caveats) and are
 * never edited in place. A handful of them embed raw field names and English kinesiology
 * terms in the middle of an otherwise-Chinese sentence (e.g. "用 horizontal_adduction 而非
 * flexion 是照 joint_actions 寫的") -- caught by an adversarial review because
 * `__untranslatedStrings()` only flags strings with NO CJK at all, so a Chinese sentence
 * with English words stitched in slips past it. This is a display-time term swap, not a
 * data edit: the underlying note string is untouched, only what's rendered changes.
 * Order matters -- compound phrases must match before their component words do.
 */
const NOTE_TERM_FIXES: Array<[RegExp, string]> = [
  [/\s*「shoulder horizontal adduction」\s*/g, "「肩水平內收」"],
  [/\s*elbow slight flexion \(isometric\)\s*/g, "肘部輕微屈曲（等長收縮）"],
  [/\s*isometric spinal stabilization\s*/g, "等長脊椎穩定"],
  [/\s*horizontal_adduction\s*/g, "水平內收"],
  [/\s*horizontal adduction\s*/g, "水平內收"],
  [/\s*shoulder adduction\s*/g, "肩內收"],
  [/\s*joint_actions\s*/g, "動作定義"],
  [/\s*torso\.flexion\s*/g, "軀幹屈曲欄位"],
  [/\s*_meta\.torso_caveat\s*/g, "軀幹替身說明"],
  [/\s*flexion\s*/g, "屈曲"],
  [/\s*abduction\s*/g, "外展"],
  [/\s*\bform\b\s*/g, "姿勢"],
  [/\s*torso\s*/g, "軀幹"],
  [/\s*pivot\s*/g, "支點"],
  [/\s*wrist\s*/g, "腕部"],
  [/\s*rig\s*/g, "骨架模型"],
  [/\s*unmodelled\s*/g, "未建模"],
  [/\s*\bbug\b\s*/g, "問題"],
];

function cleanPoseNote(note: string): string {
  return NOTE_TERM_FIXES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), note);
}

function renderPoseCaption(pose: PoseEntry | null): void {
  const label = posePhase < 0.5
    ? ui(language, "Start pose → end pose")
    : ui(language, "End pose ← start pose");
  const percent = Math.round(posePhase * 100);
  poseCaption.textContent = `${label} · ${percent}%`;
  const rawNote = language === "zh" ? pose?.note?.trim() : "";
  const note = rawNote ? cleanPoseNote(rawNote) : rawNote;
  poseNoteEl.hidden = !note;
  poseNoteEl.textContent = note ?? "";
  if (pose?.is_isometric && !note) {
    poseNoteEl.hidden = false;
    poseNoteEl.textContent = ui(language, "Isometric — start and end pose are the same by design.");
  }
}

/**
 * Item 2: ping-pong between the start and end pose so the direction of the movement is
 * visible without touching the slider. Driven from the render loop rather than a timer,
 * so the pose can never advance faster than it is drawn. Phase is derived from the wall
 * clock, so a dropped frame shifts nothing.
 */
function playPose(): boolean {
  if (playHandle !== null) { stopPlay(); return false; }
  playStartedAt = performance.now();
  playHandle = scene.onBeforeRenderObservable.add(() => {
    const raw = ((performance.now() - playStartedAt) % PLAY_PERIOD_MS) / PLAY_PERIOD_MS;
    const pingPong = raw < 0.5 ? raw * 2 : (1 - raw) * 2;
    applyPosePhase(pingPong * pingPong * (3 - 2 * pingPong));
  });
  playButton.textContent = ui(language, "Pause");
  return true;
}

function stopPlay(): void {
  if (playHandle === null) return;
  scene.onBeforeRenderObservable.remove(playHandle);
  playHandle = null;
  playButton.textContent = ui(language, "Play");
}

/** Item 2: turn the camera to the side the prime movers are on, using camera_hint. */
function aimCamera(exercise: Exercise): void {
  const primes = exercise.muscle_engagement.filter((entry) => entry.role === "prime_mover");
  const meshes = primes.flatMap((entry) => meshesByMuscle.get(entry.muscle_id) ?? []);
  if (meshes.length) {
    const center = Vector3.Zero();
    for (const mesh of meshes) {
      mesh.computeWorldMatrix(true);
      center.addInPlace(mesh.getBoundingInfo().boundingBox.centerWorld);
    }
    camera.target.copyFrom(center.scaleInPlace(1 / meshes.length));
  }
  const hint = poseFor(exercise.exercise_id)?.camera_hint;
  const facing: Facing = hint === "back" || hint === "front" || hint === "left" || hint === "right"
    ? hint
    : primes.some((entry) => /latissimus|rhomboid|trapezius|erector|gluteus|hamstring|gastrocnemius/.test(entry.muscle_id))
      ? "back" : "front";
  camera.alpha = { front: Math.PI / 2, back: -Math.PI / 2, left: Math.PI, right: 0 }[facing];
  cameraFacing = facing;
}

// ── panels ────────────────────────────────────────────────────────────────────

function renderInfo(exercise: Exercise): void {
  metaEl.replaceChildren(
    row(ui(language, "Equipment"), translate(exercise.equipment_type, language, "equipment")),
    row(ui(language, "Movement plane"), translate(exercise.movement_plane, language, "planes")),
    row(ui(language, "Joint actions"), exercise.joint_actions
      .map((action) => translate(action, language, "joint_actions"))
      .join(language === "zh" ? "；" : "; ")),
  );
  musclesEl.replaceChildren(...exercise.muscle_engagement.map((entry) => {
    const muscle = muscleById.get(entry.muscle_id);
    const item = document.createElement("div");
    item.className = "muscle";
    const top = document.createElement("div");
    top.className = "muscle-top";
    const swatch = document.createElement("i");
    swatch.className = "swatch";
    swatch.style.background = ROLE_HEX[entry.role];
    const name = document.createElement("span");
    name.className = "mname";
    name.textContent = language === "zh"
      ? muscle?.common_name_zh ?? entry.muscle_id
      : muscle?.common_name_en ?? entry.muscle_id;
    const role = document.createElement("span");
    role.className = "mrole";
    role.textContent = translate(entry.role, language, "roles");
    top.append(swatch, name, role);
    item.append(top);
    if (entry.note) {
      const note = document.createElement("div");
      note.className = "mnote";
      note.textContent = translate(entry.note, language, "notes");
      item.append(note);
    }
    return item;
  }));
  const caveat = exercise.engagement_caveat?.trim();
  caveatEl.hidden = !caveat;
  caveatEl.replaceChildren();
  if (caveat) {
    const title = document.createElement("strong");
    title.textContent = ui(language, "Evidence caveat");
    caveatEl.append(title, document.createTextNode(translate(caveat, language, "notes")));
  }
}

function installRomControls(): void {
  romSelectEl.onchange = () => { focusedJoint = romSelectEl.value; renderRom(); };
  populateRomSelect();
}

function populateRomSelect(): void {
  romSelectEl.replaceChildren();
  for (const id of jointModels.keys()) {
    const option = document.createElement("option");
    option.value = id;
    const model = jointModels.get(id)!;
    const [open, close] = language === "zh" ? ["（", "）"] : [" (", ")"];
    option.textContent = model.driveable
      ? jointLabel(id, language)
      : `${jointLabel(id, language)}${open}${ui(language, "Locked")}${close}`;
    romSelectEl.append(option);
  }
  if (!focusedJoint) focusedJoint = jointModels.has("shoulder.l") ? "shoulder.l" : [...jointModels.keys()][0] ?? "";
  romSelectEl.value = focusedJoint;
}

function focusJoint(id: string): void {
  focusedJoint = id;
  romSelectEl.value = id;
  draggedJointEl.textContent = jointLabel(id, language);
  renderRom();
}

function renderRom(): void {
  const model = jointModels.get(focusedJoint);
  romListEl.replaceChildren();
  if (!model) { romBadgeEl.hidden = true; return; }
  if (!model.driveable) {
    romBadgeEl.hidden = false;
    romBadgeEl.className = "rom-badge locked";
    romBadgeEl.textContent = `${ui(language, "Not modelled")} · ${ui(language, "This joint has no derived rotation axis and is locked.")}`;
  } else {
    const limited = isAtLimit(model);
    romBadgeEl.hidden = false;
    romBadgeEl.className = limited ? "rom-badge limit" : "rom-badge ok";
    romBadgeEl.textContent = limited ? ui(language, "Joint limit reached") : ui(language, "Within range");
  }
  const context = contextFor(focusedJoint);
  for (const axis of model.order) {
    const { min, max } = effectiveLimit(model, axis, context);
    const current = model.angles.get(axis) ?? 0;
    const line = document.createElement("div");
    line.className = model.atLimit.has(axis) ? "rom-row at-limit" : "rom-row";
    const label = document.createElement("span");
    label.className = "rom-name";
    label.textContent = dofLabel(axis, language);
    const value = document.createElement("span");
    value.className = "rom-value";
    value.textContent = `${current.toFixed(0)}°`;
    const range = document.createElement("span");
    range.className = "rom-range";
    range.textContent = `${min.toFixed(0)}° … ${max.toFixed(0)}°`;
    const bar = document.createElement("i");
    bar.className = "rom-bar";
    const span = Math.max(max - min, 1e-6);
    bar.style.setProperty("--fill", `${clampNumber(((current - min) / span) * 100, 0, 100)}%`);
    line.append(label, value, range, bar);
    romListEl.append(line);
  }
}

function row(key: string, value: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "row";
  const k = document.createElement("span");
  k.className = "key";
  k.textContent = key;
  const v = document.createElement("span");
  v.className = "value";
  v.textContent = value;
  element.append(k, v);
  return element;
}

// ── layers, picking, controls ────────────────────────────────────────────────

/**
 * Item 4. Previously the only call to setEnabled lived inside the checkbox `change`
 * listener, so the unchecked "fascia" default in index.html was never applied at load
 * (fascia rendered visible from the first frame) and any programmatic `.checked = false`
 * that did not dispatch a change event was a no-op. Visibility is now derived from the
 * checkboxes by one idempotent function, called at startup and by __setLayer().
 */
function applyLayerVisibility(): void {
  for (const mesh of anatomyMeshes) {
    const layer = layerByMesh.get(mesh);
    if (layer) mesh.setEnabled(layerCheckboxes[layer].checked);
  }
}

function installLayerControls(): void {
  for (const input of Object.values(layerCheckboxes)) input.addEventListener("change", applyLayerVisibility);
}

function setLayer(layer: Layer, on: boolean): boolean {
  const input = layerCheckboxes[layer];
  if (!input) return false;
  input.checked = on;
  applyLayerVisibility();
  return true;
}

function countVisible(layer: Layer): number {
  return anatomyMeshes.filter((mesh) => layerByMesh.get(mesh) === layer && mesh.isEnabled()).length;
}

/** Anatomy is unpickable so drags cannot be stolen; flip it on for one pick only. */
function pickAnatomy(x: number, y: number): AbstractMesh | null {
  for (const mesh of anatomyMeshes) mesh.isPickable = true;
  const info = scene.pick(x, y, (mesh) =>
    layerByMesh.has(mesh) ? mesh.isEnabled() && mesh.isVisible : controlSegmentByMesh.has(mesh));
  for (const mesh of anatomyMeshes) mesh.isPickable = false;
  return info?.pickedMesh ?? null;
}

function installPicking(): void {
  scene.onPointerObservable.add((info) => {
    if (info.type !== PointerEventTypes.POINTERTAP) return;
    // Controls win ties: a joint sphere sits *inside* the limb, so a depth-ordered pick
    // would always hand back the muscle covering it.
    const control = scene.pick(scene.pointerX, scene.pointerY, (mesh) => controlSegmentByMesh.has(mesh)).pickedMesh;
    const controlSegment = control ? controlSegmentByMesh.get(control) : undefined;
    if (controlSegment) { focusJoint(controlSegment); return; }
    const mesh = pickAnatomy(scene.pointerX, scene.pointerY);
    if (!mesh || controlSegmentByMesh.has(mesh)) return;
    lastPickedMesh = mesh;
    selectedMeshEl.textContent = meshLabel(mesh);
  });
}

/**
 * Muscle meshes resolve to their Chinese name. Bone and fascia meshes have no zh entry
 * anywhere in the dataset, so they keep their anatomical name and the readout is marked
 * exempt — the same policy i18n_zh.json._meta.not_translated states for ta_name.
 */
function meshLabel(mesh: AbstractMesh): string {
  const muscleId = meshMuscleIds.get(mesh)?.[0];
  const muscle = muscleId ? muscleById.get(muscleId) : undefined;
  const label = language === "zh" ? muscle?.common_name_zh : muscle?.common_name_en;
  if (label) delete selectedMeshEl.dataset.i18nExempt;
  else selectedMeshEl.dataset.i18nExempt = "anatomical-name";
  return label ?? cleanName(mesh.name);
}

function installReset(): void {
  resetButton.addEventListener("click", () => {
    stopPlay();
    for (const [id, model] of jointModels) { resetJoint(model); applyJointRotation(id); }
    applyPelvisGrounding(null);
    for (const runtime of segmentRuntime.values()) runtime.control?.position.copyFrom(runtime.node.position);
    draggedJointEl.textContent = ui(language, "None");
    statusEl.textContent = ui(language, "Pose reset");
    renderRom();
  });
}

function installPoseControls(): void {
  poseSlider.addEventListener("input", () => { stopPlay(); applyPosePhase(Number(poseSlider.value)); });
  playButton.addEventListener("click", () => playPose());
}

function installLanguageControls(): void {
  languageEl.addEventListener("change", () => setLanguage(languageEl.value));
}

function setLanguage(code: string): boolean {
  if (code !== "zh" && code !== "en") return false;
  language = code;
  languageEl.value = code;
  applyStaticLabels();
  const selected = selectedExercise?.exercise_id ?? selectEl.value;
  populateExercises();
  populateRomSelect();
  if (selected) {
    selectEl.value = selected;
    const exercise = exercises.find((item) => item.exercise_id === selected);
    if (exercise) renderInfo(exercise);
  }
  renderPoseCaption(selectedExercise ? poseFor(selectedExercise.exercise_id) : null);
  renderRom();
  // A previously picked mesh name is left alone (it is re-resolved on the next pick);
  // only the placeholder needs re-rendering.
  if (!lastPickedMesh) selectedMeshEl.textContent = ui(language, "Nothing selected");
  else selectedMeshEl.textContent = meshLabel(lastPickedMesh);
  return true;
}

/** Every piece of static chrome, driven from the i18n catalogue rather than the markup. */
function applyStaticLabels(): void {
  const keys: Record<string, string> = {
    eyebrow: "WP5 · full-body anatomy",
    title: "Exercise → full-body muscles",
    language: "Language",
    exercise: "Select exercise",
    pose: "Illustrative pose (not motion capture)",
    layers: "Display layers",
    layersHint: "Fascia is off by default: it wraps outside the muscles and would hide the highlight.",
    layerBone: "Bone",
    layerMuscle: "Muscle",
    layerFascia: "Fascia",
    info: "Exercise info",
    muscles: "Muscle involvement",
    rom: "Range of motion",
    romHint: "Drag sets flexion and abduction only; axial rotation and horizontal adduction come from the exercise pose.",
    status: "Model status",
    selectedMeshLabel: "Selected mesh",
    draggedJointLabel: "Dragged joint",
    reset: "Reset pose",
    hint: "Drag the orange joint spheres to change limb direction · click the model to identify a mesh · drag empty space to orbit · wheel to zoom",
  };
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = keys[element.dataset.i18n ?? ""];
    if (key) element.textContent = ui(language, key);
  }
  playButton.textContent = ui(language, playHandle === null ? "Play" : "Pause");
  playButton.title = ui(language, "Play movement");
  hintEl.textContent = ui(language, keys.hint!);
  if (draggedJointEl.textContent === "無" || draggedJointEl.textContent === "None") {
    draggedJointEl.textContent = ui(language, "None");
  }
  renderStatus();
}

function renderStatus(): void {
  if (!loadedMeshCount) { statusEl.textContent = ui(language, "Loading full-body model…"); return; }
  const mapping = missingMuscleMaps === 0
    ? ui(language, "muscle map complete")
    : `${missingMuscleMaps} ${ui(language, "muscle mappings not found")}`;
  const torso = torsoPivotFound ? "" : " · torso pivot n/a";
  statusEl.textContent = language === "zh"
    ? `已載入 ${loadedMeshCount} 個解剖網格 · ${exercises.length} 個已驗證動作 · ${mapping}${torso}`
    : `Loaded ${loadedMeshCount} anatomy meshes · ${exercises.length} verified exercises · ${mapping}${torso}`;
}

// ── acceptance hooks ─────────────────────────────────────────────────────────

function installDebugHooks(): void {
  const target = window as DebugWindow;
  target.__exercises = () => exercises.map((item) => item.exercise_id);
  target.__selectExercise = selectExercise;
  target.__muscleColorOf = (id) => {
    const role = selectedExercise?.muscle_engagement.find((entry) => entry.muscle_id === id)?.role;
    return role ? ROLE_HEX[role] : INACTIVE_HEX;
  };
  target.__caveatVisible = () => !caveatEl.hidden;
  target.__pickAt = (x, y) => pickAnatomy(x, y)?.name ?? null;
  target.__setJointAngle = (segmentId, axisName, deg) => {
    const model = jointModels.get(segmentId);
    if (!model || !model.limits.has(axisName)) return null;
    stopPlay();
    setDof(model, axisName, deg, contextFor(segmentId));
    applyJointRotation(segmentId);
    focusedJoint = segmentId;
    romSelectEl.value = segmentId;
    renderRom();
    // Read back from state rather than echoing `applied`, so the hook can never report
    // a value the model does not actually hold.
    return model.angles.get(axisName) ?? Number.NaN;
  };
  target.__getJointLimits = (segmentId) => {
    const model = jointModels.get(segmentId);
    if (!model) return null;
    const context = contextFor(segmentId);
    return {
      segment: segmentId,
      joint_type: model.type,
      driveable: model.driveable,
      reason: model.notDriveableReason,
      dof: model.order.map((axis) => {
        const { min, max } = effectiveLimit(model, axis, context);
        return {
          axis, min, max,
          current: model.angles.get(axis) ?? 0,
          at_limit: model.atLimit.has(axis),
          confidence: model.limits.get(axis)?.confidence,
        };
      }),
    };
  };
  target.__jointAngles = (segmentId) => {
    const model = jointModels.get(segmentId);
    return model ? Object.fromEntries(model.angles) : null;
  };
  target.__setPosePhase = (t) => { stopPlay(); applyPosePhase(t); };
  target.__playPose = playPose;
  target.__isPlaying = () => playHandle !== null;
  target.__cameraFacing = () => cameraFacing;
  target.__setLayer = setLayer;
  target.__visibleCountByLayer = () => ({ bone: countVisible("bone"), muscle: countVisible("muscle"), fascia: countVisible("fascia") });
  target.__lang = setLanguage;
  target.__untranslatedStrings = untranslatedStrings;
}

/**
 * Strings still rendered in English. Two sources are merged:
 *  1. dictionary misses recorded by i18n.ts (a source string with no zh entry), and
 *  2. a scan of the visible panel text.
 *
 * A string counts as untranslated when it holds a run of Latin letters AND no CJK at
 * all. The CJK test matters: translated notes legitimately keep citation names and
 * source identifiers inside them ("Youdas et al. 2010", "EMG", "joint_actions"), and
 * flagging those would drown the real misses.
 *
 * Deliberate exclusions: the language picker (its options name their own language), and
 * elements marked data-i18n-exempt="anatomical-name" — bone and fascia mesh names keep
 * their anatomical nomenclature, the same policy i18n_zh.json._meta.not_translated
 * states for ta_name and source_refs. Muscle meshes are not exempt: they resolve to
 * common_name_zh.
 */
function untranslatedStrings(): string[] {
  if (language !== "zh") return [];
  const LATIN_RUN = /[A-Za-z]{3,}/;
  const CJK = /[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/;
  const isEnglish = (text: string): boolean => LATIN_RUN.test(text) && !CJK.test(text);
  const found = new Set<string>(untranslated().filter(isEnglish));
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").trim();
      if (text && isEnglish(text)) found.add(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    if (element.hidden || element.dataset.i18nExempt !== undefined) return;
    if (element instanceof HTMLSelectElement) {
      const option = element.selectedOptions[0];
      for (const text of [option?.textContent, option?.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : null]) {
        const trimmed = (text ?? "").trim();
        if (trimmed && isEnglish(trimmed)) found.add(trimmed);
      }
      return;
    }
    for (const child of Array.from(element.childNodes)) visit(child);
  };
  for (const selector of [".panel", "#hint"]) {
    const root = document.querySelector(selector);
    if (root) visit(root);
  }
  return [...found].sort();
}

// ── helpers ──────────────────────────────────────────────────────────────────

function roleMaterial(role: Role): StandardMaterial {
  const existing = roleMaterials.get(role);
  if (existing) return existing;
  const created = material(`role-${role}`, ROLE_HEX[role], ROLE_HEX[role], 1);
  roleMaterials.set(role, created);
  return created;
}

function material(name: string, hex: string, emissive: string, alpha: number): StandardMaterial {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = Color3.FromHexString(hex);
  result.emissiveColor = Color3.FromHexString(emissive).scale(0.18);
  result.specularColor = new Color3(0.12, 0.14, 0.18);
  result.alpha = alpha;
  if (name.startsWith("jointControl")) result.disableDepthWrite = true;
  return result;
}

function validateRig(config: RigConfig): void {
  if (Object.keys(config.segments).length !== 16) {
    throw new Error(`預期 16 個 segment，實際為 ${Object.keys(config.segments).length}`);
  }
  for (const [id, segment] of Object.entries(config.segments)) {
    if (segment.parent && !config.segments[segment.parent]) throw new Error(`${id} parent 不存在`);
  }
}

function segmentOrigin(id: string, config: RigConfig): Vector3 {
  const override = originOverrides.get(id);
  if (override) return override;
  const segment = config.segments[id];
  if (!segment) throw new Error(`未知 segment：${id}`);
  if (segment.pivot) return new Vector3(...segment.pivot);
  return segment.parent ? segmentOrigin(segment.parent, config) : Vector3.Zero();
}

/** The segment's long axis in parent space; joints.ts builds its frame around it. */
function restDirection(id: string, config: RigConfig): Vector3 {
  if (id === "torso") return new Vector3(0, 1, 0);
  const origin = segmentOrigin(id, config);
  const child = Object.entries(config.segments).find(([, candidate]) => candidate.parent === id && candidate.pivot);
  const direction = child?.[1].pivot
    ? new Vector3(...child[1].pivot).subtract(origin)
    : config.segments[id]?.parent
      ? origin.subtract(segmentOrigin(config.segments[id]!.parent!, config))
      : Vector3.Down();
  return (direction.lengthSquared() < 1e-8 ? Vector3.Down() : direction).normalize();
}

/**
 * Whitelist, falling through to "muscle". The fascia test matches on name, so the
 * tensor fasciae latae — a muscle — has to be excluded explicitly or it is filed as
 * fascia and hidden by the default-off fascia layer.
 */
function classifyLayer(name: string): Layer {
  const normalized = name.toLowerCase();
  if (MUSCLE_NAMED_LIKE_FASCIA.test(normalized)) return "muscle";
  if (/fascia|tract|aponeuros/.test(normalized)) return "fascia";
  if (/\b(?:bone|coccyx|sacrum|sternum|clavicle|mandible|scapula|humerus|radius|ulna|femur|fibula|patella|tibia|talus|calcaneus|rib|vertebra|cartilage|disc)\b/.test(normalized)) return "bone";
  return "muscle";
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cleanName(name: string): string {
  return name.replace(/_primitive\d+$/i, "").replace(/\.(?:l|r)$/i, "");
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`找不到必要元素：${selector}`);
  return element;
}
