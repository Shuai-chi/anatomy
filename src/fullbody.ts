import { PointerDragBehavior } from "@babylonjs/core/Behaviors/Meshes/pointerDragBehavior";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
// Registers Scene.prototype.pick/createPickingRay. Without this side-effect import,
// tree shaking makes picking silently return hit:false for every pointer event.
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
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";

type Layer = "bone" | "muscle" | "fascia";

interface SegmentConfig {
  parent: string | null;
  pivot: [number, number, number] | null;
  contact?: number;
  meshes: string[];
}

interface RigConfig {
  segments: Record<string, SegmentConfig>;
  meta: Record<string, unknown>;
}

interface SegmentRuntime {
  config: SegmentConfig;
  node: TransformNode;
  restDirectionLocal: Vector3 | null;
  control: Mesh | null;
}

interface DebugWindow extends Window {
  __ready?: boolean;
  __segments?: () => string[];
  __boundsOf?: (meshNamePrefix: string) => BoundsResult | null;
  __setJointAngle?: (segmentId: string, degrees: number) => boolean;
}

interface BoundsResult {
  min: [number, number, number];
  max: [number, number, number];
}

const canvas = requiredElement<HTMLCanvasElement>("#renderCanvas");
const selectedMeshElement = requiredElement<HTMLSpanElement>("#selectedMesh");
const draggedJointElement = requiredElement<HTMLSpanElement>("#draggedJoint");
const statusElement = requiredElement<HTMLDivElement>("#status");
const resetButton = requiredElement<HTMLButtonElement>("#resetPose");

const engine = new Engine(canvas, true, {
  adaptToDeviceRatio: true,
  preserveDrawingBuffer: true,
  stencil: true,
});
const scene = new Scene(engine);
scene.clearColor = new Color4(0.043, 0.063, 0.125, 1);

const camera = new ArcRotateCamera(
  "fullBodyCamera",
  -Math.PI / 2.15,
  Math.PI / 2.2,
  2.65,
  new Vector3(0, 0.88, 0),
  scene,
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 0.65;
camera.upperRadiusLimit = 6;
camera.wheelPrecision = 90;
camera.panningSensibility = 0;
// The model is in real-world metres. Babylon's default near plane clips its
// centimetre-scale anatomy when the camera is close.
camera.minZ = 0.001;
camera.maxZ = 100;

const ambientLight = new HemisphericLight("ambientLight", new Vector3(0.15, 1, -0.3), scene);
ambientLight.intensity = 1.05;
const keyLight = new DirectionalLight("keyLight", new Vector3(-0.55, -1, 0.65), scene);
keyLight.intensity = 0.75;

const controlMaterial = createMaterial("jointControlMaterial", "#fb923c", "#7c2d12");
const activeControlMaterial = createMaterial("activeJointControlMaterial", "#fde047", "#a16207");
const segmentRuntime = new Map<string, SegmentRuntime>();
const anatomyMeshes: AbstractMesh[] = [];
const layerByMesh = new Map<AbstractMesh, Layer>();
const controlSegmentByMesh = new Map<AbstractMesh, string>();
const jointAngles = new Map<string, number>();
let rig: RigConfig | null = null;
let activeDrag: {
  segmentId: string;
  pivotWorld: Vector3;
  controlHome: Vector3;
  targetWorld: Vector3;
} | null = null;

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

void initialise().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  statusElement.textContent = `載入失敗：${message}`;
  console.error(error);
});

async function initialise(): Promise<void> {
  const [rigResponse, imported] = await Promise.all([
    fetch("/rig_config.json"),
    SceneLoader.ImportMeshAsync("", "/", "fullbody_lite.glb", scene),
  ]);
  if (!rigResponse.ok) {
    throw new Error(`rig_config.json HTTP ${rigResponse.status}`);
  }
  rig = await rigResponse.json() as RigConfig;
  validateRig(rig);

  for (const segmentId of Object.keys(rig.segments)) {
    createSegmentNode(segmentId, rig, new Set<string>());
  }

  const importedAnatomy = (imported.meshes as AbstractMesh[]).filter((mesh) => mesh.name !== "__root__");
  const assignedMeshes = assignMeshesToSegments(rig, importedAnatomy);
  createJointControls(rig);
  installLayerControls();
  installPicking();
  installReset();
  installDebugHooks(rig);

  const missingCount = rigMeshPrefixes(rig).filter((prefix) =>
    !importedAnatomy.some((mesh) => mesh.name.startsWith(prefix))).length;
  statusElement.textContent =
    `已載入 ${assignedMeshes} 個解剖網格 · ${Object.keys(rig.segments).length} 個 segment` +
    (missingCount === 0 ? " · rig 對應完整" : ` · ${missingCount} 個 rig 網格未找到`);
  (window as DebugWindow).__ready = true;
}

function createSegmentNode(segmentId: string, config: RigConfig, visiting: Set<string>): SegmentRuntime {
  const existing = segmentRuntime.get(segmentId);
  if (existing) return existing;
  if (visiting.has(segmentId)) throw new Error(`rig_config 存在循環 parent：${segmentId}`);

  const segment = config.segments[segmentId];
  if (!segment) throw new Error(`rig_config 缺少 segment：${segmentId}`);
  visiting.add(segmentId);

  const parentRuntime = segment.parent
    ? createSegmentNode(segment.parent, config, visiting)
    : null;
  const node = new TransformNode(`segment:${segmentId}`, scene);
  if (parentRuntime) node.parent = parentRuntime.node;

  const worldOrigin = segmentWorldOrigin(segmentId, config);
  const parentWorldOrigin = segment.parent
    ? segmentWorldOrigin(segment.parent, config)
    : Vector3.Zero();
  node.position.copyFrom(worldOrigin.subtract(parentWorldOrigin));
  node.rotationQuaternion = Quaternion.Identity();

  const runtime: SegmentRuntime = {
    config: segment,
    node,
    restDirectionLocal: null,
    control: null,
  };
  segmentRuntime.set(segmentId, runtime);
  visiting.delete(segmentId);
  return runtime;
}

function assignMeshesToSegments(config: RigConfig, importedMeshes: AbstractMesh[]): number {
  const alreadyAssigned = new Set<AbstractMesh>();
  for (const [segmentId, segment] of Object.entries(config.segments)) {
    const runtime = segmentRuntime.get(segmentId);
    if (!runtime) throw new Error(`segment runtime 未建立：${segmentId}`);

    for (const prefix of segment.meshes) {
      const matches = importedMeshes.filter((mesh) => mesh.name.startsWith(prefix));
      for (const mesh of matches) {
        if (alreadyAssigned.has(mesh)) {
          console.warn(`網格重複對應，保留第一次歸屬：${mesh.name}`);
          continue;
        }
        mesh.computeWorldMatrix(true);
        // setParent preserves the imported world transform while giving the mesh the
        // segment node's future rotations and all ancestor movement.
        mesh.setParent(runtime.node);
        mesh.isPickable = true;
        alreadyAssigned.add(mesh);
        anatomyMeshes.push(mesh);
        layerByMesh.set(mesh, classifyLayer(prefix));
      }
    }
  }

  const unassigned = importedMeshes.filter((mesh) => !alreadyAssigned.has(mesh));
  if (unassigned.length > 0) {
    console.warn("未被 rig_config 對應的匯入網格：", unassigned.map((mesh) => mesh.name));
  }
  return alreadyAssigned.size;
}

function createJointControls(config: RigConfig): void {
  for (const [segmentId, segment] of Object.entries(config.segments)) {
    if (!segment.pivot) continue;
    const runtime = segmentRuntime.get(segmentId);
    if (!runtime) throw new Error(`segment runtime 未建立：${segmentId}`);

    runtime.restDirectionLocal = findRestDirection(segmentId, config);
    const control = MeshBuilder.CreateSphere(
      `joint-control:${segmentId}`,
      { diameter: 0.032, segments: 16 },
      scene,
    );
    control.material = controlMaterial;
    control.isPickable = true;
    control.renderingGroupId = 2;

    const parentRuntime = segment.parent ? segmentRuntime.get(segment.parent) : null;
    if (parentRuntime) control.parent = parentRuntime.node;
    control.position.copyFrom(runtime.node.position);
    runtime.control = control;
    controlSegmentByMesh.set(control, segmentId);
    jointAngles.set(segmentId, 0);

    const drag = new PointerDragBehavior();
    drag.detachCameraControls = true;
    drag.dragDeltaRatio = 1;
    // We apply the observable's world-space delta ourselves. PointerDragBehavior
    // otherwise moves the mesh on the next before-render tick, so reading its
    // position inside onDragObservable is one pointer event behind.
    drag.moveAttached = false;
    drag.useObjectOrientationForDragging = false;
    control.addBehavior(drag);

    drag.onDragStartObservable.add(() => {
      runtime.node.computeWorldMatrix(true);
      activeDrag = {
        segmentId,
        pivotWorld: runtime.node.getAbsolutePosition().clone(),
        controlHome: runtime.node.position.clone(),
        targetWorld: runtime.node.getAbsolutePosition().clone(),
      };
      control.material = activeControlMaterial;
      canvas.style.cursor = "grabbing";
      draggedJointElement.textContent = displayJointName(segmentId);
      draggedJointElement.classList.add("active");
    });

    drag.onDragObservable.add((event) => {
      if (!activeDrag || activeDrag.segmentId !== segmentId) return;
      activeDrag.targetWorld.addInPlace(event.delta);
      control.setAbsolutePosition(activeDrag.targetWorld);
      control.computeWorldMatrix(true);
      rotateJointTowardControl(runtime, control, activeDrag.pivotWorld);
    });

    drag.onDragEndObservable.add(() => {
      if (activeDrag?.segmentId === segmentId) {
        control.position.copyFrom(activeDrag.controlHome);
        control.computeWorldMatrix(true);
        activeDrag = null;
      }
      control.material = controlMaterial;
      canvas.style.cursor = "default";
      draggedJointElement.textContent = "無";
      draggedJointElement.classList.remove("active");
    });
  }
}

function rotateJointTowardControl(runtime: SegmentRuntime, control: Mesh, pivotWorld: Vector3): void {
  if (!runtime.restDirectionLocal) return;
  const desiredWorld = control.getAbsolutePosition().subtract(pivotWorld);
  if (desiredWorld.lengthSquared() < 1e-7) return;

  const parent = runtime.node.parent;
  const desiredParentLocal = desiredWorld.clone();
  if (parent) {
    const inverseParentWorld = new Matrix();
    parent.computeWorldMatrix(true).invertToRef(inverseParentWorld);
    Vector3.TransformNormalToRef(desiredWorld, inverseParentWorld, desiredParentLocal);
  }
  desiredParentLocal.normalize();
  runtime.node.rotationQuaternion = quaternionFromTo(runtime.restDirectionLocal, desiredParentLocal);
  runtime.node.computeWorldMatrix(true);
  jointAngles.set(runtime.node.name.slice("segment:".length), angleBetween(runtime.restDirectionLocal, desiredParentLocal));
}

function findRestDirection(segmentId: string, config: RigConfig): Vector3 {
  const segment = config.segments[segmentId];
  if (!segment?.pivot) throw new Error(`無法計算靜態 segment 的方向：${segmentId}`);
  const pivot = vectorFromTuple(segment.pivot);
  const pivotedChild = Object.entries(config.segments).find(([, candidate]) =>
    candidate.parent === segmentId && candidate.pivot !== null);

  let directionWorld: Vector3;
  if (pivotedChild?.[1].pivot) {
    directionWorld = vectorFromTuple(pivotedChild[1].pivot).subtract(pivot);
  } else if (segment.parent) {
    directionWorld = pivot.subtract(segmentWorldOrigin(segment.parent, config));
  } else {
    directionWorld = Vector3.Down();
  }
  if (directionWorld.lengthSquared() < 1e-8) directionWorld.copyFrom(Vector3.Down());
  return directionWorld.normalize();
}

function installLayerControls(): void {
  const bindings: Array<[string, Layer]> = [
    ["#layerBone", "bone"],
    ["#layerMuscle", "muscle"],
    ["#layerFascia", "fascia"],
  ];
  for (const [selector, layer] of bindings) {
    const checkbox = requiredElement<HTMLInputElement>(selector);
    checkbox.addEventListener("change", () => {
      for (const mesh of anatomyMeshes) {
        if (layerByMesh.get(mesh) === layer) mesh.setEnabled(checkbox.checked);
      }
    });
  }
}

function installPicking(): void {
  scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;
    const pickedMesh = pointerInfo.pickInfo?.pickedMesh;
    if (!pickedMesh) return;
    const jointId = controlSegmentByMesh.get(pickedMesh);
    if (jointId) return;
    if (layerByMesh.has(pickedMesh)) selectedMeshElement.textContent = cleanMeshName(pickedMesh.name);
  });
}

function installReset(): void {
  resetButton.addEventListener("click", () => {
    for (const [segmentId, runtime] of segmentRuntime) {
      runtime.node.rotationQuaternion = Quaternion.Identity();
      runtime.control?.position.copyFrom(runtime.node.position);
      if (runtime.config.pivot) jointAngles.set(segmentId, 0);
    }
    activeDrag = null;
    draggedJointElement.textContent = "無";
    draggedJointElement.classList.remove("active");
    canvas.style.cursor = "default";
    statusElement.textContent = "姿勢已重置";
  });
}

function installDebugHooks(config: RigConfig): void {
  const debugWindow = window as DebugWindow;
  debugWindow.__segments = () => Object.keys(config.segments);
  debugWindow.__boundsOf = (meshNamePrefix: string) => {
    const matches = anatomyMeshes.filter((mesh) => mesh.name.startsWith(meshNamePrefix));
    if (matches.length === 0) return null;

    const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    for (const mesh of matches) {
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      min.minimizeInPlace(box.minimumWorld);
      max.maximizeInPlace(box.maximumWorld);
    }
    return { min: tupleFromVector(min), max: tupleFromVector(max) };
  };
  debugWindow.__setJointAngle = (segmentId: string, degrees: number) => {
    const runtime = segmentRuntime.get(segmentId);
    if (!runtime?.config.pivot || !Number.isFinite(degrees)) return false;
    const radians = degrees * Math.PI / 180;
    runtime.node.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 0, 1), radians);
    runtime.node.computeWorldMatrix(true);
    jointAngles.set(segmentId, degrees);
    statusElement.textContent = `${displayJointName(segmentId)} 已設為 ${formatDegrees(degrees)}°`;
    return true;
  };
}

function validateRig(config: RigConfig): void {
  const ids = Object.keys(config.segments);
  if (ids.length !== 16) throw new Error(`預期 16 個 segment，實際為 ${ids.length}`);
  for (const [segmentId, segment] of Object.entries(config.segments)) {
    if (segment.parent && !config.segments[segment.parent]) {
      throw new Error(`${segmentId} 的 parent 不存在：${segment.parent}`);
    }
    if (!Array.isArray(segment.meshes)) throw new Error(`${segmentId}.meshes 格式錯誤`);
  }
}

function segmentWorldOrigin(segmentId: string, config: RigConfig): Vector3 {
  const segment = config.segments[segmentId];
  if (!segment) throw new Error(`未知 segment：${segmentId}`);
  if (segment.pivot) return vectorFromTuple(segment.pivot);
  return segment.parent ? segmentWorldOrigin(segment.parent, config) : Vector3.Zero();
}

function rigMeshPrefixes(config: RigConfig): string[] {
  return Object.values(config.segments).flatMap((segment) => segment.meshes);
}

function classifyLayer(name: string): Layer {
  const normalized = name.toLowerCase();
  if (/fascia|tract|aponeuros/.test(normalized)) return "fascia";
  // Axial skeleton (ribs, vertebrae, discs, costal cartilage) must be listed
  // explicitly: this classifier falls through to "muscle", so anything missing from
  // the bone pattern gets hidden along with the muscle layer. That is what made the
  // torso look hollow in skeleton-only view even though the meshes were loaded.
  if (/\b(?:bone|coccyx|sacrum|sternum|clavicle|mandible|scapula|humerus|radius|ulna|femur|fibula|patella|tibia|talus|calcaneus|rib|vertebra|cartilage|disc)\b/.test(normalized)) {
    return "bone";
  }
  return "muscle";
}

function cleanMeshName(name: string): string {
  return name.replace(/_primitive\d+$/i, "").replace(/\.(?:l|r)$/i, "");
}

function displayJointName(segmentId: string): string {
  const [joint, side] = segmentId.split(".");
  const jointLabels: Record<string, string> = {
    shoulder: "肩關節",
    elbow: "肘關節",
    wrist: "腕關節",
    hip: "髖關節",
    knee: "膝關節",
    ankle: "踝關節",
    subtalar: "距下關節",
  };
  const sideLabel = side === "l" ? "左" : side === "r" ? "右" : "";
  return `${sideLabel}${jointLabels[joint] ?? joint}`;
}

function quaternionFromTo(from: Vector3, to: Vector3): Quaternion {
  const dot = clamp(Vector3.Dot(from, to), -1, 1);
  if (dot > 0.999999) return Quaternion.Identity();
  if (dot < -0.999999) {
    let axis = Vector3.Cross(from, Vector3.Right());
    if (axis.lengthSquared() < 1e-8) axis = Vector3.Cross(from, Vector3.Up());
    return Quaternion.RotationAxis(axis.normalize(), Math.PI);
  }
  return Quaternion.RotationAxis(Vector3.Cross(from, to).normalize(), Math.acos(dot));
}

function angleBetween(from: Vector3, to: Vector3): number {
  return Math.acos(clamp(Vector3.Dot(from, to), -1, 1)) * 180 / Math.PI;
}

function createMaterial(name: string, diffuseHex: string, emissiveHex: string): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(diffuseHex);
  material.emissiveColor = Color3.FromHexString(emissiveHex);
  material.specularColor = new Color3(0.18, 0.18, 0.2);
  return material;
}

function vectorFromTuple(value: [number, number, number]): Vector3 {
  return new Vector3(value[0], value[1], value[2]);
}

function tupleFromVector(value: Vector3): [number, number, number] {
  return [value.x, value.y, value.z];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatDegrees(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`找不到必要元素：${selector}`);
  return element;
}
