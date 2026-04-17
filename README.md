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

## 技術棧

- `web`: Next.js + React + TypeScript（UI + 本地 API）
- `ai-worker`: FastAPI + Ultralytics（本機服務）
- `storage`: 本地檔案系統 + SQLite

## 專案骨架

- `web/`: Next.js 單頁前端 + 本地 API
- `ai-worker/`: FastAPI + Ultralytics
- `storage/`: 本地影片、AI結果與 SQLite 檔案

## AI Worker 環境（Conda）

```bash
conda create -n us-worker python=3.11 -y
conda activate us-worker
pip install -r ai-worker/requirements.txt
```

## Admin 存取（`/file`）

- `/file` 與 `/api/admin/file/*` 為 admin-only。
- 本地版驗證採 HTTP Basic Auth（環境變數：`ADMIN_USER`、`ADMIN_PASSWORD`）。
- 進入 `http://localhost:3000/file` 會立即跳出瀏覽器登入視窗。
- 帳密錯誤或未登入時，後端回 `401` + `WWW-Authenticate: Basic`。
- 若要切換帳號，可呼叫 `GET /file/logout` 重新觸發登入視窗。
