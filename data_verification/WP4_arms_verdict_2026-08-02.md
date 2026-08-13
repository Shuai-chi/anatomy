# 手臂新增資料交叉驗證裁定

**審核範圍**：`fullbody_exercises.json` 後 6 筆（行 607–781）與
`fullbody_muscles.json` 後 3 筆（行 584–639）。未重審前 18／25 筆。

**方法與限制**：已逐筆讀取目前 worktree 的合併資料，並以 PubMed/DOI
交叉核對所有學術引文。Agent-reach 的 `exa` 與 `exa-free` 均因
`getaddrinfo EAI_AGAIN mcp.exa.ai` 無法使用；因此改以可用的 PubMed/DOI
索引核對。ExRx 與 Wikipedia 是網頁來源，不是 PubMed/DOI 論文；對只引用
它們的條目，最多只能給動作／解剖合理性 ✅，引用可追溯性只能標 ⚠。

## 1. 六個動作

| 動作 | 裁定 | 依據與問題 |
|---|---|---|
| `barbell_curl` | ⚠ | **動作與角色正確**：肘屈；二頭肌 prime mover，肱肌／肱橈肌 synergist，且 ExRx 的肌群欄位正是這個排列（[ExRx](https://exrx.net/WeightExercises/Biceps/BBCurl)）。所有已宣稱的 joint action 都有負責肌。**但**唯一來源是 ExRx，沒有 PubMed/DOI；若產品的引用標準要求可學術追溯，需補 DOI/PMID 或權威解剖來源。 |
| `dumbbell_incline_curl` | ❌ | **Oliveira 引文真實、不是張冠李戴**：Oliveira et al.，*J Sports Sci Med.* 2009;8(1):24–29，PMID [24150552](https://pubmed.ncbi.nlm.nih.gov/24150552/)，確實比較 incline、standard 與 preacher dumbbell curl，且測量的是**肱二頭肌長頭 EMG**。但它的結論是 incline 與一般 dumbbell curl 的全 ROM 活化型態相似，不能當作「斜板特別刺激長頭／必然長更多」的證據。2025 RCT 也是真實引文：Kassiano et al.，*Int J Sports Med.* 2025;46(5):334–343，DOI [10.1055/a-2517-0509](https://doi.org/10.1055/a-2517-0509)，比較的確是 preacher vs incline；結果是 incline 組的**近端肘屈肌厚度**增加較多（平均差 0.08 cm），而不是分辨出的「近端二頭肌厚度」或「二頭肌長頭因拉長而造成」的結果（[PubMed](https://pubmed.ncbi.nlm.nih.gov/39809454/)）。故行 664 的機制因果與 `proximal biceps thickness` 都過度延伸；須改為「肩伸展位會使跨肩的二頭肌長頭處於較長肌長；一項 8 週 RCT 發現 incline 相對 preacher 有較大的近端**肘屈肌**厚度增加，但沒有把此差異分離到二頭肌長頭，亦未證明機制」。主／協同肌與 elbow-flexion 對應本身 ✅。 |
| `dumbbell_hammer_curl` | ⚠ | joint action 與三個屈肘肌的對應 ✅；以肱橈肌、肱肌列為主要屈肘者、二頭肌仍參與，符合合理的解剖學模型。**但目前資料只有 ExRx，且「Highly activated in neutral grip」及「neutral grip shifts relative emphasis toward brachioradialis」不能由所列來源量化證實。** 可供交叉檢驗的手握研究（[PMID 36976950](https://pubmed.ncbi.nlm.nih.gov/36976950/)）確實發現中立握的二頭肌 excitation 低於旋後握；但同一研究的肱橈肌 excitation 也不是中立握最高。因此不可把它寫成已被該類 EMG 文獻證明的「高度／選擇性肱橈肌活化」。建議保留角色、將兩句改為中性表述（例如「肱橈肌與肱肌為主要肘屈肌；二頭肌亦參與」），或補直接測試 hammer curl 的 EMG 文獻。 |
| `cable_triceps_pushdown` | ⚠ | elbow extension 由 triceps brachii 產生、anconeus 可輔助，action-role 一致 ✅。ExRx 也確實把此動作列為 triceps target（[ExRx](https://exrx.net/WeightExercises/Triceps/CBPushdown)），但其頁面列「no synergists」，所以資料中 anconeus 是合理的解剖補充、不是該頁直接支持的 exercise-specific 測量結果。只有 ExRx URL，缺 PubMed/DOI。 |
| `barbell_lying_triceps_extension` | ⚠ | triceps prime mover、anconeus 協助 elbow extension，action-role 一致 ✅；但僅有 ExRx 網頁 URL，沒有可逐筆核對的 PubMed/DOI。應補來源，特別是若 UI 會把 anconeus 顯示為實測參與。 |
| `overhead_triceps_extension` | ❌ | **研究真實且真的比較所宣稱姿勢**：Maeo et al.，PMID [35819335](https://pubmed.ncbi.nlm.nih.gov/35819335/)，DOI [10.1080/17461391.2022.2100279](https://doi.org/10.1080/17461391.2022.2100279)，是 12 週單側 cable elbow-extension 的 overhead vs neutral-arm 比較；肩過頭位讓雙關節三頭長頭較長，MRI 顯示長頭增量 +28.5% vs +19.6%，全三頭 +19.9% vs +13.9%。所以行 776 的大方向有直接實證，且不是健身迷思。**然而引文頁碼錯誤**：正確為 *European Journal of Sport Science* **2023;23(7):1240–1250**，資料寫成 `1214–1226`（行 779）。故引用真實性尚未達產品標準。另宜明示此結果來自該特定訓練方案與 21 名成人，不能外推成所有過頭變式必然同幅度優勢。動作肌肉角色本身 ✅。 |

## 2. 跨關節與長度—張力宣稱

- ✅ **解剖前提**：二頭肌長頭與三頭肌長頭皆跨越肩、肘；在題述的肩位，兩者的肌腱—肌肉單元相對較長。
- ⚠ **斜板彎舉**：有真實的長頭 EMG 研究（Oliveira），也有真實的 head-to-head 肥大 RCT（Kassiano），但前者沒有證明長頭優勢、後者未分離二頭肌長頭，也未直接檢驗「較長肌長」為因。資料不可將合理機制假說升格成已證明的長頭特異因果。
- ✅（附限定）**過頭三頭伸展**：Maeo 的研究直接比較了肩位，且對長頭有 MRI 結果，足以支持「在該 12 週 cable protocol 下，overhead 的三頭肥大較大，長頭增量也較大」。仍應避免用「所有 over-head extension 都必然更好」的絕對語氣。

## 3. 新增肌肉

三個 `ta_name` 都與本地 Terminologia Anatomica 2 詞表相符：`Musculus brachialis`
（TA2.csv:2567）、`Musculus brachioradialis`（:2594）、`Musculus anconeus`（:2608）。

| 肌肉 | 裁定 | 起止點／動作 |
|---|---|---|
| `brachialis` | ✅（來源品質 ⚠） | `Distal half of anterior surface of humerus` → `Coronoid process and tuberosity of ulna` 是可接受的簡化；elbow flexion 正確。解剖研究也確認肱骨中／遠段起、尺骨 coronoid 與 tuberosity 止（[PMID 30820647](https://pubmed.ncbi.nlm.nih.gov/30820647/)）。原始引用只有 Wikipedia，應替換或加上權威解剖來源。 |
| `brachioradialis` | ✅（來源品質 ⚠） | lateral supracondylar ridge → radius styloid process、elbow flexion、radial nerve 均正確。更精確可寫成「proximal two-thirds of lateral supracondylar ridge」及「lateral distal radius, proximal to styloid」；現文字不構成錯誤。原始引用只有 Wikipedia。 |
| `anconeus` | ✅（來源品質 ⚠） | lateral epicondyle → lateral olecranon 與 proximal posterior ulna、輔助 elbow extension、radial nerve 均正確。由於它是小型輔助肌，資料的 `synergist` 而非 prime mover 分類適當；原始引用仍只有 Wikipedia。 |

## 4. Action-role 一致性與機械驗證

- 新增 3 個彎舉都宣稱 `elbow flexion`，各至少有 `biceps_brachii`／`brachialis`／`brachioradialis` 一個屈肘者；新增 3 個三頭動作都宣稱 `elbow extension`，有 `triceps_brachii`（及 anconeus）負責。手工核對無缺口 ✅。
- 已以實際兩份 JSON 執行 `validate_data.py`：`PASS 159`、`fails=0`；其唯一警告是 Oliveira 條目未附 DOI/PMID。這確認 schema/action map 一致，**不**能取代上表的引文真實性判定。

## 最終結論：**❌ 這 6 筆目前不可直接進產品。**

必修 blocker 是：

1. 修正 `overhead_triceps_extension` 的 Maeo 期刊頁碼為 **23(7):1240–1250**。
2. 收斂 `dumbbell_incline_curl` 的 caveat：不得把 2025 的「近端肘屈肌」結果寫成二頭肌／長頭已證實的機制因果；Oliveira 需補 PMID 24150552（或 DOI）並如實描述其「incline 與一般 curl 活化型態相似」結果。
3. 收斂或補證 `dumbbell_hammer_curl` 的「高度活化／偏向肱橈肌」措辭。
4. 將 6 個動作的 ExRx-only 來源與 3 條肌肉的 Wikipedia-only 來源，補為至少可追溯的專業／學術來源；這是引文品質 blocker，並非否定基本動作解剖本身。

完成上述後，重新跑同一驗證器並以修正後的 citation strings 做一次 PubMed/DOI spot-check，才可考慮放行。
