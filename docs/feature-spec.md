# 功能規格：本地影片辨識服務

> 版本：v1.0（2026-04-20）  
> 用途：作為重構移植的功能對照參考文件。

---

## 目錄

1. [影片上傳](#1-影片上傳)
   - [1.1 功能概述](#11-功能概述)
   - [1.2 接受的格式](#12-接受的格式)
   - [1.3 上傳狀態機](#13-上傳狀態機)
   - [1.4 上傳取消機制](#14-上傳取消機制)
   - [1.5 上傳進度追蹤](#15-上傳進度追蹤)
   - [1.6 後端處理流程](#16-後端處理流程)
   - [1.7 Metadata 解析欄位](#17-metadata-解析欄位)
   - [1.8 唯一性策略](#18-唯一性策略)
   - [1.9 通知](#19-通知)
   - [1.10 頁面刷新後狀態保持](#110-頁面刷新後狀態保持)
   - [1.11 相關 API](#111-相關-api)
2. [影片瀏覽](#2-影片瀏覽)
   - [2.1 功能概述](#21-功能概述)
   - [2.2 左欄影片清單](#22-左欄影片清單)
   - [2.3 影片串流播放](#23-影片串流播放)
   - [2.4 幀精準對齊機制](#24-幀精準對齊機制)
   - [2.5 播放控制](#25-播放控制)
   - [2.6 影像工具列](#26-影像工具列)
   - [2.7 標註工具列](#27-標註工具列)
   - [2.8 座標系統](#28-座標系統)
   - [2.9 鍵盤快捷鍵](#29-鍵盤快捷鍵)
   - [2.10 快速重建（Bootstrap）](#210-快速重建bootstrap)
   - [2.11 底部狀態列（StatusBar）](#211-底部狀態列statusbar)
   - [2.12 幀標記帶（FrameAnnotationBar）](#212-幀標記帶frameannotationbar)
   - [2.13 相關 API](#213-相關-api)
3. [圖層顯示](#3-圖層顯示)
   - [3.1 功能概述](#31-功能概述)
   - [3.2 類別圖層（Category Layers）](#32-類別圖層category-layers)
   - [3.3 標註圖層（Annotation Layers）](#33-標註圖層annotation-layers)
   - [3.4 AI 圖層（AI Layers）](#34-ai-圖層ai-layers)
4. [AI 辨識](#4-ai-辨識)
   - [4.1 功能概述](#41-功能概述)
   - [4.2 架構](#42-架構)
   - [4.3 AI 狀態定義](#43-ai-狀態定義)
   - [4.4 開始辨識流程](#44-開始辨識流程)
   - [4.5 取消辨識流程](#45-取消辨識流程)
   - [4.6 按鈕可用性矩陣](#46-按鈕可用性矩陣)
   - [4.7 狀態推播（SSE）](#47-狀態推播sse)
   - [4.8 終態通知](#48-終態通知)
   - [4.9 AI 統計欄位（`videos` 表）](#49-ai-統計欄位videos-表)
   - [4.10 相關 API](#410-相關-api)
5. [標註匯出](#5-標註匯出)
   - [5.1 功能概述](#51-功能概述)
   - [5.2 使用方式](#52-使用方式)
   - [5.3 COCO 格式規格](#53-coco-格式規格)
   - [5.4 YOLO 格式規格](#54-yolo-格式規格)
   - [5.5 相關 API](#55-相關-api)
6. [認證與授權](#6-認證與授權)
   - [6.1 功能概述](#61-功能概述)
   - [6.2 管理員帳號](#62-管理員帳號)
   - [6.3 登入流程](#63-登入流程)
   - [6.4 Session 管理](#64-session-管理)
   - [6.5 Middleware 保護](#65-middleware-保護)
   - [6.6 前端 AuthGate](#66-前端-authgate)
   - [6.7 相關 API](#67-相關-api)
7. [檔案管理後台](#7-檔案管理後台)
   - [7.1 功能概述](#71-功能概述)
   - [7.2 影片管理清單](#72-影片管理清單)
   - [7.3 一致性檢查](#73-一致性檢查)
   - [7.4 修復操作（Reconcile）](#74-修復操作reconcile)
   - [7.5 檔案清理（Cleanup）](#75-檔案清理cleanup)
   - [7.6 風險事件系統](#76-風險事件系統)
   - [7.7 稽核歷史](#77-稽核歷史)
   - [7.8 相關 API](#78-相關-api)
8. [AI Worker](#8-ai-worker)
   - [8.1 功能概述](#81-功能概述)
   - [8.2 API 端點](#82-api-端點)
   - [8.3 任務參數](#83-任務參數)
   - [8.4 任務狀態機](#84-任務狀態機)
   - [8.5 物件追蹤演算法](#85-物件追蹤演算法)
   - [8.6 COCO 輸出格式](#86-coco-輸出格式)
   - [8.7 部署與依賴](#87-部署與依賴)

---

## 1. 影片上傳

### 1.1 功能概述

使用者可將本地影片上傳至伺服器，每次上傳建立唯一的 `video_id`，同檔名不覆蓋既有記錄。上傳完成後系統自動解析 metadata、建立 timeline，並產生縮圖。

### 1.2 接受的格式

| 副檔名 | MIME Type |
|--------|-----------|
| `.mp4` | `video/mp4` |
| `.mov` | `video/quicktime` |
| `.avi` | `video/x-msvideo` |
| `.mkv` | `video/x-matroska` |

不符合白名單時，伺服器回 `415 Unsupported Media Type`。

### 1.3 上傳狀態機

```
IDLE → PICKED → UPLOADING → PARSING_METADATA → READY
                                              → FAILED
                                              → CANCELED
```

| 狀態 | 說明 |
|------|------|
| `IDLE` | 尚未選取檔案 |
| `PICKED` | 已選取，等待觸發 |
| `UPLOADING` | 傳輸中，顯示進度 |
| `PARSING_METADATA` | 傳輸完成，後端解析 metadata 中 |
| `READY` | 完成，可播放 |
| `FAILED` | 失敗，顯示錯誤摘要 |
| `CANCELED` | 使用者取消 |

### 1.4 上傳取消機制

- 前端使用 `XMLHttpRequest` + `AbortController` 中止傳輸。
- 點擊「取消上傳」後，UI 立即切換至 `CANCELED` 狀態。
- 後端偵測到連線中斷後，刪除暫存檔（`*.part`），確保不留下不完整的 `videos` 記錄。
- 取消後可立即再次上傳，不須重整頁面。

### 1.5 上傳進度追蹤

- `xhr.upload.onprogress` 提供 `loaded / total` 比例。
- 傳輸完成（`loaded >= total`）後切換至 `PARSING_METADATA` 狀態，等待後端回應。

### 1.6 後端處理流程

```
1. 驗證格式（副檔名 + MIME）
2. 產生 video_id（UUID v7）
3. 建立 storage/videos/{videoId}/ 目錄
4. 寫入暫存檔 source.mp4.part
5. 偵測 AbortSignal，中止則清理
6. rename .part → source.mp4
7. 呼叫 ffprobe 解析 metadata（解析度、fps、時長、編碼）
8. 建立 timeline.json（所有幀的 frameId、displayIndex、ptsUs、isKeyframe）
9. 寫入 metadata.json
10. 在 DB 建立 videos 記錄（ai_status = IDLE）
11. 背景非同步產生縮圖（不阻塞回應）
12. 回傳 201 + videoId + metadata 摘要
```

若任一步驟失敗，清除已建立的 storage 目錄並回傳對應錯誤碼。

### 1.7 Metadata 解析欄位

| 欄位 | 說明 |
|------|------|
| `video_width` | 影片寬度（px） |
| `video_height` | 影片高度（px） |
| `source_fps` | 原始幀率 |
| `duration_sec` | 時長（秒） |
| `file_size_bytes` | 檔案大小（bytes） |
| `video_codec` | 影片編碼（如 `h264`） |
| `pixel_format` | 像素格式（如 `yuv420p`） |

### 1.8 唯一性策略

- 每次上傳一律新建 `video_id`，即使檔名相同也不覆蓋既有記錄。
- 新 `video_id` 的 `categories`、`annotations`、`ai` 一律為空。
- 舊影片保留在 storage，交由管理員頁面的清理機制管理。

### 1.9 通知

| 事件 | 通知類型 | 內容 |
|------|---------|------|
| 上傳成功 | Toast（成功） | `Upload completed` |
| 上傳失敗 | Toast（錯誤） | `Upload failed` + 錯誤摘要 |
| 上傳取消 | Toast（資訊） | `Upload canceled` |

### 1.10 頁面刷新後狀態保持

- 前端將 `currentVideoId` 等關鍵狀態存入 `localStorage`。
- 刷新後先用本地快照重建畫面，再背景呼叫 API 校正最新資料。
- 若 `videoId` 已被刪除，顯示提示並清除本地狀態。

### 1.11 相關 API

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/videos/upload` | 上傳影片（`multipart/form-data`） |
| `GET` | `/api/videos` | 列出所有影片（分頁） |
| `DELETE` | `/api/videos/:id` | 刪除影片及所有關聯資料 |

---

## 2. 影片瀏覽

### 2.1 功能概述

左欄影片清單可切換當前播放影片；中央播放器提供幀精準播放控制、縮放、標註工具等操作。

### 2.2 左欄影片清單

- 顯示縮圖、檔名（截短）、AI 狀態、Timeline 狀態。
- 支援關鍵字搜尋（依檔名）。
- 支援狀態篩選：全部 / IDLE / PROCESSING / DONE / FAILED / CANCELED。
- 右鍵選單：
  - 標題列：完整檔名（第一行）、`video_id`（第二行，monospace）
  - 清除 AI 結果（僅 `ai_status = DONE` 時出現）
  - 刪除影片（永遠顯示，紅色）

### 2.3 影片串流播放

- 透過 `GET /api/videos/:id/stream` 串流播放，支援 `Range` 請求（`206 Partial Content`）。
- `<video>` 元素使用 `src` 直接掛載串流 URL。

### 2.4 幀精準對齊機制

VFR（可變幀率）影片不可用 `fps × n` 估算幀時間，必須以 `pts_us` 為對齊基準：

1. 載入影片後先取 `GET /api/videos/:id/timeline`（所有幀的 `ptsUs`）。
2. 每個顯示幀回呼（`requestVideoFrameCallback`）取得 `mediaTime`。
3. 轉換：`queryPts = round(mediaTime × 1_000_000)`。
4. Binary search：找最後一個 `pts_us ≤ queryPts` 的幀（即當前幀）。
5. Monotonic guard：防止幀號倒退（seek 後重置）。
6. 取得 `frameId` 後，更新標註 overlay 與 AI overlay。

### 2.5 播放控制

| 控制項 | 行為 |
|--------|------|
| 播放 / 暫停 | 切換 `<video>` 播放狀態 |
| 逐幀上一幀 | 依 `timeline` 跳至前一個 `displayIndex` |
| 逐幀下一幀 | 依 `timeline` 跳至下一個 `displayIndex` |
| 跳 10 幀 | `Shift+←/→` 各退 / 進 10 個 `displayIndex` |
| 跳至首幀 / 末幀 | `Home` / `End` 鍵 |
| 倍速選擇 | `0.25x / 0.5x / 1x / 1.5x / 2x` |
| 時間軸拖曳 | Seek 到目標時間，觸發 `seeked` 事件後重新計算 `frameId` |
| 時間顯示 | `currentTime / duration`、`displayIndex`、`pts_us` |
| 直跳幀號輸入 | 點擊 `displayIndex` 數字後可直接輸入幀號跳轉，Enter 確認，Esc 取消 |

拖曳時間軸期間暫停 overlay 更新，避免拖曳中抖動；`seeked` 後恢復。

**Scrubber hover 縮圖預覽：**  
滑鼠移過時間軸時，在游標上方顯示該時間點的影片幀縮圖。實作方式為背景維護一個隱藏 `<video>` 元素 + `<canvas>`，移動游標時 seek 隱藏影片並截圖（`capturePreviewFrame()`）；因 seek 非同步，採 pending queue 避免重疊 seek。

### 2.6 影像工具列

| 功能 | 預設值 | 說明 |
|------|--------|------|
| Zoom In / Out | 100% | 以 10% 步進，範圍 25%～400% |
| Fit to Window | 開啟 | 自適應容器大小，覆寫手動縮放 |
| Reset View | — | 重置縮放、平移、顯示參數 |
| Grid Toggle | 關 | 顯示/隱藏網格線 |
| Contrast / Brightness | 0 | 僅前端視覺調整，不回寫影片 |

工具列狀態存 `localStorage`（`viewer:image-tools:v1`），切換影片時重置。

### 2.7 標註工具列

與影像工具列同列，以分隔線區隔。

| 工具 | 游標 | 說明 |
|------|------|------|
| Select | default | 選取 / 移動已存在的標註 |
| Rectangle | crosshair | 點擊拖曳繪製矩形 BBox |
| Polygon | crosshair | 逐點點擊後閉合多邊形 |
| Text | text | 點擊放置文字標籤 |

**操作規則：**

- 點擊任一標註工具即進入標註模式，影片**自動暫停**。
- 點擊 Select 或按 `Esc` 退出標註模式。
- **前置條件**：必須先在類別圖層選取一個類別才可繪製；未選取時提示「請先選擇類別」。
- 切換影片時強制退出標註模式，丟棄未完成草稿。

**Rectangle：**
- 按住左鍵拖曳，放開確認；顯示虛線預覽框。
- 最小尺寸 10×10 px（影片座標），低於此值放棄並提示。

**Polygon：**
- 左鍵逐點新增頂點；右鍵撤銷最後一個點。
- 點擊第一個頂點或按 `Enter` 閉合多邊形（最少 3 點，最多 64 點）。
- `Esc` 放棄當前草稿。
- 切換工具或 seek 時，若有未完成草稿，彈出放棄確認提示。

**Text：**
- 左鍵點擊放置位置，彈出 inline 輸入框（非模態框）。
- `Enter` 確認，`Esc` 放棄；文字長度 1～64 字元。

### 2.8 座標系統

所有幾何座標使用**影片原始解析度座標**（非 CSS 像素），顯示時依當前縮放比例換算。

### 2.9 鍵盤快捷鍵

#### 播放控制

| 快捷鍵 | 功能 |
|--------|------|
| `Space` | 播放 / 暫停 |
| `←` | 上一幀 |
| `→` | 下一幀 |
| `Shift+←` | 後退 10 幀 |
| `Shift+→` | 前進 10 幀 |
| `Home` | 跳至第一幀 |
| `End` | 跳至最後一幀 |

#### 標註工具

| 快捷鍵 | 功能 |
|--------|------|
| `R` | 切換至矩形框工具 |
| `P` | 切換至多邊形工具 |
| `T` | 切換至文字標籤工具 |
| `V` | 切換至選取工具 |
| `Esc` | 取消目前繪製 / 退出標註模式 |
| `Delete` | 刪除已選取標註（多選時批次刪除） |

#### 編輯（Undo / Redo）

| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl / ⌘` + `Z` | 復原（Undo） |
| `Ctrl / ⌘` + `Shift` + `Z` | 重做（Redo） |
| `Ctrl / ⌘` + `Y` | 重做（Redo）替代鍵 |

#### 影像調整

| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl / ⌘` + `+` | 放大 |
| `Ctrl / ⌘` + `-` | 縮小 |
| `Ctrl / ⌘` + `0` | 重置縮放 |

#### 其他

| 快捷鍵 | 功能 |
|--------|------|
| `?` | 顯示 / 隱藏快捷鍵說明 |

快捷鍵在 `<input>` / `<textarea>` / `contentEditable` 元素取得焦點時停用，避免干擾輸入。

### 2.10 快速重建（Bootstrap）

刷新頁面後，前端呼叫 `GET /api/videos/:id/bootstrap` 一次取得：
- `meta`（影片資訊）
- `timelineSummary`（總幀數、起訖 `pts_us`）
- `categories`
- `annotationsCurrentWindow`（當前幀前後各 60 幀範圍）
- `aiStatus` + `aiSummary`

### 2.11 底部狀態列（StatusBar）

播放器底部固定顯示一行影片技術資訊，從 `bootstrapData.meta` 取得：

| 欄位 | 範例 |
|------|------|
| 解析度 | `1280×720` |
| 幀率 | `29.970 fps` |
| 時長 | `02:14`（mm:ss，超過 1 小時加 h） |
| 總幀數 | `4012 幀` |
| 編碼 | `H264` |
| 當前幀 | `f:123`（右側顯示 `displayIndex`） |

### 2.12 幀標記帶（FrameAnnotationBar）

時間軸（scrubber）上方有一條 **8px 高的彩色刻度帶**，標示所有有人工標註的幀位置：

- 每個有標註的幀在對應時間比例位置顯示**彩色短豎線**，顏色為該幀所包含的類別色（可多色疊加）。
- **無標註時**刻度帶不顯示（高度佔位 8px 但內容為空）。
- 滑鼠滑過刻度時顯示 tooltip（幀的 `displayIndex`）。
- 點擊刻度線可 **seek 至該幀**。
- 標記資料從 `GET /api/videos/:id/annotations`（不帶 `frameId`，掃全影片）取得，以 `frameId → [categoryColor...]` Map 形式快取在前端；切換影片後刷新。

### 2.13 相關 API

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/videos/:id/bootstrap` | 快速重建首屏資料 |
| `GET` | `/api/videos/:id/meta` | metadata + AI 統計 + timeline 狀態 |
| `GET` | `/api/videos/:id/stream` | 影片串流（支援 Range） |
| `GET` | `/api/videos/:id/timeline` | 幀列表（cursor 分頁） |
| `GET` | `/api/videos/:id/thumb` | 縮圖（JPEG，on-demand 產生） |

---

## 3. 圖層顯示

### 3.1 功能概述

右側 Layers Panel 分為三個可收合區塊：**類別圖層**、**標註圖層**、**AI 圖層**。各區塊有獨立的顯示開關，狀態存 `localStorage`（`viewer:layer-panels:v1`），切換影片不重置。

### 3.2 類別圖層（Category Layers）

#### 3.2.1 顯示欄位

| 欄位 | 說明 |
|------|------|
| 名稱 | 類別名稱（全局唯一，不分大小寫） |
| 顏色 | hex 色碼，標註框配色依此顯示 |
| 可見開關 | 單類別顯示 / 隱藏 |
| 數量 | 當前影片中此類別的標註總數 |
| 來源 | `MANUAL`（人工新增）或 `AI`（AI 辨識產生） |
| 邊框寬度 | `stroke_width`（預設 2.0 px，可手動調整） |
| 邊框顏色覆寫 | `stroke_color`（`null` = 使用類別主色；設定後該類別所有標註邊框改用此色） |

#### 3.2.2 Master Toggle

- 關閉：所有類別暫時隱藏（不修改各列的 `isVisible`）。
- 開啟：回復各列原本的 `isVisible` 狀態。

#### 3.2.3 新增類別規則

- 名稱長度 1～32 字元。
- 不可重複（case-insensitive）。
- 顏色預設由 palette 自動分配，可手動修改。
- 來源固定為 `MANUAL`（使用者建立）。

#### 3.2.4 刪除類別規則

- `source = AI` 的類別**不可刪除**（可隱藏）。
- 仍被標註引用時，API 回 `409`（`LAYER_CATEGORY_IN_USE`）。
- 可刪除時為硬刪，`ON DELETE CASCADE` 自動清除關聯標註。

#### 3.2.5 相關 API

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/videos/:id/categories` | 取得類別清單（含 `source`、`visible`、`count`、`strokeWidth`、`strokeColor`） |
| `POST` | `/api/videos/:id/categories` | 新增類別（`name`、`color`） |
| `PATCH` | `/api/videos/:id/categories/:categoryId` | 修改 `name` / `color` / `isVisible` / `strokeWidth` / `strokeColor` |
| `DELETE` | `/api/videos/:id/categories/:categoryId` | 刪除類別 |

---

### 3.3 標註圖層（Annotation Layers）

#### 3.3.1 功能

- 區塊開關：顯示 / 隱藏所有人工標註 overlay。
- 清單依當前幀的 `frame_id` 自動篩選，切幀即自動替換（無動畫）。
- 支援：類別快速變更、單筆可見切換、單筆刪除。

#### 3.3.2 清單列欄位

| 位置 | 內容 |
|------|------|
| 1 | 類型圖標：`[T]` 文字 / `[▭]` 矩形 / `[⬡]` 多邊形 |
| 2 | 類別名稱（下拉選單，僅列 `source=MANUAL` 的類別） |
| 3 | Info 圖標（hover 展開浮層） |
| 4 | Eye 圖標（單筆可見切換） |
| 5 | 刪除圖標 |

#### 3.3.3 Info 浮層內容

- 幀資訊：`displayIndex`（第幾幀）、`frame_id`
- 幾何資訊：
  - Rectangle：`x, y, width, height`
  - Polygon：頂點數、頂點座標列表
  - Text：`x, y`、文字內容
- `created_at`

#### 3.3.4 顯示規則

- 區塊關閉：不渲染任何人工標註 overlay。
- 區塊開啟：只渲染符合以下條件的標註：
  1. `frame_id` 等於當前幀
  2. 單筆 Eye 開啟（`isVisible = true`）
  3. 對應類別的 `isVisible = true`
- 點擊清單列可在影片區高亮對應標註。

#### 3.3.5 標註視覺樣式

- 矩形（BBox）與多邊形（Polygon）的**封閉區域內填充對應類別顏色，透明度約 13%**（`fill="${color}22"`，hex alpha `22`）。
- 邊框使用相同類別顏色，完全不透明。
- 此設計讓使用者在影片畫面上快速辨識標註的覆蓋區域，同時不遮蔽底層影像。
- Text 標籤渲染為：放置點位置的**實心彩色圓點**（半徑 5px）+ 右方顯示文字內容（`font-size: 13px`，帶黑色文字陰影）。
- Bbox 與 Polygon 邊框附帶 `drop-shadow(0 0 1px rgba(0,0,0,0.6))` 讓標註在淺色影像上也清晰可見。

#### 3.3.6 標註資料格式（`geometry_json`）

```json
// 矩形
{ "type": "bbox", "x": 120, "y": 80, "width": 200, "height": 150 }

// 多邊形
{ "type": "polygon", "points": [[x1,y1],[x2,y2],[x3,y3]] }

// 文字
{ "type": "text", "x": 300, "y": 200 }
```

所有座標為影片原始解析度座標系。

#### 3.3.7 標註選取與編輯

在 **Select 工具**模式下，支援以下互動：

| 操作 | 行為 |
|------|------|
| 點擊標註 | 選取（高亮邊框 + 顯示控制點），再次點擊取消選取 |
| 拖曳選取的標註本體 | 移動整個標註位置 |
| 拖曳 Bbox 的 8 個角/邊控制點 | 調整矩形尺寸（`tl/t/tr/r/br/b/bl/l`），最小尺寸限制 10×10 |
| 拖曳 Polygon 的頂點控制點 | 移動單一頂點 |
| 空白區域拖曳（Rubber Band） | 框選多個標註（多選模式） |

**選取後視覺：**
- Bbox：白色虛線外環 + 類別色實線邊框（`strokeWidth=2.5`）+ 8 個白色方形控制點（類別色邊框）
- Polygon：白色虛線外環 + 類別色實線邊框 + 每頂點白色圓形控制點
- Text：白色半透明圓環

**多選視覺（Rubber Band）：**
- 拖曳選取的標註顯示藍色半透明高亮框（`rgba(79,140,255,0.15)` fill + `#4f8cff` 邊框）

**多選時工具列顯示快捷工具欄：**
- 已選 N 筆標註時，播放區上方展開浮動工具列：
  - **刪除全部**：一次刪除全部已選標註
  - **複製到其他幀**：開啟 Propagate Dialog
  - **取消選取**：清除多選狀態

編輯結果（移動/縮放）透過 `PATCH geometry` 即時回寫 DB。

#### 3.3.8 繪製中的草稿預覽

| 工具 | 草稿視覚 |
|------|----------|
| Rectangle | 虛線矩形框（`fill=none`，`strokeDasharray=6 3`） |
| Polygon | 已放頂點以虛線折線連接 + 每頂點小圓點 + 游標到最後一點的導引虛線 |
| Text | 游標位置顯示黃色十字準心（`#f59e0b`） |

#### 3.3.9 Undo / Redo（復原 / 重做）

前端維護 `undoStack` / `redoStack`（`useAnnotationHistory` hook）：

| 操作 | 記錄內容 |
|------|----------|
| 新增標註（CREATE） | 回復 = 刪除 |
| 刪除標註（DELETE） | 回復 = 重建原標註（含 geometry） |
| 移動 / 縮放（UPDATE geometry） | 回復 = 補寫舊幾何座標 |

- 每次 mutation 前 push snapshot 進 undo stack，redo stack 在新操作發生時清空。
- 切換影片時清空兩個 stack。
- Undo / Redo 匹配 toast 提示（復原 / 重做）。

#### 3.3.10 標註複製（Propagate）

多選標註後，點擊「複製到其他幀」開啟 **PropagateDialog**：

1. 指定複製目標幀號範圍（起始幀、結束幀的 `displayIndex`）。
2. 預覽提示：`N 筆標註 × M 幀 = N×M 筆`。
3. 確認後對範圍內每一幀各發一次 `POST /api/videos/:id/annotations`，複製每筆選中標註（保留 category / geometry / textContent）。
4. 完成後顯示【已複製 N 筆標註】toast。

註：Propagate 不對目標幀清除既有標註，對相同幀重複執行會產生重複記錄。

**限制：**
- `fromIndex > toIndex` 或超出 `1 ~ totalFrames` 範圍時顯示錯誤並阻擋。
- 點擊對話框外區域可將對話框關閉。

#### 3.3.11 前端標註快取

`useFrameAnnotations` hook 內建 in-memory 快取機制：

- 快取上限 **1200 筆** 幀的標註資料（LRU 淘汰）。
- 請求節流：同一幀最短間隔 **120ms**，避免快速切幀時大量請求。
- 支援 `refreshKey` 強制繞過快取（用於標註新增/刪除後刷新）。
- 首次載入時從 bootstrap 資料中取值（無需額外 API 呼叫）。

#### 3.3.12 相關 API

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/videos/:id/annotations?frameId=&source=` | 取得標註清單（`frameId` 選填，不帶時掃全影片；`source` 可篩選 `MANUAL` / `AI`；支援 `cursor` + `limit` 分頁，上限 1000） |
| `POST` | `/api/videos/:id/annotations` | 建立人工標註 |
| `PATCH` | `/api/videos/:id/annotations/:annotationId` | 修改 `categoryId`、`isVisible`、`geometry`（幾何可修改，支援拖移/縮放回寫） |
| `DELETE` | `/api/videos/:id/annotations/:annotationId` | 刪除標註 |

---

### 3.4 AI 圖層（AI Layers）

#### 3.4.1 功能

- 區塊開關：顯示 / 隱藏 AI overlay。
- 顯示選項開關（可獨立控制）：
  - `BBox`：是否畫偵測框
  - `Track ID`：是否顯示 track 編號
  - `Trajectory`：是否顯示軌跡線（需模型提供 track 資料）
- 目前幀 bbox 清單：類別名稱、信心分數（`score`）、`track_id`。
- **信心度篩選（Confidence Slider）**：拖曳 slider 設定最低顯示分數門檻，低於此值的偵測不顯示。
- **複製 AI 偵測到手動標註**：選取一筆 AI 偵測後，可點擊「複製為手動標註」將該偵測的 bbox / category 建立為 `source=MANUAL` 的標註記錄，方便人工校正。

#### 3.4.2 顯示規則

- 區塊關閉：AI overlay 全隱藏。
- 區塊開啟 + BBox 關閉：不畫框，但可保留清單顯示。
- 類別顏色來自對應的 `categories`（`source=AI`）。
- AI 類別不可刪除，僅可透過類別圖層的 `isVisible` 隱藏。

#### 3.4.3 AI 結果資料格式（COCO）

儲存路徑：`storage/videos/{videoId}/ai/latest.coco.json`

基本欄位：`images`、`annotations`（含 `id`、`image_id`、`category_id`、`bbox`、`score`）、`categories`。

本專案擴充欄位：`track_id`、`frame_index`、`pts_us`、`source="AI"`。

每次辨識覆蓋同一個 `latest.coco.json`（不保留歷史版本）。

#### 3.4.4 AI Overlay 穩定化（Interpolation）

原始 COCO 結果僅包含 AI 實際偵測到的幀，為避免跳幀導致 bbox 閃爍，前端透過 `ai-overlay-stability.ts` 的 `resolveDetectionsForFrame()` 對每個 `displayIndex` 計算顯示內容：

| 情境 | 策略 |
|------|------|
| 精確匹配 | 直接使用該幀的偵測結果 |
| 有 `track_id`，相鄰偵測間距 ≤ 8 幀 | **線性插值** bbox（x, y, width, height, score），常數值為 `MAX_INTERPOLATION_GAP = 8` |
| 有 `track_id`，超出上一次偵測 ≤ 2 幀 | **Carry-forward**（原樣沿用上一個偵測），常數值為 `MAX_CARRY_FORWARD_GAP = 2` |
| 無 `track_id` 的輸出 | Fallback：距上一個有偵測的幀 ≤ 1 幀時 carry-forward |
| 超出間距 / 無資料 | 不顯示任何 bbox |

**`createOverlayStore()`** 在載入 COCO 結果時預先建立：
- `byFrameIndex`：幀索引 → 偵測列表
- `byTrackId`：track_id → 中心點軌跡（用於 Trajectory 繪製）
- `byTrackDetections`：track_id → 偵測列表（用於插值）

此機制讓 Trajectory 連線視覺更流暢，即使模型並非每幀都輸出偵測結果。

#### 3.4.5 相關 API

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/videos/:id/ai-result` | 取得最新 COCO 結果 |
| `DELETE` | `/api/videos/:id/ai-result` | 清除 AI 結果（保留影片），`PROCESSING` 時回 `409` |

---

## 4. AI 辨識

### 4.1 功能概述

透過 YOLO 模型（YOLOv8）對影片執行目標偵測，結果以 COCO 格式儲存。同一支影片在任意時刻只有一筆 `ai_jobs` 記錄（覆蓋策略，不保留歷史）。

### 4.2 架構

```
Browser ──POST ai-detect──▶ Next.js API Route
                                │
                          upsert ai_jobs
                                │
                     ──HTTP──▶ ai-worker (FastAPI + Ultralytics)
                                │
                          寫入 latest.coco.json
                                │
                     ──callback──▶ Next.js (更新 ai_jobs 終態)
                                │
                         SSE 推播給 Browser
```

- `web`（Next.js）：負責 API 路由、DB 狀態、SSE 推播。
- `ai-worker`（FastAPI + Python）：獨立進程，執行 YOLO 推論。
- 兩者透過本機 HTTP（`127.0.0.1`）通訊。

### 4.3 AI 狀態定義

| 狀態 | 說明 |
|------|------|
| `IDLE` | 尚未辨識，或已清除結果 |
| `PROCESSING` | 辨識進行中 |
| `DONE` | 辨識完成，`latest.coco.json` 已寫入 |
| `FAILED` | 辨識失敗，記錄 `error_message` |
| `CANCELED` | 使用者手動取消 |

### 4.4 開始辨識流程

**前端前置檢查：**
1. 無影片 → 阻擋並提示。
2. `timeline_status ≠ READY` → 阻擋並提示。
3. `ai_status = PROCESSING` → 按鈕應已禁用，阻擋觸發。

**前端樂觀更新：**
- 按鈕進入 loading 狀態。
- AI badge 先顯示 `PROCESSING`（API 回應後校正）。

**後端流程：**
1. 驗證 `ai_status ≠ PROCESSING`（否則回 `409`）。
2. Upsert `ai_jobs(video_id)` 為 `PROCESSING`（覆蓋前次記錄）。
3. Dispatch 辨識任務給 `ai-worker`。
4. `ai-worker` 完成後回呼 Next.js 更新終態。
5. Next.js 透過 SSE 推播給前端。

### 4.5 取消辨識流程

1. 前端呼叫 `POST /api/videos/:id/ai-cancel`。
2. 後端通知 `ai-worker` 停止當前任務。
3. `ai_jobs.status` 更新為 `CANCELED`。
4. SSE 推送 `canceled` 事件給前端。

取消後可立即再次觸發辨識（覆蓋前次記錄）。

### 4.6 按鈕可用性矩陣

| ai_status | 開始辨識 | 取消辨識 | 清除 AI 結果 |
|-----------|---------|---------|------------|
| `IDLE` | ✅ | ❌ | ❌（無結果） |
| `PROCESSING` | ❌ | ✅ | ❌ |
| `DONE` | ✅（重新辨識） | ❌ | ✅ |
| `FAILED` | ✅ | ❌ | ✅ |
| `CANCELED` | ✅ | ❌ | ✅ |

### 4.7 狀態推播（SSE）

主路徑：`GET /api/videos/:id/ai-status/stream`

**事件類型：**

```
event: status      → 狀態更新（含 status 欄位）
event: progress    → 進度更新（含 progress 0~100）
event: done        → 辨識完成終態
event: failed      → 辨識失敗終態
event: canceled    → 辨識取消終態
```

**規格：**
- 連線建立後先推一次當前狀態（避免前端空白等待）。
- 每 15～30 秒送一筆 keepalive 心跳。
- 支援 `Last-Event-ID`，前端重連可續接事件流。

**Fallback 輪詢：**
- SSE 連續 3 次失敗或 30 秒無事件，自動切換為輪詢 `GET /api/videos/:id/ai-status`（每 5 秒）。
- SSE 恢復後停止輪詢。
- 輪詢判定為終態（`DONE/FAILED/CANCELED`）後，主動關閉 SSE 重試。

**SSE 健康狀態回報：**
- 前端透過 `POST /api/videos/:id/ai-status/health` 回報 SSE 連線健康狀態：
  - `HEALTHY`：連線穩定，解除 `SSE_UNSTABLE_OR_BUFFERED` 風險事件。
  - `DEGRADED`：連線異常（需附 `reason`），開啟 `SSE_UNSTABLE_OR_BUFFERED` 風險事件（severity `P1`）。
- 此機制讓後端能追蹤前端 SSE 連線品質，納入風險事件系統統一管理。

### 4.8 終態通知

| 事件 | 通知 |
|------|------|
| `DONE` | Toast（成功）+ AI 動作區 badge 更新 + 右側 AI 圖層顯示統計 |
| `FAILED` | Toast（錯誤）+ 錯誤訊息摘要 |
| `CANCELED` | Toast（資訊） |

### 4.9 AI 統計欄位（`videos` 表）

辨識完成後更新：

| 欄位 | 說明 |
|------|------|
| `ai_count` | 偵測到的標註總數 |
| `ai_detected_frames` | 有偵測結果的幀數 |
| `ai_category_count` | 偵測到的類別數 |
| `ai_stats_updated_at` | 統計更新時間 |

### 4.10 相關 API

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/videos/:id/ai-detect` | 啟動辨識（非 `PROCESSING` 才可執行） |
| `POST` | `/api/videos/:id/ai-cancel` | 取消辨識（僅 `PROCESSING` 可執行） |
| `GET` | `/api/videos/:id/ai-status` | 查詢當前 AI 狀態 |
| `GET` | `/api/videos/:id/ai-status/stream` | SSE 即時推播（主路徑） |
| `POST` | `/api/videos/:id/ai-status/health` | 回報 SSE 健康狀態（`HEALTHY` / `DEGRADED`） |
| `GET` | `/api/videos/:id/ai-result` | 取得最新 COCO 結果 |
| `DELETE` | `/api/videos/:id/ai-result` | 清除 AI 結果（保留影片） |

---

## 附錄：DB Schema 摘要

---

## 5. 標註匯出（Export）

### 5.1 功能概述

管理員或使用者可將一支影片的標註資料匯出為檔案下載，支援三種格式：

| 格式 | 說明 | 來源 |
|------|------|------|
| `coco` | COCO JSON，含 MANUAL + AI 兩種來源的標註 | 全部 |
| `coco-manual` | COCO JSON，僅含 MANUAL 標註 | MANUAL |
| `yolo` | YOLO TXT，僅含 MANUAL BBox（Polygon / Text 跳過），座標正規化為 0~1 | MANUAL BBox |

### 5.2 使用方式

呼叫 `GET /api/videos/:id/export?format=<format>` 即觸發瀏覽器下載，後端回傳帶 `Content-Disposition: attachment` 的回應。前端使用 `window.open()` 或 `<a download>` 觸發。

### 5.3 COCO 格式規格

```json
{
  "info": {
    "description": "Export from video <filename>",
    "video_id": "<uuid>",
    "format": "coco | coco-manual",
    "exported_at": "<ISO 8601>"
  },
  "images": [
    {
      "id": 1,
      "file_name": "f_000123.jpg",
      "width": 1280,
      "height": 720,
      "frame_index": 123,
      "pts_us": 4100000
    }
  ],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 2,
      "bbox": [x, y, width, height],
      "area": 12000,
      "iscrowd": 0,
      "annotation_type": "BBOX | POLYGON | TEXT",
      "segmentation": [[x1,y1,x2,y2,...]],
      "source": "MANUAL | AI"
    }
  ],
  "categories": [
    { "id": 1, "name": "nodule", "supercategory": "object" }
  ]
}
```

- `images` 只包含有標註的幀，依 `displayIndex` 排序，`id` 為 1-based 整數。
- `segmentation`：BBox 不填，Polygon 填壓平的頂點座標 `[x1,y1,x2,y2,...]`。
- 檔名格式：`<video_filename>-coco.json` / `<video_filename>-coco-manual.json`。

### 5.4 YOLO 格式規格

純文字檔，每幀一段（以 `# --- f_XXXXXX.jpg ---` 分隔），每行一筆 BBox：

```
<class_id> <x_center> <y_center> <width> <height>
```

- 座標正規化（0~1），基準為影片解析度。
- `class_id` 從 0 起算，順序與 `categories` 陣列一致。
- 檔案開頭有說明注釋（影片名稱、尺寸、類別對照）。
- 檔名格式：`<video_filename>-yolo.txt`。

### 5.5 相關 API

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/videos/:id/export?format=coco` | 匯出全部標註（COCO JSON） |
| `GET` | `/api/videos/:id/export?format=coco-manual` | 匯出人工標註（COCO JSON） |
| `GET` | `/api/videos/:id/export?format=yolo` | 匯出人工 BBox（YOLO TXT） |

---

## 附錄：DB Schema 摘要

| 表 | 主鍵 | 說明 | 關聯 |
|----|------|------|------|
| `videos` | `id` | 影片主記錄 | — |
| `ai_jobs` | `video_id` | AI 工作記錄（一影片一筆） | `ON DELETE CASCADE` |
| `categories` | `id` | 類別圖層（`MANUAL` / `AI`） | `ON DELETE CASCADE` |
| `annotations` | `id` | 標註記錄（`BBOX` / `POLYGON` / `TEXT`） | `ON DELETE CASCADE` |
| `video_consistency` | `video_id` | 一致性掃描結果 | `ON DELETE CASCADE` |
| `audit_log` | `id` | 管理員操作稽核紀錄 | — |
| `risk_events` | `id` | 風險事件追蹤 | `video_id ON DELETE SET NULL` |

所有主鍵均使用 **UUID v7**（小寫含連字號）。  
SQLite 開啟 `PRAGMA foreign_keys = ON`，CASCADE 確實生效。

---

## 6. 認證與授權

### 6.1 功能概述

系統提供管理員認證機制，保護檔案管理後台（`/file`）與所有 `/api/admin/file/*` 路由。一般影片瀏覽與標註功能不需認證。

### 6.2 管理員帳號

- 帳號密碼透過環境變數 `ADMIN_USER` / `ADMIN_PASSWORD` 設定。
- 未設定時預設為 `admin` / `change-me`。
- 密碼比對使用 **constant-time comparison**（`timingSafeEqual`），防止 timing attack。

### 6.3 登入流程

1. 前端 `AuthGate` 元件顯示登入表單（帳號 / 密碼）。
2. 提交 `POST /api/auth/login`。
3. 驗證通過後，後端簽發 `admin_session` httpOnly cookie（24 小時過期）。
4. 前端切換至已認證狀態，顯示管理後台頁面。

### 6.4 Session 管理

- Token 格式：`base64url(payload).base64url(hmac)`。
- Payload 包含：`user`（使用者名稱）、`exp`（過期時間戳）。
- 簽章使用 **HMAC-SHA256**，key 優先順序：`SESSION_SECRET` → `ADMIN_PASSWORD` → `"local-dev-secret"`。
- 驗證時同時檢查簽章正確性與過期時間。

### 6.5 Middleware 保護

- Next.js Middleware 攔截所有 `/api/admin/file/*` 請求。
- 驗證順序：
  1. 檢查 `admin_session` cookie（Session Auth）。
  2. Fallback 到 `Authorization` header（HTTP Basic Auth）。
- 未認證時回傳 `401 { ok: false, error: { message: "未登入" } }`。

### 6.6 前端 AuthGate

- 三態顯示：`loading`（檢查 session）→ `authenticated`（顯示子元件）→ `unauthenticated`（顯示登入表單）。
- 登入後在頂部顯示 session bar，含使用者名稱與登出按鈕。
- 登出操作：呼叫 `POST /api/auth/logout` 清除 cookie，回到登入畫面。
- UI 語言：中文。

### 6.7 相關 API

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/auth/login` | 管理員登入（`{ username, password }`） |
| `POST` | `/api/auth/logout` | 登出（清除 session cookie） |
| `GET` | `/api/auth/me` | 取得當前登入使用者 |
| `GET` | `/file/logout` | 觸發 401 Basic Auth challenge（清除瀏覽器快取的 Basic Auth 憑證） |

---

## 7. 檔案管理後台

### 7.1 功能概述

管理員可透過 `/file` 頁面進入檔案管理後台，進行影片資料的進階管理、一致性檢查、清理、風險追蹤與稽核記錄查閱。此頁面由 `AuthGate` 元件包裹，需登入後才可存取。

### 7.2 影片管理清單

提供比一般影片列表更豐富的管理視圖：

**篩選功能：**
- 關鍵字搜尋（檔名 / video_id / 分類名稱）
- AI 狀態篩選（`IDLE` / `PROCESSING` / `DONE` / `FAILED` / `CANCELED`）
- 一致性狀態篩選（`OK` / `WARN` / `ERROR`）
- 日期範圍篩選（`dateFrom` / `dateTo`）

**排序支援：**
- 上傳時間（`uploaded_at`，預設）
- 檔名（`filename`）
- AI 狀態（`ai_status`）
- 一致性狀態（`consistency_status`）
- 類別數（`category_count`）
- 標註數（`annotation_count`）
- AI 標註數（`ai_annotation_count`）

**清單欄位：**
- 影片基本資訊（檔名、上傳時間、video_id）
- Metadata 預覽（解析度、fps、時長、編碼、像素格式、檔案大小、儲存路徑）
- 類別 / 標註數量
- AI 狀態與 AI 類別 / 標註數
- 一致性狀態（`consistency_status`、`consistency_reason`、`locked_by_processing`、`last_checked_at`）

**分頁：**
- 預設每頁 20 筆，上限 200 筆。

### 7.3 一致性檢查

針對單一影片執行檔案系統與 DB 的一致性校驗：

**檢查項目：**
- `source.mp4` 檔案是否存在
- `metadata.json` 檔案是否存在
- AI 結果檔案（`latest.coco.json`）與 DB 狀態是否一致

**輸出：**
- `consistencyStatus`：`OK` / `WARN` / `ERROR`
- `problems[]`：每個問題含 `code`、`message`、`severity`（P0/P1/P2）、`path`（選填）
- `suggestedActions[]`：建議的修復操作（含 `code`、`title`、`mode`）

**副作用：**
- 更新 `video_consistency` 表記錄。
- 發現問題時自動開啟 `risk_events`；問題解決時自動關閉。

### 7.4 修復操作（Reconcile）

對選取的影片執行批次修復，支援 **dry-run**（預覽）與 **apply**（實際執行）兩種模式：

**支援的修復動作：**

| 動作代碼 | 說明 |
|----------|------|
| `remove_orphan_fs` | 移除檔案系統中存在但 DB 無記錄的孤兒目錄 |
| `remove_orphan_db` | 移除 DB 中存在但檔案系統無對應檔案的孤兒記錄 |
| `rebuild_ai_status` | 根據檔案系統實際狀態重建 AI 狀態 |

**回應：**
- `summary`：`checked`（檢查數）、`changed`（變更數）、`skipped`（跳過數）
- `items[]`：每筆影片的處理結果（`appliedActions`、`skippedActions`、`problems`）
- apply 模式下寫入 `audit_log`。

### 7.5 檔案清理（Cleanup）

自動或手動清理舊影片資料，採 **兩階段確認制**（dry-run → 取得 confirmationToken → apply 時帶回 token）：

**清理策略（Policy）：**

| 參數 | 說明 |
|------|------|
| `retentionDays` | 保留天數，超過此天數的影片列入候選 |
| `keepLatestPerFilename` | 每個檔名保留最新 N 筆（非必填） |
| `highWatermarkPercent` | 磁碟使用率門檻（非必填） |
| `filename` | 指定檔名清理（非必填） |
| `videoIds` | 指定影片 ID 清理（非必填） |

**流程：**
1. dry-run：分析候選清單，回傳 `confirmationToken`（防止 TOCTOU）。
2. apply：帶回同一 `confirmationToken`，執行實際刪除。

**回應摘要：**
- `checked`：掃描影片數
- `eligible`：符合清理條件數
- `deleted`：已刪除數（apply 模式）
- `estimatedReclaimedBytes`：預估可回收空間
- `candidates[]`：每筆候選的詳情（`reasons`、`rankInFilename`、`olderThanRetention`、`lockedByProcessing`）

**副作用：** apply 模式下寫入 `audit_log`、更新 `risk_events`。

### 7.6 風險事件系統

追蹤系統運行中的風險狀態，提供儀表板式概覽：

#### 7.6.1 風險事件屬性

| 欄位 | 說明 |
|------|------|
| `risk_code` | 風險代碼（如 `SSE_UNSTABLE_OR_BUFFERED`、`FILE_MISSING` 等） |
| `scope_key` | 範圍鍵（`videoId` 或 `__GLOBAL__`），與 `risk_code` 組成唯一約束 |
| `severity` | 嚴重度：`P0`（緊急）/ `P1`（重要）/ `P2`（一般） |
| `status` | `OPEN`（未解決）/ `RESOLVED`（已解決） |
| `trigger_source` | 觸發來源 |
| `owner` | 負責人（選填） |
| `latest_note` | 最新備註（選填） |

#### 7.6.2 風險摘要（Dashboard）

頁面頂部顯示即時統計：
- `open_p0` / `open_p1` / `open_p2`：各等級未解決風險數
- `new_24h`：過去 24 小時新增數
- `resolved_24h`：過去 24 小時已解決數

#### 7.6.3 風險事件列表

支援篩選：
- 狀態（`OPEN` / `RESOLVED`）
- 嚴重度（`P0` / `P1` / `P2`）
- 風險代碼（`riskCode`）
- 時間範圍（`sinceHours`：`24` / `168`）

#### 7.6.4 Upsert 機制

- 以 `risk_code + scope_key` 為唯一鍵，先嘗試 UPDATE，不存在時 INSERT。
- 系統自動開啟/關閉的風險事件：
  - 一致性檢查發現問題 → 自動開啟
  - 一致性問題修復 → 自動解除
  - SSE 連線降級 → 自動開啟 `SSE_UNSTABLE_OR_BUFFERED`
  - SSE 連線恢復 → 自動解除
- 管理員可手動建立、更新風險事件。

### 7.7 稽核歷史

所有管理操作留下不可篡改的稽核記錄：

**事件類型：**

| 類型 | 說明 |
|------|------|
| `RECONCILE_APPLY` | 修復操作已執行 |
| `CLEANUP_APPLY` | 清理操作已執行 |
| `RISK_EVENT_MANUAL` | 手動建立/更新風險事件 |

**記錄欄位：**
- `event_type`：事件類型
- `actor`：操作者
- `payload_json`：操作輸入參數
- `result_json`：操作結果
- `created_at`：記錄時間

**查詢：**
- 全域稽核歷史（分頁 + `eventType` 篩選）
- 單一影片稽核歷史（在 payload / result JSON 中搜尋 `videoId`）

### 7.8 相關 API

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/admin/file/list` | 管理後台影片列表（含篩選、排序、一致性資訊） |
| `GET` | `/api/admin/file/[videoId]/consistency` | 單一影片一致性檢查 |
| `POST` | `/api/admin/file/reconcile` | 批次修復（dry-run / apply） |
| `POST` | `/api/admin/file/cleanup` | 檔案清理（dry-run / apply） |
| `GET` | `/api/admin/file/cleanup-history` | 稽核歷史（分頁 + eventType 篩選） |
| `GET` | `/api/admin/file/[videoId]/history` | 單一影片稽核歷史 |
| `GET` | `/api/admin/file/risk-summary` | 風險摘要統計 |
| `GET` | `/api/admin/file/risk-events` | 風險事件列表（分頁 + 篩選） |
| `POST` | `/api/admin/file/risk-events` | 手動建立/更新風險事件（upsert） |
| `PATCH` | `/api/admin/file/risk-events` | 部分更新風險事件 |

---

## 8. AI Worker

### 8.1 功能概述

AI Worker 為獨立的 **FastAPI + Python** 程序，負責執行 YOLOv8 模型推論。透過本機 HTTP（`127.0.0.1:8001`）與 Next.js 主服務通訊。Worker 無狀態持久化，所有 job 資料存於記憶體，重啟即遺失（由主服務負責恢復）。

### 8.2 API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/health` | 健康檢查（回傳 job 總數與執行中數量） |
| `POST` | `/v1/jobs` | 建立偵測任務（同一 video 不可重複提交，否則 `409`） |
| `GET` | `/v1/jobs/{job_id}` | 以 job_id 查詢任務狀態與進度 |
| `GET` | `/v1/jobs/by-video/{video_id}` | 以 video_id 查詢最新任務狀態 |
| `POST` | `/v1/jobs/{job_id}/cancel` | 取消任務 |
| `GET` | `/v1/jobs/{job_id}/result` | 取得完成任務的 COCO 結果與摘要 |

### 8.3 任務參數

透過 `POST /v1/jobs` request body 傳入：

| 參數 | 預設值 | 限制 | 說明 |
|------|--------|------|------|
| `video_id` | — | 1～128 字元 | 影片 ID |
| `video_path` | — | — | 影片檔案路徑 |
| `timeline_path` | — | — | timeline.json 路徑 |
| `output_path` | — | — | COCO 結果輸出路徑 |
| `model` | `yolov8n.pt` | — | YOLO 模型檔名 |
| `frame_stride` | `3` | 1～30 | 每 N 幀推論一次 |
| `conf_threshold` | `0.25` | 0.0～1.0 | 信心度門檻 |
| `iou_threshold` | `0.45` | 0.0～1.0 | NMS IoU 門檻 |

主服務端可透過環境變數 `AI_WORKER_MODEL`、`AI_FRAME_STRIDE`、`AI_CONF_THRESHOLD`、`AI_IOU_THRESHOLD` 覆寫預設值。

### 8.4 任務狀態機

```
QUEUED → PROCESSING → DONE
                    → FAILED
                    → CANCELED
```

| 狀態 | 說明 |
|------|------|
| `QUEUED` | 初始狀態，隨即啟動 daemon thread 執行 |
| `PROCESSING` | 開始讀取影片，`progress` 持續更新（0～99%） |
| `DONE` | 所有幀處理完成，COCO 結果已寫入磁碟，progress=100 |
| `FAILED` | 任何例外（檔案不存在、影片無法開啟、0 幀處理等） |
| `CANCELED` | cancel 端點設定 `cancel_event`，推論迴圈在下一幀中斷 |

同一 video 同時間只允許一個 active job（`QUEUED` / `PROCESSING`），否則回 `409`。

### 8.5 物件追蹤演算法

自行實作的 **IoU-based 簡易追蹤器**（非 DeepSORT）：

- 前後幀 bbox 以 IoU 比對，IoU ≥ **0.35** 視為同一物件，賦予相同 `track_id`。
- 超過 **12 幀**未出現的 track 會被清除（`max_age = 12`）。
- 新偵測物件自動分配遞增的 `track_id`。
- 此追蹤結果用於前端的 Trajectory 繪製與 Interpolation 插值。

### 8.6 COCO 輸出格式

與 §3.4.3 一致的 COCO 結構，寫入 `storage/videos/{videoId}/ai/latest.coco.json`：

- `images[]`：每幀一筆（`frame_index` 來自 timeline 的 `displayIndex`，`pts_us` 來自 timeline）。
- `annotations[]`：含擴充欄位 `track_id`、`frame_index`、`pts_us`、`source="AI"`。
- `categories[]`：`category_id = class_idx + 1`（1-based），`supercategory = "ultrasound"`。

Worker 完成後同時寫檔與留在記憶體中，主服務以 `GET /v1/jobs/{job_id}/result` 取得（含重試機制，最多 4 次指數退避）。

### 8.7 部署與依賴

**Python 環境：** `py311_ultrasound_local_viewer`（Conda）

**主要依賴：**

| 套件 | 說明 |
|------|------|
| `fastapi` | Web 框架 |
| `uvicorn` | ASGI 伺服器 |
| `ultralytics` | YOLOv8 推論 |
| `opencv-python-headless` | 影片幀讀取 |
| `numpy` | 數值計算 |

**執行機制：**
- 每個 job 啟動一個 **daemon thread**，無 async queue。
- 模型以 dict 快取（`_model_cache`），同一模型只載入一次，受 `_model_lock` 保護。
- 無並行 job 數量限制（受 CPU/GPU 硬體資源約束）。

**主服務輪詢：**
- 主服務以 **2 秒間隔** 輪詢 worker 狀態。
- 連續 **3 次失敗** 標記 `WORKER_UNREACHABLE` 風險。
- 啟動時 `ensureAiRunnerReady()` 掃描 DB 中 `PROCESSING` 狀態的影片，重新接管 worker 輪詢（crash recovery）。

---

## 附錄 A：DB Schema 詳細欄位

### `videos` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID v7 |
| `filename` | TEXT | NOT NULL | 原始檔名 |
| `local_path` | TEXT | NOT NULL | 檔案系統路徑 |
| `uploaded_at` | TEXT | NOT NULL | 上傳時間（ISO 8601） |
| `duration_sec` | REAL | | 影片時長（秒） |
| `source_fps` | REAL | | 原始幀率 |
| `video_width` | INTEGER | | 影片寬度（px） |
| `video_height` | INTEGER | | 影片高度（px） |
| `file_size_bytes` | INTEGER | | 檔案大小（bytes） |
| `video_codec` | TEXT | | 影片編碼 |
| `pixel_format` | TEXT | | 像素格式 |
| `ai_status` | TEXT | NOT NULL, DEFAULT 'IDLE' | AI 辨識狀態 |
| `ai_count` | INTEGER | NOT NULL, DEFAULT 0 | AI 偵測標註數 |
| `ai_detected_frames` | INTEGER | NOT NULL, DEFAULT 0 | AI 有偵測的幀數 |
| `ai_category_count` | INTEGER | NOT NULL, DEFAULT 0 | AI 偵測類別數 |
| `ai_stats_updated_at` | TEXT | | AI 統計更新時間 |
| `timeline_status` | TEXT | NOT NULL, DEFAULT 'PENDING' | Timeline 狀態 |
| `timeline_error` | TEXT | | Timeline 錯誤訊息 |
| `created_at` | TEXT | NOT NULL | 記錄建立時間 |
| `updated_at` | TEXT | NOT NULL | 記錄更新時間 |

索引：`idx_videos_uploaded_at(uploaded_at DESC)`

### `ai_jobs` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `video_id` | TEXT | PK, FK → videos(id) ON DELETE CASCADE | 影片 ID |
| `status` | TEXT | NOT NULL | 任務狀態 |
| `error_message` | TEXT | | 錯誤訊息 |
| `started_at` | TEXT | | 開始時間 |
| `finished_at` | TEXT | | 完成時間 |
| `canceled_at` | TEXT | | 取消時間 |
| `updated_at` | TEXT | NOT NULL | 更新時間 |

### `categories` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID v7 |
| `video_id` | TEXT | NOT NULL, FK → videos(id) ON DELETE CASCADE | 所屬影片 |
| `name` | TEXT | NOT NULL | 類別名稱 |
| `color` | TEXT | NOT NULL | 顏色（`#RRGGBB`） |
| `source` | TEXT | NOT NULL | 來源（`MANUAL` / `AI`） |
| `is_visible` | INTEGER | NOT NULL, DEFAULT 1 | 是否可見 |
| `stroke_width` | REAL | NOT NULL, DEFAULT 2.0 | 邊框寬度（0.5～20） |
| `stroke_color` | TEXT | | 邊框顏色覆寫（`null` = 使用主色） |
| `created_at` | TEXT | NOT NULL | 建立時間 |
| `updated_at` | TEXT | NOT NULL | 更新時間 |

唯一約束：`UNIQUE(video_id, name COLLATE NOCASE)`  
索引：`idx_categories_video_id(video_id)`

### `annotations` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID v7 |
| `video_id` | TEXT | NOT NULL, FK → videos(id) ON DELETE CASCADE | 所屬影片 |
| `frame_id` | TEXT | NOT NULL | 幀 ID（`f_000001`） |
| `category_id` | TEXT | NOT NULL, FK → categories(id) | 所屬類別 |
| `bbox_json` | TEXT | NOT NULL | 原始 bbox JSON（歷史欄位） |
| `annotation_type` | TEXT | NOT NULL, DEFAULT 'BBOX' | 類型（`BBOX` / `POLYGON` / `TEXT`） |
| `geometry_json` | TEXT | | 幾何資料 JSON |
| `text_content` | TEXT | | 文字內容（TEXT 類型專用） |
| `is_visible` | INTEGER | NOT NULL, DEFAULT 1 | 是否可見 |
| `created_at` | TEXT | NOT NULL | 建立時間 |
| `updated_at` | TEXT | NOT NULL | 更新時間 |

索引：`idx_annotations_video_id(video_id)`、`idx_annotations_frame_id(frame_id)`

### `video_consistency` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `video_id` | TEXT | PK, FK → videos(id) ON DELETE CASCADE | 影片 ID |
| `consistency_status` | TEXT | NOT NULL | `OK` / `WARN` / `ERROR` |
| `consistency_reason` | TEXT | | 狀態原因 |
| `last_checked_at` | TEXT | NOT NULL | 最後檢查時間 |
| `check_source` | TEXT | NOT NULL | 檢查來源 |
| `locked_by_processing` | INTEGER | NOT NULL, DEFAULT 0 | 是否鎖定中 |
| `updated_at` | TEXT | NOT NULL | 更新時間 |

索引：`idx_video_consistency_status(consistency_status)`

### `audit_log` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID v7 |
| `event_type` | TEXT | NOT NULL | 事件類型 |
| `actor` | TEXT | NOT NULL | 操作者 |
| `payload_json` | TEXT | NOT NULL | 操作輸入 JSON |
| `result_json` | TEXT | NOT NULL | 操作結果 JSON |
| `created_at` | TEXT | NOT NULL | 記錄時間 |

索引：`idx_audit_log_event_type_created_at(event_type, created_at DESC)`

### `risk_events` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PK | UUID v7 |
| `risk_code` | TEXT | NOT NULL | 風險代碼 |
| `scope_key` | TEXT | NOT NULL | 範圍鍵（`videoId` 或 `__GLOBAL__`） |
| `severity` | TEXT | NOT NULL | `P0` / `P1` / `P2` |
| `status` | TEXT | NOT NULL, CHECK IN ('OPEN','RESOLVED') | 狀態 |
| `trigger_time` | TEXT | NOT NULL | 觸發時間 |
| `resolved_time` | TEXT | | 解決時間 |
| `trigger_source` | TEXT | | 觸發來源 |
| `owner` | TEXT | | 負責人 |
| `latest_note` | TEXT | | 最新備註 |
| `video_id` | TEXT | FK → videos(id) ON DELETE SET NULL | 關聯影片 |
| `created_at` | TEXT | NOT NULL | 建立時間 |
| `updated_at` | TEXT | NOT NULL | 更新時間 |

唯一約束：`UNIQUE(risk_code, scope_key)`  
索引：`idx_risk_events_status_severity`、`idx_risk_events_trigger_time`、`idx_risk_events_resolved_time`、`idx_risk_events_video_id`

---

## 附錄 B：環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `ADMIN_USER` | `admin` | 管理員帳號 |
| `ADMIN_PASSWORD` | `change-me` | 管理員密碼 |
| `SESSION_SECRET` | 取 `ADMIN_PASSWORD` | Session HMAC 簽章金鑰 |
| `AI_WORKER_URL` | `http://127.0.0.1:8001` | AI Worker 服務位址 |
| `AI_WORKER_TIMEOUT_MS` | `10000` | AI Worker HTTP 請求超時（ms） |
| `AI_WORKER_MODEL` | `yolov8n.pt` | 預設 YOLO 模型檔名 |
| `AI_FRAME_STRIDE` | `3` | 每 N 幀推論一次 |
| `AI_CONF_THRESHOLD` | `0.25` | 信心度門檻 |
| `AI_IOU_THRESHOLD` | `0.45` | NMS IoU 門檻 |
| `ULTRASOUND_REPO_ROOT` | 自動推斷 | 專案根目錄路徑 |

---

## 附錄 C：技術棧

### 前端（web/）

| 技術 | 版本 | 說明 |
|------|------|------|
| Next.js | 15.2.4 | React 全端框架（App Router） |
| React | 19.0.0 | UI 框架 |
| TypeScript | 5.8.3 | 型別系統 |
| Tailwind CSS | 4.2.2 | 工具類 CSS 框架 |
| lucide-react | 1.8.0 | 圖示庫 |
| react-resizable-panels | 4.10.0 | 可調整大小的三欄佈局 |
| sonner | 2.0.7 | Toast 通知 |
| SQLite | — | 嵌入式資料庫（透過 `sqlite3` CLI 子程序存取） |

### AI Worker（ai-worker/）

| 技術 | 說明 |
|------|------|
| FastAPI | Python Web 框架 |
| Uvicorn | ASGI 伺服器 |
| Ultralytics | YOLOv8 推論引擎 |
| OpenCV (headless) | 影片幀讀取 |
| Python 3.11 | 執行環境（Conda） |

### 系統工具

| 工具 | 說明 |
|------|------|
| ffprobe | 影片 metadata 探測與 timeline 建構 |
| ffmpeg | 縮圖擷取 |

### 儲存架構

```
storage/
└── videos/
    └── {videoId}/           # UUID v7 命名
        ├── source.mp4       # 原始影片
        ├── metadata.json    # ffprobe 解析結果
        ├── timeline.json    # 所有幀的 pts_us / frameId / isKeyframe
        ├── thumb.jpg        # 128×72 縮圖
        └── ai/
            └── latest.coco.json  # AI 辨識結果（COCO 格式）
```
