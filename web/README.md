# web (Phase 1 baseline)

This directory contains the Next.js app for local API + UI.

## Implemented in this commit

- SQLite schema bootstrap (videos / categories / annotations / ai_jobs)
- Phase 1 APIs:
  - `POST /api/videos/upload`
  - `GET /api/videos`
  - `GET /api/videos/:id/meta`
  - `GET /api/videos/:id/bootstrap`
  - `GET /api/videos/:id/timeline`
  - `GET /api/videos/:id/stream`
  - `DELETE /api/videos/:id`
- Phase 2/3 baseline:
  - viewer timeline playback controls with `pts_us` alignment
  - `POST /api/videos/:id/ai-detect`
  - `POST /api/videos/:id/ai-cancel`
  - `GET /api/videos/:id/ai-status`
  - `GET /api/videos/:id/ai-status/stream` (SSE)
  - `GET /api/videos/:id/ai-result`
  - `DELETE /api/videos/:id/ai-result`
- Upload validations:
  - extension whitelist: `.mp4 .mov .avi .mkv`
  - MIME whitelist
- Timeline generation via `ffprobe` with required monotonic `pts_us`

## Run locally

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

By default, storage is read from repo-level `storage/`.
Override repo root with `ULTRASOUND_REPO_ROOT` if needed.

## AI runner mode

- `AI_RUNNER_MODE=mock` (default): local simulated detection that writes `latest.coco.json`.
- `AI_RUNNER_MODE=worker`: probes `AI_WORKER_URL` (`/health`), and marks task as `FAILED (WORKER_UNREACHABLE)` if unreachable.
