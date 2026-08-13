# Full-body 肌動學資料第二輪交叉驗證報告

驗證日期：2026-08-01

驗證範圍：`fullbody_exercises.json` 18 筆、`fullbody_muscles.json` 25 筆，並逐條對照上一輪 `WP4_codex_verdict_2026-08-01.md` 的 8 個必修項及本輪所列第 9 項 shipping 清理。

查核方法與限制：本輪沒有把 Gemini 的「已修復」聲明當證據。先以 `jq` 重跑結構、唯一性、role enum、跨檔 referential integrity 與目標值檢查，再以論文正式頁、PubMed/PMC、Frontiers、NCBI Bookshelf 與 FIPAT TA2 交叉核對。依專案規則先嘗試 agent-reach，但本環境沒有 `agent-reach` 命令；Exa 與 Exa-free 亦因 DNS `EAI_AGAIN` offline，因此改用可用的網頁檢索。ExRx 對直接抓取回傳 robots 阻擋；其精確 slug 只能以搜尋索引及引用該路徑的外部頁面交叉確認，沒有假稱做過 live HTTP 200 驗證。

判定原則：✅＝內容、方向與外部依據相符；⚠＝核心方向可接受，但仍有來源品質、完整性或措辭問題；❌＝明確錯誤、內部矛盾，或會把錯誤方向帶進產品。

## 已知 9 項變更逐項驗證

### 1. `seated_cable_row` 改成 `lat_pulldown`

- ✅ **真的改對。** 現檔只有 `lat_pulldown`，沒有舊 ID；英文／中文名、frontal plane、shoulder adduction、ExRx `CBFrontPulldown` 與 Lusk 2010 全部一致指向前側 lat pull-down。
- ✅ [Lusk et al. 2010, PMID 20543740](https://pubmed.ncbi.nlm.nih.gov/20543740/) 正式題名就是 *Grip width and forearm orientation effects on muscle activity during the lat pull-down*，J Strength Cond Res. 24(7):1895-1900，DOI 與 JSON 相符。研究直接測 anterior lat pull-down，現已不再張冠李戴到 seated row。

### 2(a). Coratella 2020 期刊改為 IJERPH

- ✅ **改對。** 現值為 *International Journal of Environmental Research and Public Health* 2020;17(17):6015，DOI `10.3390/ijerph17176015`。
- 依據：[PubMed PMID 32824894 / PMCID PMC7503819](https://pubmed.ncbi.nlm.nih.gov/32824894/) 的期刊、卷期、文章號與 DOI 均完全相符。

### 2(b). 前三角肌 note 改為 `externally rotated`

- ✅ **方向從錯改成對，沒有又翻成另一個錯誤方向。** Coratella 摘要明載：內旋增加後三角、上斜方與肱三頭募集；外旋增加 anterior 與 medial deltoid activation。現文 `Assists especially if externally rotated.` 與作者結論方向一致。
- ⚠ 這是 10 名競技健美選手的急性 sEMG 結果，不能外推成長期肥大優勢；目前 note 只談 assists，沒有宣稱 hypertrophy，故可接受。
- ⚠ 舊有 `supraspinatus` note「只啟動前 15–30°」仍是過度簡化；棘上肌不會在 15–30° 後停止參與。這不是本輪新改壞，但仍不宜作為精確教學文案。

### 3. Franke 2015 期刊改為 J Sports Med Phys Fitness

- ✅ **改對。** [PubMed PMID 24947920](https://pubmed.ncbi.nlm.nih.gov/24947920/) 記錄為 *Journal of Sports Medicine and Physical Fitness* 2015;55(7-8):714-721；reverse peck deck 的後三角肌活動高於 seated row 與 inclined lat pull-down，動作方向亦相符。
- ⚠ JSON 題名仍以 `...` 截斷且沒有 PMID/DOI；可定位到正確論文，但不算完全正規化的書目。

### 4. Plotkin 2023 改成 Frontiers in Physiology 正式引用

- ✅ **改對。** 現值為 *Frontiers in Physiology* 2023;14:1279170，DOI `10.3389/fphys.2023.1279170`，不再把 bioRxiv 與同行審查版本混寫。
- ✅ [Frontiers 正式論文](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2023.1279170/full) 證實 9 週 set-volume-equated squat/hip-thrust 訓練得到相近 gluteal hypertrophy；同頁也明說首回合較高的 hip-thrust sEMG 沒有可靠預測長期肥大。因此新增 caveat「activation gap 不等於 growth gap」科學方向正確。
- ⚠ 題名仍以 `...` 截斷，但 journal、volume、article number 與 DOI 已足以唯一定位，不是產品阻擋項。

### 5. `teres_minor` 補定義；`core_stabilizers` 換成 `erector_spinae`

- ✅ **referential integrity 修好。** `teres_minor` 已存在，所有 exercise muscle IDs 都能 join 到 25 筆 muscle 表；`core_stabilizers` orphan 已完全消失。
- ✅ `teres_minor` 的 lateral scapular border 起點、greater tubercle inferior facet 止點、external rotation 與 axillary nerve 均正確。[NCBI Teres Minor](https://www.ncbi.nlm.nih.gov/books/NBK513324/) 支持其腋神經支配與外旋／關節穩定功能。
- ⚠ `reverse_fly` 把 teres minor 列為 synergist 在動作學上可接受：水平外展時尤其配合外旋可見 teres minor 活動；[Tsuruike et al. 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8178592/) 直接量到不同水平外展位置的 teres minor EMG。可是 JSON 唯一引用的 Franke 2015 只量三角肌分部，沒有量 teres minor；因此「內容合理、列內 citation 沒有直接支援新增角色」。
- ❌ **`erector_spinae` 替換造成新的方向性錯誤。** 肩推列現在寫 `Maintains spinal stability and resists extension.`。豎脊肌雙側收縮產生脊柱 extension moment、維持直立並抵抗 flexion；抵抗過度 extension 的主要是腹直肌／腹斜肌等前側軀幹肌。[NCBI lumbar spine anatomy](https://www.ncbi.nlm.nih.gov/books/NBK557616/) 明載 erector spinae contraction produces an extension moment。因此可改為 `maintains extension and resists spinal flexion`；若要表達 anti-extension，必須另列 abdominal stabilizers，不能把方向塞給 erector spinae。
- 結論：第 5 項只有「消 orphan」成功；語義未完全修好，屬典型 **修 A 弄壞 B**。

### 6. ExRx 路徑修正

- ✅ `RectusAbdominis/BWCcrunch` 已改成 `RectusAbdominis/BWCrunch`；精確路徑可由 UAB 等外部課程資料交叉命中。
- ✅ hanging leg raise 已由錯誤的 `RectusAbdominis/...` 改為 `HipFlexors/BWHangingLegRaise`；精確 URL 在多個外部訓練計畫索引中一致出現，也與動作主要髖屈機制相符。
- ⚠ ExRx 本身阻擋直接抓取，本輪無法確認 live HTTP status／頁面當下內容；本項的 ✅ 是「slug 身份已改對」，不是「已做即時可達性驗證」。

### 7. `hanging_leg_raise` 肌肉角色與 caveat

- ✅ **修正的大方向正確。** 加入 iliopsoas 與 rectus femoris 作 hip-flexion prime movers、移除「lower fibers preferentially」迷思，且 caveat 區分純髖屈與主動骨盆捲曲，均比上一版正確。[Andersson et al. 1997](https://pubmed.ncbi.nlm.nih.gov/9118976/) 以 fine-wire/表面 EMG 顯示 bilateral leg lifts 有顯著 iliacus、sartorius 與腹肌活動；[Kim et al. 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4395661/) 顯示 0–45° leg raise 較偏 rectus femoris，45° 以上伴 posterior pelvic tilt 時 rectus abdominis 活動增加。
- ❌ **但目前成品自相矛盾，所以第 7 項不能算修好。** `joint_actions` 已把 `spinal flexion (posterior pelvic tilt)` 列成這個動作實際包含的關節動作；同一列卻把 rectus abdominis 永久標為 `stabilizer`，note 又說只有「actively curling the pelvis upward」才是 prime mover。若 pelvic curl／spinal flexion 真的在本動作定義內，腹直肌就是該段 spinal-flexion 的 prime mover；若本列只想表示 hip-flexion leg raise，則應移除 `spinal flexion` joint action，保留腹肌 stabilizer，並把 pelvic-curl 版本只放 caveat。
- ⚠ `rectus_femoris` 作直腿髖屈 agonist 合理，但其貢獻隨髖角與膝伸直造成的肌長條件改變；不宜把全 ROM 寫成固定等級。現 note 已有「particularly with straight legs」，尚可接受。
- 修法必須二選一：
  1. **Hip-flexion 版**：joint actions 只留 hip flexion；iliopsoas/RF prime mover；腹肌 stabilizer；pelvic curl 僅作變式 caveat。
  2. **Leg-hip raise／toes-to-bar 版**：保留 hip flexion + pelvic/spinal flexion；iliopsoas/RF 負責前段髖屈，rectus abdominis（可含 obliques）在骨盆捲曲段升為 prime mover，note 標 phase-dependent。

### 8. `ta_name` 分部格式與集合標記

- ✅ 六個分部格式已按上一輪建議正規化：`Pars descendens/transversa/ascendens musculi trapezii` 與 `Pars clavicularis/acromialis/spinalis musculi deltoidei`，且都補了 `parent_muscle`、`fiber_region`。
- ✅ 原 4 個集合項 `rhomboids`、`vastus_muscles`、`hamstrings`、`obliques` 都有 `ta_category: group_label` 與「不是單一 TA leaf term」note；新增的 `iliopsoas` 也有 group label 標示。這符合上一輪「拆分或明確標成集合」的最低要求。
- ✅ [FIPAT TA2 Part 2](https://fipat.library.dal.ca/wp-content/uploads/2020/09/FIPAT-TA2-Part-2.pdf) 將 iliopsoas、iliacus、psoas major 分層列出；把本資料的合併列標為 group label 是誠實做法。
- ⚠ `hamstrings` 仍把整組都列為 hip extension，但 biceps femoris short head 不跨髖。group label 解決的是術語誠實性，不會自動修掉組內例外；若 UI 會把 group action 解讀成每個成員皆有該作用，仍須補 note。

### 9. 三個無學術來源動作移出 shipping 集合

- ✅ 現檔確為 18 筆；上一版的 `straight_arm_pulldown`、`face_pull`、`russian_twist` 均不存在。沒有發現同名改 ID 後偷偷留在 shipping 集合的情況。
- ✅ 移除後沒有造成 orphan：所有剩餘 exercise 的 muscle IDs 都可在 25 筆 muscle 表解析。

## 新增內容獨立驗證

### `teres_minor`

- ✅ anatomy 正確：TA 名、起止點、external rotation、axillary nerve 均與 NCBI 解剖資料一致。
- ⚠ 產品列只引用 Wikipedia，且漏寫它對 glenohumeral joint 的動態穩定功能；事實沒有寫錯，但 provenance 與完整性低於其餘用 DOI 的 exercise 列。

### `iliopsoas`

- ✅ 起點壓縮描述（iliacus＝iliac fossa；psoas major＝lumbar vertebrae）、共同止於 lesser trochanter、髖屈功能均正確。[NCBI Iliopsoas](https://pubmed.ncbi.nlm.nih.gov/30285403/) 亦明載 psoas 由 lumbar plexus L1–L3、iliacus 由 femoral nerve L2–L4 支配。
- ✅ `Femoral nerve and lumbar plexus` 方向正確，但建議改成分部式文字，避免被誤讀成兩個構成肌都接受兩者共同支配。
- ⚠ row 仍只引用 Wikipedia；本輪是以 NCBI 獨立核對後才判解剖正確。

### `adductor_magnus`

- ✅ 起點（inferior pubic/ischial ramus + ischial tuberosity）、止點（linea aspera + adductor tubercle）、obturator + tibial division of sciatic nerve 的合併描述正確。[Takizawa et al.](https://pubmed.ncbi.nlm.nih.gov/23813615/) 也顯示神經分布比教科書式二分更有區域重疊，因此 JSON 是可接受的高階摘要，不宜再寫成每一區完全互斥。
- ✅ hip adduction + extension 方向正確；尤其深髖屈時 extension moment arm 增加。[Németh & Ohlsén 1985](https://pubmed.ncbi.nlm.nih.gov/3988782/) 與 [Plotkin et al. 2023](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2023.1279170/full) 均支持它在深蹲底部的重要髖伸展貢獻。
- ⚠ row 只引用 Wikipedia，且把兩個功能區合併成整肌作用；作 app 摘要可接受，但若面向解剖教學，應補 `adductor part`／`hamstring part` caveat。

### 深蹲調整

- ✅ 新增 `adductor_magnus: synergist` 與 `erector_spinae: stabilizer` 的方向正確；Kubo 2019 直接測到 squat training 的 adductor volume 變化，深度較大時效果更明顯。[Kubo et al. PMID 31230110](https://pubmed.ncbi.nlm.nih.gov/31230110/)
- ✅ hamstrings 留在 stabilizer 並以 hypertrophy caveat 限定，比列作 prime mover 更準確。
- ⚠ `Squats are primarily a quad/glute exercise` 在同列新增重要 adductor magnus 後顯得過度簡化。建議寫成 `primarily knee extensors and hip extensors (gluteus maximus and adductor magnus); poor direct hamstring hypertrophy stimulus`，避免 UI 又把大內收肌藏掉。

### 硬舉調整

- ✅ hamstrings 由固定 prime mover 降為 `phase-dependent synergist/dynamic stabilizer` 是正確方向。ExRx 的 deadlift 分析也把 hamstrings 分為 top-half synergist、bottom-half dynamic stabilizer；[Martín-Fuentes et al. 2020 systematic review](https://pmc.ncbi.nlm.nih.gov/articles/PMC7046193/) 顯示不同變式／階段的肌肉活動不可用單一固定排序概括。
- ✅ Martin-Fuentes 引用現在明標 `A systematic review`，不再假裝是作者直接做的新人體 EMG 實驗。
- ⚠ conventional deadlift 仍漏 `adductor_magnus`；它是 ExRx 分析中的 synergist，也是深髖屈位置的髖伸肌。若產品聲稱「完整 muscle engagement」，這仍是不完整；若只展示代表性肌群，可降為建議而非 blocker。

## 修 A 是否弄壞 B

- ❌ **有。** `core_stabilizers` → `erector_spinae` 消除了 orphan，卻把原本可能屬於 anterior core 的 `resists extension` note 原封不動套到 spinal extensor，造成作用方向錯誤。
- ❌ **第 7 項內部互斥。** 修正者同時採用了「純髖屈版」的肌肉角色與「骨盆捲曲版」的 joint action，導致一列描述兩個不同版本卻只給一組固定 role。
- ✅ 期刊／DOI 修正沒有破壞原本正確的動作身份；Plotkin caveat 反而比上一版更嚴謹。
- ✅ 新增 3 個 muscle row 與 ID 改名後，schema、唯一性、role enum、cross-file join 都沒有回歸。

## 額外抽查：上一輪未細看 3 個動作

1. `front_raise` → ✅

   shoulder flexion + anterior deltoid prime mover 正確。[Coratella 2020](https://pubmed.ncbi.nlm.nih.gov/32824894/) 的 frontal raise 直接顯示 anterior deltoid 在所比變式中最高。ExRx slug 外觀與索引亦一致。資料只列一個肌肉是不完整但沒有角色顛倒；若 UI 宣稱完整，應補 clavicular pectoralis major、serratus/trapezius 等協同／肩胛肌。

2. `leg_press` → ✅（代表性摘要）

   `vastus_muscles: prime_mover`、`gluteus_maximus: synergist` 與 hip/knee extension 方向正確。[Leg press sEMG systematic review](https://pmc.ncbi.nlm.nih.gov/articles/PMC7369968/) 顯示 45° leg press 的 vastus medialis 與 gluteus maximus 均有顯著活動，且會隨腳位／負荷改變。現列適合作代表性摘要，不是完整肌群清單。

3. `single_arm_dumbbell_row` → ⚠

   latissimus dorsi、rhomboids、posterior deltoid 都會參與，基本方向合理；但 joint actions 明列 elbow flexion，muscle engagement 卻完全沒有 biceps/brachialis 類 elbow flexor。另 ExRx `BackGeneral/DBBentOverRow` 的肌群權重會依手肘路徑改變：手肘貼身偏 lat，外展則 posterior deltoid／scapular retractors 比重更高。現資料把 lat 固定為唯一 prime mover，卻沒有 technique caveat，應標為不完整而非完全核實。

## 確定性檢查結果

- ✅ JSON 解析與筆數：18 exercises、25 muscles。
- ✅ exercise_id / muscle_id：各自無重複。
- ✅ 18/18 exercise 均具上一輪要求的 8 個核心欄位。
- ✅ 所有 role 僅為 `prime_mover`、`synergist`、`stabilizer`。
- ✅ orphan muscle IDs：0。
- ✅ `lat_pulldown` 存在、`seated_cable_row` 不存在；`core_stabilizers` reference 為 0；`teres_minor` 存在。
- ✅ 5 個集合列均有 `ta_category: group_label`。
- ✅ 三個移出 shipping 的 ID 均不存在。

查核時檔案 SHA-256：

- `fullbody_exercises.json`: `e71f3444d7ba94480463d9c36e067dcd516ecb935fb990c86c07ca6d49cba4fc`
- `fullbody_muscles.json`: `b03add832d83def0bd78adf5f6225d117f72c32ee7d1a3eae280902c59e474d5`

## 可否進產品

**結論：❌ 目前仍不可直接進產品。**

第二輪已把上一輪的大多數書目、ID、orphan、TA 格式與主要髖屈肌缺漏修好，整體可信度已由「中低」提升到「中等偏高」；但 shipping 資料仍有兩個會直接教錯使用者的語義問題：

1. standing shoulder press 把 erector spinae 寫成 `resists extension`，作用方向相反；
2. hanging leg raise 同時宣稱有 spinal flexion/pelvic curl，卻把 rectus abdominis 固定為 stabilizer，版本定義與 role 自相矛盾。

這兩項修正後，另補上新增 muscle rows 的非 Wikipedia 來源，並處理或明示 `single_arm_dumbbell_row`／deadlift 的代表性而非完整性，才可升為可 shipping。最低必要 gate 是：**先修上述兩個 ❌，再重跑 orphan/enum/schema 檢查；否則不得進產品。**
