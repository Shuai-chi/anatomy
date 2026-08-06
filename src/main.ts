import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Bone } from "@babylonjs/core/Bones/bone";
import { BoneIKController } from "@babylonjs/core/Bones/boneIKController";
import { PointerDragBehavior } from "@babylonjs/core/Behaviors/Meshes/pointerDragBehavior";
// Side-effect-only import: registers Scene.prototype.pick/createPickingRay.
// Without this, tree-shaken @babylonjs/core imports silently leave picking
// non-functional (scene.pick() always returns hit:false, no error thrown).
import "@babylonjs/core/Culling/ray";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import "./style.css";

const canvasElement = document.querySelector<HTMLCanvasElement>("#renderCanvas");
const statusElement = document.querySelector<HTMLOutputElement>("#status");

if (!canvasElement || !statusElement) {
  throw new Error("找不到 #renderCanvas 或 #status");
}

const canvas: HTMLCanvasElement = canvasElement;
const status: HTMLOutputElement = statusElement;

const UPPER_ARM_LENGTH = 2.6;
const FOREARM_LENGTH = 2.2;
const MIN_ELBOW_ANGLE = degreesToRadians(35);
const MAX_ELBOW_ANGLE = degreesToRadians(150);
const SHOULDER_POSITION = new Vector3(-1.9, 0.45, 0);

const minReach = reachAtElbowAngle(MIN_ELBOW_ANGLE);
const maxReach = reachAtElbowAngle(MAX_ELBOW_ANGLE);

const engine = new Engine(canvas, true, {
  adaptToDeviceRatio: true,
  preserveDrawingBuffer: true,
  stencil: true,
});
const scene = new Scene(engine);
scene.clearColor = new Color4(0.043, 0.063, 0.125, 1);

const camera = new ArcRotateCamera(
  "camera",
  -Math.PI / 2,
  Math.PI / 2.15,
  10,
  new Vector3(0, 1.55, 0),
  scene,
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 6;
camera.upperRadiusLimit = 15;
camera.wheelPrecision = 45;
camera.panningSensibility = 0;

const ambientLight = new HemisphericLight(
  "ambientLight",
  new Vector3(0.1, 1, -0.25),
  scene,
);
ambientLight.intensity = 0.9;

const keyLight = new DirectionalLight(
  "keyLight",
  new Vector3(-0.5, -1, 0.65),
  scene,
);
keyLight.intensity = 0.75;

const boneMaterial = createMaterial("boneMaterial", new Color3(0.86, 0.9, 0.96));
boneMaterial.roughness = 0.72;
const jointMaterial = createMaterial("jointMaterial", new Color3(0.45, 0.55, 0.72));
const targetMaterial = createMaterial("targetMaterial", new Color3(1, 0.36, 0.06));
targetMaterial.emissiveColor = new Color3(0.38, 0.07, 0.01);
const poleMaterial = createMaterial("poleMaterial", new Color3(0.08, 0.62, 0.9));
poleMaterial.emissiveColor = new Color3(0.01, 0.15, 0.28);
poleMaterial.alpha = 0.7;

// A real Babylon skeleton drives the display meshes. The tiny hidden mesh is the
// skeleton's world-space reference and gives attachToBone a transform to follow.
const skeleton = new Skeleton("armSkeleton", "armSkeleton", scene);
const shoulderBone = new Bone(
  "shoulder",
  skeleton,
  null,
  Matrix.Identity(),
  null,
  null,
  0,
);
shoulderBone.length = UPPER_ARM_LENGTH;
const elbowBone = new Bone(
  "elbow",
  skeleton,
  shoulderBone,
  Matrix.Translation(0, UPPER_ARM_LENGTH, 0),
  null,
  null,
  1,
);
elbowBone.length = FOREARM_LENGTH;
const wristBone = new Bone(
  "wrist",
  skeleton,
  elbowBone,
  Matrix.Translation(0, FOREARM_LENGTH, 0),
  null,
  null,
  2,
);
wristBone.length = 0.35;

const rigRoot = MeshBuilder.CreateBox("rigRoot", { size: 0.01 }, scene);
rigRoot.position.copyFrom(SHOULDER_POSITION);
rigRoot.isVisible = false;
rigRoot.isPickable = false;
rigRoot.skeleton = skeleton;

const upperArm = createBoneSegment("upperArm", UPPER_ARM_LENGTH, 0.38);
upperArm.position.y = UPPER_ARM_LENGTH / 2;
upperArm.attachToBone(shoulderBone, rigRoot);

const forearm = createBoneSegment("forearm", FOREARM_LENGTH, 0.31);
forearm.position.y = FOREARM_LENGTH / 2;
forearm.attachToBone(elbowBone, rigRoot);

const shoulderJoint = createJoint("shoulderJoint", 0.5);
shoulderJoint.attachToBone(shoulderBone, rigRoot);
const elbowJoint = createJoint("elbowJoint", 0.43);
elbowJoint.attachToBone(elbowBone, rigRoot);
const wristJoint = createJoint("wristJoint", 0.35);
wristJoint.attachToBone(wristBone, rigRoot);

const target = MeshBuilder.CreateSphere(
  "ikTarget",
  { diameter: 0.64, segments: 24 },
  scene,
);
target.position.set(2.05, 2.25, 0);
target.material = targetMaterial;
target.isPickable = true;

const poleTarget = MeshBuilder.CreateSphere(
  "poleTarget",
  { diameter: 0.3, segments: 16 },
  scene,
);
poleTarget.position.copyFrom(SHOULDER_POSITION.add(new Vector3(-0.3, 3.5, 0)));
poleTarget.material = poleMaterial;
poleTarget.isPickable = false;

const ikController = new BoneIKController(rigRoot, elbowBone, {
  targetMesh: target,
  poleTargetMesh: poleTarget,
  bendAxis: Vector3.Right(),
  maxAngle: MAX_ELBOW_ANGLE,
  slerpAmount: 1,
});

const dragBehavior = new PointerDragBehavior();
dragBehavior.dragDeltaRatio = 1;
dragBehavior.detachCameraControls = true;
dragBehavior.useObjectOrientationForDragging = false;
target.addBehavior(dragBehavior);

let isDragging = false;
let isAtRomBoundary = false;

dragBehavior.onDragStartObservable.add(() => {
  isDragging = true;
  canvas.style.cursor = "grabbing";
});

dragBehavior.onDragEndObservable.add(() => {
  isDragging = false;
  canvas.style.cursor = "grab";
});

target.actionManager = null;
canvas.style.cursor = "grab";

scene.onBeforeRenderObservable.add(() => {
  isAtRomBoundary = constrainTargetToElbowRom(target.position);
  ikController.update();
  skeleton.computeAbsoluteMatrices();
  skeleton.prepare(true);
  updateStatus();
});

engine.runRenderLoop(() => {
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});

status.textContent = "IK 已就緒，拖曳橘色球體";

function createMaterial(name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.specularColor = new Color3(0.22, 0.25, 0.32);
  return material;
}

function createBoneSegment(name: string, length: number, diameter: number): Mesh {
  const segment = MeshBuilder.CreateCylinder(
    name,
    {
      height: length,
      diameter,
      tessellation: 28,
    },
    scene,
  );
  segment.material = boneMaterial;
  segment.isPickable = false;
  return segment;
}

function createJoint(name: string, diameter: number): Mesh {
  const joint = MeshBuilder.CreateSphere(name, { diameter, segments: 20 }, scene);
  joint.material = jointMaterial;
  joint.isPickable = false;
  return joint;
}

function constrainTargetToElbowRom(targetPosition: Vector3): boolean {
  const shoulderWorld = rigRoot.getAbsolutePosition();
  const shoulderToTarget = targetPosition.subtract(shoulderWorld);
  const currentReach = shoulderToTarget.length();
  const constrainedReach = Math.min(maxReach, Math.max(minReach, currentReach));

  if (Math.abs(currentReach - constrainedReach) < 0.0001) {
    return false;
  }

  if (currentReach < 0.0001) {
    shoulderToTarget.copyFrom(Vector3.Right());
  } else {
    shoulderToTarget.scaleInPlace(1 / currentReach);
  }

  targetPosition.copyFrom(shoulderWorld.add(shoulderToTarget.scale(constrainedReach)));
  target.computeWorldMatrix(true);
  return true;
}

function updateStatus(): void {
  const distance = Vector3.Distance(rigRoot.getAbsolutePosition(), target.position);
  const cosine = Math.min(
    1,
    Math.max(
      -1,
      (UPPER_ARM_LENGTH ** 2 + FOREARM_LENGTH ** 2 - distance ** 2) /
        (2 * UPPER_ARM_LENGTH * FOREARM_LENGTH),
    ),
  );
  const elbowDegrees = Math.round((Math.acos(cosine) * 180) / Math.PI);
  const dragState = isDragging ? "拖曳中" : "IK 已就緒";
  const limitState = isAtRomBoundary ? " · ROM 邊界已限制" : "";
  status.textContent = `${dragState} · 肘角 ${elbowDegrees}°（限制 35°–150°）${limitState}`;
}

function reachAtElbowAngle(angle: number): number {
  return Math.sqrt(
    UPPER_ARM_LENGTH ** 2 +
      FOREARM_LENGTH ** 2 -
      2 * UPPER_ARM_LENGTH * FOREARM_LENGTH * Math.cos(angle),
  );
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
