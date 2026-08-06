import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
// Side-effect import: registers Scene.prototype.pick. Without it picking silently
// no-ops (see verification_screenshots/INDEPENDENT_VERIFICATION.md).
import "@babylonjs/core/Culling/ray";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Scene } from "@babylonjs/core/scene";
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

// muscle_id (Stage 3 schema) -> the mesh name prefix in chest_pilot.glb.
// The glTF exporter splits some objects into "<name>_primitive0/1", so this
// matches by prefix rather than exact equality.
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
const INACTIVE_COLOR = Color3.FromHexString("#475569");
const BONE_COLOR = Color3.FromHexString("#d8dee9");

const canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas")!;
const selectEl = document.querySelector<HTMLSelectElement>("#exercise")!;
const metaEl = document.querySelector<HTMLDivElement>("#meta")!;
const musclesEl = document.querySelector<HTMLDivElement>("#muscles")!;
const caveatEl = document.querySelector<HTMLDivElement>("#caveat")!;

const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.043, 0.063, 0.125, 1);

// Anatomically-derived pivot, used here only to frame the camera on the joint.
// (Blender Z-up -> Babylon Y-up is (-x, z, -y); verified against the loaded mesh
// bounds, not assumed -- see real_asset_demo.ts.)
const FOCUS = new Vector3(-0.1507, 1.3652, -0.0347);

const camera = new ArcRotateCamera("camera", -Math.PI / 2.6, Math.PI / 2.3, 0.55, FOCUS, scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 0.2;
camera.upperRadiusLimit = 2;
camera.wheelPrecision = 300;
// Scene is at real anatomical scale (~0.3m); the default near-clip plane is too
// far out for content this small and clips the whole model away.
camera.minZ = 0.001;
camera.maxZ = 100;

new HemisphericLight("ambient", new Vector3(0.1, 1, -0.25), scene).intensity = 0.95;
const keyLight = new DirectionalLight("key", new Vector3(-0.55, -1, 0.6), scene);
keyLight.intensity = 0.7;

const muscleMaterials = new Map<string, StandardMaterial>();
let exercises: Exercise[] = [];

Promise.all([
  fetch("/exercises.json").then((r) => r.json() as Promise<Exercise[]>),
  SceneLoader.ImportMeshAsync("", "/", "chest_pilot.glb", scene),
]).then(([loadedExercises, imported]) => {
  exercises = loadedExercises;

  // Bones get a neutral material; each muscle group gets its own material instance
  // so it can be recoloured independently per exercise.
  const boneMat = new StandardMaterial("boneMat", scene);
  boneMat.diffuseColor = BONE_COLOR;
  boneMat.specularColor = new Color3(0.15, 0.17, 0.22);

  for (const mesh of imported.meshes as AbstractMesh[]) {
    if (mesh.name === "__root__") continue;
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

  for (const ex of exercises) {
    const opt = document.createElement("option");
    opt.value = ex.exercise_id;
    opt.textContent = `${ex.name_zh}（${ex.colloquial_region_tag}）`;
    selectEl.appendChild(opt);
  }
  selectEl.addEventListener("change", () => applyExercise(selectEl.value));
  applyExercise(exercises[0].exercise_id);

  (window as any).__ready = true;
  (window as any).__muscleColorOf = (muscleId: string) => {
    const m = muscleMaterials.get(muscleId);
    return m ? m.diffuseColor.toHexString() : null;
  };
});

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
    name.textContent = zhMuscleName(eng.muscle_id);
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

function zhMuscleName(muscleId: string): string {
  const names: Record<string, string> = {
    pec_major_clavicular: "胸大肌鎖骨部（上胸）",
    pec_major_sternocostal: "胸大肌胸肋部（中胸）",
    pec_major_abdominal: "胸大肌腹部（下胸）",
    pectoralis_minor: "胸小肌",
    serratus_anterior: "前鋸肌",
  };
  return names[muscleId] ?? muscleId;
}

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
