# Ultrasound Local Viewer

本專案是獨立於既有平台的「本地單頁影片辨識服務」，提供三大功能：

1. 影片上傳
2. 影片瀏覽
3. 圖層顯示（類別 / 標註 / AI辨識）

## 目標

- 不依賴 Cloudflare R2
- 不依賴 Supabase
- 全流程在本機執行（檔案存本地、AI在本地 worker）
- AI辨識使用 Ultralytics YOLO，輸出 COCO

## 文件

- 開發計畫：`docs/development-plan.md`

## 專案骨架

- `web/`: Next.js 單頁前端 + 本地 API
- `ai-worker/`: FastAPI + Ultralytics
- `storage/`: 本地影片、AI結果與 SQLite 檔案

