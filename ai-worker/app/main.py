from __future__ import annotations

import json
import math
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from ultralytics import YOLO

JobStatus = Literal["QUEUED", "PROCESSING", "DONE", "FAILED", "CANCELED"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class DetectJobRequest(BaseModel):
    video_id: str = Field(min_length=1, max_length=128)
    video_path: str
    timeline_path: str
    output_path: str
    model: str = "yolov8n.pt"
    frame_stride: int = Field(default=3, ge=1, le=30)
    conf_threshold: float = Field(default=0.25, ge=0.0, le=1.0)
    iou_threshold: float = Field(default=0.45, ge=0.0, le=1.0)


class JobSummary(BaseModel):
    ai_count: int = 0
    ai_detected_frames: int = 0
    ai_category_count: int = 0
    processed_frames: int = 0


class JobSnapshot(BaseModel):
    job_id: str
    video_id: str
    status: JobStatus
    progress: int
    error_message: Optional[str] = None
    updated_at: str


class JobResultPayload(BaseModel):
    job_id: str
    video_id: str
    status: Literal["DONE"]
    summary: JobSummary
    coco: Dict[str, Any]


@dataclass
class JobRecord:
    job_id: str
    request: DetectJobRequest
    status: JobStatus = "QUEUED"
    progress: int = 0
    error_message: Optional[str] = None
    updated_at: str = field(default_factory=now_iso)
    result: Optional[Dict[str, Any]] = None
    summary: JobSummary = field(default_factory=JobSummary)
    cancel_event: threading.Event = field(default_factory=threading.Event)
    lock: threading.Lock = field(default_factory=threading.Lock)


class JobCanceled(Exception):
    pass


app = FastAPI(title="ultrasound-ai-worker", version="0.1.0")
_jobs_by_id: Dict[str, JobRecord] = {}
_latest_job_by_video: Dict[str, str] = {}
_jobs_lock = threading.Lock()
_model_cache: Dict[str, YOLO] = {}
_model_lock = threading.Lock()


def _snapshot(record: JobRecord) -> JobSnapshot:
    with record.lock:
        return JobSnapshot(
            job_id=record.job_id,
            video_id=record.request.video_id,
            status=record.status,
            progress=record.progress,
            error_message=record.error_message,
            updated_at=record.updated_at
        )


def _set_state(
    record: JobRecord,
    *,
    status: Optional[JobStatus] = None,
    progress: Optional[int] = None,
    error_message: Optional[str] = None
) -> None:
    with record.lock:
        if status is not None:
            record.status = status
        if progress is not None:
            record.progress = max(0, min(100, int(progress)))
        record.error_message = error_message
        record.updated_at = now_iso()


def _assert_not_canceled(record: JobRecord) -> None:
    if record.cancel_event.is_set():
        raise JobCanceled()


def _load_model(model_name: str) -> YOLO:
    with _model_lock:
        model = _model_cache.get(model_name)
        if model is None:
            model = YOLO(model_name)
            _model_cache[model_name] = model
        return model


def _load_timeline(timeline_path: Path) -> List[Dict[str, Any]]:
    text = timeline_path.read_text(encoding="utf-8")
    payload = json.loads(text)
    frames = payload.get("frames")
    if not isinstance(frames, list):
        return []
    return [frame for frame in frames if isinstance(frame, dict)]


def _resolve_frame_meta(frame_idx: int, frames: List[Dict[str, Any]], fps: float) -> Tuple[str, int, int]:
    if frame_idx < len(frames):
        frame = frames[frame_idx]
        display_index = int(frame.get("displayIndex") or (frame_idx + 1))
        pts_us_raw = frame.get("ptsUs")
        if isinstance(pts_us_raw, (int, float)) and math.isfinite(pts_us_raw):
            pts_us = int(pts_us_raw)
        elif fps > 0:
            pts_us = int(round((frame_idx / fps) * 1_000_000))
        else:
            pts_us = int(frame_idx * 33_333)
        frame_id = str(frame.get("frameId") or f"f_{display_index:06d}")
        return frame_id, display_index, pts_us

    display_index = frame_idx + 1
    pts_us = int(round((frame_idx / fps) * 1_000_000)) if fps > 0 else int(frame_idx * 33_333)
    return f"f_{display_index:06d}", display_index, pts_us


def _bbox_iou(lhs: Tuple[float, float, float, float], rhs: Tuple[float, float, float, float]) -> float:
    lx1, ly1, lx2, ly2 = lhs
    rx1, ry1, rx2, ry2 = rhs

    ix1 = max(lx1, rx1)
    iy1 = max(ly1, ry1)
    ix2 = min(lx2, rx2)
    iy2 = min(ly2, ry2)

    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0

    lhs_area = max(0.0, lx2 - lx1) * max(0.0, ly2 - ly1)
    rhs_area = max(0.0, rx2 - rx1) * max(0.0, ry2 - ry1)
    denom = lhs_area + rhs_area - inter
    if denom <= 0:
        return 0.0
    return inter / denom


def _assign_track_id(
    tracks: List[Dict[str, Any]],
    bbox_xyxy: Tuple[float, float, float, float],
    frame_idx: int,
    next_track_id: List[int]
) -> int:
    best_iou = 0.0
    best_track: Optional[Dict[str, Any]] = None

    for track in tracks:
        if frame_idx - int(track["last_frame_idx"]) > 12:
            continue
        score = _bbox_iou(track["bbox_xyxy"], bbox_xyxy)
        if score > best_iou:
            best_iou = score
            best_track = track

    if best_track is not None and best_iou >= 0.35:
        best_track["bbox_xyxy"] = bbox_xyxy
        best_track["last_frame_idx"] = frame_idx
        return int(best_track["track_id"])

    track_id = next_track_id[0]
    next_track_id[0] += 1
    tracks.append({
        "track_id": track_id,
        "bbox_xyxy": bbox_xyxy,
        "last_frame_idx": frame_idx
    })
    return track_id


def _run_detection(record: JobRecord) -> Tuple[Dict[str, Any], JobSummary]:
    request = record.request
    _assert_not_canceled(record)

    video_path = Path(request.video_path).resolve()
    timeline_path = Path(request.timeline_path).resolve()

    if not video_path.is_file():
        raise FileNotFoundError(f"video_path not found: {video_path}")
    if not timeline_path.is_file():
        raise FileNotFoundError(f"timeline_path not found: {timeline_path}")

    timeline_frames = _load_timeline(timeline_path)

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError("cannot open input video")

    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        estimated_frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if estimated_frame_count <= 0 and timeline_frames:
            estimated_frame_count = len(timeline_frames)

        total_for_progress = max(1, math.ceil(estimated_frame_count / request.frame_stride))

        model = _load_model(request.model)
        class_names_raw = getattr(model, "names", {})

        images: List[Dict[str, Any]] = []
        annotations: List[Dict[str, Any]] = []
        categories_map: Dict[int, Dict[str, Any]] = {}

        next_annotation_id = 1
        processed_frames = 0
        frame_idx = -1
        active_tracks: List[Dict[str, Any]] = []
        next_track_id = [1]

        while True:
            _assert_not_canceled(record)
            ok, frame = capture.read()
            if not ok:
                break
            frame_idx += 1

            if frame_idx % request.frame_stride != 0:
                continue

            processed_frames += 1

            frame_id, display_index, pts_us = _resolve_frame_meta(frame_idx, timeline_frames, fps)
            image_id = len(images) + 1
            height, width = frame.shape[:2]
            images.append({
                "id": image_id,
                "file_name": f"{frame_id}.jpg",
                "width": int(width),
                "height": int(height),
                "frame_index": int(display_index),
                "pts_us": int(pts_us)
            })

            infer = model.predict(
                source=frame,
                verbose=False,
                conf=request.conf_threshold,
                iou=request.iou_threshold
            )

            if infer:
                boxes = getattr(infer[0], "boxes", None)
                if boxes is not None and len(boxes) > 0:
                    xyxy = boxes.xyxy.cpu().numpy() if boxes.xyxy is not None else np.empty((0, 4), dtype=np.float32)
                    confs = (
                        boxes.conf.cpu().numpy() if boxes.conf is not None else np.ones(len(xyxy), dtype=np.float32)
                    )
                    classes = (
                        boxes.cls.cpu().numpy().astype(np.int64)
                        if boxes.cls is not None
                        else np.zeros(len(xyxy), dtype=np.int64)
                    )

                    for i in range(len(xyxy)):
                        x1, y1, x2, y2 = [float(v) for v in xyxy[i].tolist()]
                        w = max(0.0, x2 - x1)
                        h = max(0.0, y2 - y1)
                        if w <= 0.0 or h <= 0.0:
                            continue

                        class_idx = int(classes[i])
                        category_id = class_idx + 1
                        class_name = (
                            class_names_raw.get(class_idx)
                            if isinstance(class_names_raw, dict)
                            else class_names_raw[class_idx]
                            if isinstance(class_names_raw, list) and class_idx < len(class_names_raw)
                            else str(class_idx)
                        )
                        categories_map[category_id] = {
                            "id": category_id,
                            "name": str(class_name),
                            "supercategory": "ultrasound"
                        }

                        track_id = _assign_track_id(active_tracks, (x1, y1, x2, y2), frame_idx, next_track_id)

                        annotations.append({
                            "id": next_annotation_id,
                            "image_id": image_id,
                            "category_id": category_id,
                            "bbox": [round(x1, 3), round(y1, 3), round(w, 3), round(h, 3)],
                            "score": round(float(confs[i]), 6),
                            "track_id": int(track_id),
                            "frame_index": int(display_index),
                            "pts_us": int(pts_us),
                            "source": "AI"
                        })
                        next_annotation_id += 1

            active_tracks[:] = [track for track in active_tracks if frame_idx - int(track["last_frame_idx"]) <= 12]

            progress = min(99, int(round((processed_frames / total_for_progress) * 100)))
            _set_state(record, status="PROCESSING", progress=progress)

        if processed_frames == 0:
            raise RuntimeError("no frames processed")

        categories = [categories_map[key] for key in sorted(categories_map.keys())]
        detected_frames = len({int(item["frame_index"]) for item in annotations})

        return {
            "images": images,
            "annotations": annotations,
            "categories": categories
        }, JobSummary(
            ai_count=len(annotations),
            ai_detected_frames=detected_frames,
            ai_category_count=len(categories),
            processed_frames=processed_frames
        )
    finally:
        capture.release()


def _persist_result(output_path: Path, payload: Dict[str, Any]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _run_job(job_id: str) -> None:
    record = _jobs_by_id.get(job_id)
    if record is None:
        return

    _set_state(record, status="PROCESSING", progress=1)

    try:
        coco, summary = _run_detection(record)
        _assert_not_canceled(record)

        output_path = Path(record.request.output_path).resolve()
        _persist_result(output_path, coco)

        with record.lock:
            record.result = coco
            record.summary = summary

        _set_state(record, status="DONE", progress=100, error_message=None)
    except JobCanceled:
        _set_state(record, status="CANCELED", progress=0, error_message=None)
    except Exception as exc:  # noqa: BLE001
        _set_state(record, status="FAILED", progress=0, error_message=str(exc))


@app.get("/health")
def health() -> Dict[str, Any]:
    with _jobs_lock:
        total_jobs = len(_jobs_by_id)
        running_jobs = sum(1 for item in _jobs_by_id.values() if item.status in {"QUEUED", "PROCESSING"})

    return {
        "ok": True,
        "time": now_iso(),
        "jobs": {
            "total": total_jobs,
            "running": running_jobs
        }
    }


@app.post("/v1/jobs", response_model=JobSnapshot)
def create_job(payload: DetectJobRequest) -> JobSnapshot:
    video_path = Path(payload.video_path).resolve()
    timeline_path = Path(payload.timeline_path).resolve()

    if not video_path.is_file():
        raise HTTPException(status_code=400, detail="video_path not found")
    if not timeline_path.is_file():
        raise HTTPException(status_code=400, detail="timeline_path not found")

    with _jobs_lock:
        existing_id = _latest_job_by_video.get(payload.video_id)
        if existing_id is not None:
            existing = _jobs_by_id.get(existing_id)
            if existing is not None and existing.status in {"QUEUED", "PROCESSING"}:
                raise HTTPException(status_code=409, detail="job already running for this video")

        job_id = str(uuid.uuid4())
        record = JobRecord(job_id=job_id, request=payload)
        _jobs_by_id[job_id] = record
        _latest_job_by_video[payload.video_id] = job_id

        thread = threading.Thread(target=_run_job, args=(job_id,), daemon=True)
        thread.start()

    return _snapshot(record)


@app.get("/v1/jobs/{job_id}", response_model=JobSnapshot)
def get_job(job_id: str) -> JobSnapshot:
    record = _jobs_by_id.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="job not found")
    return _snapshot(record)


@app.get("/v1/jobs/by-video/{video_id}", response_model=JobSnapshot)
def get_job_by_video(video_id: str) -> JobSnapshot:
    with _jobs_lock:
        job_id = _latest_job_by_video.get(video_id)

    if job_id is None:
        raise HTTPException(status_code=404, detail="job not found")

    record = _jobs_by_id.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="job not found")

    return _snapshot(record)


@app.post("/v1/jobs/{job_id}/cancel", response_model=JobSnapshot)
def cancel_job(job_id: str) -> JobSnapshot:
    record = _jobs_by_id.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="job not found")

    should_return_snapshot = False
    with record.lock:
        if record.status in {"DONE", "FAILED", "CANCELED"}:
            should_return_snapshot = True

    if should_return_snapshot:
        return _snapshot(record)

    record.cancel_event.set()
    _set_state(record, status="CANCELED", progress=0, error_message=None)
    return _snapshot(record)


@app.get("/v1/jobs/{job_id}/result", response_model=JobResultPayload)
def get_job_result(job_id: str) -> JobResultPayload:
    record = _jobs_by_id.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="job not found")

    with record.lock:
        if record.status != "DONE" or record.result is None:
            raise HTTPException(status_code=409, detail="result not ready")

        return JobResultPayload(
            job_id=record.job_id,
            video_id=record.request.video_id,
            status="DONE",
            summary=record.summary,
            coco=record.result
        )
