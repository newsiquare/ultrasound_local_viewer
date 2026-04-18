# 標註系統規格文件

日期：2026-04-17  
版本：v1.0  
關聯主文件：`development-plan.md`（對應章節：3.2.5、3.3.2、4.2、5.5、6.10、7）

---

## 目錄

- [1. 背景與範圍](#1-背景與範圍)
- [2. 標註工具列規格](#2-標註工具列規格)
- [3. 標註圖層清單規格](#3-標註圖層清單規格)
- [4. 資料庫 Schema 變更](#4-資料庫-schema-變更)
- [5. API 規格](#5-api-規格)
- [6. 核心流程](#6-核心流程)
- [7. 前端模組](#7-前端模組)
- [8. 驗收標準](#8-驗收標準)
- [9. 實作 Checklist](#9-實作-checklist)

---

## 1. 背景與範圍

本文件描述標註系統的完整規格，包含：

- **標註工具列**：在影像工具列同一列新增 Select / Text / Rectangle / Polygon 四個工具
- **標註圖層清單**：重新規劃 Layers Panel 的 Annotation 區塊列項欄位與互動
- **Schema 升級**：將 `bbox_json` 升級為支援多類型的 `geometry_json`，新增 `annotation_type`、`text_content`、`is_visible` 欄位
- **API 補齊**：明確 Annotation CRUD 的 input/output 規格
- **建立流程保護**：草稿保護、前置檢查、邊界情境處理

不在本文件範圍：AI 標註（`source=AI`）建立邏輯、COCO 輸出格式、類別管理 API。

---

## 2. 標註工具列規格

### 2.1 位置

位於 **影像工具列（ViewerImageToolbar）同一列**，以分隔線區隔：

```text
[ Zoom+ | Zoom- | Fit | Grid | Contrast ]  |  [ Select | Text | Rectangle | Polygon ]
```

### 2.2 工具定義

| 工具 | 說明 | 游標樣式 | 進入標註模式 |
|---|---|---|---|
| Select（游標） | 選取或移動已存在的標註 | `default` | 否（退出模式） |
| Text（文字） | 點擊放置文字標籤 | `text` | 是 |
| Rectangle（矩形） | 點擊拖曳繪製矩形 BBox | `crosshair` | 是 |
| Polygon（多邊形） | 逐點點擊後閉合多邊形 | `crosshair` | 是 |

### 2.3 模式切換規則

1. 點擊 Text / Rectangle / Polygon 任一工具 → 立即進入標註模式（無額外開關）。
2. 點擊 Select 工具或按 `Esc` → 退出標註模式，回到瀏覽模式。
3. 進入標註模式時，影片**自動暫停**。
4. 切換影片時，強制退出標註模式並**丟棄**未完成草稿。

### 2.4 前置條件

在進入任何繪製動作前，必須先在**類別圖層選取一個目標類別**。

- 未選取時：提示「請先在類別圖層選擇一個類別」，**不進入繪製**。
- 影片未載入或 `timeline_status != READY`：提示並阻擋。

### 2.5 各工具操作細節

#### Rectangle（矩形）

1. 按住左鍵拖曳，放開即確認。
2. 繪製中顯示虛線預覽框。
3. 最小尺寸限制：`10×10 px`（影片座標系）；低於此值放棄並顯示提示。

#### Polygon（多邊形）

1. 左鍵逐點新增頂點；右鍵撤銷最後一個點。
2. 點擊第一個頂點（或按 `Enter`）閉合多邊形並確認。
3. `Esc` 放棄當前草稿。
4. 頂點數限制：**最少 3 個，最多 64 個**；超過 64 點阻止新增並提示。

#### Text（文字）

1. 左鍵點擊放置位置，彈出 inline 輸入框（非模態框）。
2. `Enter` 確認，`Esc` 放棄。
3. 文字長度限制：`1~64` 字元。

### 2.6 草稿保護

| 情境 | 行為 |
|---|---|
| 繪製中 seek 到其他幀 | 彈出「放棄草稿？」確認提示 |
| 繪製中切換標註工具 | 若有 Polygon 草稿，彈出放棄確認 |
| 切換影片 | 強制丟棄草稿，退出標註模式 |

### 2.7 座標系統

- 所有幾何座標使用**影片原始解析度座標**（非畫面 CSS 像素）。
- 顯示時依當前縮放比例換算，避免跨解析度渲染錯位。

---

## 3. 標註圖層清單規格

### 3.1 清單資料範圍

- 只顯示**當前幀**（`frame_id` 符合）的標註。
- 幀切換時，清單**自動替換**（無動畫，直接刷新）。
- 每次呼叫 `GET /api/videos/:id/annotations?frameId=<current>` 取得當前幀清單。

### 3.2 清單列欄位（由左至右）

```text
[ 類型圖標 ]  [ 類別名稱（下拉） ]  [ ⓘ Info ]  [ 👁 Eye ]  [ 🗑 刪除 ]
```

| 位置 | 元件 | 說明 |
|---|---|---|
| 1 | 類型圖標 | `[T]` 文字、`[▭]` 矩形、`[⬡]` 多邊形 |
| 2 | 類別名稱（下拉選單） | 可直接更改該標註所屬類別；僅列出 `source=MANUAL` 類別 |
| 3 | Info 圖標 | 滑鼠靠近自動展開浮層 |
| 4 | Eye 圖標 | 切換**單筆**標註可見性，不影響其他筆 |
| 5 | 刪除圖標 | 刪除該筆標註（呼叫 DELETE API） |

### 3.3 Info 圖標浮層內容

| 欄位 | 內容 |
|---|---|
| 幀資訊 | `display_index`（第幾幀）、`frame_id` |
| 幾何（Rectangle） | `x, y, width, height`（影片座標） |
| 幾何（Polygon） | 頂點數、頂點座標列表 `[[x1,y1],...]` |
| 幾何（Text） | 放置點 `x, y`、文字內容 |
| 建立時間 | `created_at` |

### 3.4 顯示規則

1. 區塊開關**關閉**時，不渲染任何人工標註 overlay。
2. 區塊開關**開啟**時，只渲染同時滿足以下三個條件的標註：
   - `frame_id` 符合當前幀
   - 該筆 `is_visible = 1`（Eye 開啟）
   - 對應類別 `isVisible = true`
3. 點擊清單列，在影片區高亮對應標註。
4. 類別下拉變更後，overlay 顏色同步更新。

---

## 4. 資料庫 Schema 變更

### 4.1 `annotations` 表格欄位變更

| 異動 | 舊欄位 | 新欄位 |
|---|---|---|
| 棄用 | `bbox_json TEXT NOT NULL` | — |
| 新增 | — | `annotation_type TEXT NOT NULL`（`BBOX`/`POLYGON`/`TEXT`） |
| 新增（取代） | — | `geometry_json TEXT NOT NULL` |
| 新增 | — | `text_content TEXT`（僅 TEXT 類型使用） |
| 新增 | — | `is_visible INTEGER NOT NULL DEFAULT 1` |

### 4.2 完整 `annotations` Schema

```sql
CREATE TABLE annotations (
  id              TEXT PRIMARY KEY,
  video_id        TEXT NOT NULL,
  frame_id        TEXT NOT NULL,
  category_id     TEXT NOT NULL,
  annotation_type TEXT NOT NULL CHECK(annotation_type IN ('BBOX','POLYGON','TEXT')),
  geometry_json   TEXT NOT NULL,
  text_content    TEXT,
  is_visible      INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  FOREIGN KEY(video_id)    REFERENCES videos(id)     ON DELETE CASCADE,
  FOREIGN KEY(category_id) REFERENCES categories(id)
);
```

### 4.3 `geometry_json` 格式規範

```json
// annotation_type = BBOX
{ "type": "bbox", "x": 120, "y": 80, "width": 200, "height": 150 }

// annotation_type = POLYGON
{ "type": "polygon", "points": [[x1,y1],[x2,y2],[x3,y3]] }

// annotation_type = TEXT
{ "type": "text", "x": 300, "y": 200 }
```

座標單位：影片原始解析度像素（非 CSS 像素）。

### 4.4 Migration 注意事項

- 若資料庫已有舊 `bbox_json` 資料，migration 需將其轉換為 `geometry_json` 格式（`annotation_type = 'BBOX'`）。
- Migration 為不可逆操作，執行前需備份 `app.db`。

---

## 5. API 規格

### 5.1 共通規格

```json
// 成功
{ "ok": true, "data": {} }

// 失敗
{ "ok": false, "error": { "code": "...", "message": "...", "details": {} }, "requestId": "req_xxx" }
```

### 5.2 `GET /api/videos/:id/annotations`

**Query 參數：**

| 參數 | 必填 | 說明 |
|---|---|---|
| `frameId` | 是 | 只回傳指定幀的標註，不支援跨幀批次拉取 |
| `source` | 否 | `MANUAL` 或 `AI`，不帶則回傳全部 |
| `cursor` | 否 | 分頁游標 |
| `limit` | 否 | 每頁筆數，預設 100 |

**Response `data` 欄位：**

```json
[
  {
    "id": "uuid",
    "videoId": "uuid",
    "frameId": "f_000001",
    "categoryId": "uuid",
    "annotationType": "BBOX",
    "geometry": { "type": "bbox", "x": 120, "y": 80, "width": 200, "height": 150 },
    "textContent": null,
    "isVisible": true,
    "createdAt": "2026-04-17T10:00:00Z"
  }
]
```

### 5.3 `POST /api/videos/:id/annotations`

**Request Body：**

```json
{
  "frameId": "f_000001",
  "categoryId": "uuid-xxx",
  "annotationType": "BBOX",
  "geometry": { "type": "bbox", "x": 120, "y": 80, "width": 200, "height": 150 },
  "textContent": null
}
```

**驗證規則：**

| 規則 | 錯誤碼 | HTTP |
|---|---|---|
| `annotationType` 不在白名單 | `INVALID_ANNOTATION_TYPE` | 400 |
| `geometry` 格式不符對應類型 | `INVALID_GEOMETRY` | 400 |
| `textContent` 為空（TEXT 類型） | `TEXT_CONTENT_REQUIRED` | 400 |
| Polygon 頂點數 < 3 或 > 64 | `INVALID_POLYGON_POINTS` | 400 |
| Rectangle 尺寸 < 10×10 | `BBOX_TOO_SMALL` | 400 |
| `categoryId` 不存在 | `CATEGORY_NOT_FOUND` | 404 |
| `frameId` 不存在於 timeline | `FRAME_NOT_FOUND` | 404 |

**成功回應：** `201 Created`，回傳建立的標註物件。

### 5.4 `PATCH /api/videos/:id/annotations/:annotationId`

**允許修改欄位：**

| 欄位 | 說明 |
|---|---|
| `categoryId` | 變更所屬類別（只允許 MANUAL 類別） |
| `isVisible` | 切換可見性 |

> 幾何形狀（`geometry`）建立後**不支援修改**，需刪除後重新繪製。

**成功回應：** `200 OK`，回傳更新後的標註物件。

### 5.5 `DELETE /api/videos/:id/annotations/:annotationId`

**規則：**

- `source=MANUAL` 的標註才可刪除。
- `source=AI` 的標註回 `409 Conflict`（`AI_ANNOTATION_NOT_DELETABLE`）。

**成功回應：** `204 No Content`。

---

## 6. 核心流程

### 6.1 標註建立流程

```text
[使用者點擊 Rectangle / Polygon / Text 工具]
         ↓
[前置檢查]
  ├─ 無影片或 timeline 未 READY → 阻擋，顯示提示
  └─ 未選取類別 → 提示「請先選擇類別」，不進入繪製
         ↓
[進入標註模式]
  ├─ 影片自動暫停
  └─ AnnotationCanvas 開始攔截滑鼠事件
         ↓
[繪製]
  ├─ Rectangle：拖曳畫框 → 放開確認
  ├─ Polygon：逐點點擊 → Enter 或點第一點閉合
  └─ Text：點擊放置 → inline 輸入 → Enter 確認
         ↓
[送出]
  └─ POST /api/videos/:id/annotations
         ↓
[完成]
  ├─ 標註圖層清單新增一筆（當前幀可見，其他幀不顯示）
  └─ overlay 立即渲染
```

### 6.2 幀切換後標註顯示流程

```text
[使用者 seek / 逐幀跳轉]
         ↓
[計算當前 frame_id（binary search pts_us）]
         ↓
[GET /api/videos/:id/annotations?frameId=<current>]
         ↓
[替換標註圖層清單內容]
         ↓
[重新渲染 AnnotationCanvas overlay]
```

### 6.3 標註可見性控制優先順序

```text
區塊開關（OFF） > 類別 isVisible（false） > 單筆 is_visible（0）
```

只要上層開關為關閉，下層開關的設定不影響最終顯示（但資料保留）。

---

## 7. 前端模組

### 7.1 新增模組

| 模組 | 說明 |
|---|---|
| `useAnnotationTool` | 管理當前選取工具、繪製草稿狀態、送出確認、草稿保護邏輯 |
| `AnnotationCanvas` | 覆蓋在影片區的 SVG/Canvas，負責事件攔截、繪製預覽與確認後渲染 |

### 7.2 `useAnnotationTool` 狀態

```typescript
type AnnotationToolState = {
  activeTool: 'select' | 'text' | 'rectangle' | 'polygon' | null;
  isAnnotating: boolean;       // 是否在標註模式中
  draftPoints: [number, number][];  // Polygon 草稿頂點
  selectedCategoryId: string | null;  // 當前選取的類別
};
```

### 7.3 修改模組

| 模組 | 變更說明 |
|---|---|
| `ViewerImageToolbar` | 在工具列右側以分隔線新增標註工具按鈕 |
| `AnnotationLayerSection` | 清單列重構為新欄位排列（類型/類別下拉/Info/Eye/刪除） |
| `useFrameAnnotations` | Query 改為必帶 `frameId`，回傳當前幀標註清單 |

---

## 8. 驗收標準

### 8.1 標註工具列

- [ ] 點擊 Rectangle / Polygon / Text 工具後，游標樣式正確切換
- [ ] 進入標註模式時影片自動暫停
- [ ] 點擊 Select 或按 `Esc` 可退出標註模式，影片恢復可播放
- [ ] 未選取類別點擊繪製工具，顯示「請先選擇類別」提示
- [ ] 切換影片時強制退出標註模式

### 8.2 各工具繪製

- [ ] Rectangle：拖曳顯示虛線預覽框，放開後確認並出現在 overlay
- [ ] Rectangle：尺寸 < 10×10 px 放棄並提示
- [ ] Polygon：逐點點擊新增頂點，右鍵撤銷，Enter 閉合
- [ ] Polygon：少於 3 點無法閉合
- [ ] Polygon：超過 64 點阻止新增並提示
- [ ] Text：點擊後顯示 inline 輸入框，Enter 確認，`Esc` 放棄
- [ ] Text：空字串無法確認

### 8.3 草稿保護

- [ ] Rectangle 繪製中 seek，彈出放棄確認提示
- [ ] Polygon 繪製中 seek，彈出放棄確認提示
- [ ] 切換影片時自動丟棄草稿，無提示直接退出

### 8.4 標註圖層清單

- [ ] 幀切換後清單自動刷新為當前幀內容
- [ ] 清單列欄位由左至右：類型圖標 → 類別下拉 → Info → Eye → 刪除
- [ ] Info 圖標 hover 展開，顯示幾何座標與 `display_index`、`frame_id`、`created_at`
- [ ] 類別下拉可直接變更所屬類別，overlay 顏色同步更新
- [ ] Eye 圖標切換後，對應標註立即隱藏/顯示於 overlay
- [ ] 刪除圖標點擊後，呼叫 DELETE API，清單與 overlay 同步移除

### 8.5 跨幀顯示隔離

- [ ] 第 0 幀標註不出現在第 1 幀的清單與 overlay
- [ ] seek 到標註所在幀後，overlay 正確顯示該筆標註

### 8.6 API

- [ ] `POST` Polygon 頂點數 < 3 回 `400`（`INVALID_POLYGON_POINTS`）
- [ ] `POST` Polygon 頂點數 > 64 回 `400`（`INVALID_POLYGON_POINTS`）
- [ ] `POST` TEXT 類型未帶 `textContent` 回 `400`（`TEXT_CONTENT_REQUIRED`）
- [ ] `POST` `categoryId` 不存在回 `404`（`CATEGORY_NOT_FOUND`）
- [ ] `PATCH` 成功變更 `categoryId`
- [ ] `PATCH` 成功變更 `isVisible`
- [ ] `DELETE` AI 來源標註回 `409`（`AI_ANNOTATION_NOT_DELETABLE`）
- [ ] `GET` 不帶 `frameId` 回 `400`

### 8.7 Schema Migration

- [ ] 舊 `bbox_json` 資料成功轉換為 `geometry_json`（`annotation_type='BBOX'`）
- [ ] 新欄位 `annotation_type`、`is_visible`、`text_content` 存在且有正確預設值

---

## 9. 實作 Checklist

### Phase A：Schema & API（後端）

- [ ] **A1** 撰寫 migration：`annotations` 新增 `annotation_type`、`geometry_json`、`text_content`、`is_visible`，棄用 `bbox_json`
- [ ] **A2** 撰寫 `bbox_json → geometry_json` 資料轉換腳本（migration 內執行）
- [ ] **A3** 更新 `POST /api/videos/:id/annotations` input schema 與驗證邏輯
- [ ] **A4** 新增 `annotationType` 白名單驗證（`BBOX / POLYGON / TEXT`）
- [ ] **A5** 新增 `geometry_json` 格式驗證（依 type 分別驗證）
- [ ] **A6** 新增 Polygon 頂點數驗證（3~64）
- [ ] **A7** 新增 Rectangle 最小尺寸驗證（10×10 px 影片座標）
- [ ] **A8** 新增 TEXT 類型的 `textContent` 必填驗證
- [ ] **A9** 更新 `PATCH /api/videos/:id/annotations/:id`：只允許修改 `categoryId`、`isVisible`
- [ ] **A10** 更新 `GET /api/videos/:id/annotations`：`frameId` 改為必填，未帶回 `400`
- [ ] **A11** `DELETE /api/videos/:id/annotations/:id`：AI 來源標註回 `409`

### Phase B：前端工具列

- [ ] **B1** `ViewerImageToolbar`：以分隔線新增 Select / Text / Rectangle / Polygon 按鈕
- [ ] **B2** 按鈕 active 樣式（高亮當前選取工具）
- [ ] **B3** 點擊繪製工具時自動暫停影片
- [ ] **B4** 點擊 Select 或按 `Esc` 退出標註模式，影片可繼續播放
- [ ] **B5** 未選取類別時點擊繪製工具，顯示 toast 提示
- [ ] **B6** 切換影片時強制退出標註模式

### Phase C：`useAnnotationTool` Hook

- [ ] **C1** 建立 `useAnnotationTool` hook，管理 `activeTool`、`isAnnotating`、`draftPoints`、`selectedCategoryId`
- [ ] **C2** Rectangle 草稿邏輯：記錄 mousedown 起點與目前游標位置
- [ ] **C3** Polygon 草稿邏輯：逐點追加、右鍵撤銷、Enter/閉合觸發確認
- [ ] **C4** Text 草稿邏輯：記錄放置座標，管理 inline 輸入框開關
- [ ] **C5** 草稿保護：seek 時若有草稿，觸發放棄確認 dialog
- [ ] **C6** 切換影片時自動清空草稿狀態
- [ ] **C7** 送出函式：組裝 payload 並呼叫 POST API，成功後清空草稿

### Phase D：`AnnotationCanvas` 元件

- [ ] **D1** 建立 `AnnotationCanvas`（SVG 或 Canvas），覆蓋在影片顯示區上方
- [ ] **D2** 標註模式 ON 時攔截 `mousedown / mousemove / mouseup / click` 事件
- [ ] **D3** Rectangle 預覽：拖曳中繪製虛線矩形
- [ ] **D4** Polygon 預覽：顯示已確認頂點、連線，以及游標到最後一點的引導線
- [ ] **D5** Text 放置點標記：點擊位置顯示臨時十字標
- [ ] **D6** 已確認標註渲染：依 `annotationType` 繪製對應形狀，顏色來自類別 `color`
- [ ] **D7** 點擊已存在標註時高亮（Select 模式）
- [ ] **D8** 座標換算：所有畫面事件座標換算為影片原始解析度座標

### Phase E：`AnnotationLayerSection` 重構

- [ ] **E1** 清單列重構為新欄位排列（類型圖標 / 類別下拉 / Info / Eye / 刪除）
- [ ] **E2** 類型圖標：`[T]`、`[▭]`、`[⬡]` 依 `annotationType` 顯示
- [ ] **E3** 類別下拉：列出當前影片的 MANUAL 類別；onChange 呼叫 PATCH API
- [ ] **E4** Info 圖標：hover 展開浮層，顯示幾何詳情、`display_index`、`frame_id`、`created_at`
- [ ] **E5** Eye 圖標：toggle 呼叫 PATCH `isVisible`，overlay 同步更新
- [ ] **E6** 刪除圖標：呼叫 DELETE API，成功後從清單與 overlay 移除
- [ ] **E7** 幀切換時自動重新拉取 `GET annotations?frameId=<current>`

### Phase F：整合測試

- [ ] **F1** Rectangle 繪製 → 清單出現 → 切換幀後消失 → 切回原幀後重現
- [ ] **F2** Polygon 繪製 → 少於 3 點無法閉合
- [ ] **F3** Text 繪製 → 放置確認 → Info 浮層顯示正確文字內容
- [ ] **F4** 類別下拉變更 → overlay 顏色立即同步
- [ ] **F5** Eye 關閉 → overlay 隱藏；Eye 開啟 → overlay 重現
- [ ] **F6** Rectangle 繪製中 seek → 放棄確認提示出現
- [ ] **F7** 切換影片 → 標註模式退出，草稿消失
- [ ] **F8** POST Polygon 頂點數 > 64 → API 回 400
- [ ] **F9** DELETE AI 標註 → API 回 409
- [ ] **F10** Migration 執行後，舊資料 `geometry_json` 格式正確

---

*文件結束*
