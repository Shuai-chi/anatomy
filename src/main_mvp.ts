import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Bone } from "@babylonjs/core/Bones/bone";
import { PointerDragBehavior } from "@babylonjs/core/Behaviors/Meshes/pointerDragBehavior";
// Side-effect import: registers Scene.prototype.pick / createPickingRay. Without it
// picking silently returns hit:false forever with no error -- see
// verification_screenshots/INDEPENDENT_VERIFICATION.md for how this cost a debugging round.
import "@babylonjs/core/Culling/ray";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";

type Role = "prime_mover" | "synergist" | "stabilizer";

interface Engagement {
  muscle_id: string;
  role: Role;
  note?: string;
}

interface Exercise {
  exercise_id: string;
  name_en: string;
  name_zh: string;
  equipment_type: string;
  movement_plane: string;
  joint_actions: string[];
  muscle_engagement: Engagement[];
  colloquial_region_tag: string;
  engagement_caveat?: string;
}

const MUSCLE_MESH_PREFIX: Record<string, string> = {
  pec_major_clavicular: "Clavicular head of pectoralis major muscle.l",
  pec_major_sternocostal: "Sternocostal head of pectoralis major muscle.l",
  pec_major_abdominal: "(Abdominal part of pectoralis major muscle).l",
  pectoralis_minor: "Pectoralis minor muscle.l",
  serratus_anterior: "Serratus anterior muscle.l",
};

const ROLE_COLOR: Record<Role, Color3> = {
  prime_mover: Color3.FromHexString("#ef4444"),
  synergist: Color3.FromHexString("#f59e0b"),
  stabilizer: Color3.FromHexString("#3b82f6"),
};
const ROLE_LABEL: Record<Role, string> = {
  prime_mover: "主動肌",
  synergist: "協同肌",
  stabilizer: "穩定肌",
};
const ZH_MUSCLE: Record<string, string> = {
  pec_major_clavicular: "胸大肌鎖骨部（上胸）",
  pec_major_sternocostal: "胸大肌胸肋部（中胸）",
  pec_major_abdominal: "胸大肌腹部（下胸）",
  pectoralis_minor: "胸小肌",
  serratus_anterior: "前鋸肌",
};
const INACTIVE_COLOR = Color3.FromHexString("#475569");
const BONE_COLOR = Color3.FromHexString("#d8dee9");

// Generic glenohumeral horizontal adduction/abduction range, NOT per-exercise.
// The Stage 3 dataset records joint_actions qualitatively (e.g. "shoulder horizontal
// adduction") but contains no per-exercise ROM degrees, so inventing a distinct range
// per exercise here would be fabricating data. This single anatomical range is applied
// to every exercise and is labelled as generic in the UI; per-exercise ROM would need
// to be collected and source-cited before it can be shown as exercise-specific.
const ROM_MIN_DEG = -45;
const ROM_MAX_DEG = 130;

const canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas")!;
const selectEl = document.querySelector<HTMLSelectElement>("#exercise")!;
const romEl = document.querySelector<HTMLDivElement>("#rom")!;
const metaEl = document.querySelector<HTMLDivElement>("#meta")!;
const musclesEl = document.querySelector<HTMLDivElement>("#muscles")!;
const caveatEl = document.querySelector<HTMLDivElement>("#caveat")!;

const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.043, 0.063, 0.125, 1);

// Glenohumeral pivot, computed from the real geometry (BVH closest point between
// Humerus.l and Scapula.l -- contact distance 0.00083, i.e. the meshes touch).
// Blender Z-up -> Babylon Y-up is (-x, z, -y); verified against the loaded mesh's
// world bounding box rather than assumed (the first guess had X inverted).
const PIVOT = new Vector3(-0.15067100524902344, 1.365230917930603, -0.03474174439907074);

const camera = new ArcRotateCamera("camera", -Math.PI / 2.6, Math.PI / 2.3, 0.55, PIVOT.clone(), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 0.2;
camera.upperRadiusLimit = 2;
camera.wheelPrecision = 300;
// Real anatomical scale (~0.3m across); Babylon's default near-clip is too far out
// for content this small and clips the whole model away.
camera.minZ = 0.001;
camera.maxZ = 100;

new HemisphericLight("ambient", new Vector3(0.1, 1, -0.25), scene).intensity = 0.95;
const keyLight = new DirectionalLight("key", new Vector3(-0.55, -1, 0.6), scene);
keyLight.intensity = 0.7;

const muscleMaterials = new Map<string, StandardMaterial>();
let exercises: Exercise[] = [];
let currentAngleDeg = 0;
let isDragging = false;
let atRomBoundary = false;

const ARM_RADIUS = 0.3;

Promise.all([
  fetch("/exercises.json").then((r) => r.json() as Promise<Exercise[]>),
  SceneLoader.ImportMeshAsync("", "/", "chest_pilot.glb", scene),
]).then(([loadedExercises, imported]) => {
  exercises = loadedExercises;

  const boneMat = new StandardMaterial("boneMat", scene);
  boneMat.diffuseColor = BONE_COLOR;
  boneMat.specularColor = new Color3(0.15, 0.17, 0.22);

  const humerusParts: AbstractMesh[] = [];
  for (const mesh of imported.meshes as AbstractMesh[]) {
    if (mesh.name === "__root__") continue;
    if (mesh.name.startsWith("Humerus.l")) humerusParts.push(mesh);

    const muscleId = Object.keys(MUSCLE_MESH_PREFIX).find((id) =>
      mesh.name.startsWith(MUSCLE_MESH_PREFIX[id]),
    );
    if (muscleId) {
      let mat = muscleMaterials.get(muscleId);
      if (!mat) {
        mat = new StandardMaterial(`muscleMat_${muscleId}`, scene);
        mat.specularColor = new Color3(0.12, 0.14, 0.18);
        muscleMaterials.set(muscleId, mat);
      }
      mesh.material = mat;
    } else {
      mesh.material = boneMat;
    }
  }

  // Rig: attach the real humerus to a single shoulder bone at the anatomical pivot.
  const skeleton = new Skeleton("shoulderSkeleton", "shoulderSkeleton", scene);
  const shoulderBone = new Bone("shoulder", skeleton, null, Matrix.Identity(), null, null, 0);
  const rigRoot = MeshBuilder.CreateBox("rigRoot", { size: 0.002 }, scene);
  rigRoot.position.copyFrom(PIVOT);
  rigRoot.isVisible = false;
  rigRoot.isPickable = false;
  rigRoot.skeleton = skeleton;
  for (const part of humerusParts) part.attachToBone(shoulderBone, rigRoot);

  const target = MeshBuilder.CreateSphere("dragTarget", { diameter: 0.028 }, scene);
  const targetMat = new StandardMaterial("targetMat", scene);
  targetMat.diffuseColor = Color3.FromHexString("#fb923c");
  targetMat.emissiveColor = Color3.FromHexString("#7c2d12");
  target.material = targetMat;
  target.position.copyFrom(PIVOT.add(new Vector3(ARM_RADIUS, 0, 0)));
  target.isPickable = true;

  const dragBehavior = new PointerDragBehavior();
  dragBehavior.detachCameraControls = true;
  target.addBehavior(dragBehavior);
  dragBehavior.onDragStartObservable.add(() => { isDragging = true; });
  dragBehavior.onDragEndObservable.add(() => { isDragging = false; });

  scene.onBeforeRenderObservable.add(() => {
    const rel = target.position.subtract(PIVOT);
    rel.y = 0;
    const len = rel.length();
    if (len > 0.0001) rel.scaleInPlace(ARM_RADIUS / len);

    let angle = Math.atan2(rel.z, rel.x);
    const min = (ROM_MIN_DEG * Math.PI) / 180;
    const max = (ROM_MAX_DEG * Math.PI) / 180;
    const clamped = Math.max(min, Math.min(max, angle));
    atRomBoundary = Math.abs(clamped - angle) > 0.001;
    angle = clamped;

    target.position.copyFrom(
      PIVOT.add(new Vector3(Math.cos(angle) * ARM_RADIUS, 0, Math.sin(angle) * ARM_RADIUS)),
    );
    shoulderBone.setRotationMatrix(Matrix.RotationY(-angle), undefined);
    skeleton.computeAbsoluteMatrices();
    skeleton.prepare(true);

    currentAngleDeg = Math.round((angle * 180) / Math.PI);
    updateRomReadout();
  });

  for (const ex of exercises) {
    const opt = document.createElement("option");
    opt.value = ex.exercise_id;
    opt.textContent = `${ex.name_zh}（${ex.colloquial_region_tag}）`;
    selectEl.appendChild(opt);
  }
  selectEl.addEventListener("change", () => applyExercise(selectEl.value));
  applyExercise(exercises[0].exercise_id);

  (window as any).__ready = true;
  (window as any).__muscleColorOf = (id: string) =>
    muscleMaterials.get(id)?.diffuseColor.toHexString() ?? null;
  (window as any).__angle = () => currentAngleDeg;
  (window as any).__projectTarget = () =>
    Vector3.Project(
      target.position,
      Matrix.Identity(),
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
    ).asArray();
});

function updateRomReadout(): void {
  const state = isDragging ? "拖曳中" : "可拖曳";
  const bound = atRomBoundary ? " · 已達活動度邊界" : "";
  romEl.textContent =
    `${state} · 肩關節水平內收 ${currentAngleDeg}°　（通用活動度 ${ROM_MIN_DEG}°～${ROM_MAX_DEG}°，非此動作專屬）${bound}`;
}

function applyExercise(exerciseId: string): void {
  const ex = exercises.find((e) => e.exercise_id === exerciseId);
  if (!ex) return;

  const engagementById = new Map(ex.muscle_engagement.map((e) => [e.muscle_id, e]));
  for (const [muscleId, mat] of muscleMaterials) {
    const engagement = engagementById.get(muscleId);
    if (engagement) {
      mat.diffuseColor = ROLE_COLOR[engagement.role];
      mat.emissiveColor = ROLE_COLOR[engagement.role].scale(0.22);
      mat.alpha = 1;
    } else {
      mat.diffuseColor = INACTIVE_COLOR;
      mat.emissiveColor = Color3.Black();
      mat.alpha = 0.45;
    }
  }

  metaEl.innerHTML = "";
  const rows: Array<[string, string]> = [
    ["器材", ex.equipment_type],
    ["運動平面", ex.movement_plane],
    ["關節動作", ex.joint_actions.join("、")],
  ];
  for (const [k, v] of rows) {
    const row = document.createElement("div");
    row.className = "row";
    const kEl = document.createElement("span");
    kEl.className = "k";
    kEl.textContent = k;
    const vEl = document.createElement("span");
    vEl.textContent = v;
    row.append(kEl, vEl);
    metaEl.appendChild(row);
  }

  musclesEl.innerHTML = "";
  const order: Role[] = ["prime_mover", "synergist", "stabilizer"];
  const sorted = [...ex.muscle_engagement].sort(
    (a, b) => order.indexOf(a.role) - order.indexOf(b.role),
  );
  for (const eng of sorted) {
    const row = document.createElement("div");
    row.className = "muscle";
    const sw = document.createElement("i");
    sw.className = "swatch";
    sw.style.background = ROLE_COLOR[eng.role].toHexString();
    const name = document.createElement("span");
    name.className = "mname";
    name.textContent = ZH_MUSCLE[eng.muscle_id] ?? eng.muscle_id;
    const role = document.createElement("span");
    role.className = "mrole";
    role.textContent = ROLE_LABEL[eng.role];
    row.append(sw, name, role);
    musclesEl.appendChild(row);
    if (eng.note) {
      const note = document.createElement("div");
      note.className = "mnote";
      note.textContent = eng.note;
      musclesEl.appendChild(note);
    }
  }

  if (ex.engagement_caveat) {
    caveatEl.hidden = false;
    caveatEl.textContent = `⚠ ${ex.engagement_caveat}`;
  } else {
    caveatEl.hidden = true;
  }
}

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
