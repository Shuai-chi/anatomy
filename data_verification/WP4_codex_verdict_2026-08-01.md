# Full-body 肌動學資料交叉驗證報告

驗證日期：2026-08-01

驗證範圍：`fullbody_exercises.json` 21 筆、`fullbody_muscles.json` 22 筆；共 28 條 `source_refs`，其中 13 條為具名學術引用、15 條為 ExRx.net URL。

查核方法與限制：先嘗試專案指定的 agent-reach／Exa 路徑，但本環境沒有 `agent-reach` 命令，且 `mcporter list` 顯示 `exa` 與 `exa-free` 均 offline（0 healthy）。因此改用可用的網頁檢索，優先核對 PubMed、PMC、PLOS、Frontiers、DOI 與 FIPAT Terminologia Anatomica 2nd edition。ExRx 阻擋直接抓取，故其 URL 只做路徑格式與搜尋索引交叉比對；沒有把「長得像」當作真的可用連結。

判定原則：✅＝可由書目記錄／摘要直接核對研究與動作；⚠＝研究或路徑大致對得上，但引用不精確、屬二手綜述，或無法完整核實；❌＝期刊、動作、資料列身份或 URL 路徑明確不符。

## 引用真實性

- `pull_up_overhand` / `Youdas et al., Journal of Strength and Conditioning Research 2010 (Surface Electromyographic Activation Patterns and Joint Kinematics...)` → ✅核實

  依據：[PubMed PMID 21068680](https://pubmed.ncbi.nlm.nih.gov/21068680/) 的正式題名是 *Surface electromyographic activation patterns and elbow joint motion during a pull-up, chin-up, or perfect-pullup rotational exercise*，J Strength Cond Res. 2010;24(12):3404-3414，DOI `10.1519/JSC.0b013e3181f1598c`。研究直接讓受試者做 conventional pull-up、chin-up 與旋轉握把版本，測了背闊肌、肱二頭肌、下斜方肌等；不是只在文獻回顧裡提到 pull-up。JSON 把題名尾段寫成 `Joint Kinematics`，不是正式題名用語，但作者、期刊、年份與動作均正確。

- `chin_up_underhand` / `Youdas et al., Journal of Strength and Conditioning Research 2010` → ✅核實

  依據：同一篇 [Youdas et al. 2010](https://pubmed.ncbi.nlm.nih.gov/21068680/) 直接測了 chin-up。摘要明載 chin-up 的肱二頭肌與胸大肌 EMG 顯著高於 pull-up，下斜方肌則在 pull-up 較高，因此 JSON 所寫「反握 chin-up 的肱二頭肌募集較高」有直接依據。

- `barbell_row` / `Fenwick et al., Journal of Strength and Conditioning Research 2009 (Comparison of different rowing exercises...)` → ✅核實

  依據：[PubMed PMID 19197209](https://pubmed.ncbi.nlm.nih.gov/19197209/) 為 *Comparison of different rowing exercises: trunk muscle activation and lumbar spine motion, load, and stiffness*，J Strength Cond Res. 2009;23(2):350-358，DOI `10.1519/JSC.0b013e3181942019`。研究的三個動作包含 standing bent-over row，並量測軀幹／髖肌活動及脊柱負荷，與本列對豎脊肌等長穩定的用途相符。

- `seated_cable_row` / `Lusk et al., Journal of Strength and Conditioning Research 2010 (Grip width and forearm orientation effects...)` → ❌張冠李戴

  依據：[PubMed PMID 20543740](https://pubmed.ncbi.nlm.nih.gov/20543740/) 確有此文，正式題名為 *Grip width and forearm orientation effects on muscle activity during the lat pull-down*，J Strength Cond Res. 2010;24(7):1895-1900，DOI `10.1519/JSC.0b013e3181ddb0ab`；但它測的是四種握法的 **anterior lat pull-down**，沒有測 seated cable row。本 JSON 的 `exercise_id` 是 `seated_cable_row`，但 `name_en`、`name_zh`、joint actions、ExRx URL 和 Lusk 引用全部都是 lat pulldown。這是整列身份衝突：若產品以 ID 取資料，會重演「研究存在但沒測該動作」的錯誤。必須二選一：改 ID 為 lat-pulldown 類，或重建真正 seated cable row 的內容與引用。

- `standing_shoulder_press` / `Saeterbakken et al., Journal of Strength and Conditioning Research 2013 (Effects of body position and load on muscle activity...)` → ✅核實

  依據：[PubMed PMID 23096062](https://pubmed.ncbi.nlm.nih.gov/23096062/) 為 *Effects of body position and loading modality on muscle activity and strength in shoulder presses*，J Strength Cond Res. 2013;27(7):1824-1831，DOI `10.1519/JSC.0b013e318276b873`。15 名男性直接做 seated/standing、barbell/dumbbell shoulder press 並量 EMG 與 1RM；與站姿槓鈴肩推相符。JSON 題名把 `loading modality` 簡化成 `load`，宜改回正式題名。

- `lateral_raise` / `Coratella et al., Journal of Human Kinetics 2020 (An Electromyographic Analysis of Lateral Raise Variations...)` → ❌期刊張冠李戴

  依據：研究存在且確實測了多種 lateral raise 與 frontal raise，但正確來源是 [PubMed PMID 32824894 / PMCID PMC7503819](https://pubmed.ncbi.nlm.nih.gov/32824894/)：*An Electromyographic Analysis of Lateral Raise Variations and Frontal Raise in Competitive Bodybuilders*，**International Journal of Environmental Research and Public Health** 2020;17(17):6015，DOI `10.3390/ijerph17176015`，不是 *Journal of Human Kinetics*。此外，該文結果是內旋 lateral raise 增加後三角肌／上斜方肌，而外旋增加前三角肌與中三角肌；JSON 的 note「anterior deltoid assists especially if internally rotated」方向相反。

- `reverse_fly` / `Franke et al., Journal of Strength and Conditioning Research 2015 (Analysis of anterior, middle and posterior deltoid activation...)` → ❌期刊張冠李戴

  依據：[PubMed PMID 24947920](https://pubmed.ncbi.nlm.nih.gov/24947920/) 的研究確實讓受試者做 reverse peck deck、seated row 與 inclined lat pulldown，並發現 reverse peck deck 的後三角肌活動最高；但正確期刊是 **Journal of Sports Medicine and Physical Fitness** 2015;55(7-8):714-721，不是 *Journal of Strength and Conditioning Research*。動作相符、期刊不符，必須改書目，不可標為完全核實。

- `barbell_squat` / `Kubo et al., European Journal of Applied Physiology 2019 (Effects of squat training with different depths...)` → ✅核實

  依據：[PubMed PMID 31230110](https://pubmed.ncbi.nlm.nih.gov/31230110/) 為同名研究，Eur J Appl Physiol. 2019;119(9):1933-1942，DOI `10.1007/s00421-019-04181-y`。17 名男性接受 10 週 full/half squat 訓練；MRI 顯示膝伸肌、臀大肌與內收肌體積增加，但股直肌與 hamstrings 在兩組均未顯著增加。這支持 JSON 的「深蹲不是有效 hamstring hypertrophy 動作」限定式敘述；它不是用來證明單次 EMG 主動肌排序的研究。

- `barbell_squat` / `Caterisano et al., Journal of Strength and Conditioning Research 2002 (The effect of back squat depth on the EMG activity...)` → ✅核實

  依據：[PubMed PMID 12173958](https://pubmed.ncbi.nlm.nih.gov/12173958/) 為 *The effect of back squat depth on the EMG activity of 4 superficial hip and thigh muscles*，J Strength Cond Res. 2002;16(3):428-432，DOI `10.1519/00124278-200208000-00014`。10 名有經驗訓練者直接做 partial、parallel、full back squat；量測 vastus medialis/lateralis、biceps femoris、gluteus maximus，且臀大肌在較深 squat 的相對貢獻提高，與引用用途相符。

- `barbell_deadlift` / `Martin-Fuentes et al., PLoS One 2020 (Electromyographic activity in deadlift exercise...)` → ⚠存疑（研究類型標示不足）

  依據：[PubMed PMID 32107499](https://pubmed.ncbi.nlm.nih.gov/32107499/)／[PLOS citation](https://journals.plos.org/plosone/article/citation?id=10.1371%2Fjournal.pone.0229507) 為 *Electromyographic activity in deadlift exercise and its variants. A systematic review*，PLoS ONE 2020;15(2):e0229507，DOI `10.1371/journal.pone.0229507`。它確實系統性納入 conventional deadlift 與變式的 sEMG 研究，主題相符；但 Martín-Fuentes 團隊本身沒有做一個新的 deadlift 人體 EMG 實驗。若欄位要表達「此研究直接測了這個動作」，就不能標 ✅；應在引用中保留 `systematic review`。

- `leg_curl` / `Maeo et al., Medicine & Science in Sports & Exercise 2021 (Greater Hamstrings Muscle Hypertrophy...)` → ✅核實

  依據：[PubMed PMID 33009197](https://pubmed.ncbi.nlm.nih.gov/33009197/)／[PMC7969179](https://pmc.ncbi.nlm.nih.gov/articles/PMC7969179/) 為同名研究，Med Sci Sports Exerc. 2021;53(4):825-837，DOI `10.1249/MSS.0000000000002523`。研究直接比較 12 週 seated 與 prone leg curl；whole hamstrings 與雙關節 hamstring 的 hypertrophy 在 seated 組較大，支持 JSON 的長肌長／坐姿腿彎舉 caveat。

- `barbell_hip_thrust` / `Plotkin et al., bioRxiv / peer-reviewed literature 2023 (Hip thrust and back squat training elicit similar...)` → ⚠存疑（引用混合兩個版本）

  依據：相同研究先以 [bioRxiv preprint DOI `10.1101/2023.06.21.545949`](https://pmc.ncbi.nlm.nih.gov/articles/PMC10349977/) 發布，之後於 2023 年正式同行審查刊登為 [Frontiers in Physiology 14:1279170](https://pubmed.ncbi.nlm.nih.gov/37877099/)，DOI `10.3389/fphys.2023.1279170`。兩版本都做了 9 週 hip thrust 對 back squat、MRI hypertrophy 與首回合 sEMG，並得到相近 gluteal hypertrophy。內容方向正確，但 `bioRxiv / peer-reviewed literature` 不是可重現的期刊欄位，會讓讀者不知道引用的是未審 preprint 還是正式論文；建議只留正式 Front Physiol 引用。

- `barbell_hip_thrust` / `Contreras et al., Journal of Applied Biomechanics 2015` → ✅核實

  依據：[PubMed PMID 26214739](https://pubmed.ncbi.nlm.nih.gov/26214739/) 為 *A Comparison of Gluteus Maximus, Biceps Femoris, and Vastus Lateralis Electromyographic Activity in the Back Squat and Barbell Hip Thrust Exercises*，J Appl Biomech. 2015;31(6):452-458，DOI `10.1123/jab.2014-0301`。13 名受訓女性直接做 back squat 與 barbell hip thrust；hip thrust 的 upper/lower gluteus maximus 及 biceps femoris mean/peak EMG 均較高。研究、期刊、年份、動作皆相符。

### ExRx.net URL 路徑檢查

| exercise_id | 原 URL 路徑 | 判定 | 具體依據 |
|---|---|---:|---|
| `pull_up_overhand` | `LatissimusDorsi/BWPullup` | ✅ | 符合 ExRx 的 `WeightExercises/<muscle>/<equipment+slug>` 慣例，搜尋索引亦可見此精確路徑。 |
| `chin_up_underhand` | `LatissimusDorsi/BWUnderhandChinup` | ✅ | 路徑格式與精確 slug 均有外部索引佐證。 |
| `seated_cable_row` | `LatissimusDorsi/CBFrontPulldown` | ❌（對 ID） | URL 本身是已知的 front pulldown 路徑，但它再次證明本列不是 seated row；真正 seated-row 類路徑會是 `BackGeneral/CBSeatedRow` 一類。 |
| `single_arm_dumbbell_row` | `BackGeneral/DBBentOverRow` | ✅ | 路徑格式合理，精確路徑可由搜尋索引交叉命中。單臂／雙臂技術仍應由頁面內容確認。 |
| `straight_arm_pulldown` | `LatissimusDorsi/CBStraightArmPulldown` | ⚠ | 命名格式合理，但這次搜尋未找到精確 slug 的可靠索引；不可僅因格式像 ExRx 就宣稱已驗證可達。 |
| `lateral_raise` | `DeltoidLateral/DBLateralRaise` | ✅ | 精確路徑有搜尋索引佐證。 |
| `front_raise` | `DeltoidAnterior/DBFrontRaise` | ✅（格式） | 目錄、器材前綴、動作 slug 均符合 ExRx 慣例；因 robots 限制未直接開頁。 |
| `face_pull` | `DeltoidPosterior/CBFacePull` | ⚠ | 格式合理，但本次未找到精確 slug 的可靠索引；需由可連線環境做 HTTP/頁面標題驗證。 |
| `barbell_deadlift` | `GluteusMaximus/BBDeadlift` | ✅（格式） | ExRx 的 deadlift 頁面會按不同 target muscle 交叉列示；`BBDeadlift` slug 與 `GluteusMaximus` 分類均符合其慣例。 |
| `leg_press` | `Quadriceps/LV45LegPress` | ✅ | 精確路徑有搜尋索引佐證。 |
| `leg_extension` | `Quadriceps/LVLegExtension` | ✅ | 精確路徑有搜尋索引佐證。 |
| `crunch` | `RectusAbdominis/BWCcrunch` | ❌ | 已知／索引可見的 ExRx slug 是 `RectusAbdominis/BWCrunch`；原值多了一個小寫 `c`，對大小寫敏感路徑很可能 404。 |
| `plank` | `RectusAbdominis/BWFrontPlank` | ✅ | 精確路徑有多個外部索引交叉命中。 |
| `hanging_leg_raise` | `RectusAbdominis/BWHangingLegRaise` | ❌ | 搜尋索引反覆顯示 ExRx 的精確路徑是 `HipFlexors/BWHangingLegRaise`，不是 `RectusAbdominis/...`。這不只是 URL typo，也與該動作主要髖屈機制一致。 |
| `russian_twist` | `Obliques/BWRussianTwist` | ⚠ | 外觀符合 ExRx 路徑模板，但本次查不到精確路徑的可靠索引；在無法直接連線的情況下不能升為 ✅。 |

## schema 完整性

- ✅ 21/21 exercise 都有要求的八個欄位：`exercise_id`、`name_en`、`name_zh`、`equipment_type`、`movement_plane`、`joint_actions`、`muscle_engagement`、`source_refs`。以 `jq` 對 required-key set 做差集，沒有輸出缺欄紀錄。

- ✅ 所有 `muscle_engagement` 都有 `muscle_id` 與 `role`；所有 role 都只使用 `prime_mover`、`synergist`、`stabilizer`。機械檢查沒有找到非法 role。

- ✅ 21 個 `exercise_id` 無重複；`joint_actions`、`muscle_engagement`、`source_refs` 皆為 array，基本型別檢查無異常。

- ❌ 跨檔 referential integrity 失敗：`standing_shoulder_press` 使用 `core_stabilizers`，`reverse_fly` 使用 `teres_minor`，但這兩個 `muscle_id` 都不在 22 筆 `fullbody_muscles.json` 中。產品 join 後會得到 orphan reference。應新增正式肌肉定義，或改成現有、明確的肌肉 ID；`core_stabilizers` 尤其不是單一解剖結構，不宜偽裝成 muscle ID。

- ❌ `seated_cable_row` 的 ID 與其餘欄位互相矛盾：名稱是 Seated Lat Pulldown／坐姿滑輪下拉，joint actions 是 shoulder adduction + scapular downward rotation，URL 是 `CBFrontPulldown`，引用也只測 lat pulldown。這不是單純翻譯問題，而是主鍵語義錯誤。

- ⚠ 與已驗證胸部格式相比，本批多數學術 `source_refs` 缺 PMID/PMCID/DOI，且有題名截斷、`fetched` 日期、模糊的 `peer-reviewed literature` 混在同一自由文字欄。Schema 雖合法，但可追溯性比胸部範例差；建議至少統一成「正式題名＋期刊＋年份＋DOI/PMID」。

## 肌肉學名（ta_name）

核對基準：[FIPAT Terminologia Anatomica, 2nd ed.](https://libraries.dal.ca/Fipat/ta2.html) 與 [TA2 Viewer](https://ta2viewer.openanatomy.org/)。結論不是「全部正確」：12 筆是可直接接受的單一 TA 肌名；6 筆把「整塊肌＋分部」寫成自訂逗號格式；4 筆是通行的集合稱呼，但不是精確的單一 TA leaf term。沒有看到毫無拉丁文依據的亂造字，但若欄位宣稱是 `ta_name`，後 10 筆應正規化。

| muscle_id | 現有 ta_name | 判定 | 建議／依據 |
|---|---|---:|---|
| `latissimus_dorsi` | `Musculus latissimus dorsi` | ✅ | 正式肌名。 |
| `teres_major` | `Musculus teres major` | ✅ | 正式肌名。 |
| `trapezius_upper` | `Musculus trapezius, pars descendens` | ⚠ | 可理解但不是 TA2 的正式完整分部寫法；應用 `Pars descendens musculi trapezii`，或 `ta_name: Musculus trapezius` 並由 `fiber_region` 表示上束。 |
| `trapezius_middle` | `Musculus trapezius, pars transversa` | ⚠ | 正式分部為 `Pars transversa musculi trapezii`。 |
| `trapezius_lower` | `Musculus trapezius, pars ascendens` | ⚠ | 正式分部為 `Pars ascendens musculi trapezii`。 |
| `rhomboids` | `Musculi rhomboidei` | ⚠ | 是通行且文法正確的集合稱呼，不是亂造；但 FIPAT 的可識別肌肉是 `Musculus rhomboideus major` 與 `Musculus rhomboideus minor`。若要求可 join 的 TA 實體，應拆分。 |
| `erector_spinae` | `Musculus erector spinae` | ✅ | TA/TA2 可接受名稱（TA2 亦列 `Erector spinae` 為首選顯示）。 |
| `deltoid_anterior` | `Musculus deltoideus, pars clavicularis` | ⚠ | 正式分部為 `Pars clavicularis musculi deltoidei`；也可保留整肌名並用 `fiber_region`。 |
| `deltoid_lateral` | `Musculus deltoideus, pars acromialis` | ⚠ | 正式分部為 `Pars acromialis musculi deltoidei`。 |
| `deltoid_posterior` | `Musculus deltoideus, pars spinalis` | ⚠ | 正式分部為 `Pars spinalis musculi deltoidei`。 |
| `supraspinatus` | `Musculus supraspinatus` | ✅ | 正式肌名。 |
| `infraspinatus` | `Musculus infraspinatus` | ✅ | 正式肌名。 |
| `biceps_brachii` | `Musculus biceps brachii` | ✅ | 正式肌名。 |
| `triceps_brachii` | `Musculus triceps brachii` | ✅ | 正式肌名。 |
| `gluteus_maximus` | `Musculus gluteus maximus` | ✅ | 正式肌名。 |
| `gluteus_medius` | `Musculus gluteus medius` | ✅ | 正式肌名。 |
| `rectus_femoris` | `Musculus rectus femoris` | ✅ | 正式肌名。 |
| `vastus_muscles` | `Musculi vasti` | ⚠ | 是常見集合稱呼，但產品列實際合併 vastus lateralis/medialis/intermedius；嚴格 TA 實體應分成三個 `Musculus vastus ...`。 |
| `hamstrings` | `Musculi ischiocrurales` | ⚠ | 是通行的 ischiocrural/hamstring 集合稱呼，不是自創；但不是單一肌。JSON 的英文名稱把整個 biceps femoris 都算入，需注意短頭不跨髖、嚴格上不具典型 ischiocrural 起點，不能把全組都描述成 hip extensor。 |
| `rectus_abdominis` | `Musculus rectus abdominis` | ✅ | 正式肌名。 |
| `obliques` | `Musculi obliqui abdominis` | ⚠ | 文法與通行集合概念可理解，但正式可辨識肌肉應分為 `Musculus obliquus externus abdominis`、`Musculus obliquus internus abdominis`。 |
| `transversus_abdominis` | `Musculus transversus abdominis` | ✅ | 正式肌名。 |

## 解剖學合理性抽查

以下挑選 5 個動作，判斷的是資料內角色配置，不把單次表面 EMG 直接等同長期 hypertrophy。

1. `barbell_squat` → ✅大致合理，但不完整

   `vastus_muscles` 與 `gluteus_maximus` 作 prime mover，`rectus_femoris` 作 synergist，hamstrings 作 knee/hip 共收縮穩定者，方向合理；Kubo 與 Caterisano 也分別支持 knee extensor/glute hypertrophy 與深度增加時 glute contribution。主要遺漏是 adductor magnus（深蹲的重要髖伸肌）以及 gluteus medius／軀幹穩定肌。遺漏不會把現有 prime mover 變成錯誤，但若 UI 宣稱「完整肌群」就不合格。

2. `barbell_deadlift` → ⚠整體方向合理，`hamstrings: prime_mover` 過度簡化

   臀大肌、hamstrings、膝伸肌與豎脊肌確實都參與 conventional deadlift；豎脊肌以高等長需求維持軀幹是合理的 stabilizer 描述。然而各階段與個體技術不同，hamstrings（尤其 biceps femoris short head）不能一概視為整段 prime mover；ExRx 也將其依階段列為 synergist/dynamic stabilizer。資料還漏掉 adductor magnus、腹壁抗屈、背闊肌／斜方肌／握力鏈等穩定角色。建議將 hamstrings 降為 phase-dependent synergist，或加 caveat。

3. `lateral_raise` → ⚠主動肌合理，但旋轉方向 note 與所引研究相反

   中三角肌列 prime mover 合理，supraspinatus 列 synergist 也合理；但「supraspinatus only initiates first 15-30 degrees」是過度簡化，並非 15° 後就停止參與。更重要的是 Coratella 2020 報告內旋 lateral raise 更偏後三角／上斜方，外旋更增加前與中三角，JSON 卻寫「前三角尤其在內旋時協助」。此 note 必須改。

4. `hanging_leg_raise` → ❌主要髖屈肌整組缺失

   動作明列 `hip flexion`，卻只放 `rectus_abdominis` 與 `obliques`，沒有 iliopsoas、rectus femoris 等髖屈肌。直腿從懸垂抬起的主要關節動作首先是髖屈；腹直肌在維持骨盆／抗伸展，以及有明確 posterior pelvic tilt、軀幹屈曲時才更接近主動產生骨盆捲曲。把腹直肌一律列為唯一 prime mover，還寫「lower fibers preferentially」，容易把健身迷思產品化。ExRx 的已知頁面也把此動作放在 `HipFlexors/BWHangingLegRaise`。此列需要新增髖屈肌資料，並依技術版本區分 hip-flexion leg raise 與 pelvic-curl leg raise。

5. `plank` → ✅合理

   front plank 是等長抗伸展任務，把 rectus abdominis、transversus abdominis、obliques 都標為 stabilizer，而不是虛構 concentric prime mover，角色配置合理。若追求完整性，可加入 gluteus maximus、quadriceps、serratus anterior 等共同維持姿勢的肌群，但目前三筆沒有明顯角色顛倒。

## 總結

- 必須修正：

  1. 解決 `seated_cable_row` 整列身份衝突；Lusk 2010 只支援 lat pulldown，不支援 seated row。
  2. 把 Coratella 2020 的期刊改為 *International Journal of Environmental Research and Public Health*，並修正內／外旋 lateral raise 的肌肉 note。
  3. 把 Franke 2015 的期刊改為 *Journal of Sports Medicine and Physical Fitness*。
  4. 把 Plotkin 2023 改成精確的 Front Physiol 正式引用，或明確標示 bioRxiv preprint，不能用 `bioRxiv / peer-reviewed literature` 混寫。
  5. 修復 orphan muscle IDs：`core_stabilizers`、`teres_minor`；前者不是單一肌肉實體。
  6. 修正 ExRx 路徑：`BWCcrunch` → `BWCrunch`；`RectusAbdominis/BWHangingLegRaise` → 已知的 `HipFlexors/BWHangingLegRaise`（或移除不能核實的連結）。
  7. 重寫 `hanging_leg_raise` 的 muscle engagement，加入真正的髖屈肌並區分骨盆後傾版本。
  8. 若 `ta_name` 宣稱嚴格 TA 名稱，正規化 6 個分部名稱，並決定 4 個集合項要拆分還是明確標示為 group label。

- 建議修正：

  1. Martin-Fuentes 2020 明標 `systematic review`，避免被誤讀為該團隊直接做 deadlift EMG 實驗。
  2. 每個學術引用補 DOI 或 PMID/PMCID，移除題名省略號與模糊來源字樣。
  3. 在可直接連線 ExRx 的環境重新驗證 `CBStraightArmPulldown`、`CBFacePull`、`BWRussianTwist` 三個精確 slug；目前只能給 ⚠。
  4. 補足 squat 的 adductor magnus／軀幹穩定、deadlift 的 phase-dependent 肌群與 lateral raise 的旋轉 caveat；不要把表面 EMG 高低直接寫成 hypertrophy 結論。

- 整體可信度評估：**中低，尚不可直接進產品**。多數基本動作學方向可用，但 13 條學術引用中有 3 條明確的動作／期刊張冠李戴、2 條需降級為 ⚠，另有兩個 orphan muscle ID、至少兩個錯誤 ExRx 路徑，以及懸垂舉腿的核心解剖漏項；這正是需要人工交叉驗證才能攔下的資料品質。
