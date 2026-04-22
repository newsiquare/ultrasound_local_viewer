# Ultrasound Local Viewer

本專案是獨立於既有平台的「本地單頁影片辨識服務」，提供以下核心功能：

1. 影片上傳
2. 影片瀏覽
3. 圖層顯示（類別 / 標註 / AI辨識）
4. AI 任務啟動/取消與狀態同步（SSE）
5. `/file` 管理頁（檔案一致性檢查、修復、清理）

## 目標

- 不依賴 Cloudflare R2
- 不依賴 Supabase
- 全流程在本機執行（檔案存本地、AI在本地 worker）
- AI辨識使用 Ultralytics YOLO，輸出 COCO

## 文件

- 開發計畫：`docs/development-plan.md`
- 功能規格（移植參考）：`docs/feature-spec.md`

## 技術棧

- `web`: Next.js + React + TypeScript（UI + 本地 API）
- `ai-worker`: FastAPI + Ultralytics（本機服務）
- `storage`: 本地檔案系統 + SQLite

## 專案骨架

- `web/`: Next.js 單頁前端 + 本地 API
- `ai-worker/`: FastAPI + Ultralytics
- `storage/`: 本地影片、AI結果與 SQLite 檔案

## Web 服務啟動

```bash
cd web
npm install        # 首次或 package.json 有異動時執行
npm run dev        # 開發模式（預設 http://localhost:3100，由 .env 的 PORT 決定）
```

> **PORT 設定**：`web/.env` 內的 `PORT=3100` 會透過啟動腳本 `scripts/run-next-with-env.mjs` 傳給 Next.js，若未設定則預設為 3000。

---

## AI Worker 服務啟動（Conda）

```bash
conda create -n us-worker python=3.11 -y
conda activate us-worker
pip install -r ai-worker/requirements.txt
```

啟動 ai-worker：

```bash
uvicorn app.main:app --app-dir ai-worker --host 127.0.0.1 --port 8001
```

可選環境變數（web 端）：

- `AI_WORKER_URL`（預設 `http://127.0.0.1:8001`）
- `AI_WORKER_MODEL`（預設 `yolov8n.pt`）
- `AI_WORKER_FRAME_STRIDE`（預設 `1`，逐幀推論）
- `AI_WORKER_CONF_THRESHOLD`（預設 `0.25`）
- `AI_WORKER_IOU_THRESHOLD`（預設 `0.45`）

## Admin 存取（`/file`）

- `/file` 與 `/api/admin/file/*` 為 admin-only。
- 本地版驗證採同頁 **Auth Gate 遮罩**（環境變數：`ADMIN_USER`、`ADMIN_PASSWORD`）。
- 進入 `http://localhost:3000/file` 會顯示全頁登入遮罩（非瀏覽器原生彈窗）。
- 登入成功後簽發 HttpOnly Session Cookie（HMAC-SHA256 簽章，24 小時效期）。
- 帳密錯誤時，頁面內顯示錯誤提示，不觸發瀏覽器彈窗。
- 若要登出，點擊頁面右上角的「登出」按鈕（呼叫 `POST /api/auth/logout`）。
- Viewer 頁（`/`）已登入時，TopBar 右上角顯示管理員頭像，可快速連至後台或登出。
