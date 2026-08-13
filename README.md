# 人體解剖訓練對照

以全身解剖模型呈現已驗證訓練動作的肌肉參與、角色配色、關節拖曳連動、圖層切換與資料 caveat。預設入口是 `index.html`；`fullbody.html` 是全身檢視器，`tension.html` 以肌肉起止點的直線距離呈現相對張力變化。

## 執行

```bash
npm install
npm run dev
```

正式建置：

```bash
npm run build
```

`dev/` 內的頁面是開發時的技術驗證紀錄，不是產品入口：IK 原型、MVP/MVP2、肌肉配色示範與真實資產示範都保留在此。`verification_screenshots/` 亦為驗證軌跡，請勿刪除。

## PWA 與快取

PWA manifest 使用深色主題 `#0b1020`。Service worker 不會在安裝時 precache `.glb` 模型；模型首次被使用時採 CacheFirst，最多保留 3 個模型、最長 30 天，避免 14.7 MB 的全身資產阻塞 service-worker 安裝。

## 授權與標註

3D 資產衍生自 [Z-Anatomy](https://github.com/Z-Anatomy/Anatomy)（基於 BodyParts3D），依 **CC BY-SA 4.0** 授權。衍生 3D 資產必須以相同 CC BY-SA 4.0 授權釋出，並保留上述來源標註；本專案程式碼不因該 3D 資產授權而受限。

## 資料與驗證

產品內 30 個動作經四輪跨模型資料驗證後納入。驗證報告及機械檢查工具保留於本 repo 的 [`data_verification/`](data_verification/)，包括最終裁定 [`WP4_round4_FINAL_verdict_2026-08-02.md`](data_verification/WP4_round4_FINAL_verdict_2026-08-02.md) 與手臂群最終裁定 [`WP4_arms_FINAL_verdict_2026-08-02.md`](data_verification/WP4_arms_FINAL_verdict_2026-08-02.md)。

## 已知限制

- 全身資產為 14.7 MB（gzip 約 10.2 MB），對行動網路偏大；後續應改為分層 lazy load。
- 髖與肩是球窩關節，尚未定義旋轉軸與 ROM；該處張力數值可能不符合生理。
- 目前以直線起止點計算，不含肌肉繞行，因此會低估部分肌肉的長度變化。
- 脊椎逐節活動與肩胛胸廓關節不在本版本範圍內。
- 缺少逐動作 ROM 角度資料；UI 顯示的是通用活動度，不是動作專屬 ROM。
