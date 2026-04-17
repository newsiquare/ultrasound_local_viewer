# 開發計畫：本地單頁影片辨識服務（可實作規格版）

最後更新：2026-04-17  
版本：v2.6（admin `/file` 改為 HTTP Basic Auth 即時登入彈窗）

## 快速導覽（TOC）

- [1. 專案定位](#1-專案定位)
- [2. 介面資訊架構](#2-介面資訊架構)
- [3. 功能規格（逐區塊）](#3-功能規格逐區塊)
- [3.4 檔案管理頁 `/file`（admin-only）](#34-檔案管理頁-fileadmin-only)
- [4. 資料儲存設計](#4-資料儲存設計)
- [5. API 規格（詳細）](#5-api-規格詳細)
- [5.4 Admin File API（新增）](#54-admin-file-api新增)
- [6. 核心流程與互動細節](#6-核心流程與互動細節)
- [7. 前端模組拆分](#7-前端模組拆分)
- [8. 分期里程碑（依賴導向）](#8-分期里程碑依賴導向)
- [9. 驗收標準（DoD）](#9-驗收標準dod)
- [10. 測試清單（可執行）](#10-測試清單可執行)
- [11. AI Worker 執行架構（新增）](#11-ai-worker-執行架構新增)
- [12. 風險與對策](#12-風險與對策)

---

## 1. 專案定位

本專案是一個獨立 repo 的本地單頁服務，目標是把以下流程整合在同一個 Viewer：

1. 影片上傳（本地存檔）
2. 影片播放（串流 + 時間軸）
3. 圖層顯示（類別、標註、AI）
4. AI 辨識（YOLO）啟動 / 取消 / 完成狀態
5. 檔案一致性維運（DB 與檔案系統一致性檢查與修復）

硬性約束：

1. 不使用 Cloudflare R2
2. 不使用 Supabase
3. 檔案與資料全部落在本機
4. AI 結果輸出 COCO
5. 同一支影片 `ai_jobs` 永遠只保留一筆（覆蓋更新，不保留歷史版）

### 1.1 技術棧（固定）

1. `web`：Next.js（App Router）+ React + TypeScript（同專案提供 UI 與本地 API route handlers）。
2. `ai-worker`：FastAPI + Python + Ultralytics（獨立進程，本機服務）。
3. `storage`：本地檔案系統 + SQLite。
4. 前後端通訊：
   - Browser 與 web：HTTP/JSON + SSE（AI 狀態推播）
   - web 與 ai-worker：本機 HTTP（127.0.0.1）

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
│ [注意事項] [拖拉上傳] [單檔進度] [總進度] [建立上傳任務] [取消上傳] [清除當前影片] │
│ [清除AI] [清除當前所有資料(前端)]                                              │
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
│ actions: 建立上傳任務 | 取消上傳 | 清除當前影片 | 清除AI結果 | 清除當前所有資料 │
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

### 2.5 Admin 維運頁（隱藏路由）

1. 提供 `localhost:3000/file` 作為檔案管理頁（admin-only）。
2. 一般使用者前端不顯示 `/file` 入口。
3. 非 admin 即使手動輸入 `/file` 也必須被伺服器阻擋（`401` + `WWW-Authenticate: Basic`）。

---

## 3. 功能規格（逐區塊）

### 3.1 Upload Panel

#### 3.1.1 控制項與行為

| 控制項 | 說明 | 可用條件 | 禁用條件 |
|---|---|---|---|
| 拖拉上傳區 | 接受單檔影片 | 無任務進行中 | 正在寫檔或解析 metadata |
| 建立上傳任務 | 開啟檔案選擇器並上傳 | 非 `UPLOADING` | `UPLOADING` |
| 取消上傳 | 取消目前上傳中的請求 | `UPLOADING` 或 `PARSING_METADATA` | `IDLE/READY/FAILED/CANCELED` |
| 清除當前影片 | 刪除影片 + AI + DB 紀錄 | 已有影片 | 無影片 |
| 清除 AI 結果 | 保留影片，清 AI 結果 | 已有影片且非 `PROCESSING` | `PROCESSING` |
| 清除當前所有資料 | 清空前端 session/render 狀態並回到預設 UI（不刪 DB/檔案） | 永遠可用 | 無 |

#### 3.1.2 上傳狀態機

`IDLE -> PICKED -> UPLOADING -> PARSING_METADATA -> READY | FAILED | CANCELED`

#### 3.1.3 上傳取消規格（新增）

1. 前端使用 `AbortController` 取消 `POST /api/videos/upload`。
2. 使用者點擊「取消上傳」後，UI 立即切成 `CANCELED` 並停止進度更新。
3. 後端收到連線中斷後，必須清理暫存檔（避免殘留半檔）。
4. 取消完成後可立即再次上傳，不需重整頁面。

#### 3.1.4 上傳通知規格（新增）

1. 上傳成功：顯示 `Upload completed` toast。
2. 上傳失敗：顯示 `Upload failed` toast + 錯誤摘要。
3. 上傳取消：顯示 `Upload canceled` info toast。

#### 3.1.5 Metadata 顯示欄位

1. `video_width`, `video_height`
2. `source_fps`
3. `duration_sec`
4. `file_size_bytes`
5. `video_codec`
6. `pixel_format`

#### 3.1.6 刷新與前端狀態保持（新增）

1. 網頁刷新後必須維持目前影片與已載入圖層資料（不可回到空白預設）。
2. 前端至少保存以下狀態於 `localStorage`：
   - `currentVideoId`
   - upload/viewer/layers 的 UI 開關狀態
   - 最近一次成功載入的 `meta/categories/annotations/ai-result` 快照時間
3. 刷新後採「先回填快照，再背景 revalidate」：
   - 先用本地快照重建畫面
   - 再並行呼叫 API 校正最新資料
4. 若重建失敗（例如 `videoId` 已被刪除），顯示 `資料已不存在，已重置畫面` 並清除本地狀態。
5. 「清除當前所有資料」按鈕只清前端狀態，不觸發後端刪除。

#### 3.1.7 重複上傳策略（新增）

1. 每次上傳都建立新的 `video_id`，即使 `filename` 相同也不覆蓋舊影片。
2. 新 `video_id` 的類別與標註預設為空（`categories=0`, `annotations=0`）。
3. 舊影片資料保留在本機，交由 `/file` 清理策略管理。

---

### 3.2 Viewer Panel

#### 3.2.1 影像工具列（不含 AI 任務按鈕）

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

#### 3.2.2 AI 動作區（固定在影片顯示區右上）

| 控制項 | 顯示規則 | 點擊後行為 |
|---|---|---|
| 開始辨識 | 永遠顯示；`PROCESSING` 時禁用 | 呼叫 `POST /api/videos/:id/ai-detect` |
| 取消辨識 | 只在 `PROCESSING` 顯示（其餘隱藏或禁用） | 呼叫 `POST /api/videos/:id/ai-cancel` |
| 狀態 Badge | 永遠顯示 | `IDLE/PROCESSING/DONE/FAILED/CANCELED` |

重點規則：

1. `PROCESSING` 期間「開始辨識」按鈕必須禁用。
2. 再次辨識只允許在非 `PROCESSING` 狀態執行，並覆蓋同影片 `ai_jobs` 同列（單筆策略）。

#### 3.2.3 播放工具列

| 控制項 | 行為細節 |
|---|---|
| 播放/暫停 | 切換 `<video>` 播放狀態 |
| 逐幀上一幀 | 以 `timeline` 前一個 `display_index` 跳轉 |
| 逐幀下一幀 | 以 `timeline` 下一個 `display_index` 跳轉 |
| 倍速 | `0.25x / 0.5x / 1x / 1.5x / 2x` |
| 時間軸拖曳 | seek 到目標時間並觸發 `seeked` |
| 時間與幀資訊 | 顯示 `currentTime / duration`、`display_index`、`pts_us` |

#### 3.2.4 播放工具列互動規格（重要）

1. 拖曳時間軸時暫停 overlay 更新（避免拖曳中抖動）
2. `seeked` 後重新計算當前 `frame_id`，再恢復 overlay
3. 逐幀跳轉必須以 `timeline` 為準，不用 `1/fps` 推估

---

### 3.3 Layers Panel

三個區塊都支援「收合/展開」。  
預設：三區塊皆展開。

#### 3.3.1 類別圖層（Category Layers）

##### 區塊功能

1. 全域顯示開關（Category Master Toggle）
2. 類別列表（每列：名稱、顏色、可見開關、計數）
3. 新增類別
4. 刪除類別

##### 列項欄位

| 欄位 | 說明 |
|---|---|
| name | 類別名稱，唯一（不分大小寫） |
| color | 顯示顏色（hex） |
| visible | 該類別是否顯示 |
| count | 目前影片中此類別標註數 |
| source | `MANUAL` 或 `AI` |

##### 類別新增規格

1. 名稱長度 `1~32`
2. 不可重複（case-insensitive）
3. 顏色預設由 palette 自動分配，可手動改

##### 類別刪除規格

1. `source = AI` 類別不可刪除（由 AI 結果決定，只能隱藏）
2. `source = MANUAL` 且仍被標註引用時不可刪除，API 回 `409` 並回傳引用數
3. 可刪除時為硬刪（移除 category 記錄）
4. 若刪除整支影片，該影片的類別會一併刪除（DB `ON DELETE CASCADE`）。

##### 類別開關規格

1. Master Toggle = Off：所有類別暫時隱藏（不改每列原本 visible）
2. Master Toggle = On：回復每列原本 visible 狀態

#### 3.3.2 標註圖層（Annotation Layers）

##### 區塊功能

1. 區塊開關（顯示/隱藏所有人工標註）
2. 目前幀標註清單
3. 選中標註高亮與定位

##### 顯示規則

1. 區塊關閉時，不渲染人工標註 overlay
2. 區塊開啟時，只渲染當前幀且對應可見類別的標註

#### 3.3.3 AI 圖層（AI Layers）

##### 區塊功能

1. 區塊開關（顯示/隱藏 AI overlay）
2. 顯示選項開關：
   - `BBox`
   - `Track ID`
   - `Trajectory`
3. 目前幀 bbox 清單（類別、score、track_id）

##### 顯示規則

1. 區塊關閉：AI overlay 全隱藏
2. 區塊開啟 + BBox 關閉：不畫框，但可保留清單
3. Trajectory 只有當模型提供 track 且軌跡資料存在時顯示

#### 3.3.4 收合/展開狀態保存

1. `localStorage` key：`viewer:layer-panels:v1`
2. 保存：`categoryOpen`, `annotationOpen`, `aiOpen`
3. 切換影片不重置（偏好層級）

### 3.4 檔案管理頁 `/file`（admin-only）

#### 3.4.1 權限與可見性

1. 只有 admin 可存取 `/file`。
2. 權限檢查必須在伺服器端執行（不可只靠前端隱藏）。
3. `/api/admin/file/*` 全部端點僅允許 admin。
4. 本地版 admin 鑑權採 HTTP Basic Auth（環境變數：`ADMIN_USER`、`ADMIN_PASSWORD`）。
5. 驗證規則：`Authorization: Basic base64(user:password)` 比對 `ADMIN_USER/ADMIN_PASSWORD`。
6. 未登入或驗證失敗時回 `401`，且需帶 `WWW-Authenticate: Basic realm=\"File Admin\"` 以觸發瀏覽器登入彈窗。
7. 提供 `GET /file/logout`：固定回 `401` + `WWW-Authenticate`，用於「切換帳號」重新登入。

#### 3.4.2 頁面用途

1. 檢視影片資產清單與關鍵統計。
2. 檢測 DB 與檔案系統不一致問題。
3. 提供安全修復（dry-run 預覽後再 apply）。
4. 管理定時清理策略與手動觸發清理。
5. 支援管理員快速切換登入帳號（`/file/logout`）。

#### 3.4.3 表格欄位（實作基線）

1. `video_id`
2. `filename`（固定左側第 2 欄）
3. 上傳時間（`uploaded_at`）
4. 類別 / 標註數量（`category_count` / `annotation_count`）
5. AI 辨識狀態（`ai_status`）
6. AI 類別 / 標註數量（`ai_category_count` / `ai_annotation_count`）
7. 一致性狀態（`consistency_status`）
8. 操作欄（順序固定：`metadata`、`檢查`、`預覽清理`、`刪除`、`修復`）

##### 3.4.3.2 操作區（Table Toolbar）

1. 關鍵字搜尋框：`filename/video_id/來源/類別`。
2. 篩選器：上傳日期、影像來源、影像類別、AI 狀態、一致性狀態。
3. 批次操作按鈕：
   - `批次一致性掃描`
   - `批次預覽清理(dry-run)`
   - `批次套用(apply)`（需二次確認）
4. 顯示設定：每頁筆數、欄位顯示開關、排序。

##### 3.4.3.3 列內操作（Row Actions）

1. `metadata` 圖標：放在操作欄第一個按鈕。
2. `metadata` 圖標 hover 行為：滑鼠靠近即自動顯示 metadata 浮層（解析度、fps、長度、編碼、`storage_path`、人類可讀 `file_size`）。
3. `metadata` 圖標 click 行為：可選擇固定右側抽屜，顯示完整 metadata JSON。
4. `檢查一致性`：開啟該影片一致性詳細結果。
5. `預覽清理`：僅顯示將刪除/修復的項目，不落資料。
6. `刪除影片`：刪除 `source.mp4 + metadata + timeline + ai + DB rows`。
7. `套用修復`：僅在非 `PROCESSING` 狀態可執行。

##### 3.4.3.4 右側細節抽屜（Details Drawer）

1. 基本資料：`video_id`, `filename`, `uploaded_at`。
2. metadata：解析度、fps、長度、編碼、`storage_path`, `file_size`。
3. AI：`ai_status`, `ai_count`, `ai_detected_frames`, `ai_stats_updated_at`。
4. 一致性：`consistency_status`, `last_checked_at`, `consistency_reason`。
5. 操作歷史：最近一次 `cleanup/reconcile` 執行者、時間、影響筆數。

##### 3.4.3.5 一致性狀態 `info` 圖標內容（新增）

一致性狀態欄位需提供 `info` 圖標，至少顯示以下細節：

1. `last_checked_at`
2. `consistency_reason`
3. `locked_by_processing`

#### 3.4.4 一致性狀態定義

1. `HEALTHY`：DB 與檔案皆完整。
2. `MISSING_FILE`：DB 有記錄但 `source.mp4` 不存在。
3. `MISSING_METADATA`：影片存在但 metadata 缺失。
4. `MISSING_AI_RESULT`：`ai_status=DONE` 但 `latest.coco.json` 缺失。
5. `ORPHAN_DB`：DB 殘留失效記錄（無對應目錄）。
6. `ORPHAN_FS`：磁碟有孤兒目錄（無 DB 對應 `video_id`）。
7. `PROCESSING_LOCKED`：進行中任務，禁止刪除/修復。

#### 3.4.5 操作規格（安全優先）

1. 所有高風險操作預設為 `dry-run`。
2. 只有使用者二次確認後才可 `apply`。
3. `PROCESSING` 影片不可刪除或修復（回 `409`）。
4. 提供「批次一致性掃描」與「批次預覽清理」。
5. 每次 apply 必須留下 audit log（時間、操作者、影響筆數）。

#### 3.4.6 篩選與搜尋（參考附件並優化）

1. 關鍵字搜尋：檔名 / `video_id` / 類別名稱。
2. 上傳日期區間篩選。
3. AI 狀態篩選（`IDLE/PROCESSING/DONE/FAILED/CANCELED`）。
4. 一致性狀態篩選（`HEALTHY` 與各種異常）。
5. 支援排序（上傳時間、異常優先）。
6. 支援分頁與每頁筆數切換。

#### 3.4.7 風險監控區（新增）

1. `/file` 頁面上方提供「風險監控摘要卡」：
   - `P0/P1/P2` 開啟數
   - 最近 24 小時新增風險數
   - 最近 24 小時已恢復數
2. 提供「風險列表抽屜」欄位：
   - `risk_code`, `severity`, `status`, `trigger_time`, `owner`, `latest_note`
3. 每筆風險需可跳轉到對應影片或對應檢查結果。
4. 風險監控資料來源為後端彙整，不由前端自行推算。

---

## 4. 資料儲存設計

### 4.1 檔案目錄

1. `storage/videos/{videoId}/source.mp4`
2. `storage/videos/{videoId}/metadata.json`
3. `storage/videos/{videoId}/timeline.json`
4. `storage/videos/{videoId}/ai/latest.coco.json`
5. `storage/app.db`

### 4.2 SQLite schema

ID 規格（固定）：

1. `video_id` / `id` 一律使用 `UUID v7`（小寫、含連字號），範例：`018f7d2e-6f4d-7c9a-b2d1-8c6e1b2a9f40`
2. 文件中 `v_xxx` 僅為示意，實作不可使用短代號作正式主鍵

#### `videos`

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

#### `ai_jobs`（同影片單筆）

1. `video_id TEXT PRIMARY KEY`
2. `status TEXT NOT NULL`（`IDLE/PROCESSING/DONE/FAILED/CANCELED`）
3. `error_message TEXT`
4. `started_at TEXT`
5. `finished_at TEXT`
6. `canceled_at TEXT`
7. `updated_at TEXT NOT NULL`
8. `FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE`

#### `categories`

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

#### `annotations`

1. `id TEXT PRIMARY KEY`
2. `video_id TEXT NOT NULL`
3. `frame_id TEXT NOT NULL`
4. `category_id TEXT NOT NULL`
5. `bbox_json TEXT NOT NULL`
6. `created_at TEXT NOT NULL`
7. `updated_at TEXT NOT NULL`
8. `FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE`
9. `FOREIGN KEY(category_id) REFERENCES categories(id)`

#### `video_consistency`

1. `video_id TEXT PRIMARY KEY`
2. `consistency_status TEXT NOT NULL`
3. `consistency_reason TEXT`
4. `last_checked_at TEXT NOT NULL`
5. `check_source TEXT NOT NULL`（`MANUAL/SCHEDULED/ON_UPLOAD`）
6. `locked_by_processing INTEGER NOT NULL DEFAULT 0`
7. `updated_at TEXT NOT NULL`
8. `FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE`

#### `audit_log`

1. `id TEXT PRIMARY KEY`
2. `event_type TEXT NOT NULL`（`RECONCILE_APPLY/CLEANUP_APPLY/VIDEO_DELETE/...`）
3. `actor TEXT NOT NULL`
4. `target_type TEXT NOT NULL`（`VIDEO/SYSTEM`）
5. `target_id TEXT`
6. `request_id TEXT`
7. `payload_json TEXT`
8. `result_json TEXT`
9. `created_at TEXT NOT NULL`

#### `risk_events`

1. `id TEXT PRIMARY KEY`
2. `risk_code TEXT NOT NULL`
3. `severity TEXT NOT NULL`（`P0/P1/P2`）
4. `status TEXT NOT NULL`（`OPEN/ACKED/RESOLVED`）
5. `video_id TEXT`
6. `trigger_source TEXT NOT NULL`（`CONSISTENCY_SCAN/SSE_HEALTH/CLEANUP_MONITOR/MANUAL`）
7. `trigger_time TEXT NOT NULL`
8. `resolved_time TEXT`
9. `owner TEXT`
10. `latest_note TEXT`
11. `created_at TEXT NOT NULL`
12. `updated_at TEXT NOT NULL`
13. `FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE SET NULL`

### 4.3 時間對齊規範（`pts_us`）

1. `display_index` 只供顯示，不做對齊基準
2. `pts_us` 才是對齊基準
3. VFR 影片禁止用 `fps * n` 估算幀時間
4. `pts_us` 無法建立時，回 `422` 或標記 `timeline_status = FAILED`

### 4.4 Viewer 對齊三個保護

1. 時間來源保護：優先 `requestVideoFrameCallback().mediaTime`
2. 幀查找保護：binary search `last pts_us <= queryPts`
3. 播放穩定保護：monotonic guard + `seeked` 後重置

### 4.5 AI 覆蓋策略（無歷史）

1. 同影片在非 `PROCESSING` 狀態再次辨識時，覆蓋 `ai_jobs` 同列
2. AI 結果永遠寫 `latest.coco.json`
3. 不保存歷史 `jobId` 結果檔

### 4.6 `timeline.json` 格式（固定）

```json
{
  "schemaVersion": "1.0",
  "videoId": "018f7d2e-6f4d-7c9a-b2d1-8c6e1b2a9f40",
  "durationUs": 12345678,
  "sourceFps": 29.97,
  "frames": [
    {
      "frameId": "f_000001",
      "displayIndex": 1,
      "ptsUs": 33367,
      "isKeyframe": true
    }
  ]
}
```

規則：

1. `frames[*].ptsUs` 必填且單調不遞減。
2. `displayIndex` 僅供 UI 顯示，不可作對齊依據。
3. `frameId` 在單一 `videoId` 內唯一。

### 4.7 COCO 輸出範圍（固定）

本專案採「COCO Detection 基本欄位 + tracking 擴充欄位」：

1. 基本欄位：`images`, `annotations`, `categories`。
2. `annotations` 必填：`id`, `image_id`, `category_id`, `bbox`, `score`。
3. 擴充欄位（非標準 COCO，但本專案固定）：`track_id`, `frame_index`, `pts_us`, `source="AI"`。
4. 不要求 segmentation/polygon；初版以 bbox 為主。

---

## 5. API 規格（詳細）

### 5.0 共通規格

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

常用狀態碼：`200/201/204/400/401/404/409/413/415/422/500`

Admin 鑑權（適用 `/api/admin/file/*`）：

1. 使用 HTTP Basic Auth：`Authorization: Basic <base64(user:password)>`
2. 伺服器以環境變數 `ADMIN_USER`、`ADMIN_PASSWORD` 比對帳密
3. 無憑證或比對失敗一律回 `401` + `WWW-Authenticate: Basic realm=\"File Admin\"`
4. `/file` route 也使用同一套 Basic Auth，首次進入即觸發登入彈窗

### 5.1 Upload / Video API

#### `POST /api/videos/upload`

- Input: `multipart/form-data(file)`
- Allowed extension: `.mp4`, `.mov`, `.avi`, `.mkv`
- Allowed MIME: `video/mp4`, `video/quicktime`, `video/x-msvideo`, `video/x-matroska`
- 不在白名單時回 `415 Unsupported Media Type`
- Client cancel: 由前端 `AbortController` 中止請求
- Server cleanup: 請求中止時刪除暫存檔，且不可產生不完整 `videos` 記錄
- Upload identity rule: 每次上傳一律新建 `video_id`（同檔名也不覆蓋既有 row）
- Upload reset rule: 新 `video_id` 初始 `categories/annotations/ai` 皆為空
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

#### `GET /api/videos`

Query: `page`, `pageSize`  
Output: 影片列表 + `aiStatus` + `timelineStatus`

#### `GET /api/videos/:id/meta`

Output: metadata + AI統計 + timeline 狀態

#### `GET /api/videos/:id/bootstrap`

用途：刷新後快速重建 Viewer 畫面（單次回傳首屏必要資料）

Query：

1. `windowBefore`（預設 `60`、上限 `240`）
2. `windowAfter`（預設 `60`、上限 `240`）

Output：

1. `meta`
2. `timelineSummary`（總幀數、起訖 `pts_us`）
3. `categories`
4. `annotationsCurrentWindow`（`currentFrame ± windowBefore/windowAfter`）
5. `aiStatus` + `aiSummary`

#### `GET /api/videos/:id/stream`

1. 支援 `Range`
2. 回傳 `206` 與 `Accept-Ranges: bytes`
3. 非法 range 回 `416`

#### `GET /api/videos/:id/timeline`

Query: `cursor`, `limit`  
Output: `[{frameId, displayIndex, ptsUs, isKeyframe}]`

#### `DELETE /api/videos/:id`

刪除影片、metadata、timeline、AI結果與 DB row（同影片的 `categories`、`annotations` 會因 `ON DELETE CASCADE` 一併移除）

#### `DELETE /api/videos/:id/ai-result`

1. 保留影片、清除 AI 結果
2. 若 `PROCESSING`，回 `409`（需先 cancel）

### 5.2 AI API

#### `POST /api/videos/:id/ai-detect`

1. 僅在非 `PROCESSING` 狀態可執行。
2. 若目前 `ai_status=PROCESSING`，回 `409 Conflict`。
3. 合法呼叫時 upsert 同影片 `ai_jobs` 為 `PROCESSING`（單列覆蓋）。

Output:

```json
{
  "videoId": "v_xxx",
  "status": "PROCESSING"
}
```

#### `POST /api/videos/:id/ai-cancel`

1. 僅 `PROCESSING` 可執行
2. 成功後狀態 `CANCELED`

#### `GET /api/videos/:id/ai-status`

Output:

```json
{
  "videoId": "v_xxx",
  "status": "DONE",
  "errorMessage": null,
  "updatedAt": "2026-04-17T10:00:00Z"
}
```

#### `GET /api/videos/:id/ai-status/stream`（SSE）

用途：AI 狀態即時推播（主路徑，取代固定輪詢）

Response headers：

1. `Content-Type: text/event-stream`
2. `Cache-Control: no-cache`
3. `Connection: keep-alive`
4. `X-Accel-Buffering: no`（若有反向代理）

事件格式：

```text
event: status
id: 101
data: {"videoId":"v_xxx","status":"PROCESSING","updatedAt":"2026-04-17T10:00:00Z"}

event: progress
id: 102
data: {"videoId":"v_xxx","progress":42}

event: done
id: 103
data: {"videoId":"v_xxx","status":"DONE","updatedAt":"2026-04-17T10:01:23Z"}
```

規格要求：

1. 連線建立後先推一次當前狀態（避免前端空白等待）
2. 終態事件：`done`、`failed`、`canceled`
3. 心跳：每 `15~30` 秒送一筆 keepalive 訊息
4. 支援 `Last-Event-ID`，前端重連可續接
5. 若 SSE 建立失敗或連續中斷，前端 fallback 為輪詢 `GET /api/videos/:id/ai-status`（每 5 秒）
6. fallback 觸發門檻：連續 `3` 次連線失敗或 `30` 秒無事件
7. 若經輪詢判定為終態（`DONE/FAILED/CANCELED`），需主動關閉 SSE 重試

#### `GET /api/videos/:id/ai-result`

回最新 COCO + 統計；若有 track，需包含 `track_id` 與軌跡點資料

### 5.3 Category API（新增細節）

#### `GET /api/videos/:id/categories`

回傳類別清單（含 `source`, `visible`, `count`）

#### `POST /api/videos/:id/categories`

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

#### `PATCH /api/videos/:id/categories/:categoryId`

允許修改：`name`, `color`, `isVisible`

#### `DELETE /api/videos/:id/categories/:categoryId`

1. `source=AI` 回 `409`（不可刪）
2. 被 annotation 引用回 `409`（`LAYER_CATEGORY_IN_USE`）
3. 可刪時回 `204`

### 5.4 Admin File API（新增）

所有端點前綴：`/api/admin/file/*`，全部 admin-only。

認證方式：HTTP Basic Auth（`ADMIN_USER` / `ADMIN_PASSWORD`）。

#### `GET /api/admin/file/list`

用途：回傳檔案管理表格資料（含一致性狀態）

Query：

1. `q`, `dateFrom`, `dateTo`
2. `aiStatus`, `consistencyStatus`
3. `page`, `pageSize`, `sortBy`, `sortDir`

最低回傳欄位：

1. `video_id`, `filename`, `uploaded_at`
2. `category_count`, `annotation_count`
3. `ai_status`, `ai_category_count`, `ai_annotation_count`
4. `metadata_preview`（供操作欄 `metadata` 圖標 hover 顯示）
5. `consistency_status`
6. `consistency_info`（`last_checked_at`, `consistency_reason`, `locked_by_processing`）

#### `GET /api/admin/file/:videoId/consistency`

用途：檢查單一影片的一致性細節與修復建議

Output：

1. `consistencyStatus`
2. `problems[]`
3. `suggestedActions[]`

#### `POST /api/admin/file/reconcile`

用途：修復一致性問題（預設 dry-run）

Input：

```json
{
  "videoIds": ["v_1", "v_2"],
  "mode": "dry-run",
  "actions": ["remove_orphan_fs", "remove_orphan_db", "rebuild_ai_status"]
}
```

規則：

1. `mode=dry-run` 僅回預計變更，不落資料。
2. `mode=apply` 才執行實際變更。
3. 涉及 `PROCESSING` 影片回 `409`。

#### `POST /api/admin/file/cleanup`

用途：觸發定時清理策略的手動執行（預覽或套用）

Input：

```json
{
  "mode": "dry-run",
  "retentionDays": 30,
  "keepLatestPerFilename": 2,
  "highWatermarkPercent": 80
}
```

規則：

1. 預設 `dry-run`。
2. `apply` 前須二次確認（前端 confirmation token）。
3. 回傳預估釋放空間與影響清單。

#### `GET /api/admin/file/cleanup-history`

用途：查詢清理與修復歷史（供追蹤審計）

資料來源：`audit_log`（過濾 `event_type in (RECONCILE_APPLY, CLEANUP_APPLY)`）

#### `GET /api/admin/file/risk-summary`

用途：提供 `/file` 風險監控摘要卡資料

最低回傳欄位：

1. `generated_at`
2. `open_p0`, `open_p1`, `open_p2`
3. `new_24h`, `resolved_24h`

資料來源：`risk_events` 彙總計算

#### `GET /api/admin/file/risk-events`

用途：提供 `/file` 風險列表與追蹤資訊

Query：`status`, `severity`, `riskCode`, `page`, `pageSize`

最低回傳欄位：

1. `risk_code`, `severity`, `status`
2. `trigger_time`, `resolved_time`
3. `trigger_source`, `owner`, `latest_note`
4. `video_id`（可為空，若是全域風險）

#### `GET /file/logout`

用途：強制觸發重新登入（切換管理員帳號）

行為：

1. 固定回 `401`
2. Header 必含 `WWW-Authenticate: Basic realm=\"File Admin\"`

### 5.5 Annotation API（補齊）

#### `GET /api/videos/:id/annotations`

Query：`frameId`, `source`, `cursor`, `limit`

#### `POST /api/videos/:id/annotations`

用途：建立人工標註（`source=MANUAL`）

#### `PATCH /api/videos/:id/annotations/:annotationId`

用途：更新人工標註 bbox 與類別

#### `DELETE /api/videos/:id/annotations/:annotationId`

用途：刪除人工標註

---

## 6. 核心流程與互動細節

### 6.1 播放與對齊流程

1. 載入影片後先取 `timeline`
2. 每個顯示幀回呼：
   - 取得 `mediaTime`
   - 轉為 `queryPts = round(mediaTime * 1_000_000)`
   - binary search 對應 `frameId`
   - 套用 monotonic guard
3. 以 `frameId` 查當前幀 AI/標註 overlay

### 6.2 AI辨識按鈕點擊後流程（新增）

觸發：使用者點擊「開始辨識」

1. 前端前置檢查：
   - 若無影片：阻擋並提示
   - 若 `timeline_status != READY`：阻擋並提示
   - 若目前 `ai_status=PROCESSING`：阻擋觸發（按鈕應已禁用）
2. 前端立即 UI 回饋：
   - 「開始辨識」按鈕進入 loading
   - AI 狀態 badge 先顯示 `PROCESSING`（optimistic，可在 API 回應後校正）
3. 呼叫 `POST /api/videos/:id/ai-detect`
4. 後端處理：
   - upsert `ai_jobs(video_id)` 為 `PROCESSING`
   - dispatch 到 `ai-worker`
5. 前端狀態追蹤：
   - 優先連接 SSE：`GET /api/videos/:id/ai-status/stream`
   - 收到 `status/progress` 即更新 badge 與進度 UI
6. 終態收斂：
   - 收到 `done`：顯示 `Finish (DONE)` toast，刷新 `ai-result`，右側 AI 圖層保留完成狀態
   - 收到 `failed`：顯示 `FAILED` toast + 錯誤摘要
   - 收到 `canceled`：顯示 `CANCELED` 提示
7. 連線失敗保護：
   - SSE 失敗時 fallback 輪詢（5 秒）
   - 一旦 SSE 恢復，停止輪詢

### 6.3 AI 通知與狀態同步機制（SSE 主路徑）

1. 主路徑：SSE 即時推播狀態，不使用固定 2 秒輪詢
2. fallback：僅在 SSE 失敗時啟動 5 秒輪詢
3. 通知規格：
   - `DONE`：右上 toast + AI 動作區 badge
   - `FAILED`：error toast + 錯誤訊息
   - `CANCELED`：info toast
4. 常駐資訊：
   - 右側 AI 圖層區顯示最新終態與統計，避免只靠瞬間 toast

### 6.4 按鈕可用性矩陣

| 狀態 | 開始辨識 | 取消辨識 | 清除AI結果 |
|---|---|---|---|
| IDLE | 可用 | 不可用 | 可用（若有結果） |
| PROCESSING | 不可用 | 可用 | 不可用 |
| DONE | 可用 | 不可用 | 可用 |
| FAILED | 可用 | 不可用 | 可用 |
| CANCELED | 可用 | 不可用 | 可用 |

### 6.5 上傳按鈕可用性矩陣（新增）

| 上傳狀態 | 建立上傳任務 | 取消上傳 | 清除當前影片 | 清除當前所有資料 |
|---|---|---|---|---|
| IDLE | 可用 | 不可用 | 視是否有影片 | 可用 |
| UPLOADING | 不可用 | 可用 | 不可用 | 可用（先確認是否中止上傳） |
| PARSING_METADATA | 不可用 | 可用 | 不可用 | 可用（先確認是否中止上傳） |
| READY | 可用 | 不可用 | 可用 | 可用 |
| FAILED | 可用 | 不可用 | 視是否有影片 | 可用 |
| CANCELED | 可用 | 不可用 | 視是否有影片 | 可用 |

### 6.6 圖層開關互動規格

1. 關閉「類別圖層」：隱藏類別清單與對應 overlay 篩選 UI，但不刪資料
2. 關閉「標註圖層」：不渲染 manual overlay
3. 關閉「AI圖層」：不渲染 AI overlay
4. 類別列 `isVisible=false`：只影響顯示，不影響資料存在

### 6.7 `/file` 維運流程（新增）

1. admin 開啟 `/file`。
2. 頁面先拉 `GET /api/admin/file/list` 顯示資產清單。
3. 選擇異常列後可執行「一致性檢查」。
4. 系統先回 `dry-run` 修復預覽（不改資料）。
5. admin 確認後才執行 `apply`。
6. 完成後刷新清單，並記錄到 cleanup/reconcile history。

### 6.8 刷新後狀態重建流程（新增）

1. App 啟動先讀 `localStorage` 的 `currentVideoId` 與 UI state。
2. 若有 `currentVideoId`：
   - 先用本地快照恢復 upload/viewer/layers 畫面
   - 立即呼叫 `GET /api/videos/:id/bootstrap` 做資料校正
3. 若校正回 `404`（影片已不存在）：
   - 清空本地狀態
   - 顯示 `資料已不存在，已重置畫面`
4. 使用者點擊「清除當前所有資料」時：
   - 清空前端保存的狀態與快照
   - 畫面回到預設空白（不刪後端資料）

### 6.9 `/file` 風險監控流程（新增）

1. `/file` 首屏並行呼叫：
   - `GET /api/admin/file/list`
   - `GET /api/admin/file/risk-summary`
2. 使用者點擊風險卡後開啟風險列表抽屜（`GET /api/admin/file/risk-events`）。
3. 點選風險列可跳轉到對應影片列並執行一致性檢查。
4. 修復成功後，重新拉取 `risk-summary` 與 `risk-events`。
5. `risk_events` 產生觸發點（固定）：
   - 一致性掃描命中異常：`trigger_source=CONSISTENCY_SCAN`
   - SSE 健康度異常（連續失敗或長時間無事件）：`trigger_source=SSE_HEALTH`
   - 清理監控命中高水位：`trigger_source=CLEANUP_MONITOR`
   - 管理員手動建立/註記：`trigger_source=MANUAL`

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
11. `useAiStatusStream`（SSE 連線、重連、fallback 輪詢）
12. `useLayerVisibilityState`
13. `useCategories`
14. `useUploadTask`（上傳進度、取消上傳、狀態通知）
15. `FileAdminPage`（`/file`）
16. `useViewerSessionState`（刷新重建、快照回填、清除前端狀態）
17. `useFileConsistency`（一致性掃描與修復）
18. `useFileCleanup`（定時清理預覽與執行）
19. `RiskSummaryCards`（`/file` 風險摘要）
20. `useRiskEvents`（`/file` 風險事件列表）

---

## 8. 分期里程碑（依賴導向）

### Phase 1：資料基線與上傳鏈路

1. `videos/categories/annotations/ai_jobs` schema 落地。
2. Upload + metadata + stream + timeline 基本路徑。
3. Upload Panel 完整按鈕（含取消上傳）。
4. `GET /api/videos/:id/bootstrap` 首屏重建資料。

退出條件：

1. 可完成「上傳 -> 播放 -> 刪除」閉環。
2. 取消上傳不殘留半檔與半 DB row。

### Phase 2：Viewer 播放與時間對齊

1. 影像工具列 + 播放工具列（含逐幀）。
2. 三個保護（`mediaTime`, binary search, monotonic）。
3. overlay 依 `pts_us` 穩定對齊。

退出條件：

1. VFR 影片無系統性漂移。
2. seek 與逐幀後 overlay 穩定正確。

### Phase 3：AI 任務與即時狀態

1. `ai-detect` / `ai-cancel` / `ai-status` / `ai-result`。
2. SSE 主路徑 + fallback 輪詢 + 重連。
3. 同影片單筆覆蓋策略與 `PROCESSING` 防重入。
4. 完成/失敗/取消通知與 AI 圖層同步。

退出條件：

1. `PROCESSING` 期間不可重複啟動。
2. SSE 不穩時可平滑切到 fallback。

### Phase 4：圖層操作與刷新保持

1. 類別/標註/AI 三區塊收合展開與顯示控制。
2. 類別 CRUD + Annotation CRUD。
3. 刷新後狀態重建（快照回填 + revalidate）。
4. 「清除當前所有資料（前端）」按鈕。

退出條件：

1. 刷新不會誤導成資料遺失。
2. 使用者可手動一鍵回到預設空白 UI。

### Phase 5：維運治理與穩定化

1. `/file` admin 頁（清單、篩選、列內操作、細節抽屜）。
2. 一致性檢查與修復（`dry-run -> apply`）。
3. 風險監控摘要與事件列表（管理員前端可視化）。
4. 定時清理排程（可配置 + 可預覽 + 安全保留）。
5. 錯誤路徑、效能優化、交付文件與回歸測試。

---

## 9. 驗收標準（DoD）

### 9.1 UI 與互動

1. AI 按鈕不在影像工具列，固定在影片區右上
2. 影像工具列、播放工具列所有按鈕行為符合規格
3. 三個圖層區塊可收合/展開且狀態可保存
4. 類別圖層支援新增/刪除/可見切換
5. `source=AI` 類別不可刪除，且有明確錯誤提示
6. 上傳中可按「取消上傳」，且 UI 正確進入 `CANCELED`
7. 網頁刷新後可維持目前影片與圖層渲染（先快照、後校正）
8. 「清除當前所有資料」可將畫面回到預設，但不影響後端資料

### 9.2 對齊與播放

1. 使用 `requestVideoFrameCallback + mediaTime`（不支援才 fallback）
2. 幀查找為 binary search `last pts_us <= queryPts`
3. 有 monotonic guard 與 `seeked` 重置
4. VFR 影片不出現系統性 bbox 漂移

### 9.3 AI 任務

1. 同影片 `ai_jobs` 只有一筆
2. `PROCESSING` 可取消並正確進入 `CANCELED`
3. `DONE/FAILED/CANCELED` 狀態顯示正確
4. 優先使用 SSE 推播，SSE 異常時可 fallback 輪詢且可自動回切
5. `PROCESSING` 時「開始辨識」按鈕禁用，且 `POST /api/videos/:id/ai-detect` 回 `409`
6. ai-worker 不可達時可收斂為 `FAILED`，且可再次啟動辨識

### 9.4 API 與錯誤

1. API 錯誤格式一致
2. 串流 `206/416` 行為正確
3. 類別刪除衝突 `409` 行為正確
4. 上傳中止時不會留下半成品檔案或不完整 DB 記錄
5. `GET /api/videos/:id/bootstrap` 可支援刷新後重建首屏
6. `/api/admin/file/*` 需強制 HTTP Basic Auth（`ADMIN_USER/ADMIN_PASSWORD`）
7. upload 僅接受白名單格式，非法格式回 `415`
8. bootstrap `windowBefore/windowAfter` 超過上限時需被 clamp 或回 `400`

### 9.5 `/file` 管理能力

1. 只有 admin 可存取 `/file` 與 `/api/admin/file/*`。
2. 表格可顯示最低欄位（`video_id`、`filename`、上傳時間、類別/標註、AI 狀態、AI 類別/標註、一致性狀態、操作欄）。
3. `metadata` 以操作欄圖標呈現，hover 浮層需包含 `storage_path` 與人類可讀 `file_size`。
4. 一致性狀態可正確辨識 `HEALTHY/MISSING_FILE/ORPHAN_DB/ORPHAN_FS` 等情境。
5. 一致性狀態 `info` 圖標可顯示 `last_checked_at`、`consistency_reason`、`locked_by_processing`。
6. 修復與清理操作必須支援 `dry-run -> apply` 兩段式流程。
7. `PROCESSING` 影片操作鎖可正確阻擋高風險操作。
8. `/file` 可顯示風險摘要卡（P0/P1/P2、新增/恢復趨勢）。
9. `/file` 可開啟風險事件列表並跳轉到對應影片。
10. 風險事件需能顯示 `trigger_source` 與來源時間。
11. 進入 `/file` 未登入時需立即彈出瀏覽器 Basic Auth 登入視窗。

---

## 10. 測試清單（可執行）

### 10.1 測試框架與分層（固定）

1. 前端單元/Hook 測試：`Vitest`
2. API 整合測試：`Vitest + Supertest`
3. 端對端流程測試：`Playwright`
4. `ai-worker` 單元測試：`pytest`
5. CI 最低門檻：每次 PR 至少執行單元測試 + API 整合測試

1. 上傳 mp4 成功，metadata 正確
2. 上傳非支援格式回 `415`
3. timeline 缺 `pts_us` 回 `422`
4. 播放中 overlay 不抖動（monotonic）
5. seek 後 overlay 可正確跳轉
6. AI 任務可開始/取消（`PROCESSING` 時不可再次開始）
7. `POST /api/videos/:id/ai-detect` 在 `PROCESSING` 回 `409`
8. 清除 AI 結果在 `PROCESSING` 回 `409`
9. 類別新增重名回 `409`
10. 已引用類別刪除回 `409`
11. AI 類別刪除回 `409`
12. SSE 連線後可立即收到當前狀態（首包）
13. SSE 斷線後 fallback 輪詢生效，SSE 恢復後停止輪詢
14. 上傳中點擊取消，上傳狀態進入 `CANCELED`
15. 上傳取消後立即可重新上傳
16. 上傳取消後 storage 與 DB 無殘留半成品資料
17. 未登入直接訪問 `/file` 回 `401`，且帶 `WWW-Authenticate: Basic realm=\"File Admin\"`
18. 未登入呼叫 `/api/admin/file/list` 回 `401`，且帶 `WWW-Authenticate`
19. `/file` 表格第 2 欄為 `filename`
20. `/file` 操作欄第一個是 `metadata` 圖標，hover 可顯示 `storage_path` 與人類可讀 `file_size`
21. 一致性狀態 `info` 圖標顯示 `last_checked_at`、`consistency_reason`、`locked_by_processing`
22. `reconcile` 的 `dry-run` 不改動資料
23. `reconcile` 的 `apply` 可修復至少一種異常（例如 `ORPHAN_FS`）
24. `cleanup` 的 `dry-run` 回傳預估釋放空間與刪除清單
25. `cleanup` 的 `apply` 不會刪除 `PROCESSING` 影片
26. 刷新頁面後，Viewer 仍顯示刷新前的影片與圖層內容
27. `GET /api/videos/:id/bootstrap` 能在單次請求回首屏重建必要資料
28. 點擊「清除當前所有資料」後回到預設 UI，且 DB/檔案不受影響
29. `/file` 首屏可同時顯示檔案清單與風險摘要卡
30. `/file` 風險事件列表可跳轉並定位到對應影片列
31. 同檔名連續上傳 3 次會產生 3 個不同 `video_id`
32. 同檔名新上傳影片的類別與標註初始值為 0，不沿用舊影片資料
33. 呼叫 `/api/admin/file/list` 未帶 Basic Auth 回 `401`
34. 呼叫 `/api/admin/file/list` 帶錯誤帳密回 `401`
35. 上傳白名單外格式（例如 `.wmv`）回 `415`
36. `GET /api/videos/:id/bootstrap` 未帶參數時採 `windowBefore=60/windowAfter=60`
37. `GET /api/videos/:id/bootstrap` 傳入超上限 window 時被 clamp 或回 `400`
38. 一致性掃描命中異常後，`risk_events` 新增對應 `trigger_source=CONSISTENCY_SCAN`
39. ai-worker 不可達時，`ai_jobs` 由 `PROCESSING` 收斂為 `FAILED`
40. `timeline.json` 產生結果包含 `frames[*].ptsUs` 且單調不遞減
41. `latest.coco.json` annotation 含擴充欄位 `track_id/frame_index/pts_us`
42. 呼叫 `GET /file/logout` 後需再次跳出 Basic Auth 登入視窗

---

## 11. AI Worker 執行架構（新增）

### 11.1 執行模型

1. `ai-worker` 為獨立 FastAPI 服務（本機進程），不與 web 進程共用記憶體。
2. web 與 `ai-worker` 以本機 HTTP 通訊（預設 `127.0.0.1`）。
3. 同一 `video_id` 僅允許一個 `PROCESSING` 任務（由 `ai_jobs` 單筆策略約束）。

### 11.2 web 與 ai-worker 通訊

1. web 啟動辨識：
   - 寫入 `ai_jobs=PROCESSING`
   - 呼叫 ai-worker 偵測 API（帶 `video_id`、來源檔路徑、輸出路徑）
2. web 取得任務進度：
   - 由 web 端背景輪詢 ai-worker job 狀態
   - 更新 `ai_jobs` 與 `videos.ai_*` 統計
   - 再由 web 對 Browser 以 SSE 推播
3. Browser 不直接連 ai-worker，只連 web API。

### 11.3 Cancel 訊號傳遞

1. 使用者點「取消辨識」→ web 呼叫 ai-worker cancel API。
2. ai-worker 收到 cancel 後停止推論流程，回報 `CANCELED`。
3. web 收斂狀態到 `ai_jobs.status=CANCELED`，並推播終態事件。

### 11.4 Worker crash / 重啟恢復

1. 若 web 與 ai-worker 連線失敗且超過容忍門檻，將對應 `ai_jobs` 標記 `FAILED`，`error_message=WORKER_UNREACHABLE`。
2. web 啟動時執行恢復掃描：對「殘留 PROCESSING」任務做健康檢查並收斂為 `FAILED` 或 `DONE`。
3. 任務失敗後允許再次點擊辨識（符合單筆覆蓋策略）。

---

## 12. 風險與對策

本節只保留「管理員需要主動監控」的殘餘風險，避免和前文規格重複。

| 風險代碼 | 等級 | 觸發條件（摘要） | 主要對策 | 監控入口 |
|---|---|---|---|---|
| `FS_DB_INCONSISTENCY` | P0 | DB 有影片但檔案缺失，或檔案有孤兒目錄 | `/file` 一致性掃描 + `reconcile dry-run -> apply` | `/file` 摘要卡 + 事件列表 |
| `SSE_UNSTABLE_OR_BUFFERED` | P1 | SSE 連續失敗或長時間無事件 | heartbeat + `Last-Event-ID` + `X-Accel-Buffering: no` + fallback 輪詢 | AI 狀態區 + `/file` 風險列表 |
| `REFRESH_DATA_MISUNDERSTOOD` | P1 | 使用者刷新後誤以為資料遺失 | 刷新狀態重建 + 失效提示 + 清除當前所有資料按鈕 | Viewer 啟動畫面提示 |
| `STORAGE_GROWTH` | P2 | 同名影片多版本累積造成空間壓力 | 定時清理（可配置 + 可預覽 + 安全保留） | `/file` 清理預覽與歷史 |
