import { PointerDragBehavior } from "@babylonjs/core/Behaviors/Meshes/pointerDragBehavior";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
// Required side-effect import: without it Babylon picking silently fails after bundling.
import "@babylonjs/core/Culling/ray";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { composeQuaternion, createJointModel, effectiveLimit, isAtLimit, resetJoint, setDof, solveSwing } from "./joints";
import type { JointAxesFile, JointModel, RomContext } from "./joints";

interface SegmentConfig { parent: string | null; pivot: [number, number, number] | null; meshes: string[] }
interface RigConfig { segments: Record<string, SegmentConfig> }
interface AttachmentPoint { bone: string; pos: [number, number, number] }
interface AttachmentRecord { origin_points: AttachmentPoint[]; insertion_points: AttachmentPoint[]; origin_segments: string[]; insertion_segments: string[]; spans: string[]; crosses_joint: boolean }
interface PassiveCurve { strain_at_zero_force: number; strain_at_one_norm_force: number; source: "per_muscle" | "opensim_default" }
interface MuscleDynamics { max_isometric_force: number; optimal_fiber_length: number; tendon_slack_length: number; pennation_angle_at_optimal: number; passive_curve: PassiveCurve; opensim_source_id: string | string[] }
interface SegmentRuntime { config: SegmentConfig; node: TransformNode; control: Mesh | null }
interface MuscleRuntime { key: string; data: AttachmentRecord; origins: TransformNode[]; insertions: TransformNode[]; restLength: number; meshes: AbstractMesh[] }
interface TensionItem { key: string; strain: number; pullsOn: string[] }
interface JointLimitReport { segment: string; joint_type: string; driveable: boolean; dof: Array<{ axis: string; min: number; max: number; current: number }> }
interface DebugWindow extends Window { __ready?: boolean; __muscleLength?: (key: string) => number | null; __muscleStrain?: (key: string) => number | null; __passiveTension?: (key: string) => number | null; __setJointAngle?: (segmentId: string, axisName: string, deg: number) => number | null; __getJointLimits?: (segmentId: string) => JointLimitReport | null; __tensionReport?: () => TensionItem[] }

const canvas = required<HTMLCanvasElement>("#renderCanvas");
const draggedJoint = required<HTMLSpanElement>("#draggedJoint");
const summary = required<HTMLSpanElement>("#summary");
const tensionList = required<HTMLDivElement>("#tensionList");
const status = required<HTMLDivElement>("#status");
const resetButton = required<HTMLButtonElement>("#resetPose");
const engine = new Engine(canvas, true, { adaptToDeviceRatio: true, preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine); scene.clearColor = new Color4(.043, .063, .125, 1);
const camera = new ArcRotateCamera("tensionCamera", -Math.PI / 2.15, Math.PI / 2.2, 2.65, new Vector3(0, .88, 0), scene);
camera.attachControl(canvas, true); camera.lowerRadiusLimit = .35; camera.upperRadiusLimit = 6; camera.wheelPrecision = 90; camera.panningSensibility = 0; camera.minZ = .001; camera.maxZ = 100;
new HemisphericLight("ambient", new Vector3(.15, 1, -.3), scene).intensity = 1.05;
new DirectionalLight("key", new Vector3(-.55, -1, .65), scene).intensity = .75;
const neutralMaterial = material("neutralMuscle", "#566277", "#182235", .38);
const boneMaterial = material("bone", "#cbd5e1", "#172033", .72);
const controlMaterial = material("jointControl", "#fb923c", "#7c2d12", 1);
const activeControlMaterial = material("jointControlActive", "#fde047", "#a16207", 1);
const limitControlMaterial = material("jointControlLimit", "#ef4444", "#7f1d1d", 1);
const lockedControlMaterial = material("jointControlLocked", "#64748b", "#1e293b", .55);
const segmentRuntime = new Map<string, SegmentRuntime>();
// Per-joint models (axes + full multi-DOF ROM), shared with the main viewer's src/joints.ts.
// A single global rotation axis (the original behaviour) is wrong for length computation:
// rotating the knee about the antero-posterior axis swings the shin sideways, so medial
// hamstrings shorten while the lateral one lengthens. Ball joints (hip/shoulder) need a
// real 2-DOF (abduction, flexion) cone, not one axis -- an earlier version here rotated
// the dragged direction with an unconstrained shortest-arc quaternion, which let hip/
// shoulder be dragged into anatomically-impossible orientations (observed: 98% strain on
// quadratus femoris). See public/joint_axes.json for how each joint's ROM is derived.
const jointModels = new Map<string, JointModel>();
const muscleRuntime = new Map<string, MuscleRuntime>();
const muscleDynamics = new Map<string, MuscleDynamics>();
const anatomyMeshes: AbstractMesh[] = [];
let activeDrag: { id: string; pivot: Vector3; target: Vector3; home: Vector3 } | null = null;

engine.runRenderLoop(() => scene.render()); window.addEventListener("resize", () => engine.resize());
void initialise().catch((error: unknown) => { status.textContent = `載入失敗：${error instanceof Error ? error.message : String(error)}`; console.error(error); });

async function initialise(): Promise<void> {
  const [rigResponse, attachmentResponse, jointAxesResponse, dynamicsResponse, imported] = await Promise.all([
    fetch("/rig_config.json"), fetch("/attachments.json"), fetch("/joint_axes.json"), fetch("/muscle_dynamics.json"),
    SceneLoader.ImportMeshAsync("", "/", "fullbody_lite.glb", scene),
  ]);
  if (!rigResponse.ok || !attachmentResponse.ok || !jointAxesResponse.ok || !dynamicsResponse.ok) {
    throw new Error(`資料載入失敗：rig ${rigResponse.status} / attachments ${attachmentResponse.status} / joint_axes ${jointAxesResponse.status} / dynamics ${dynamicsResponse.status}`);
  }
  const rig = await rigResponse.json() as RigConfig;
  const attachments = await attachmentResponse.json() as Record<string, AttachmentRecord>;
  const jointAxes = await jointAxesResponse.json() as JointAxesFile;
  for (const [key, dynamics] of Object.entries(await dynamicsResponse.json() as Record<string, MuscleDynamics>)) muscleDynamics.set(key, dynamics);
  for (const id of Object.keys(rig.segments)) createSegment(id, rig, new Set<string>());
  assignMeshes(rig, (imported.meshes as AbstractMesh[]).filter((mesh) => mesh.name !== "__root__"));
  // Models (axes + ROM) must exist before controls: controls read model.driveable to
  // decide whether to attach a drag behaviour at all, and to pick the locked/unlocked colour.
  createJointModels(rig, jointAxes);
  createJointControls(rig);
  // Each marker is parented to the segment that owns the attachment bone. Its local
  // position is derived from the supplied rest-world coordinate, so it follows the
  // same TransformNode hierarchy as the anatomy mesh after any joint rotation.
  const crossJointCount = Object.values(attachments).filter((data) => data.crosses_joint).length;
  for (const [key, data] of Object.entries(attachments)) if (data.crosses_joint) createMuscleRuntime(key, data);
  installReset(); installDebugHooks(); updateTensionView();
  const incompleteCount = crossJointCount - muscleRuntime.size;
  status.textContent = `已量測 ${muscleRuntime.size}/${crossJointCount} 條跨關節肌肉` +
    (incompleteCount ? `；${incompleteCount} 條缺一端附著點，未以猜測補值` : "") + "。";
  (window as DebugWindow).__ready = true;
}

function createJointModels(rig: RigConfig, jointAxes: JointAxesFile): void {
  for (const id of Object.keys(rig.segments)) {
    if (!rig.segments[id]?.pivot) continue;
    jointModels.set(id, createJointModel(id, restDirection(id, rig), jointAxes[id]?.rom));
  }
}

function createSegment(id: string, rig: RigConfig, visiting: Set<string>): SegmentRuntime {
  const old = segmentRuntime.get(id); if (old) return old;
  if (visiting.has(id)) throw new Error(`rig parent 循環：${id}`); visiting.add(id);
  const config = rig.segments[id]; if (!config) throw new Error(`缺少 segment：${id}`);
  const parent = config.parent ? createSegment(config.parent, rig, visiting) : null;
  const node = new TransformNode(`segment:${id}`, scene); if (parent) node.parent = parent.node;
  const origin = segmentOrigin(id, rig); const parentOrigin = config.parent ? segmentOrigin(config.parent, rig) : Vector3.Zero();
  node.position.copyFrom(origin.subtract(parentOrigin)); node.rotationQuaternion = Quaternion.Identity();
  const runtime = { config, node, control: null }; segmentRuntime.set(id, runtime); visiting.delete(id); return runtime;
}

function assignMeshes(rig: RigConfig, imported: AbstractMesh[]): void {
  const assigned = new Set<AbstractMesh>();
  for (const [id, config] of Object.entries(rig.segments)) {
    const runtime = segmentRuntime.get(id); if (!runtime) continue;
    for (const prefix of config.meshes) for (const mesh of imported.filter((item) => item.name.startsWith(prefix))) {
      if (assigned.has(mesh)) continue; mesh.computeWorldMatrix(true); mesh.setParent(runtime.node); mesh.isPickable = true; assigned.add(mesh); anatomyMeshes.push(mesh);
      mesh.material = isBone(prefix) ? boneMaterial : neutralMaterial;
    }
  }
}

function createMuscleRuntime(key: string, data: AttachmentRecord): void {
  const origins = data.origin_points.map((point, index) => createMarker(`${key}:origin:${index}`, point, data.origin_segments));
  const insertions = data.insertion_points.map((point, index) => createMarker(`${key}:insertion:${index}`, point, data.insertion_segments));
  if (!origins.length || !insertions.length) return;
  const runtime: MuscleRuntime = { key, data, origins, insertions, restLength: 0, meshes: anatomyMeshes.filter((mesh) => matchesMuscleMesh(mesh.name, key)) };
  runtime.restLength = muscleLength(runtime); muscleRuntime.set(key, runtime);
}

function createMarker(name: string, point: AttachmentPoint, segments: string[]): TransformNode {
  const segment = segmentForBone(point.bone, segments); const runtime = segmentRuntime.get(segment);
  if (!runtime) throw new Error(`附著點 ${point.bone} 無有效 segment：${segment}`);
  const marker = new TransformNode(`attachment:${name}`, scene); marker.parent = runtime.node; marker.setAbsolutePosition(new Vector3(...point.pos)); marker.computeWorldMatrix(true); return marker;
}

function segmentForBone(bone: string, candidates: string[]): string { return candidates.find((id) => !!segmentRuntime.get(id)?.config.meshes.some((prefix) => bone.startsWith(prefix))) ?? candidates[0] ?? ""; }

function createJointControls(rig: RigConfig): void {
  for (const [id, config] of Object.entries(rig.segments)) {
    if (!config.pivot) continue;
    const runtime = segmentRuntime.get(id); const model = jointModels.get(id);
    if (!runtime || !model) continue;
    const control = MeshBuilder.CreateSphere(`joint-control:${id}`, { diameter: .032, segments: 16 }, scene);
    control.material = model.driveable ? controlMaterial : lockedControlMaterial; control.isPickable = true; control.renderingGroupId = 2;
    const parent = config.parent ? segmentRuntime.get(config.parent) : null; if (parent) control.parent = parent.node; control.position.copyFrom(runtime.node.position); runtime.control = control;
    if (!model.driveable) continue;
    const drag = new PointerDragBehavior(); drag.detachCameraControls = true; drag.dragDeltaRatio = 1; drag.moveAttached = false; drag.useObjectOrientationForDragging = false; control.addBehavior(drag);
    drag.onDragStartObservable.add(() => { runtime.node.computeWorldMatrix(true); activeDrag = { id, pivot: runtime.node.getAbsolutePosition().clone(), target: runtime.node.getAbsolutePosition().clone(), home: runtime.node.position.clone() }; control.material = activeControlMaterial; canvas.style.cursor = "grabbing"; draggedJoint.textContent = jointName(id); });
    drag.onDragObservable.add((event) => { if (!activeDrag || activeDrag.id !== id) return; activeDrag.target.addInPlace(event.delta); control.setAbsolutePosition(activeDrag.target); rotateJoint(id, control, activeDrag.pivot); control.material = isAtLimit(model) ? limitControlMaterial : activeControlMaterial; updateTensionView(); });
    drag.onDragEndObservable.add(() => { if (activeDrag?.id === id) control.position.copyFrom(activeDrag.home); activeDrag = null; control.material = isAtLimit(model) ? limitControlMaterial : controlMaterial; canvas.style.cursor = "default"; draggedJoint.textContent = "無"; });
  }
}

/** Drag → clamped (abduction, flexion) inside the joint's ROM cone, via src/joints.ts. */
function rotateJoint(segmentId: string, control: Mesh, pivotWorld: Vector3): void {
  const runtime = segmentRuntime.get(segmentId); const model = jointModels.get(segmentId);
  if (!runtime || !model) return;
  const world = control.getAbsolutePosition().subtract(pivotWorld);
  if (world.lengthSquared() < 1e-7) return;
  const local = world.clone();
  if (runtime.node.parent) { const inverse = new Matrix(); (runtime.node.parent as TransformNode).computeWorldMatrix(true).invertToRef(inverse); Vector3.TransformNormalToRef(world, inverse, local); }
  solveSwing(model, local, contextFor(segmentId));
  applyJointRotation(segmentId);
}

function applyJointRotation(segmentId: string): void {
  const runtime = segmentRuntime.get(segmentId); const model = jointModels.get(segmentId);
  if (!runtime || !model) return;
  runtime.node.rotationQuaternion = composeQuaternion(model); runtime.node.computeWorldMatrix(true);
}

/** Coupled limits (hip/ankle/knee) need the same-side knee angle, same as the main viewer. */
function contextFor(segmentId: string): RomContext {
  const side = segmentId.split(".")[1];
  const knee = side ? jointModels.get(`knee.${side}`) : null;
  return { kneeFlexion: knee?.angles.get("flexion_extension") ?? 0 };
}

// A multi-patch attachment is represented by its centroid. This is stable for the
// supplied patches and preserves the shared geometry API for B; B can later replace
// this with routed tendon paths without changing markers, L0, strain, or dL/dtheta.
function muscleLength(runtime: MuscleRuntime): number { return centroid(runtime.origins).subtract(centroid(runtime.insertions)).length(); }
function centroid(markers: TransformNode[]): Vector3 { const result = Vector3.Zero(); for (const marker of markers) { marker.computeWorldMatrix(true); result.addInPlace(marker.getAbsolutePosition()); } return result.scaleInPlace(1 / markers.length); }
function strain(runtime: MuscleRuntime): number { return (muscleLength(runtime) - runtime.restLength) / runtime.restLength; }

function derivative(key: string, segment: string, deltaDegrees = .2): number | null {
  const muscle = muscleRuntime.get(key); const joint = segmentRuntime.get(segment); if (!muscle || !joint?.config.pivot) return null;
  const previous = joint.node.rotationQuaternion?.clone() ?? Quaternion.Identity(); const before = muscleLength(muscle); const delta = deltaDegrees * Math.PI / 180;
  joint.node.rotationQuaternion = previous.multiply(Quaternion.RotationAxis(Vector3.Forward(), delta)); joint.node.computeWorldMatrix(true); const after = muscleLength(muscle);
  joint.node.rotationQuaternion = previous; joint.node.computeWorldMatrix(true); return (after - before) / delta;
}

function updateTensionView(): void {
  const stretched = [...muscleRuntime.values()].map((runtime) => ({ runtime, strain: strain(runtime) })).filter((item) => item.strain > .0005).sort((a, b) => b.strain - a.strain);
  for (const runtime of muscleRuntime.values()) for (const mesh of runtime.meshes) mesh.material = runtimeMaterial(Math.max(0, strain(runtime)));
  summary.textContent = `${muscleRuntime.size} 條可量測 · ${stretched.length} 條拉長（>0.05%）`;
  tensionList.replaceChildren(...(stretched.length ? stretched.map(renderTension) : [emptyMessage()]));
}

function renderTension(item: { runtime: MuscleRuntime; strain: number }): HTMLDivElement {
  const element = document.createElement("div"); element.className = "muscle"; const { runtime } = item;
  const pulls = pullDescriptions(runtime); const derivativeText = runtime.data.spans.map((segment) => { const value = derivative(runtime.key, segment); return value === null ? null : `${jointName(segment)} dL/dθ ${value >= 0 ? "+" : ""}${value.toFixed(3)} m/rad`; }).filter((value): value is string => value !== null).join("；");
  const passive = passiveTension(runtime);
  const passiveText = passive === null ? "" : `<div class="detail passive">被動張力估計（正規化）：${passive.toFixed(3)} ⚠ 相對值，非驗證過的絕對力</div>`;
  element.innerHTML = `<strong>${displayMuscleName(runtime.key)}</strong><div class="detail">拉長 ${(item.strain * 100).toFixed(2)}% · L = ${muscleLength(runtime).toFixed(4)} m</div>${passiveText}<div class="pull">${pulls.join("；")}</div><div class="detail">${derivativeText || "無可用關節導數"}（正值：朝 +角度微擾會拉長）</div>`;
  return element;
}

/**
 * B-lite passive Hill-type force-length estimate.  The browser geometry supplies
 * MTU length; Rajagopal2016 supplies the Millard curve constants.  With
 * F=exp(k*extension)-1, solve k=ln(2)/curveSpan so the specified one-force
 * strain evaluates to 1, without presenting a Newton value.
 */
function passiveTension(runtime: MuscleRuntime): number | null {
  const dynamics = muscleDynamics.get(runtime.key); if (!dynamics) return null;
  const fiberLength = Math.max(muscleLength(runtime) - dynamics.tendon_slack_length, dynamics.optimal_fiber_length * .01) / Math.cos(dynamics.pennation_angle_at_optimal);
  const normalizedLength = fiberLength / dynamics.optimal_fiber_length;
  const zero = dynamics.passive_curve.strain_at_zero_force;
  const one = dynamics.passive_curve.strain_at_one_norm_force;
  const extension = normalizedLength - 1 - zero;
  if (extension <= 0) return 0;
  const span = one - zero;
  if (span <= 0) return null;
  const k = Math.log(2) / span;
  return Math.exp(k * extension) - 1;
}

function pullDescriptions(runtime: MuscleRuntime): string[] {
  const originCenter = centroid(runtime.origins); const insertionCenter = centroid(runtime.insertions);
  const fromOrigins = runtime.data.origin_segments.map((segment) => `對 ${segment}：朝 ${segmentList(runtime.data.insertion_segments)} 附著點${directionLabel(insertionCenter.subtract(originCenter))}拉力`);
  const fromInsertions = runtime.data.insertion_segments.map((segment) => `對 ${segment}：朝 ${segmentList(runtime.data.origin_segments)} 附著點${directionLabel(originCenter.subtract(insertionCenter))}拉力`);
  return [...fromOrigins, ...fromInsertions];
}
function directionLabel(vector: Vector3): string { const parts: string[] = []; if (Math.abs(vector.y) > .015) parts.push(vector.y > 0 ? "（向上）" : "（向下）"); if (Math.abs(vector.z) > .015) parts.push(vector.z > 0 ? "（+Z）" : "（−Z）"); return parts.join("") || ""; }
function segmentList(segments: string[]): string { return segments.join("、"); }
function emptyMessage(): HTMLDivElement { const element = document.createElement("div"); element.className = "row"; element.textContent = "目前沒有超過 0.05% 拉長的跨關節肌肉；拖曳關節或用除錯掛鉤設定姿勢。"; return element; }

function installReset(): void {
  resetButton.addEventListener("click", () => {
    for (const [id, model] of jointModels) { resetJoint(model); applyJointRotation(id); }
    for (const runtime of segmentRuntime.values()) runtime.control?.position.copyFrom(runtime.node.position);
    draggedJoint.textContent = "無"; activeDrag = null; updateTensionView(); status.textContent = "姿勢已重置";
  });
}
function installDebugHooks(): void {
  const target = window as DebugWindow;
  target.__muscleLength = (key) => { const runtime = muscleRuntime.get(key); return runtime ? muscleLength(runtime) : null; };
  target.__muscleStrain = (key) => { const runtime = muscleRuntime.get(key); return runtime ? strain(runtime) : null; };
  target.__passiveTension = (key) => { const runtime = muscleRuntime.get(key); return runtime ? passiveTension(runtime) : null; };
  target.__setJointAngle = (segmentId, axisName, deg) => {
    const model = jointModels.get(segmentId);
    if (!model || !model.limits.has(axisName)) return null;
    setDof(model, axisName, deg, contextFor(segmentId));
    applyJointRotation(segmentId);
    updateTensionView();
    const applied = model.angles.get(axisName) ?? Number.NaN;
    status.textContent = `${jointName(segmentId)} ${axisName} 已設為 ${applied}°`;
    return applied;
  };
  target.__getJointLimits = (segmentId) => {
    const model = jointModels.get(segmentId);
    if (!model) return null;
    const context = contextFor(segmentId);
    return {
      segment: segmentId, joint_type: model.type, driveable: model.driveable,
      dof: model.order.map((axis) => { const { min, max } = effectiveLimit(model, axis, context); return { axis, min, max, current: model.angles.get(axis) ?? 0 }; }),
    };
  };
  target.__tensionReport = () => [...muscleRuntime.values()].map((runtime) => ({ key: runtime.key, strain: strain(runtime), pullsOn: [...new Set([...runtime.data.origin_segments, ...runtime.data.insertion_segments])] })).filter((item) => item.strain > .0005).sort((a, b) => b.strain - a.strain);
}
function runtimeMaterial(value: number): StandardMaterial { const clamped = Math.min(value / .1, 1); const red = Math.round(245 + 10 * clamped); const green = Math.round(145 * (1 - clamped)); const blue = Math.round(45 * (1 - clamped)); return material(`strain-${Math.round(clamped * 20)}`, `#${toHex(red)}${toHex(green)}${toHex(blue)}`, "#4c1208", .94); }
function material(name: string, hex: string, emissive: string, alpha: number): StandardMaterial { const existing = scene.getMaterialByName(name); if (existing instanceof StandardMaterial) return existing; const result = new StandardMaterial(name, scene); result.diffuseColor = Color3.FromHexString(hex); result.emissiveColor = Color3.FromHexString(emissive).scale(.14); result.specularColor = new Color3(.12, .14, .18); result.alpha = alpha; return result; }
function toHex(value: number): string { return value.toString(16).padStart(2, "0"); }
function matchesMuscleMesh(meshName: string, key: string): boolean { const [name, side] = key.split("|"); return meshName.startsWith(`${name}.${side}`) || meshName.startsWith(`${name} muscle.${side}`); }
function isBone(name: string): boolean { return /\b(?:bone|coccyx|sacrum|sternum|clavicle|mandible|scapula|humerus|radius|ulna|femur|fibula|patella|tibia|talus|calcaneus|rib|vertebra|cartilage|disc)\b/i.test(name); }
function segmentOrigin(id: string, rig: RigConfig): Vector3 { const config = rig.segments[id]; if (!config) throw new Error(`未知 segment：${id}`); return config.pivot ? new Vector3(...config.pivot) : config.parent ? segmentOrigin(config.parent, rig) : Vector3.Zero(); }
function restDirection(id: string, rig: RigConfig): Vector3 { const config = rig.segments[id]; if (!config?.pivot) throw new Error(`靜態 segment 無方向：${id}`); const pivot = new Vector3(...config.pivot); const child = Object.entries(rig.segments).find(([, value]) => value.parent === id && value.pivot); const vector = child?.[1].pivot ? new Vector3(...child[1].pivot).subtract(pivot) : config.parent ? pivot.subtract(segmentOrigin(config.parent, rig)) : Vector3.Down(); return (vector.lengthSquared() < 1e-8 ? Vector3.Down() : vector).normalize(); }
function jointName(id: string): string { const [joint, side] = id.split("."); const labels: Record<string, string> = { shoulder:"肩", elbow:"肘", wrist:"腕", hip:"髖", knee:"膝", ankle:"踝", subtalar:"距下" }; return `${side === "l" ? "左" : side === "r" ? "右" : ""}${labels[joint] ?? joint}關節`; }
function displayMuscleName(key: string): string { return key.replace("|l", "（左）").replace("|r", "（右）").replace(/ muscle/gi, ""); }
function required<T extends Element>(selector: string): T { const element = document.querySelector<T>(selector); if (!element) throw new Error(`找不到必要元素：${selector}`); return element; }
