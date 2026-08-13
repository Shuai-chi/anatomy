# 手臂資料最終確認（第二輪）

日期：2026-08-02  
範圍：`fullbody_exercises.json` 後 6 筆、`fullbody_muscles.json` 後 3 筆；未重審既有資料。

## 逐項確認

1. ✅ `overhead_triceps_extension` 的 Maeo 引文已改為
   `European Journal of Sport Science 2023;23(7):1240-1250`，並保留
   PMID `35819335` 與 DOI `10.1080/17461391.2022.2100279`
   （`fullbody_exercises.json:780-783`）。先前錯誤的 `1214-1226` 已不存在於此批資料。

2. ✅ `dumbbell_incline_curl` caveat 已正確收斂：明載結果是「proximal
   elbow flexor」、**非** isolated biceps long head，且明說未證明這個特定機制；Oliveira
   只表述為與 standard curl 有相似的 full-ROM activation pattern
   （`:665`）。`PMID: 24150552` 已補上（`:668`）。

3. ✅ `dumbbell_hammer_curl` 已移除「高度活化」及「中立握會偏向／選擇性強調肱橈肌」等比較性宣稱。現在僅將肱橈肌、肱肌列為 elbow-flexion
   prime movers，二頭肌列為 synergist（`:681-701`）；這是較窄的解剖角色陳述，並有 Moore
   解剖學教科書來源。

4. ✅ 來源不再是 ExRx-only／Wikipedia-only。

   - 六個動作各有 ExRx 以外的 `Clinically Oriented Anatomy, 8th ed.`；incline curl
     另有 Oliveira PMID 與 Kassiano DOI，overhead extension 另有 Maeo PMID/DOI
     （exercises `:633-635`, `:666-669`, `:699-701`, `:726-728`, `:753-755`, `:781-783`）。
   - 三條新增肌肉均以 Moore 教科書為可追溯來源；`brachialis` 另有 StatPearls
     `PMID: 30820647`（muscles `:598-600`, `:618-619`, `:637-638`）。Wikipedia-only 引用已不存在。

## 修正是否造成回歸／新增未證實宣稱

✅ 未發現本批四項修復造成 action-role 或跨檔 ID 回歸：獨立重跑
`python3 validate_data.py fullbody_exercises.json fullbody_muscles.json` 得
`PASS 159`、`fails=0`。唯一 warning 為既有且範圍外的 `reverse_fly` 缺 DOI。

✅ 目標六筆未見被移除的 hammer-curl 比較性措辭、incline-curl 的「長頭機制已證實」說法，或舊 Maeo 錯頁碼。新增／保留的較強實證敘述（incline 的 8 週 RCT、overhead 的 12 週研究）都在同筆資料中附 PMID 或 DOI，且文字已限定研究對象／結果範圍；本輪文本檢閱未發現新的無來源宣稱。

⚠ 外部連網限制：依 agent-reach 規定先後嘗試 `exa`、`exa-free`，兩者皆因
`mcp.exa.ai` 的 DNS `EAI_AGAIN` 失敗。因此本輪沒有假稱重新 live-check PubMed、DOI 或書籍頁面；上述書目真實性依目前資料中的可追溯識別碼及上一輪已記錄的交叉核對結果判斷。

## 最終結論

✅ **這 6 筆現在可進產品**（本輪窄範圍放行）。四個先前 blocker 已逐一解除，資料結構與 action-role 閘門亦通過。唯一 ⚠ 是本環境的即時外部索引複查不可用，並非此批的資料 blocker。
