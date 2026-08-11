import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { PointerDragBehavior } from "@babylonjs/core/Behaviors/Meshes/pointerDragBehavior";
// Side-effect import: registers Scene.prototype.pick / createPickingRay. Without it
// picking silently returns hit:false forever with no error thrown.
import "@babylonjs/core/Culling/ray";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";

type Role = "prime_mover" | "synergist" | "stabilizer";
interface Engagement { muscle_id: string; role: Role; note?: string }
interface Exercise {
  exercise_id: string; name_en: string; name_zh: string; equipment_type: string;
  movement_plane: string; joint_actions: string[]; muscle_engagement: Engagement[];
  colloquial_region_tag: string; engagement_caveat?: string;
}

const MUSCLE_MESH_PREFIX: Record<string, string> = {
  pec_major_clavicular: "Clavicular head of pectoralis major muscle.l",
  pec_major_sternocostal: "Sternocostal head of pectoralis major muscle.l",
  pec_major_abdominal: "(Abdominal part of pectoralis major muscle).l",
  pectoralis_minor: "Pectoralis minor muscle.l",
  serratus_anterior: "Serratus anterior muscle.l",
};
// Only the forearm bones follow the elbow bone. The triceps deliberately does NOT:
// it spans the elbow (running along the humerus, inserting on the ulnar olecranon),
// so rigidly parenting it to the forearm swings the whole muscle belly away from the
// arm -- visibly wrong. Under tier (b) rigid attachment (no skinning) a joint-spanning
// muscle cannot be fully correct on either side; attaching it to the humerus, where
// the bulk of its belly lies, is the closer approximation. Only its distal tendon is
// then slightly wrong, which is what tier (c) skinning would exist to fix.
const FOREARM_MESH_PREFIXES = ["Radius.l", "Ulna.l"];
const UPPERARM_MUSCLE_PREFIXES = ["Long head of triceps brachii.l",
  "Lateral head of triceps brachii.l", "Medial head of triceps brachii.l"];
// The Stage 3 dataset scoped muscle_engagement to chest muscles only and has no
// triceps entries, so the triceps is rendered as ordinary anatomy rather than being
// assigned an invented role -- "elbow extension" appearing in joint_actions is not
// the same thing as sourced engagement data for a specific muscle.

const ROLE_COLOR: Record<Role, Color3> = {
  prime_mover: Color3.FromHexString("#ef4444"),
  synergist: Color3.FromHexString("#f59e0b"),
  stabilizer: Color3.FromHexString("#3b82f6"),
};
const ROLE_LABEL: Record<Role, string> = {
  prime_mover: "主動肌", synergist: "協同肌", stabilizer: "穩定肌",
};
const ZH_MUSCLE: Record<string, string> = {
  pec_major_clavicular: "胸大肌鎖骨部（上胸）",
  pec_major_sternocostal: "胸大肌胸肋部（中胸）",
  pec_major_abdominal: "胸大肌腹部（下胸）",
  pectoralis_minor: "胸小肌", serratus_anterior: "前鋸肌",
};
const INACTIVE_COLOR = Color3.FromHexString("#475569");

// Joint centres computed from the real geometry in Blender: the point where the two
// articulating bones actually touch (BVH closest-point). Glenohumeral = humerus vs
// scapula (contact 0.00083); humeroulnar = ulna vs humerus (contact 0.000032 -- the
// ulnar trochlear notch on the humeral trochlea, which is the true elbow hinge; the
// radius meets the capitulum, a different facet, so it is not the hinge axis).
// Blender Z-up -> Babylon Y-up is (-x, z, -y), verified against loaded mesh bounds.
const b2b = (x: number, y: number, z: number) => new Vector3(-x, z, -y);
const SHOULDER = b2b(0.15067100524902344, 0.03474174439907074, 1.365230917930603);
const ELBOW_REST = b2b(0.21799206733703613, 0.042124610394239426, 1.1081428527832031);

// Elbow flexion ROM. Generic anatomical range, NOT per-exercise: the Stage 3 dataset
// records joint actions qualitatively ("elbow extension") with no degree values, so a
// per-exercise arc here would be invented data. Labelled as generic in the UI.
const ELBOW_MIN_DEG = 0;    // full extension
const ELBOW_MAX_DEG = 145;  // full flexion

const canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas")!;
const selectEl = document.querySelector<HTMLSelectElement>("#exercise")!;
const romEl = document.querySelector<HTMLDivElement>("#rom")!;
const metaEl = document.querySelector<HTMLDivElement>("#meta")!;
const musclesEl = document.querySelector<HTMLDivElement>("#muscles")!;
const caveatEl = document.querySelector<HTMLDivElement>("#caveat")!;

const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.043, 0.063, 0.125, 1);

const camera = new ArcRotateCamera("camera", -Math.PI / 2.6, Math.PI / 2.4, 0.75,
  SHOULDER.add(new Vector3(0, -0.12, 0)), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 0.25;
camera.upperRadiusLimit = 2.5;
camera.wheelPrecision = 250;
// Real anatomical scale (~0.3m); Babylon's default near clip is too far for this.
camera.minZ = 0.001;
camera.maxZ = 100;

new HemisphericLight("ambient", new Vector3(0.1, 1, -0.25), scene).intensity = 0.95;
const keyLight = new DirectionalLight("key", new Vector3(-0.55, -1, 0.6), scene);
keyLight.intensity = 0.7;

const muscleMaterials = new Map<string, StandardMaterial>();
let exercises: Exercise[] = [];
let shoulderDeg = 0;
let elbowDeg = 0;
let isDragging = false;
let atBoundary = false;

Promise.all([
  fetch("/exercises.json").then((r) => r.json() as Promise<Exercise[]>),
  SceneLoader.ImportMeshAsync("", "/", "chest_pilot_v2.glb", scene),
]).then(([loadedExercises, imported]) => {
  exercises = loadedExercises;

  const boneMat = new StandardMaterial("boneMat", scene);
  boneMat.diffuseColor = Color3.FromHexString("#d8dee9");
  boneMat.specularColor = new Color3(0.15, 0.17, 0.22);
  const tricepsMat = new StandardMaterial("tricepsMat", scene);
  tricepsMat.diffuseColor = Color3.FromHexString("#8b7355");
  tricepsMat.alpha = 0.75;

  const humerusParts: AbstractMesh[] = [];
  const forearmParts: AbstractMesh[] = [];

  for (const mesh of imported.meshes as AbstractMesh[]) {
    if (mesh.name === "__root__") continue;
    if (mesh.name.startsWith("Humerus.l")) humerusParts.push(mesh);
    if (UPPERARM_MUSCLE_PREFIXES.some((p) => mesh.name.startsWith(p))) humerusParts.push(mesh);
    if (FOREARM_MESH_PREFIXES.some((p) => mesh.name.startsWith(p))) forearmParts.push(mesh);

    const muscleId = Object.keys(MUSCLE_MESH_PREFIX).find((id) =>
      mesh.name.startsWith(MUSCLE_MESH_PREFIX[id]));
    if (muscleId) {
      let mat = muscleMaterials.get(muscleId);
      if (!mat) {
        mat = new StandardMaterial(`muscleMat_${muscleId}`, scene);
        mat.specularColor = new Color3(0.12, 0.14, 0.18);
        muscleMaterials.set(muscleId, mat);
      }
      mesh.material = mat;
    } else if (mesh.name.includes("triceps")) {
      mesh.material = tricepsMat;
    } else {
      mesh.material = boneMat;
    }
  }

  // Find the rest wrist position: the distal (lowest-Y) extent of the ulna.
  let wristRest = ELBOW_REST.clone();
  const ulna = forearmParts.find((m) => m.name.startsWith("Ulna.l"));
  if (ulna) {
    ulna.computeWorldMatrix(true);
    const bb = ulna.getBoundingInfo().boundingBox;
    wristRest = new Vector3(
      (bb.minimumWorld.x + bb.maximumWorld.x) / 2,
      bb.minimumWorld.y,
      (bb.minimumWorld.z + bb.maximumWorld.z) / 2,
    );
  }

  const UPPER_LEN = Vector3.Distance(SHOULDER, ELBOW_REST);
  const FORE_LEN = Vector3.Distance(ELBOW_REST, wristRest);
  const restUpperDir = ELBOW_REST.subtract(SHOULDER).normalize();
  const restForeDir = wristRest.subtract(ELBOW_REST).normalize();

  // Two-node hierarchy rather than a Skeleton/Bone rig. The first attempt used
  // Bone.setRotationMatrix on a parent/child bone pair, and the elbow visibly came
  // apart under flexion (measured: humerus and ulna world AABBs overlap at rest but
  // separate at 61 degrees). TransformNode pivots are unambiguous here: setParent
  // preserves each mesh's world transform and stores the offset, so rotating a node
  // rotates its meshes about that node's origin, and a child node inherits the
  // parent's rotation -- which is exactly the chained movement ("連動") wanted.
  const shoulderNode = new TransformNode("shoulderJoint", scene);
  shoulderNode.position.copyFrom(SHOULDER);
  shoulderNode.rotationQuaternion = Quaternion.Identity();

  const elbowNode = new TransformNode("elbowJoint", scene);
  elbowNode.parent = shoulderNode;
  // local offset from shoulder to elbow, in the shoulder node's (initially identity) frame
  elbowNode.position.copyFrom(ELBOW_REST.subtract(SHOULDER));
  elbowNode.rotationQuaternion = Quaternion.Identity();

  for (const p of humerusParts) p.setParent(shoulderNode);
  for (const p of forearmParts) p.setParent(elbowNode);

  const target = MeshBuilder.CreateSphere("dragTarget", { diameter: 0.03 }, scene);
  const tMat = new StandardMaterial("targetMat", scene);
  tMat.diffuseColor = Color3.FromHexString("#fb923c");
  tMat.emissiveColor = Color3.FromHexString("#7c2d12");
  target.material = tMat;
  target.position.copyFrom(wristRest);
  target.isPickable = true;

  const drag = new PointerDragBehavior();
  drag.detachCameraControls = true;
  target.addBehavior(drag);
  drag.onDragStartObservable.add(() => { isDragging = true; });
  drag.onDragEndObservable.add(() => { isDragging = false; });

  const REACH_MIN = Math.abs(UPPER_LEN - FORE_LEN) + 0.012;
  const REACH_MAX = UPPER_LEN + FORE_LEN - 0.004;

  scene.onBeforeRenderObservable.add(() => {
    // --- analytic two-bone IK (law of cosines) ---
    const toTarget = target.position.subtract(SHOULDER);
    let dist = toTarget.length();
    const clampedDist = Math.max(REACH_MIN, Math.min(REACH_MAX, dist));
    atBoundary = Math.abs(clampedDist - dist) > 1e-4;
    if (dist > 1e-6) {
      target.position.copyFrom(SHOULDER.add(toTarget.scale(clampedDist / dist)));
    }
    dist = clampedDist;
    const dir = target.position.subtract(SHOULDER).normalize();

    // interior elbow angle between the two segments
    const cosElbow = clamp(
      (UPPER_LEN ** 2 + FORE_LEN ** 2 - dist ** 2) / (2 * UPPER_LEN * FORE_LEN), -1, 1);
    const elbowInterior = Math.acos(cosElbow);
    // flexion = 180 - interior (0 deg = straight arm)
    let flexion = Math.PI - elbowInterior;
    const fMin = (ELBOW_MIN_DEG * Math.PI) / 180;
    const fMax = (ELBOW_MAX_DEG * Math.PI) / 180;
    const fClamped = clamp(flexion, fMin, fMax);
    if (Math.abs(fClamped - flexion) > 1e-4) atBoundary = true;
    flexion = fClamped;

    // shoulder-to-elbow direction: rotate `dir` by alpha within the plane spanned by
    // `dir` and the rest bend plane normal.
    const alpha = Math.acos(clamp(
      (UPPER_LEN ** 2 + dist ** 2 - FORE_LEN ** 2) / (2 * UPPER_LEN * dist), -1, 1));
    // bend plane normal: keep the elbow bending in a stable, anatomically sane plane
    let normal = Vector3.Cross(restUpperDir, restForeDir);
    if (normal.lengthSquared() < 1e-8) normal = Vector3.Cross(dir, new Vector3(0, 0, 1));
    normal.normalize();
    const upperDir = rotateAround(dir, normal, alpha);
    const elbowPos = SHOULDER.add(upperDir.scale(UPPER_LEN));
    const foreDir = target.position.subtract(elbowPos).normalize();

    // Map rest directions onto solved directions.
    const qUpper = quatFromTo(restUpperDir, upperDir);
    const qForeWorld = quatFromTo(restForeDir, foreDir);
    const qForeLocal = qUpper.conjugate().multiply(qForeWorld);

    shoulderNode.rotationQuaternion = qUpper;
    elbowNode.rotationQuaternion = qForeLocal;

    elbowDeg = Math.round((flexion * 180) / Math.PI);
    shoulderDeg = Math.round(
      (Math.acos(clamp(Vector3.Dot(restUpperDir, upperDir), -1, 1)) * 180) / Math.PI);
    updateReadout();
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
  (window as any).__angles = () => ({ shoulder: shoulderDeg, elbow: elbowDeg });
  (window as any).__lens = () => ({ upper: UPPER_LEN, fore: FORE_LEN });
  (window as any).__boundsOf = (prefix: string) => {
    const m = scene.meshes.find((x) => x.name.startsWith(prefix));
    if (!m) return null;
    m.computeWorldMatrix(true);
    const bi = m.getBoundingInfo();
    return { min: bi.boundingBox.minimumWorld.asArray(), max: bi.boundingBox.maximumWorld.asArray() };
  };
  (window as any).__projectTarget = () =>
    Vector3.Project(target.position, Matrix.Identity(), scene.getTransformMatrix(),
      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())).asArray();
});

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function rotateAround(v: Vector3, axis: Vector3, angle: number): Vector3 {
  const q = Quaternion.RotationAxis(axis, angle);
  const m = new Matrix();
  Matrix.FromQuaternionToRef(q, m);
  return Vector3.TransformNormal(v, m).normalize();
}

function quatFromTo(from: Vector3, to: Vector3): Quaternion {
  const d = clamp(Vector3.Dot(from, to), -1, 1);
  if (d > 0.999999) return Quaternion.Identity();
  if (d < -0.999999) {
    let ortho = Vector3.Cross(from, new Vector3(1, 0, 0));
    if (ortho.lengthSquared() < 1e-8) ortho = Vector3.Cross(from, new Vector3(0, 1, 0));
    return Quaternion.RotationAxis(ortho.normalize(), Math.PI);
  }
  const axis = Vector3.Cross(from, to).normalize();
  return Quaternion.RotationAxis(axis, Math.acos(d));
}


function updateReadout(): void {
  const state = isDragging ? "拖曳中" : "可拖曳";
  const bound = atBoundary ? " · 已達活動度邊界" : "";
  romEl.textContent =
    `${state} · 肩關節偏移 ${shoulderDeg}° · 肘關節屈曲 ${elbowDeg}°` +
    `　（肘 ${ELBOW_MIN_DEG}°～${ELBOW_MAX_DEG}° 為通用活動度，非此動作專屬）${bound}`;
}

function applyExercise(exerciseId: string): void {
  const ex = exercises.find((e) => e.exercise_id === exerciseId);
  if (!ex) return;
  const byId = new Map(ex.muscle_engagement.map((e) => [e.muscle_id, e]));
  for (const [id, mat] of muscleMaterials) {
    const eng = byId.get(id);
    if (eng) {
      mat.diffuseColor = ROLE_COLOR[eng.role];
      mat.emissiveColor = ROLE_COLOR[eng.role].scale(0.22);
      mat.alpha = 1;
    } else {
      mat.diffuseColor = INACTIVE_COLOR;
      mat.emissiveColor = Color3.Black();
      mat.alpha = 0.45;
    }
  }

  metaEl.innerHTML = "";
  for (const [k, v] of [["器材", ex.equipment_type], ["運動平面", ex.movement_plane],
    ["關節動作", ex.joint_actions.join("、")]] as Array<[string, string]>) {
    const row = document.createElement("div");
    row.className = "row";
    const kEl = document.createElement("span");
    kEl.className = "k"; kEl.textContent = k;
    const vEl = document.createElement("span"); vEl.textContent = v;
    row.append(kEl, vEl); metaEl.appendChild(row);
  }

  musclesEl.innerHTML = "";
  const order: Role[] = ["prime_mover", "synergist", "stabilizer"];
  for (const eng of [...ex.muscle_engagement].sort(
    (a, b) => order.indexOf(a.role) - order.indexOf(b.role))) {
    const row = document.createElement("div");
    row.className = "muscle";
    const sw = document.createElement("i");
    sw.className = "swatch";
    sw.style.background = ROLE_COLOR[eng.role].toHexString();
    const name = document.createElement("span");
    name.className = "mname";
    name.textContent = ZH_MUSCLE[eng.muscle_id] ?? eng.muscle_id;
    const role = document.createElement("span");
    role.className = "mrole"; role.textContent = ROLE_LABEL[eng.role];
    row.append(sw, name, role); musclesEl.appendChild(row);
    if (eng.note) {
      const note = document.createElement("div");
      note.className = "mnote"; note.textContent = eng.note;
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
