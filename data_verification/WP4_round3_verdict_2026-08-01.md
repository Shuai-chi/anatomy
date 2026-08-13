# Full-body 肌動學資料第三輪（最終）交叉驗證

驗證日期：2026-08-01  
驗證檔案：`04_Management/plan/_temp/anatomy_app/data_verification/fullbody_exercises.json`  
本輪範圍：只驗收第二輪的兩項必修修復，並重跑資料結構閘門；沒有把修正者的自報當作證據。

## 1. `standing_shoulder_press`／`erector_spinae`

**✅ 通過。**

- 現在將豎脊肌正確表述為「等長維持軀幹直立的脊椎伸肌」：JSON 第 210–213 行。這不再把它說成抗脊椎伸展。
- note 與 `engagement_caveat` 均正確區分：在過頭負荷下，限制腰椎過度伸展（anti-extension）是腹壁的穩定功能，而非豎脊肌的功能：第 212、219 行。
- 這不是把錯誤換成另一種錯誤。豎脊肌可等長維持／提供伸展力矩以保持軀幹姿勢；腹直肌與腹斜肌等前側腹壁則可用來抵抗不希望出現的腰椎過伸。唯一措辭上的細節是「overhead load encourages」應理解為常見的動作代償風險，而非每一個過頭負荷必然造成過伸；不影響資料正確性。

## 2. `hanging_leg_raise`

**⚠ 部分通過，尚有一個可明確修掉的內部一致性問題。**

### 已修正且正確的部分

- Base 版本只把**髖屈**列為主要動態動作；`iliopsoas` 與 `rectus_femoris` 均列為 prime mover（第 565–579 行）。這與直腿懸垂抬腿的主動力一致。
- 腹直肌／腹斜肌列為 stabilizer，並以 `engagement_caveat` 將「主動骨盆後傾／脊椎屈曲」另列為 pelvic-curl 變式（第 581–592 行）。因此，第二輪的原始矛盾——列出 spinal flexion 卻沒有將其產生肌指派為動力肌——已消除。
- 兩版本的描述在生物力學上可接受：純髖屈版本中腹壁可等長協助控制骨盆與腰椎；刻意將骨盆捲起的變式另加骨盆後傾／腰椎屈曲時，腹直肌對該段成為 prime mover。`lower abs` 不能被宣稱為可被此動作孤立，caveat 的說法正確。

### 尚未通過的部分：不應將「等長肩胛下壓」列為 joint action

- 第 567 行的 `scapular depression (isometric grip support)` **不宜留在 `joint_actions`**。等長肩帶支撐表示沒有必要的肩胛位移；它應描述為肩胛／肩帶的等長穩定需求，而非一項本動作的關節動作。
- 同一列的 `muscle_engagement` 也沒有指派下斜方肌、背闊肌等可能的肩胛下壓／穩定參與者。故若把它保留為動作，會新造出「joint action 無對應肌肉角色」的問題，正好違反本輪要驗的 action-role 一致性。

**可執行修法（擇一）：**

1. 建議：從 `joint_actions` 移除第 567 行，只保留 `hip flexion`；如需保留教學資訊，把它寫進 `engagement_caveat` 為「懸垂時需要等長肩帶穩定／主動肩姿控制」。
2. 若產品資料模型明確允許靜態需求列入 `joint_actions`，改成 `scapular/shoulder-girdle stabilization (isometric)`，並補有來源的相應 stabilizer 肌肉列與 note；不能稱為 `scapular depression` 卻標示為等長。

補充：`colloquial_region_tag: "下腹"`（第 591 行）若會直接顯示給使用者，仍可能與 caveat 的「不可孤立下腹」相互拉扯；這是 UI 文案風險，建議改為「核心／髖屈」或明確標成通俗搜尋標籤，不是本輪 action-role blocker。

## 確定性檢查

已實跑：

```text
python3 validate_data.py fullbody_exercises.json fullbody_muscles.json
PASS  105
WARN  citations without DOI/PMID (1): reverse_fly ...
exercises=18 muscles=25 fails=0 warns=1
```

機械檢查通過：18 exercises、25 muscles、schema／role enum／referential integrity 均通過；該 validator 無法判斷第 567 行「等長」與「joint action」的語義衝突，因此此輪人工交叉驗證優先於其 PASS。

## Shipping 結論

**❌ 目前不可把這 18 筆視為最終可 shipping 資料。**

第一個必修項已通過；第二項的主要髖屈／骨盆捲曲矛盾已通過，但新增的第 567 行重新引入一個較小、卻是同類型的 action-role 語義不一致。完成上節任一明確修法後，重跑既有 validator，即可就這兩項給出「通過」結論；不需要再重做整批資料。

## 第二輪其他發現：blocker 分類

| 項目 | 分類 | 理由與具體處置 |
|---|---|---|
| 新增 `teres_minor`／`iliopsoas`／`adductor_magnus` muscle rows 僅有 Wikipedia | 可上線後補的改進 | 行的解剖內容已被獨立核對且引用不是不存在；補 NCBI／教科書／原始文獻可提高 provenance，不會修正一個目前的方向性錯誤。若產品另有「每列必須學術來源」的政策，才升格為政策 blocker。 |
| `single_arm_dumbbell_row` 宣稱 `elbow flexion`，卻沒有 biceps/brachialis 等屈肘肌 | **blocker（若資料的契約是列出每個已宣稱動作的參與肌）** | 這與本輪 hanging-leg-raise 原問題同型：動作存在而沒有對應肌。應補有來源的 `biceps_brachii`／`brachialis` synergist，或移除 `elbow flexion`（後者不建議，因為動作本身確有屈肘）。若 schema 明文是「只列代表肌群」且 UI 也如此揭露，才可降級為改進；現檔沒有此揭露。 |
| `barbell_deadlift` 的 `adductor_magnus` 缺列、內容屬代表性而非完整性 | 可上線後補的改進 | 現有髖／膝伸展與現列肌肉角色沒有方向性錯誤；大內收肌是重要但不是使既有 action 無來源的唯一肌。建議補入，或在資料／UI 標示「代表性參與肌群，非完整 EMG 排名」。 |

