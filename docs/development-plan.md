# 開發計畫：本地單頁影片辨識服務（可實作規格版）

最後更新：2026-04-17  
版本：v2.0（強化互動細節、工具列規格、圖層與類別 CRUD）

---

## 1. 專案定位

本專案是一個獨立 repo 的本地單頁服務，目標是把以下流程整合在同一個 Viewer：

1. 影片上傳（本地存檔）
2. 影片播放（串流 + 時間軸）
3. 圖層顯示（類別、標註、AI）
4. AI 辨識（YOLO）啟動 / 取消 / 完成狀態

硬性約束：

1. 不使用 Cloudflare R2
2. 不使用 Supabase
3. 檔案與資料全部落在本機
4. AI 結果輸出 COCO
5. 同一支影片 `ai_jobs` 永遠只保留一筆（覆蓋更新，不保留歷史版）

---

## 2. 介面資訊架構

### 2.1 畫面切分

1. 上區（`1/7`）：Upload Panel
2. 下左（`3/4`）：Viewer Panel
3. 下右（`1/4`）：Layers Panel

### 2.2 佈局線框（Desktop）

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ Upload Panel (1/7)                                                            │
│ [注意事項] [拖拉上傳] [單檔進度] [總進度] [建立上傳任務] [清除當前影片] [清除AI] │
│ metadata: 解析度 | fps | 長度 | 大小 | 編碼                                    │
└───────────────────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────┬───────────────────────────────┐
│ Viewer Panel (3/4)                            │ Layers Panel (1/4)            │
│ [影像工具列: 縮放/對比/格線/量測...]           │ [類別圖層(可收合)]             │
│ 影片顯示區 (video + overlay)                  │ [標註圖層(可收合)]             │
│ 右上固定: [開始辨識] [取消辨識] [狀態Badge]     │ [AI圖層(可收合)]               │
│ [播放工具列: 播放/暫停/逐幀/倍速/時間軸/幀資訊]  │                               │
└───────────────────────────────────────────────┴───────────────────────────────┘
```

### 2.3 佈局線框（Mobile）

```text
┌───────────────────────────────────────────────┐
│ Upload Panel                                  │
│ actions: 建立上傳任務 | 清除當前影片 | 清除AI結果 │
└───────────────────────────────────────────────┘
┌───────────────────────────────────────────────┐
│ Viewer Toolbar（不含 AI 按鈕）                 │
│ Video 右上：開始辨識 | 取消辨識 | 狀態          │
│ Video + Playback Controls                     │
└───────────────────────────────────────────────┘
┌───────────────────────────────────────────────┐
│ Layers Panel（分頁 / 抽屜）                    │
└───────────────────────────────────────────────┘
```

### 2.4 響應式規則

1. `>=1280px`：固定 `1/7 + 3/4:1/4`
2. `768~1279px`：`1/7 + 2/3:1/3`
3. `<768px`：上下堆疊，Layers 以抽屜或 tab 呈現

---

## 3. 功能規格（逐區塊）

## 3.1 Upload Panel

### 3.1.1 控制項與行為

| 控制項 | 說明 | 可用條件 | 禁用條件 |
|---|---|---|---|
| 拖拉上傳區 | 接受單檔影片 | 無任務進行中 | 正在寫檔或解析 metadata |
| 建立上傳任務 | 開啟檔案選擇器並上傳 | 非 `UPLOADING` | `UPLOADING` |
| 清除當前影片 | 刪除影片 + AI + DB 紀錄 | 已有影片 | 無影片 |
| 清除 AI 結果 | 保留影片，清 AI 結果 | 已有影片且非 `PROCESSING` | `PROCESSING` |

### 3.1.2 上傳狀態機

`IDLE -> PICKED -> UPLOADING -> PARSING_METADATA -> READY | FAILED`

### 3.1.3 Metadata 顯示欄位

1. `video_width`, `video_height`
2. `source_fps`
3. `duration_sec`
4. `file_size_bytes`
5. `video_codec`
6. `pixel_format`

---

## 3.2 Viewer Panel

## 3.2.1 影像工具列（不含 AI 任務按鈕）

| 功能 | 行為 | 預設值 | 備註 |
|---|---|---|---|
| Zoom In / Out | 以 10% 單位縮放 | 100% | 範圍 `25%~400%` |
| Fit to Window | 以容器自適應顯示 | 開啟 | 覆寫手動縮放 |
| Reset View | 重置縮放/平移/顯示參數 | - | 回到預設視圖 |
| Grid Toggle | 顯示/隱藏網格 | 關 | UI 狀態本機保存 |
| Measure Toggle | 進入量測模式 | 關 | 初版可先預留，不阻擋主流程 |
| Contrast/Brightness | 視覺調整 | 0 | 僅前端視覺，不回寫影片 |

狀態保存：

1. 工具列狀態存 `localStorage`（key: `viewer:image-tools:v1`）
2. 切換影片時重置（避免跨影片污染）

## 3.2.2 AI 動作區（固定在影片顯示區右上）

| 控制項 | 顯示規則 | 點擊後行為 |
|---|---|---|
| 開始辨識 | 永遠顯示 | 呼叫 `POST /api/videos/:id/ai-detect` |
| 取消辨識 | 只在 `PROCESSING` 顯示（其餘隱藏或禁用） | 呼叫 `POST /api/videos/:id/ai-cancel` |
| 狀態 Badge | 永遠顯示 | `IDLE/PROCESSING/DONE/FAILED/CANCELED` |

重點規則：

1. 再次點 `開始辨識` 一律覆蓋同影片任務（單筆策略）
2. 若已在 `PROCESSING`，前端先顯示「正在重啟」小狀態，再走取消+重啟流程

## 3.2.3 播放工具列

| 控制項 | 行為細節 |
|---|---|
| 播放/暫停 | 切換 `<video>` 播放狀態 |
| 逐幀上一幀 | 以 `timeline` 前一個 `display_index` 跳轉 |
| 逐幀下一幀 | 以 `timeline` 下一個 `display_index` 跳轉 |
| 倍速 | `0.25x / 0.5x / 1x / 1.5x / 2x` |
| 時間軸拖曳 | seek 到目標時間並觸發 `seeked` |
| 時間與幀資訊 | 顯示 `currentTime / duration`、`display_index`、`pts_us` |

### 3.2.4 播放工具列互動規格（重要）

1. 拖曳時間軸時暫停 overlay 更新（避免拖曳中抖動）
2. `seeked` 後重新計算當前 `frame_id`，再恢復 overlay
3. 逐幀跳轉必須以 `timeline` 為準，不用 `1/fps` 推估

---

## 3.3 Layers Panel

三個區塊都支援「收合/展開」。  
預設：三區塊皆展開。

## 3.3.1 類別圖層（Category Layers）

### 區塊功能

1. 全域顯示開關（Category Master Toggle）
2. 類別列表（每列：名稱、顏色、可見開關、計數）
3. 新增類別
4. 刪除類別

### 列項欄位

| 欄位 | 說明 |
|---|---|
| name | 類別名稱，唯一（不分大小寫） |
| color | 顯示顏色（hex） |
| visible | 該類別是否顯示 |
| count | 目前影片中此類別標註數 |
| source | `MANUAL` 或 `AI` |

### 類別新增規格

1. 名稱長度 `1~32`
2. 不可重複（case-insensitive）
3. 顏色預設由 palette 自動分配，可手動改

### 類別刪除規格

1. `source = AI` 類別不可刪除（由 AI 結果決定，只能隱藏）
2. `source = MANUAL` 且仍被標註引用時不可刪除，API 回 `409` 並回傳引用數
3. 可刪除時為硬刪（移除 category 記錄）

### 類別開關規格

1. Master Toggle = Off：所有類別暫時隱藏（不改每列原本 visible）
2. Master Toggle = On：回復每列原本 visible 狀態

## 3.3.2 標註圖層（Annotation Layers）

### 區塊功能

1. 區塊開關（顯示/隱藏所有人工標註）
2. 目前幀標註清單
3. 選中標註高亮與定位

### 顯示規則

1. 區塊關閉時，不渲染人工標註 overlay
2. 區塊開啟時，只渲染當前幀且對應可見類別的標註

## 3.3.3 AI 圖層（AI Layers）

### 區塊功能

1. 區塊開關（顯示/隱藏 AI overlay）
2. 顯示選項開關：
   - `BBox`
   - `Track ID`
   - `Trajectory`
3. 目前幀 bbox 清單（類別、score、track_id）

### 顯示規則

1. 區塊關閉：AI overlay 全隱藏
2. 區塊開啟 + BBox 關閉：不畫框，但可保留清單
3. Trajectory 只有當模型提供 track 且軌跡資料存在時顯示

## 3.3.4 收合/展開狀態保存

1. `localStorage` key：`viewer:layer-panels:v1`
2. 保存：`categoryOpen`, `annotationOpen`, `aiOpen`
3. 切換影片不重置（偏好層級）

---

## 4. 資料儲存設計

## 4.1 檔案目錄

1. `storage/videos/{videoId}/source.mp4`
2. `storage/videos/{videoId}/metadata.json`
3. `storage/videos/{videoId}/timeline.json`
4. `storage/videos/{videoId}/ai/latest.coco.json`
5. `storage/app.db`

## 4.2 SQLite schema

## `videos`

1. `id TEXT PRIMARY KEY`
2. `filename TEXT NOT NULL`
3. `local_path TEXT NOT NULL`
4. `uploaded_at TEXT NOT NULL`
5. `duration_sec REAL`
6. `source_fps REAL`
7. `video_width INTEGER`
8. `video_height INTEGER`
9. `file_size_bytes INTEGER`
10. `video_codec TEXT`
11. `pixel_format TEXT`
12. `ai_status TEXT NOT NULL DEFAULT 'IDLE'`
13. `ai_count INTEGER NOT NULL DEFAULT 0`
14. `ai_detected_frames INTEGER NOT NULL DEFAULT 0`
15. `ai_category_count INTEGER NOT NULL DEFAULT 0`
16. `ai_stats_updated_at TEXT`
17. `timeline_status TEXT NOT NULL DEFAULT 'PENDING'`
18. `timeline_error TEXT`
19. `created_at TEXT NOT NULL`
20. `updated_at TEXT NOT NULL`

## `ai_jobs`（同影片單筆）

1. `video_id TEXT PRIMARY KEY`
2. `status TEXT NOT NULL`（`IDLE/PROCESSING/DONE/FAILED/CANCELED`）
3. `error_message TEXT`
4. `started_at TEXT`
5. `finished_at TEXT`
6. `canceled_at TEXT`
7. `updated_at TEXT NOT NULL`
8. `FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE`

## `categories`

1. `id TEXT PRIMARY KEY`
2. `video_id TEXT NOT NULL`
3. `name TEXT NOT NULL`
4. `color TEXT NOT NULL`
5. `source TEXT NOT NULL`（`MANUAL/AI`）
6. `is_visible INTEGER NOT NULL DEFAULT 1`
7. `created_at TEXT NOT NULL`
8. `updated_at TEXT NOT NULL`
9. `UNIQUE(video_id, LOWER(name))`
10. `FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE`

## `annotations`

1. `id TEXT PRIMARY KEY`
2. `video_id TEXT NOT NULL`
3. `frame_id TEXT NOT NULL`
4. `category_id TEXT NOT NULL`
5. `bbox_json TEXT NOT NULL`
6. `created_at TEXT NOT NULL`
7. `updated_at TEXT NOT NULL`
8. `FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE`
9. `FOREIGN KEY(category_id) REFERENCES categories(id)`

## 4.3 時間對齊規範（`pts_us`）

1. `display_index` 只供顯示，不做對齊基準
2. `pts_us` 才是對齊基準
3. VFR 影片禁止用 `fps * n` 估算幀時間
4. `pts_us` 無法建立時，回 `422` 或標記 `timeline_status = FAILED`

## 4.4 Viewer 對齊三個保護

1. 時間來源保護：優先 `requestVideoFrameCallback().mediaTime`
2. 幀查找保護：binary search `last pts_us <= queryPts`
3. 播放穩定保護：monotonic guard + `seeked` 後重置

## 4.5 AI 覆蓋策略（無歷史）

1. 同影片再次辨識時覆蓋 `ai_jobs` 同列
2. AI 結果永遠寫 `latest.coco.json`
3. 不保存歷史 `jobId` 結果檔

---

## 5. API 規格（詳細）

## 5.0 共通規格

成功回應：

```json
{
  "ok": true,
  "data": {}
}
```

錯誤回應：

```json
{
  "ok": false,
  "error": {
    "code": "LAYER_CATEGORY_IN_USE",
    "message": "Category is referenced by annotations.",
    "details": { "annotationCount": 12 }
  },
  "requestId": "req_xxx"
}
```

常用狀態碼：`200/201/204/400/404/409/413/415/422/500`

## 5.1 Upload / Video API

### `POST /api/videos/upload`

- Input: `multipart/form-data(file)`
- Output data：

```json
{
  "videoId": "v_xxx",
  "status": "READY",
  "metadata": {
    "videoWidth": 1280,
    "videoHeight": 720,
    "sourceFps": 29.97,
    "durationSec": 12.3,
    "videoCodec": "h264"
  }
}
```

### `GET /api/videos`

Query: `page`, `pageSize`  
Output: 影片列表 + `aiStatus` + `timelineStatus`

### `GET /api/videos/:id/meta`

Output: metadata + AI統計 + timeline 狀態

### `GET /api/videos/:id/stream`

1. 支援 `Range`
2. 回傳 `206` 與 `Accept-Ranges: bytes`
3. 非法 range 回 `416`

### `GET /api/videos/:id/timeline`

Query: `cursor`, `limit`  
Output: `[{frameId, displayIndex, ptsUs, isKeyframe}]`

### `DELETE /api/videos/:id`

刪除影片、metadata、timeline、AI結果與 DB row

### `DELETE /api/videos/:id/ai-result`

1. 保留影片、清除 AI 結果
2. 若 `PROCESSING`，回 `409`（需先 cancel）

## 5.2 AI API

### `POST /api/videos/:id/ai-detect`

1. upsert 同影片 `ai_jobs` 為 `PROCESSING`
2. 同影片重點擊即覆蓋重啟

Output:

```json
{
  "videoId": "v_xxx",
  "status": "PROCESSING"
}
```

### `POST /api/videos/:id/ai-cancel`

1. 僅 `PROCESSING` 可執行
2. 成功後狀態 `CANCELED`

### `GET /api/videos/:id/ai-status`

Output:

```json
{
  "videoId": "v_xxx",
  "status": "DONE",
  "errorMessage": null,
  "updatedAt": "2026-04-17T10:00:00Z"
}
```

### `GET /api/videos/:id/ai-result`

回最新 COCO + 統計；若有 track，需包含 `track_id` 與軌跡點資料

## 5.3 Category API（新增細節）

### `GET /api/videos/:id/categories`

回傳類別清單（含 `source`, `visible`, `count`）

### `POST /api/videos/:id/categories`

Input:

```json
{
  "name": "Nerve",
  "color": "#22C55E"
}
```

規則：

1. 名稱不可重複
2. 只建立 `source=MANUAL`

### `PATCH /api/videos/:id/categories/:categoryId`

允許修改：`name`, `color`, `isVisible`

### `DELETE /api/videos/:id/categories/:categoryId`

1. `source=AI` 回 `409`（不可刪）
2. 被 annotation 引用回 `409`（`LAYER_CATEGORY_IN_USE`）
3. 可刪時回 `204`

---

## 6. 核心流程與互動細節

## 6.1 播放與對齊流程

1. 載入影片後先取 `timeline`
2. 每個顯示幀回呼：
   - 取得 `mediaTime`
   - 轉為 `queryPts = round(mediaTime * 1_000_000)`
   - binary search 對應 `frameId`
   - 套用 monotonic guard
3. 以 `frameId` 查當前幀 AI/標註 overlay

## 6.2 AI 流程

1. 點 `開始辨識` -> `PROCESSING`
2. 完成 -> `DONE` + toast
3. 失敗 -> `FAILED` + error toast
4. 取消 -> `CANCELED`

## 6.3 按鈕可用性矩陣

| 狀態 | 開始辨識 | 取消辨識 | 清除AI結果 |
|---|---|---|---|
| IDLE | 可用 | 不可用 | 可用（若有結果） |
| PROCESSING | 可用（觸發重啟） | 可用 | 不可用 |
| DONE | 可用 | 不可用 | 可用 |
| FAILED | 可用 | 不可用 | 可用 |
| CANCELED | 可用 | 不可用 | 可用 |

## 6.4 圖層開關互動規格

1. 關閉「類別圖層」：隱藏類別清單與對應 overlay 篩選 UI，但不刪資料
2. 關閉「標註圖層」：不渲染 manual overlay
3. 關閉「AI圖層」：不渲染 AI overlay
4. 類別列 `isVisible=false`：只影響顯示，不影響資料存在

---

## 7. 前端模組拆分

1. `UploadPanel`
2. `ViewerImageToolbar`
3. `ViewerAiActionDock`
4. `PlaybackToolbar`
5. `LayersPanel`
6. `CategoryLayerSection`
7. `AnnotationLayerSection`
8. `AiLayerSection`
9. `useFrameTimeline`
10. `useAiTaskActions`
11. `useLayerVisibilityState`
12. `useCategories`

---

## 8. 分期里程碑（修正版）

### Phase 1：骨架與上傳

1. Upload + metadata + stream 基本路徑
2. timeline 產生與 `pts_us` 落地
3. Upload Panel 完整按鈕行為

### Phase 2：Viewer 與工具列

1. 影像工具列功能齊備
2. 播放工具列（含逐幀）
3. AI 動作區移位與基本狀態
4. 三個保護（`mediaTime`, binary search, monotonic）

### Phase 3：AI 整合

1. `ai-detect` / `ai-cancel` / `ai-status` / `ai-result`
2. 同影片單筆覆蓋策略
3. 完成/失敗/取消通知

### Phase 4：Layers 與類別管理

1. 類別/標註/AI 三區塊收合展開
2. 類別 CRUD
3. AI 顯示切換（BBox/Track ID/Trajectory）

### Phase 5：穩定化

1. 錯誤路徑與邊界條件
2. 播放效能與大檔優化
3. 測試與交付文件

---

## 9. 驗收標準（DoD）

## 9.1 UI 與互動

1. AI 按鈕不在影像工具列，固定在影片區右上
2. 影像工具列、播放工具列所有按鈕行為符合規格
3. 三個圖層區塊可收合/展開且狀態可保存
4. 類別圖層支援新增/刪除/可見切換
5. `source=AI` 類別不可刪除，且有明確錯誤提示

## 9.2 對齊與播放

1. 使用 `requestVideoFrameCallback + mediaTime`（不支援才 fallback）
2. 幀查找為 binary search `last pts_us <= queryPts`
3. 有 monotonic guard 與 `seeked` 重置
4. VFR 影片不出現系統性 bbox 漂移

## 9.3 AI 任務

1. 同影片 `ai_jobs` 只有一筆
2. `PROCESSING` 可取消並正確進入 `CANCELED`
3. `DONE/FAILED/CANCELED` 狀態顯示正確

## 9.4 API 與錯誤

1. API 錯誤格式一致
2. 串流 `206/416` 行為正確
3. 類別刪除衝突 `409` 行為正確

---

## 10. 測試清單（可執行）

1. 上傳 mp4 成功，metadata 正確
2. 上傳非支援格式回 `415`
3. timeline 缺 `pts_us` 回 `422`
4. 播放中 overlay 不抖動（monotonic）
5. seek 後 overlay 可正確跳轉
6. AI 任務可開始/取消/重啟
7. 清除 AI 結果在 `PROCESSING` 回 `409`
8. 類別新增重名回 `409`
9. 已引用類別刪除回 `409`
10. AI 類別刪除回 `409`

---

## 11. 風險與對策

1. 影片過大上傳慢
- 對策：進度明確 + 大小上限

2. AI 任務長時間卡住
- 對策：取消能力 + timeout + 狀態監控

3. 工具列行為不一致造成學習成本
- 對策：按鈕語義固定、明確禁用規則、狀態可視化

4. 圖層規則不清造成顯示混亂
- 對策：區塊開關、類別開關、主開關三層規則分明

5. VFR 對齊漂移
- 對策：`pts_us` + 三個保護

6. 類別刪除誤傷資料
- 對策：引用中禁止刪除，先回 `409` 不做隱式刪除
