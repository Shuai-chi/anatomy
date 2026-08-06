import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";

/**
 * Joint model + range-of-motion clamping.
 *
 * Limits come from the `rom` key added to public/joint_axes.json (data lifted from
 * public/rom_data.json). The legacy `rom_deg` field in that same file is NOT read:
 * it stores the opposite sign for elbow and knee, and rom_data.json warns that
 * negating the angle *and* flipping the axis cancels out.
 *
 * ── Frame (verified empirically against public/fullbody_lite.glb, not derived on paper) ──
 *   down    = the segment's rig rest direction (bone long axis, away from the joint)
 *   lateral = the abduction direction: -X for `.l`, +X for `.r`
 *   front   = +Z (anterior)
 * so `abduction > 0` and `external rotation > 0` mean the same anatomical thing on
 * both sides and the left-side ROM numbers apply unmirrored. That is the
 * "mirror the axis, keep the numbers" branch rom_data.json._meta.lr_mirroring asks for;
 * the numbers are never additionally negated (which is what the old setBoth() did).
 *
 * ── Ball joints ──
 * The swing is clamped as a genuine 2-DOF cone: the dragged direction is decomposed
 * into (abduction, flexion) in the frame above, each is clamped, and the direction is
 * rebuilt from the clamped pair. Axial rotation is an independent twist applied first
 * so the swing carries it. rom_data.json._meta.ball_joint_clamping_warning requires
 * the wiring step to pick and document one decomposition order; this is it:
 *
 *   twist → abduction → flexion → horizontal adduction   (extrinsic, in parent space)
 */

export interface DofConditional {
  knee_extended_max_flexion?: number;
  knee_flexed_max_dorsiflexion?: number;
  note?: string;
}

export interface DofLimit {
  axis: string;
  min: number;
  max: number;
  confidence?: string;
  note?: string;
  source?: string;
  conditional?: DofConditional;
  available_only_when?: string;
}

export interface JointRom {
  joint_type: string;
  driveable: boolean;
  not_driveable_reason?: string;
  dof: DofLimit[];
}

export interface JointAxesEntry {
  type?: string;
  rom?: JointRom;
}

export type JointAxesFile = Record<string, JointAxesEntry>;

/** Which anatomical DOF drives which slot of the twist→abduction→flexion→HA chain. */
const FLEX_AXES = ["flexion_extension", "dorsi_plantarflexion"];
const ABD_AXES = ["abduction_adduction", "inversion_eversion", "radial_ulnar_deviation"];
const TWIST_AXES = ["internal_external_rotation", "pronation_supination", "tibial_rotation"];
const HA_AXES = ["horizontal_adduction"];

export interface JointModel {
  segmentId: string;
  jointKey: string;
  side: "l" | "r" | null;
  type: string;
  driveable: boolean;
  notDriveableReason?: string;
  limits: Map<string, DofLimit>;
  order: string[];
  angles: Map<string, number>;
  atLimit: Set<string>;
  down: Vector3;
  lateral: Vector3;
  front: Vector3;
  flexAxis: Vector3;
  abdAxis: Vector3;
  twistAxis: Vector3;
  haAxis: Vector3;
}

/** Cross-joint state the coupled limits need (rom_data coupling_constraints). */
export interface RomContext {
  kneeFlexion: number;
}

export const NEUTRAL_CONTEXT: RomContext = { kneeFlexion: 0 };

export function createJointModel(segmentId: string, restDirection: Vector3, rom: JointRom | undefined): JointModel {
  const [jointKey, rawSide] = segmentId.split(".");
  const side = rawSide === "l" || rawSide === "r" ? rawSide : null;
  const lateralSign = side === "l" ? -1 : 1;
  const down = restDirection.clone().normalize();

  let lateral = new Vector3(lateralSign, 0, 0);
  lateral.subtractInPlace(down.scale(Vector3.Dot(lateral, down)));
  if (lateral.lengthSquared() < 1e-6) lateral = new Vector3(lateralSign, 0, 0);
  lateral.normalize();

  const front = new Vector3(0, 0, 1);
  front.subtractInPlace(down.scale(Vector3.Dot(front, down)));
  front.subtractInPlace(lateral.scale(Vector3.Dot(front, lateral)));
  if (front.lengthSquared() < 1e-6) front.set(0, 0, 1);
  front.normalize();

  // The knee is the one joint whose flexion swings the distal segment backwards.
  const flexFrontSign = jointKey === "knee" ? -1 : 1;
  const limits = new Map<string, DofLimit>();
  const angles = new Map<string, number>();
  for (const dof of rom?.dof ?? []) {
    limits.set(dof.axis, dof);
    angles.set(dof.axis, 0);
  }

  return {
    segmentId,
    jointKey: jointKey ?? segmentId,
    side,
    type: rom?.joint_type ?? "unmodelled",
    driveable: rom?.driveable ?? false,
    notDriveableReason: rom?.not_driveable_reason,
    limits,
    order: [...limits.keys()],
    angles,
    atLimit: new Set<string>(),
    down,
    lateral,
    front,
    flexAxis: Vector3.Cross(down, front).normalize().scale(flexFrontSign),
    abdAxis: Vector3.Cross(down, lateral).normalize(),
    twistAxis: down.scale(-lateralSign),
    haAxis: down.scale(lateralSign),
  };
}

function slot(model: JointModel, names: string[]): string | null {
  for (const name of names) if (model.limits.has(name)) return name;
  return null;
}

export function flexAxisName(model: JointModel): string | null { return slot(model, FLEX_AXES); }
export function abdAxisName(model: JointModel): string | null { return slot(model, ABD_AXES); }
export function twistAxisName(model: JointModel): string | null { return slot(model, TWIST_AXES); }
export function haAxisName(model: JointModel): string | null { return slot(model, HA_AXES); }

function angleOf(model: JointModel, name: string | null): number {
  return name ? model.angles.get(name) ?? 0 : 0;
}

/**
 * Effective limits after the coupled constraints rom_data.json documents:
 *  - hip flexion  80 (knee straight) → 120 (knee flexed ≥ 90)
 *  - ankle dorsiflexion −20 (knee straight) → −25 (knee flexed ≥ 90)
 *  - knee tibial rotation scales from 0 at full extension to full range at 90° flexion
 */
export function effectiveLimit(model: JointModel, axis: string, context: RomContext): { min: number; max: number } {
  const dof = model.limits.get(axis);
  if (!dof) return { min: 0, max: 0 };
  if (!model.driveable) return { min: 0, max: 0 };
  let { min, max } = dof;
  const kneeShare = clamp(context.kneeFlexion / 90, 0, 1);

  const extended = dof.conditional?.knee_extended_max_flexion;
  if (model.jointKey === "hip" && axis === "flexion_extension" && typeof extended === "number") {
    max = extended + (max - extended) * kneeShare;
  }
  const flexedDorsi = dof.conditional?.knee_flexed_max_dorsiflexion;
  if (model.jointKey === "ankle" && typeof flexedDorsi === "number") {
    min = min + (flexedDorsi - min) * kneeShare;
  }
  if (model.jointKey === "knee" && axis === "tibial_rotation") {
    min *= kneeShare;
    max *= kneeShare;
  }
  return { min, max };
}

/** Sets one DOF, clamped. Returns the angle actually applied. */
export function setDof(model: JointModel, axis: string, degrees: number, context: RomContext): number {
  if (!model.limits.has(axis) || !Number.isFinite(degrees)) return Number.NaN;
  const { min, max } = effectiveLimit(model, axis, context);
  const applied = clamp(degrees, min, max);
  model.angles.set(axis, applied);
  if (Math.abs(applied - degrees) > 1e-6) model.atLimit.add(axis);
  else model.atLimit.delete(axis);
  return applied;
}

export function resetJoint(model: JointModel): void {
  for (const axis of model.limits.keys()) model.angles.set(axis, 0);
  model.atLimit.clear();
}

/**
 * twist → abduction → flexion → horizontal adduction, all about fixed parent-space axes.
 *
 * `steps` is listed in application order and consumed in REVERSE, because Babylon's
 * `a.multiply(b)` applies **b first, then a**. Verified against the model: composing
 * forwards made horizontal_adduction a silent no-op — it ended up applied first, while
 * the limb still lay along its own long axis, which is the axis HA turns about.
 */
export function composeQuaternion(model: JointModel): Quaternion {
  const steps: Array<[Vector3, number]> = [
    [model.twistAxis, angleOf(model, twistAxisName(model))],
    [model.abdAxis, angleOf(model, abdAxisName(model))],
    [model.flexAxis, angleOf(model, flexAxisName(model))],
    [model.haAxis, angleOf(model, haAxisName(model))],
  ];
  let q = Quaternion.Identity();
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const [axis, degrees] = steps[index]!;
    if (Math.abs(degrees) < 1e-6) continue;
    q = q.multiply(Quaternion.RotationAxis(axis, (degrees * Math.PI) / 180));
  }
  return q;
}

/**
 * Drag solver: turn a desired bone direction (in parent space) into clamped
 * (abduction, flexion). Horizontal adduction is zeroed because it is redundant with
 * (abduction, flexion) for *direction* — the pair already covers the whole sphere —
 * and keeping it would make the inverse problem underdetermined.
 * Twist is left untouched.
 * Returns true when the request was outside the cone and had to be projected onto it.
 */
export function solveSwing(model: JointModel, direction: Vector3, context: RomContext): boolean {
  if (!model.driveable) return true;
  const d = direction.clone();
  if (d.lengthSquared() < 1e-9) return false;
  d.normalize();

  const flexName = flexAxisName(model);
  const abdName = abdAxisName(model);
  const haName = haAxisName(model);
  if (haName) model.angles.set(haName, 0);

  const lateralComponent = Vector3.Dot(d, model.lateral);
  const downComponent = Vector3.Dot(d, model.down);
  // flexAxis already carries the knee's sign flip; undo it here so the solved angle
  // comes back in the anatomical (flexion-positive) convention.
  const flexSign = model.jointKey === "knee" ? -1 : 1;
  const frontComponent = Vector3.Dot(d, model.front) * flexSign;

  // atan2, not asin: asin(lateralComponent) is structurally capped at +/-90 degrees
  // because a dot product with a unit vector is bounded to [-1,1] -- no drag trajectory
  // could ever request more than 90 degrees of abduction, regardless of rom_data.json's
  // documented range (shoulder is 120). atan2 against downComponent recovers the full
  // +/-180 range the same way requestedFlex already does, so past 90 degrees of abduction
  // (down component goes negative) is now reachable up to whatever the ROM clamp allows.
  const requestedAbd = (Math.atan2(lateralComponent, downComponent) * 180) / Math.PI;
  const requestedFlex = (Math.atan2(frontComponent, downComponent) * 180) / Math.PI;

  let clamped = false;
  if (abdName) clamped = Math.abs(setDof(model, abdName, requestedAbd, context) - requestedAbd) > 1e-6 || clamped;
  else clamped = Math.abs(requestedAbd) > 1e-6 || clamped;
  if (flexName) clamped = Math.abs(setDof(model, flexName, requestedFlex, context) - requestedFlex) > 1e-6 || clamped;
  return clamped;
}

export function isAtLimit(model: JointModel): boolean {
  return model.atLimit.size > 0;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
