#!/usr/bin/env python3
"""Generate a local file-management report for videos.

Outputs at least:
- video_id
- uploaded_at
- category_count / annotation_count
- ai_status
- ai_category_count / ai_annotation_count
- video metadata
"""

from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import sys
from pathlib import Path
from typing import Dict, List, Optional, Set


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return bool(row)


def get_columns(conn: sqlite3.Connection, table: str) -> Set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}


def query_count_by_video(conn: sqlite3.Connection, table: str) -> Dict[str, int]:
    if not table_exists(conn, table):
        return {}
    cols = get_columns(conn, table)
    if "video_id" not in cols:
        return {}
    out: Dict[str, int] = {}
    for vid, cnt in conn.execute(f"SELECT video_id, COUNT(*) FROM {table} GROUP BY video_id"):
        out[str(vid)] = int(cnt)
    return out


def read_json_file(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None


def get_coco_counts(coco: Optional[dict]) -> Dict[str, int]:
    if not coco:
        return {"ai_annotation_count": 0, "ai_category_count": 0}
    anns = coco.get("annotations") or []
    cats = coco.get("categories") or []
    cat_count = len(cats)
    if cat_count == 0 and anns:
        # fallback by category_id uniqueness
        cat_ids = {a.get("category_id") for a in anns if a.get("category_id") is not None}
        cat_count = len(cat_ids)
    return {
        "ai_annotation_count": len(anns),
        "ai_category_count": cat_count,
    }


def format_metadata(row: dict) -> str:
    width = row.get("video_width")
    height = row.get("video_height")
    fps = row.get("source_fps")
    duration = row.get("duration_sec")
    size = row.get("file_size_bytes")
    codec = row.get("video_codec")

    parts: List[str] = []
    if width and height:
        parts.append(f"{width}x{height}")
    if fps is not None:
        parts.append(f"{fps}fps")
    if duration is not None:
        parts.append(f"{duration}s")
    if size is not None:
        parts.append(f"{size}bytes")
    if codec:
        parts.append(str(codec))
    return ", ".join(parts)


def fetch_videos(conn: sqlite3.Connection) -> List[dict]:
    if not table_exists(conn, "videos"):
        raise RuntimeError("Table 'videos' not found.")

    cols = get_columns(conn, "videos")

    select_cols: List[str] = ["id"]
    optional = [
        "filename",
        "uploaded_at",
        "created_at",
        "ai_status",
        "ai_count",
        "ai_category_count",
        "video_width",
        "video_height",
        "source_fps",
        "duration_sec",
        "file_size_bytes",
        "video_codec",
        "pixel_format",
    ]
    for c in optional:
        if c in cols:
            select_cols.append(c)

    sql = f"SELECT {', '.join(select_cols)} FROM videos ORDER BY COALESCE(uploaded_at, created_at) DESC"
    rows: List[dict] = []
    for db_row in conn.execute(sql):
        item = dict(zip(select_cols, db_row))
        item["video_id"] = str(item.pop("id"))
        rows.append(item)
    return rows


def build_report_rows(db_path: Path, videos_dir: Path) -> List[dict]:
    conn = sqlite3.connect(str(db_path))
    try:
        videos = fetch_videos(conn)
        category_counts = query_count_by_video(conn, "categories")
        annotation_counts = query_count_by_video(conn, "annotations")
        ai_job_status: Dict[str, str] = {}

        if table_exists(conn, "ai_jobs") and "video_id" in get_columns(conn, "ai_jobs"):
            cols = get_columns(conn, "ai_jobs")
            status_col = "status" if "status" in cols else None
            if status_col:
                for vid, status in conn.execute("SELECT video_id, status FROM ai_jobs"):
                    ai_job_status[str(vid)] = str(status or "")

        out: List[dict] = []
        for v in videos:
            vid = v["video_id"]
            uploaded_at = v.get("uploaded_at") or v.get("created_at")

            category_count = int(category_counts.get(vid, 0))
            annotation_count = int(annotation_counts.get(vid, 0))

            ai_status = str(v.get("ai_status") or ai_job_status.get(vid, "IDLE") or "IDLE")

            ai_annotation_count = v.get("ai_count")
            ai_category_count = v.get("ai_category_count")

            # fallback from COCO if DB counters not available
            coco_path = videos_dir / vid / "ai" / "latest.coco.json"
            coco_counts = get_coco_counts(read_json_file(coco_path))
            if ai_annotation_count is None:
                ai_annotation_count = coco_counts["ai_annotation_count"]
            if ai_category_count is None:
                ai_category_count = coco_counts["ai_category_count"]

            # metadata fallback from metadata.json
            metadata_path = videos_dir / vid / "metadata.json"
            metadata_json = read_json_file(metadata_path) or {}

            merged = dict(v)
            for k in (
                "video_width",
                "video_height",
                "source_fps",
                "duration_sec",
                "file_size_bytes",
                "video_codec",
                "pixel_format",
            ):
                if merged.get(k) is None and metadata_json.get(k) is not None:
                    merged[k] = metadata_json.get(k)

            row = {
                "video_id": vid,
                "uploaded_at": uploaded_at,
                "category_count": category_count,
                "annotation_count": annotation_count,
                "ai_status": ai_status,
                "ai_category_count": int(ai_category_count or 0),
                "ai_annotation_count": int(ai_annotation_count or 0),
                "metadata": {
                    "video_width": merged.get("video_width"),
                    "video_height": merged.get("video_height"),
                    "source_fps": merged.get("source_fps"),
                    "duration_sec": merged.get("duration_sec"),
                    "file_size_bytes": merged.get("file_size_bytes"),
                    "video_codec": merged.get("video_codec"),
                    "pixel_format": merged.get("pixel_format"),
                },
                "metadata_summary": format_metadata(merged),
            }
            out.append(row)

        return out
    finally:
        conn.close()


def print_table(rows: List[dict]) -> None:
    headers = [
        "video_id",
        "uploaded_at",
        "category_count",
        "annotation_count",
        "ai_status",
        "ai_category_count",
        "ai_annotation_count",
        "metadata_summary",
    ]

    str_rows: List[List[str]] = []
    for r in rows:
        str_rows.append([
            str(r.get("video_id", "")),
            str(r.get("uploaded_at", "")),
            str(r.get("category_count", 0)),
            str(r.get("annotation_count", 0)),
            str(r.get("ai_status", "")),
            str(r.get("ai_category_count", 0)),
            str(r.get("ai_annotation_count", 0)),
            str(r.get("metadata_summary", "")),
        ])

    widths = [len(h) for h in headers]
    for row in str_rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(cell))

    line = " | ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    print(line)
    print("-" * len(line))
    for row in str_rows:
        print(" | ".join(row[i].ljust(widths[i]) for i in range(len(headers))))


def print_csv(rows: List[dict]) -> None:
    writer = csv.writer(sys.stdout)
    writer.writerow([
        "video_id",
        "uploaded_at",
        "category_count",
        "annotation_count",
        "ai_status",
        "ai_category_count",
        "ai_annotation_count",
        "metadata_json",
    ])
    for r in rows:
        writer.writerow([
            r.get("video_id", ""),
            r.get("uploaded_at", ""),
            r.get("category_count", 0),
            r.get("annotation_count", 0),
            r.get("ai_status", ""),
            r.get("ai_category_count", 0),
            r.get("ai_annotation_count", 0),
            json.dumps(r.get("metadata", {}), ensure_ascii=False),
        ])


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Show file-management report for local videos.")
    p.add_argument("--db", default="storage/app.db", help="SQLite DB path (default: storage/app.db)")
    p.add_argument(
        "--videos-dir",
        default="storage/videos",
        help="Videos root directory (default: storage/videos)",
    )
    p.add_argument(
        "--format",
        choices=["table", "json", "csv"],
        default="table",
        help="Output format",
    )
    p.add_argument("--video-id", default=None, help="Filter by specific video_id")
    p.add_argument("--limit", type=int, default=0, help="Max rows (0 means no limit)")
    return p.parse_args()


def main() -> int:
    args = parse_args()

    db_path = Path(args.db).resolve()
    videos_dir = Path(args.videos_dir).resolve()

    if not db_path.exists():
        print(f"DB not found: {db_path}", file=sys.stderr)
        return 2

    rows = build_report_rows(db_path=db_path, videos_dir=videos_dir)

    if args.video_id:
        rows = [r for r in rows if r.get("video_id") == args.video_id]
    if args.limit > 0:
        rows = rows[: args.limit]

    if args.format == "json":
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    elif args.format == "csv":
        print_csv(rows)
    else:
        print_table(rows)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
