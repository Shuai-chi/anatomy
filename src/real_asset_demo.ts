import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Bone } from "@babylonjs/core/Bones/bone";
import { PointerDragBehavior } from "@babylonjs/core/Behaviors/Meshes/pointerDragBehavior";
// Side-effect import: registers Scene.prototype.pick/createPickingRay. Missing this
// causes scene.pick() to silently return hit:false forever (see prototype's
// verification_screenshots/INDEPENDENT_VERIFICATION.md for the full story).
import "@babylonjs/core/Culling/ray";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import "./style.css";

const canvasElement = document.querySelector<HTMLCanvasElement>("#renderCanvas");
const statusElement = document.querySelector<HTMLDivElement>("#status");
if (!canvasElement || !statusElement) throw new Error("找不到 #renderCanvas 或 #status");
const canvas = canvasElement;
const status = statusElement;

const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.043, 0.063, 0.125, 1);

// Glenohumeral joint pivot computed in Blender (headless, BVH closest-point-between-
// meshes on the real Humerus.l / Scapula.l geometry -- see
// stage4_asset_pipeline/scripts/find_joint_pivot.py). Blender is Z-up; empirically
// (verified against the loaded Humerus.l bounding box, not assumed) the glTF export's
// Z-up-to-Y-up conversion here is (x, y, z) -> (-x, z, -y). Contact distance between
// the two meshes was 0.00083 units, i.e. modeled as touching -- this is the real
// articulation point, not a guessed bounding-box center.
const BLENDER_PIVOT = new Vector3(0.15067100524902344, 0.03474174439907074, 1.365230917930603);
const PIVOT = new Vector3(-BLENDER_PIVOT.x, BLENDER_PIVOT.z, -BLENDER_PIVOT.y);

const camera = new ArcRotateCamera("camera", -Math.PI / 2.4, Math.PI / 2.2, 0.6, PIVOT.clone(), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 0.2;
camera.upperRadiusLimit = 2;
camera.wheelPrecision = 300;
// Scene scale here is meters at real anatomical size (~0.3m across); Babylon's
// default camera.minZ (near clip plane) assumes a larger default scale and can
// clip the entire scene away if left unset for content this small.
camera.minZ = 0.001;
camera.maxZ = 100;

new HemisphericLight("ambient", new Vector3(0.1, 1, -0.25), scene).intensity = 0.9;
const keyLight = new DirectionalLight("key", new Vector3(-0.5, -1, 0.65), scene);
keyLight.intensity = 0.75;

status.textContent = "loading chest_pilot.glb...";

SceneLoader.ImportMeshAsync("", "/", "chest_pilot.glb", scene).then((result) => {
  const byName = (needle: string) => result.meshes.filter((m) => m.name.includes(needle));
  const humerusParts = byName("Humerus.l");
  (window as any).__debug = {
    meshCount: result.meshes.length,
    meshNames: result.meshes.map((m) => m.name),
    humerusBounds: humerusParts.map((m) => {
      m.computeWorldMatrix(true);
      const bi = m.getBoundingInfo();
      return { name: m.name, min: bi.boundingBox.minimumWorld.asArray(), max: bi.boundingBox.maximumWorld.asArray() };
    }),
    pivot: PIVOT.asArray(),
  };
  if (humerusParts.length === 0) {
    status.textContent = "ERROR: Humerus.l not found in loaded meshes";
    return;
  }

  // Marker sphere at the computed pivot, for visual sanity-check.
  const pivotMarker = MeshBuilder.CreateSphere("pivotMarker", { diameter: 0.02 }, scene);
  const markerMat = new StandardMaterial("pivotMarkerMat", scene);
  markerMat.emissiveColor = new Color3(1, 1, 0);
  pivotMarker.material = markerMat;
  pivotMarker.position.copyFrom(PIVOT);

  const skeleton = new Skeleton("shoulderSkeleton", "shoulderSkeleton", scene);
  const shoulderBone = new Bone("shoulder", skeleton, null, Matrix.Identity(), null, null, 0);

  const rigRoot = MeshBuilder.CreateBox("rigRoot", { size: 0.002 }, scene);
  rigRoot.position.copyFrom(PIVOT);
  rigRoot.isVisible = false;
  rigRoot.isPickable = false;
  rigRoot.skeleton = skeleton;

  for (const part of humerusParts) {
    part.attachToBone(shoulderBone, rigRoot);
  }

  // IK target: humerus is a single bone (no elbow in this demo), so BoneIKController's
  // 2-bone solve isn't applicable here -- instead drive the shoulder bone's rotation
  // directly from the drag target's bearing relative to the pivot, clamped to a
  // horizontal-adduction/abduction ROM range matching the Stage 3 bench-press data
  // (shoulder horizontal adduction is the prime mover action for this pilot).
  const target = MeshBuilder.CreateSphere("dragTarget", { diameter: 0.03 }, scene);
  const targetMat = new StandardMaterial("targetMat", scene);
  targetMat.emissiveColor = new Color3(1, 0.36, 0.06);
  target.material = targetMat;
  target.position.copyFrom(PIVOT.add(new Vector3(0.32, 0, 0)));
  target.isPickable = true;

  const dragBehavior = new PointerDragBehavior();
  dragBehavior.detachCameraControls = true;
  target.addBehavior(dragBehavior);

  let isDragging = false;
  dragBehavior.onDragStartObservable.add(() => { isDragging = true; });
  dragBehavior.onDragEndObservable.add(() => { isDragging = false; });

  const ARM_REACH = 0.32;
  const MIN_ANGLE = degToRad(-70); // extension / behind the body
  const MAX_ANGLE = degToRad(90); // horizontal adduction toward midline

  scene.onBeforeRenderObservable.add(() => {
    const rel = target.position.subtract(PIVOT);
    // constrain drag target to a fixed-radius arc in the horizontal (XZ) plane
    rel.y = 0;
    const len = rel.length();
    if (len > 0.0001) rel.scaleInPlace(ARM_REACH / len);
    let angle = Math.atan2(rel.z, rel.x);
    const clamped = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angle));
    const atBoundary = Math.abs(clamped - angle) > 0.001;
    angle = clamped;
    target.position.copyFrom(PIVOT.add(new Vector3(Math.cos(angle) * ARM_REACH, 0, Math.sin(angle) * ARM_REACH)));

    shoulderBone.setRotationMatrix(Matrix.RotationY(-angle), undefined);
    skeleton.computeAbsoluteMatrices();
    skeleton.prepare(true);

    const deg = Math.round((angle * 180) / Math.PI);
    status.textContent = `${isDragging ? "拖曳中" : "IK 已就緒"} · 肩關節水平內收角 ${deg}°${atBoundary ? " · ROM 邊界已限制" : ""}`;
  });

  status.textContent = "IK 已就緒，拖曳橘色球體";
  (window as any).__scene = scene;
  (window as any).__target = target;
  (window as any).__projectTarget = () =>
    Vector3.Project(
      target.position,
      Matrix.Identity(),
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
    ).asArray();
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}
