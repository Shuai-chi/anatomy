# Full-body 肌動學資料第四輪（最終）獨立驗收裁決

驗證日期：2026-08-02  
驗證者：Codex（非本輪修正者）  
驗證範圍：`fullbody_exercises.json`（18 筆）、`fullbody_muscles.json`（25 筆），以及目前 app 的資料載入路徑。  
前輪報告：`WP4_round3_verdict_2026-08-01.md`。

## 方法與限制

- 未採信 Claude 的「126 pass / 0 fail」自報；我獨立重跑 `python3 validate_data.py fullbody_exercises.json fullbody_muscles.json`，結果為 `PASS 126`、`FAIL 0`、`WARN 1`（`reverse_fly` 缺 DOI）。
- 獨立檢閱三筆已改動記錄、25 筆 muscle 定義、第三輪報告，以及修正 commit `364532a` 的 diff。
- app 的 `prototype/src/app.ts` 直接 import `../../data_verification/fullbody_exercises.json` 及 `fullbody_muscles.json`；因此本報告驗的正是 app 的 18 筆全身資料。`npx tsc --noEmit` 亦已獨立通過。
- 外部連網複核**本輪未能完成**：`agent-reach` CLI 不存在；依 fallback 嘗試 Exa 和 Exa-free，皆因 `mcp.exa.ai` DNS `EAI_AGAIN` 失敗。以下凡涉及外部文獻支撐而本輪無法重查者，明標為 ⚠；沒有假裝已連網查證。

## 1. 移除 `hanging_leg_raise` 的偽 joint action

**✅ 通過。**

- `joint_actions` 現只剩 `hip flexion`；其兩個 prime movers 為 `iliopsoas` 與 `rectus_femoris`，和該動態動作一致。
- 已移除的「`scapular depression (isometric grip support)`」確實不應列為 joint action：等長肩帶／握力需求描述的是懸吊時的穩定條件，並非此動作必然產生的肩胛關節位移。
- 新 `engagement_caveat` 明說它是「stabilisation requirement, not a joint action」且未把未列出的肩帶／握力肌肉錯當作已建模的角色。這正確避免了第三輪指出的「宣稱動作、卻沒有對應產生肌」矛盾。

## 2. 兩種划船加入 `biceps_brachii`

**⚠ 通過，但有一項可上線後補的引用缺口。**

### (a) 解剖學與資料一致性

- `barbell_row` 與 `single_arm_dumbbell_row` 均保留 `elbow flexion`，並各自新增 `biceps_brachii: synergist`；該肌肉在 muscles 表中也明確定義為肘屈曲肌。故已消除第三輪指出的 action-role 不一致，且 role 為 synergist 合理，沒有把肱二頭肌誇大成背部划船的唯一／主要目標肌。
- **⚠ 外部來源限制：**本輪無法連網重查特定動作的 EMG 或 ExRx 頁面；上述判斷是依既有資料的肘屈曲定義、動作力學與第三輪驗證脈絡，不是本輪新取得的文獻驗證。

### (b) 是否必須另加 `brachialis`／`brachioradialis`

- **不必，`biceps_brachii` 一筆已足以修復此批資料的正確性與 action-role 契約。**兩者也是肘屈肌，且在不同握法／前臂旋轉位可能重要；但資料模型列的是參與肌，不是宣稱完整的所有屈肘肌清單。為了湊齊三個屈肘肌而新建兩筆未充分溯源的 muscle rows，反而會擴大本輪風險與驗收範圍。
- 若未來產品要宣稱「完整肌肉名單」或顯示逐肌 EMG 排名，才應新增 `brachialis`、`brachioradialis`，並先補其 muscle 定義與可追溯來源；目前不是 blocker。

### (c) 新 note 的來源

- 「Elbow flexor; contributes to the pulling phase」是對已有 `elbow flexion` 的必要角色說明，可接受。
- **⚠「Relative contribution varies with grip (supinated increases it)」是可檢驗的比較性主張，但兩筆 row 的 `source_refs` 沒有直接指向此主張。**`barbell_row` 只有 Fenwick 2009，`single_arm_dumbbell_row` 只有 ExRx URL；本輪又無法連網確認兩者是否足以支持這句。這不是方向性錯誤或回滾理由，但應補上直接支持握法差異的文獻，或將句子縮為不比較握法的「assists elbow flexion during the pull」。

## 3. `hanging_leg_raise` 標籤改為「核心／髖屈」

**✅ 通過。**

- 新標籤與資料本體相符：base version 是髖屈，腹壁列為等長穩定；故「核心／髖屈」同時指出訓練情境與主要關節作用。
- 它也和 caveat 的「不可宣稱能孤立 lower abs」一致，已移除第三輪指出的 UI 自相矛盾。
- caveat 對 pelvic-curl 變式另行說明，不會把變式的脊椎屈曲錯套到基準 straight-leg 版本。

## 第三輪列為「可上線後補」項目

| 項目 | 第四輪分類 | 理由／後續 |
|---|---|---|
| `teres_minor`／`iliopsoas`／`adductor_magnus` 三筆 muscle rows 僅 Wikipedia | **⚠ 可上線後補** | 三筆皆有非空且對應的 Wikipedia URL，欄位的基本解剖關係無本輪可見矛盾；但本輪無法連網複核，且 Wikipedia 不是理想的長期 provenance。補 NCBI Bookshelf、Terminologia Anatomica 對照或教科書／原始研究來源。這不需要回滾目前功能。 |
| `barbell_deadlift` 是代表性、非完整肌群清單 | **✅ 仍為可上線後補** | 現有 hip extension 有 `gluteus_maximus`／`hamstrings`，knee extension 有 `vastus_muscles`；每個已宣稱動作均有對應肌肉，沒有誤教機制。可補 `adductor_magnus`，或在資料／UI 明示「代表性參與肌群，非完整 EMG 排名」。 |

## 最終結論

**✅ 這 18 筆資料現在可留在產品；不需回滾。**

第四輪三項必修的解剖語義與內部一致性均已修正：懸垂舉腿不再把等長需求偽裝成 joint action、兩種划船已有明確屈肘協同肌、UI 標籤不再推廣「下腹孤立」迷思。機械 gate 由我獨立重跑為 126 pass / 0 fail，且 app 實際直接載入本次受驗 JSON；TypeScript 靜態檢查亦通過。

可列入計畫書、但**不阻擋上線**的後續項目：

1. 為兩種划船的「旋後握增加 biceps 相對貢獻」補直接文獻，或把 note 縮為不含比較性主張的版本。
2. 以權威解剖／學術來源取代或補強 `teres_minor`、`iliopsoas`、`adductor_magnus` 的 Wikipedia-only provenance。
3. 對 `barbell_deadlift` 補 `adductor_magnus`，或在資料／UI 清楚標示為代表性參與肌群、非完整 EMG 排名。
4. 補 `reverse_fly` 的 DOI／PMID（現有 validator 唯一 warning）。

