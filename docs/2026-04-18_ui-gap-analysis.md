# UI 差距分析與優化計畫 ✅ 已完成

日期：2026-04-18  
完成日期：2026-04-19  
參考平台：CVAT、Supervisely、Label Studio、Roboflow

---

## 背景

本文件基於現有完成功能（三欄佈局、深色主題、RECT/POLYGON/TEXT 標註工具、AI overlay、圖層面板），對照主流 Web 標註平台，列出尚有差距的 UI/互動項目，並記錄決策與實作 Checklist。

---

## 優化項目規格

### 高優先（直接影響標註效率）

#### H1. Undo / Redo（復原/重做）

- 快捷鍵：`Ctrl+Z`（復原）、`Ctrl+Shift+Z` / `Ctrl+Y`（重做）
- 範圍：標註的新增、刪除、幾何編輯（移動、resize、頂點拖曳）
- 實作建議：前端維護 `undoStack / redoStack`，每次 mutation 前 push 快照；redo stack 在新操作發生時清空
- 切換影片時清空兩個 stack

#### H2. Timeline 幀標記帶

在 scrubber 下方疊加一排彩色標記，顯示哪些幀有人工標註（以類別色塊顯示）。

```
▶  ──●────────────────────────  00:13
      ■ ■■    ■  ■■■             ← 有標註的幀位置（依類別染色）
```

- 資料來源：`GET /api/videos/:id/annotations`，取得所有幀的 `display_index` 與 `category_id`（無需分頁）
- 渲染：在 scrubber 軌道正下方疊 `<canvas>` 或 `<svg>`，按比例映射到幀位置
- 互動：hover 小標記 → tooltip 顯示該幀標註筆數；點擊 → 跳到該幀

#### H3. 框選多個標註（Rubber-band select）

- 在 Select 工具模式下，按住左鍵拖曳畫布空白區域 → 顯示虛線矩形
- 放開後：落入矩形內的所有標註進入「多選狀態」（橘色邊框）
- 多選狀態下可執行：
  - `Delete` / `Backspace`：批次刪除（需確認對話框）
  - 下拉選單變更類別（套用至全部選中標註）
- `Esc` 或點擊空白處：取消多選

#### H4. 直接輸入幀號跳轉

- 點擊播放列的「當前幀計數器（display_index）」→ 計數器變為 `<input>` 輸入框
- 輸入目標幀號（1-based），`Enter` 確認跳轉；`Esc` 取消並還原顯示
- 超出範圍時 clamp 至有效範圍並提示

---

### 中優先（視覺/體驗差距）

#### M1. Timeline 幀縮圖 Hover 預覽

- 滑鼠 hover scrubber 時，在游標上方顯示該時間點的幀縮圖（120×68px 左右）
- 縮圖來源：使用 FFmpeg 預先擷取關鍵幀縮圖（可在上傳完成後非同步產生），或直接 seek 隱藏 `<video>` 取截圖
- 縮圖框內同時顯示對應時間碼

#### M2. 複製標註到其他幀（Propagate）

- 在標註列表列新增「複製到幀」操作（`📋+N`）
- 彈出對話框：輸入起始幀/結束幀，或「往後 N 幀」
- 建立時 `source=MANUAL`、幾何相同、`frame_id` 依序填入
- 此功能對超音波影片（結構位置跨幀穩定）的標註效率提升最大

#### M3. 類別顏色可自訂

- 在類別圖層列表每一列新增色塊 swatch，點擊開啟 color picker（shadcn/ui Popover + `<input type="color">`）
- 顏色存至資料庫 `categories.color` 欄位（若無則新增）
- overlay 與圖層面板色塊同步更新

---

### 低優先（細節打磨）

#### L1. Toast / Snackbar 通知

- 使用 `shadcn/ui` 的 `Sonner`（toast）元件
- 觸發時機：標註儲存成功/失敗、刪除完成、AI 辨識完成、匯出成功
- 位置：右下角浮動，3 秒自動消失

#### L2. 匯出格式選項 UI

- TopBar 新增 **Export** 按鈕（`Download` icon）
- Dropdown 提供：
  - COCO JSON（現有 `latest.coco.json`）
  - 人工標註 COCO（僅 `source=MANUAL`）
  - YOLO TXT（bbox 格式轉換）
- 點擊後呼叫後端產生並下載

#### L3. 鍵盤快捷鍵說明面板

- TopBar 右上角新增 `?` 圖示按鈕
- 點擊後開啟 Modal，列出所有快捷鍵對照表（分組：播放控制 / 工具切換 / 標註操作 / 其他）
- 僅前端靜態內容，無後端依賴

#### L4. 影片列表縮圖

- 左側欄影片卡片顯示首幀縮圖（同 M1 縮圖機制）
- 縮圖尺寸：`64×36px`，lazy load
- 若縮圖尚未產生則顯示灰色佔位符

---

## 決策記錄

| 項目 | 決策 | 原因 |
|------|------|------|
| 圖層面板 Tab 分頁（原 Phase 6-1） | **不開發** | 現有三段堆疊已可使用，Tab 帶來的操作層級反而增加切換成本 |
| 標註屬性（Attributes）面板 | **不開發** | 超音波標註場景不需要 occluded / truncated 等屬性，維持精簡 |

---

## 摘要對比表

| 功能 | 本案現況 | CVAT | Supervisely | Label Studio | Roboflow |
|------|:--------:|:----:|:-----------:|:------------:|:--------:|
| Undo / Redo | ✅ 2026-04-18 | ✅ | ✅ | ✅ | ✅ |
| Timeline 幀標記帶 | ✅ 2026-04-18 | ✅ | ✅ | ❌ | ❌ |
| 框選多個標註 | ✅ 2026-04-18 | ✅ | ✅ | ❌ | ❌ |
| 跳幀輸入框 | ✅ 2026-04-18 | ✅ | ✅ | — | — |
| Timeline 幀縮圖 hover | ✅ 2026-04-19 | ✅ | ❌ | ❌ | ✅ |
| 複製標註到多幀 | ✅ 2026-04-18 | ✅ | ✅ | ❌ | ❌ |
| 類別顏色自訂 | ✅ 2026-04-18 | ✅ | ✅ | ✅ | ✅ |
| Export UI | ✅ 2026-04-19 | ✅ | ✅ | ✅ | ✅ |
| Toast 通知 | ✅ 2026-04-18 | ✅ | ✅ | ✅ | ✅ |
| 快捷鍵說明面板 | ✅ 2026-04-18 | ✅ | ✅ | ✅ | ✅ |
| 影片列表縮圖 | ✅ 2026-04-19 | — | ✅ | — | ✅ |
| BBOX 淡色填充 | ✅ 2026-04-18 | ✅ | ✅ | — | ✅ |
| 圖層面板 Tab 分頁 | — | — | — | — | — |
| 標註屬性欄位 | — | — | — | — | — |

---

## 實作 Checklist

### 高優先

- [x] **H1** Undo / Redo ✅ 2026-04-18
  - [x] `useAnnotationHistory.ts`：`undoStack / redoStack` 前端 state
  - [x] 標註新增 / 刪除時 push snapshot
  - [x] `Ctrl+Z` 觸發 undo，`Ctrl+Shift+Z` / `Ctrl+Y` 觸發 redo
  - [x] 切換影片時清空兩個 stack
  - [x] Toast 提示（復原 / 重做）

- [x] **H2** Timeline 幀標記帶 ✅ 2026-04-18
  - [x] 取得整支影片所有標註的 `display_index` + `category_id`
  - [x] 建立 `FrameAnnotationBar` 元件，疊加於 scrubber 下方
  - [x] 點擊跳轉對應幀

- [x] **H3** 框選多個標註（Rubber-band select）✅ 2026-04-18
  - [x] SELECT 模式支援 rubber-band 拖曳（`AnnotationCanvas`）
  - [x] 多選狀態視覺（橘色邊框）
  - [x] `Delete` / `Backspace` 批次刪除（含確認對話框）
  - [x] `Esc` / 點擊空白取消多選

- [x] **H4** 直接輸入幀號跳轉 ✅ 2026-04-18
  - [x] 播放列幀計數器點擊 → 切換成 `<input>`
  - [x] `Enter` 跳轉（clamp 至有效範圍）
  - [x] `Esc` 取消

### 中優先

- [x] **M1** Timeline 幀縮圖 Hover 預覽 ✅ 2026-04-19
  - [x] 前端方案：隱藏 `<video>` 元素（`opacity:0; width:1px`，非 `display:none`）seek 後用 in-memory canvas 截圖
  - [x] `onSeeked` JSX prop 綁定（避免 `useEffect` ref 時序問題）
  - [x] scrubber `onMouseMove` → seek 預覽影片，顯示縮圖 tooltip（含時間碼）
  - [x] seek 排隊機制（`previewSeekingRef` + `pendingPreviewTimeRef`）處理快速滑動

- [x] **M2** 複製標註到其他幀（Propagate）✅ 2026-04-18
  - [x] 多選工具列新增「複製到其他幀」按鈕
  - [x] `PropagateDialog.tsx`：輸入起始幀/結束幀（1-based）
  - [x] 前端迴圈呼叫現有 POST，批次建立 `source=MANUAL` 標註
  - [x] Toast 提示複製筆數

- [x] **M3** 類別顏色可自訂 ✅ 2026-04-18
  - [x] `PATCH /api/videos/:id/categories/:catId` 支援更新 color / strokeColor
  - [x] LayersPanel 類別列 color picker（控制 `category.color`）
  - [x] 更新顏色時同步清除 `stroke_color` override

### 低優先

- [x] **L1** Toast / Snackbar 通知 ✅ 2026-04-18
  - [x] 安裝 `sonner`，在 `layout.tsx` 加入 `<Toaster />`
  - [x] 標註刪除完成
  - [x] 上傳成功 / 失敗 / 取消
  - [x] AI 辨識完成（SSE 事件觸發）
  - [x] 複製標註完成
  - [x] Undo / Redo 提示

- [x] **L2** 匯出格式選項 UI ✅ 2026-04-19
  - [x] TopBar 新增 Export dropdown（`Download` icon）
  - [x] 後端 `GET /api/videos/:id/export?format=coco`：全部標注（MANUAL + AI）COCO JSON
  - [x] 後端 `GET /api/videos/:id/export?format=coco-manual`：僅 MANUAL 標注 COCO JSON
  - [x] 後端 `GET /api/videos/:id/export?format=yolo`：MANUAL bbox 轉 YOLO TXT（正規化座標）
  - [x] `Content-Disposition: attachment` 觸發瀏覽器直接下載
  - [x] 修正：bbox 從 `geometry_json` 的 `{x,y,width,height}` 物件解析（而非 array）
  - [x] 修正：`annotation_type` 比較改用 `.toUpperCase()` 對應 DB 全大寫儲存

- [x] **L3** 鍵盤快捷鍵說明面板 ✅ 2026-04-18
  - [x] TopBar 右上角新增 `?` 按鈕，或按 `?` 鍵觸發
  - [x] `KeyboardShortcutsModal.tsx`：分組列表（播放控制 / 工具切換 / 標註操作 / 影像調整 / 其他）

- [x] **L4** 影片列表縮圖 ✅ 2026-04-19
  - [x] 後端 `GET /api/videos/:id/thumb`：on-demand FFmpeg 擷取首幀 128×72 JPEG（per-video mutex 防並發）
  - [x] 上傳完成後 fire-and-forget 背景產生 `thumb.jpg`
  - [x] 左側欄影片卡片新增 64×36 縮圖，`onError` 靜默隱藏（graceful fallback）

---

## 額外改善（實作過程追加）

| 日期 | 項目 | 說明 |
|------|------|------|
| 2026-04-18 | BBOX 淡色填充 | `AnnotationCanvas` 的矩形標註由 `fill="none"` 改為 `fill="${color}22"`（同多邊形，約 13% 不透明度），提升區域辨識度 |
| 2026-04-19 | Export bbox 解析修正 | `bbox_json` 實為 `{x,y,width,height}` 物件而非陣列，改從 `geometry_json` 解析；POLYGON 外接矩形從頂點計算 |
| 2026-04-19 | Export annotation_type 大小寫 | DB 儲存 `"BBOX"` / `"POLYGON"` 全大寫，比較改用 `.toUpperCase()` |
| 2026-04-19 | M1 縮圖技術決策 | 採前端 seek 方案：`opacity:0` 隱藏 video（非 `display:none`）+ `onSeeked` JSX prop + in-memory canvas → dataURL |

---

## 下一步建議

**所有規劃項目（H1–H4、M1–M3、L1–L4）已全部完成。** 🎉

如需繼續優化，可考慮的方向：

| 方向 | 說明 |
|------|------|
| 效能 | Timeline 幀標記帶大量幀時虛擬捲動 |
| 可及性 | ARIA 標籤、鍵盤 focus 管理 |
| 測試 | E2E 測試（Playwright）覆蓋主要標註流程 |
| 批次操作 | 多影片批次 AI 辨識排程 |

---

## Bug 修復記錄

### BUG-01：右側圖層面板播放時垂直跳動

**發現日期**：2026-04-19  
**症狀**：播放影片（尤其是全新、無標註的影片）時，右側「AI 圖層」區塊會隨播放幀切換忽高忽低跳動。

**根本原因**：  
每次幀切換，`useFrameAnnotations` 會將資料重置為 loading 狀態（空陣列或 null），造成「標註圖層」高度瞬間塌陷；待 API 回應後高度恢復，使其下方的「AI 圖層」反覆被推上/推下。

```
幀切換 → 資料清空 → 標註圖層高度塌陷 → AI 圖層跳上
         ↓
         API 回應 → 標註圖層高度恢復 → AI 圖層跳下
```

**選定修法：方案 3 — 右側面板固定高度分區**

將右側畫面面板改為 `display: flex; flex-direction: column`，三個區塊（類別圖層 / 標註圖層 / AI 圖層）各佔固定 `flex` 比例，內容溢出時各自 `overflow-y: auto` 內部捲動。

- **效果**：三個區塊的起始位置永遠固定，無論各區塊內容多寡都不會影響其他區塊位置，完全根治跳動。
- **副作用**：類別較多或標註較多時，各區塊內部出現捲軸（屬更好的 UX）。

**修改範圍（已實作）**：
- `web/src/client/components/LayersPanel.tsx`：外層單一可捲動容器改為 `flex column`；三個 section 分配固定比例（類別 28% / 標註 flex:1 / AI 37%），各自 `overflow-y: auto` 內部捲動；分隔線加 `flex-shrink: 0`。✅ 2026-04-19
