# 獨立驗證紀錄（Claude，非產出者自報）— 完整過程含一次自我修正、根因、修復、複驗

這份紀錄刻意保留完整過程（包含一次錯誤結論），因為這正是「不自報、要留軌跡」原則要留下的東西。

## 第一輪（已撤回）：「視覺上確認可行」

用固定螢幕座標模擬拖曳，前後截圖顯示手臂形狀不同，當時判定「IK 真的連動」。之後發現 `#status`
文字全程沒變，追查後判斷第一輪看到的很可能是滑鼠沒點中球體、退而觸發了 `ArcRotateCamera` 環繞、
鏡頭轉動造成「看起來變形」的假象。**予以撤回。**

## 第二輪：逐層排查，找到真根因

1. 加偵錯鉤子直接讀 `target.position`／`isDragging`：全程沒變化，證實拖曳從頭到尾沒被觸發。
2. 用 Babylon 自己算出的精確投影座標呼叫 `scene.pick()`：`hit: false`。
3. 網格掃描＋放寬 pick 條件（任何 mesh 都算）：**全部 `hit:false`**，即使 `ikTarget.isPickable` 確認是
   `true`。一度懷疑是 headless 自動化環境限制，換成 Xvfb 真的（非 headless）Chromium 重測，**結果一樣**
   ——這排除了「只是 headless 假象」的可能，代表問題出在程式本身。
4. 回頭看第一次執行時 Babylon 自己印出的 console 警告（其實從第一輪就有，當時誤判為無關雜訊）：
   `"Ray needs to be imported before as it contains a side-effect required by your code."`
   ——**這就是根因**：`@babylonjs/core` 的模組化（tree-shaken）匯入方式下，`Scene.prototype.pick`／
   `createPickingRay` 是靠匯入 `@babylonjs/core/Culling/ray`（純 side-effect import，程式碼裡不直接用
   到任何具名匯出）才會被掛載到原型上；沒匯入的話，`scene.pick()` 不會報錯，只會**永遠安靜地回傳
   `hit:false`**——這是 Babylon.js 模組化匯入生態圈一個有文件記載但容易漏掉的陷阱，`main.ts` 原本
   完全沒有這行匯入。

## 修復

在 `main.ts` 加一行：
```ts
import "@babylonjs/core/Culling/ray";
```
重新 build，用 Xvfb 真瀏覽器複驗：

- **拖曳連動**：`fixed_before.png`（肘角 129°）→ mousedown 後狀態列即時變成「拖曳中」→ 拖到接近肩膀時
  肘角即時降到 37°（`fixed_during.png`，肩膀錨點螢幕座標與最初靜止畫面完全一致，證明這次不是相機在動，
  是骨架真的在動）→ 放開後狀態列正確變回「IK 已就緒」（`fixed_after.png`）。
- **ROM 邊界 clamp**：把滑鼠拖到畫面最右上角（遠超過手臂長度），肘角正確卡在上限 `150°`，狀態列正確
  顯示「ROM 邊界已限制」，球體視覺上也確實停在手臂搆得到的最大距離，沒有跟著滑鼠飄到畫面邊緣
  （`rom_max_reach.png`）。
- **HUD 更新 bug**：跟拖曳失效是同一個根因造成的同一個症狀，不是獨立的第二個 bug——`target.position`
  沒變，狀態列當然也不會變。根因修好後這個「bug」自動消失，不需要另外修。

## 誠實結論

核心問題——「Babylon.js 能不能做到拖一個關節、骨架依 ROM 限制即時連動反應」——**這次是真的驗證過、
確認可行**，不是自報，也不是第一輪那種被相機移動騙過去的假陽性：有截圖＋狀態列數值＋根因診斷三方
互相印證。過程中犯過一次過早下結論的錯誤，但沒有帶著錯誤結論結案，而是往下查到真正的原因、修掉、
再複驗一次。這比「一次到位」更值得記錄的是：**看到不尋常的 console 警告，就算不影響 exit code，
也該當下查清楚，不要當雜訊放過**——這條教訓比原型本身更值錢。
