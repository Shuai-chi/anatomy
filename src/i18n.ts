import catalogue from "./data/i18n_zh.json";

export type Language = "zh" | "en";

/**
 * Buckets mirror `src/data/i18n_zh.json`. Lookup is an EXACT match on the verbatim,
 * original-cased source string.
 *
 * The previous implementation lowercased the key and then ran a longest-first regex
 * substring replacement over the whole sentence. That is precisely what produced the
 * half-translated "水平面 (horizontal adduction) with 矢狀面 肘關節伸展" output: it
 * rewrote the fragments it recognised and left the connective English in place.
 * Substring replacement is not used anywhere in this file.
 */
export type Bucket = "equipment" | "planes" | "joint_actions" | "roles" | "notes" | "ui";

const BUCKETS: Bucket[] = ["equipment", "planes", "joint_actions", "roles", "notes", "ui"];
const zh = catalogue as unknown as Record<Bucket, Record<string, string>>;

/**
 * UI chrome this build added on top of i18n_zh.json (ROM readout, playback, joint and
 * degree-of-freedom names). Kept here rather than edited into the shipped i18n_zh.json
 * so that file stays a verbatim copy of the reviewed input.
 * Key = the English string, exactly as rendered in English mode.
 */
const extraUi: Record<string, string> = {
  "Arms": "手臂",
  "Range of motion": "關節活動度",
  "Joint limit reached": "已達活動度上限",
  "Within range": "在活動範圍內",
  "Play": "播放",
  "Pause": "暫停",
  "Play movement": "播放動作",
  "Start pose": "起始姿勢",
  "End pose": "結束姿勢",
  "Phase": "動作進程",
  "Start pose applied automatically": "已自動套用起始姿勢",
  "View": "視角",
  "Anterior view": "前面觀",
  "Posterior view": "後面觀",
  "Not modelled": "未建模",
  "This joint has no derived rotation axis and is locked.": "此關節未推導出旋轉軸，已鎖定不可旋轉。",
  "Locked": "已鎖定",
  "Isometric — start and end pose are the same by design.": "等長動作——起始與結束姿勢本來就相同。",
  "Drag the orange joint spheres to change limb direction · click the model to identify a mesh · drag empty space to orbit · wheel to zoom":
    "拖曳橘色關節球改變肢體方向 · 點選模型辨識網格 · 拖曳空白處旋轉視角 · 滾輪縮放",
  "Drag sets flexion and abduction only; axial rotation and horizontal adduction come from the exercise pose.":
    "拖曳只調整屈曲與外展；軸向旋轉與水平內收由動作姿勢設定。",
  "Loaded": "已載入",
  "anatomy meshes": "個解剖網格",
  "verified exercises": "個已驗證動作",
  "muscle map complete": "肌肉對應完整",
  "muscle mappings not found": "個肌肉對應未找到",
  "flexion_extension": "屈曲／伸展",
  "abduction_adduction": "外展／內收",
  "internal_external_rotation": "內旋／外旋",
  "horizontal_adduction": "水平內收",
  "pronation_supination": "旋前／旋後",
  "tibial_rotation": "脛骨旋轉",
  "dorsi_plantarflexion": "背屈／蹠屈",
  "radial_ulnar_deviation": "橈偏／尺偏",
  "inversion_eversion": "內翻／外翻",
  "shoulder": "肩關節",
  "elbow": "肘關節",
  "wrist": "腕關節",
  "hip": "髖關節",
  "knee": "膝關節",
  "ankle": "踝關節",
  "subtalar": "距下關節",
  "torso": "軀幹",
  "pelvis": "骨盆",
  "left": "左",
  "right": "右",
  "ball": "球窩關節",
  "hinge": "屈戌關節",
  "condyloid": "髁狀關節",
  "proxy_hinge": "代理鉸鏈（非解剖關節）",
  "unmodelled": "未建模",
};

/** Source strings that reached the UI without a translation, for __untranslatedStrings(). */
const misses = new Set<string>();

/**
 * Translate one verbatim source string from public/*.json.
 * `bucket` narrows the lookup; without it the buckets are searched in a fixed order.
 * A miss returns the original string unchanged (no "（英文原文）" suffix) and is
 * recorded so the coverage hook can report it.
 */
export function translate(value: string, language: Language, bucket?: Bucket): string {
  if (language === "en") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const buckets = bucket ? [bucket] : BUCKETS;
  for (const name of buckets) {
    const hit = zh[name]?.[trimmed];
    if (hit) return hit;
  }
  misses.add(trimmed);
  return value;
}

/** UI chrome. `key` is the English string; English mode returns it verbatim. */
export function ui(language: Language, key: string): string {
  if (language === "en") return key;
  const hit = zh.ui[key] ?? extraUi[key];
  if (hit) return hit;
  misses.add(key);
  return key;
}

/** Human-readable joint name, e.g. "shoulder.l" -> 左肩關節 / Left shoulder. */
export function jointLabel(segmentId: string, language: Language): string {
  const [joint, side] = segmentId.split(".");
  const base = ui(language, joint ?? segmentId);
  if (!side) return base;
  const sideLabel = ui(language, side === "l" ? "left" : "right");
  return language === "zh" ? `${sideLabel}${base}` : `${sideLabel} ${base.toLowerCase()}`;
}

/** Degree-of-freedom name, e.g. "abduction_adduction" -> 外展／內收. */
export function dofLabel(axis: string, language: Language): string {
  return ui(language, axis);
}

export function untranslated(): string[] {
  return [...misses].sort();
}
