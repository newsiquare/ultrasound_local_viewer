#!/usr/bin/env python3
"""Cleanup local videos with configurable retention, preview, and safe-keep rules.

Default behavior is dry-run preview. Use --apply to actually delete.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import shutil
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Set, Tuple


@dataclass
class VideoRow:
    video_id: str
    filename: str
    uploaded_at_raw: str
    uploaded_at: dt.datetime
    ai_status: str
    local_path: Optional[str]


@dataclass
class Candidate:
    row: VideoRow
    reason: str


def parse_dt(value: str) -> Optional[dt.datetime]:
    if not value:
        return None
    text = value.strip()
    # Accept common ISO formats: "2026-04-17T10:00:00Z", "2026-04-17 10:00:00"
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        out = dt.datetime.fromisoformat(text)
        if out.tzinfo is None:
            return out.replace(tzinfo=dt.timezone.utc)
        return out.astimezone(dt.timezone.utc)
    except ValueError:
        # fallback: plain date
        try:
            out2 = dt.datetime.strptime(value[:19], "%Y-%m-%d %H:%M:%S")
            return out2.replace(tzinfo=dt.timezone.utc)
        except ValueError:
            return None


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return bool(row)


def get_columns(conn: sqlite3.Connection, table: str) -> Set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}


def pick_timestamp_column(cols: Set[str]) -> Optional[str]:
    for candidate in ("uploaded_at", "created_at", "updated_at"):
        if candidate in cols:
            return candidate
    return None


def fetch_videos(conn: sqlite3.Connection) -> List[VideoRow]:
    if not table_exists(conn, "videos"):
        raise RuntimeError("Table 'videos' not found in DB.")

    cols = get_columns(conn, "videos")
    ts_col = pick_timestamp_column(cols)
    if not ts_col:
        raise RuntimeError("Table 'videos' has no uploaded_at/created_at/updated_at column.")

    if "id" not in cols:
        raise RuntimeError("Table 'videos' has no 'id' column.")

    filename_col = "filename" if "filename" in cols else "id"
    ai_status_col = "ai_status" if "ai_status" in cols else "''"
    local_path_col = "local_path" if "local_path" in cols else "NULL"

    sql = (
        f"SELECT id, {filename_col} AS filename, {ts_col} AS uploaded_at, "
        f"{ai_status_col} AS ai_status, {local_path_col} AS local_path "
        "FROM videos"
    )

    out: List[VideoRow] = []
    for row in conn.execute(sql):
        video_id = str(row[0])
        filename = str(row[1] or video_id)
        uploaded_at_raw = str(row[2] or "")
        parsed = parse_dt(uploaded_at_raw)
        if not parsed:
            # Skip undated rows for safety.
            continue
        ai_status = str(row[3] or "").upper()
        local_path = str(row[4]) if row[4] else None
        out.append(
            VideoRow(
                video_id=video_id,
                filename=filename,
                uploaded_at_raw=uploaded_at_raw,
                uploaded_at=parsed,
                ai_status=ai_status,
                local_path=local_path,
            )
        )
    return out


def disk_usage_percent(path: Path) -> float:
    usage = shutil.disk_usage(path)
    if usage.total <= 0:
        return 0.0
    return (usage.used / usage.total) * 100.0


def choose_candidates(
    rows: Sequence[VideoRow],
    now_utc: dt.datetime,
    retention_days: int,
    keep_latest: int,
    keep_statuses: Set[str],
    high_watermark_percent: Optional[float],
    videos_dir: Path,
    limit: int,
) -> Tuple[List[Candidate], float]:
    by_filename: Dict[str, List[VideoRow]] = {}
    for r in rows:
        by_filename.setdefault(r.filename, []).append(r)

    protected_ids: Set[str] = set()
    for _, group in by_filename.items():
        group_sorted = sorted(group, key=lambda x: x.uploaded_at, reverse=True)
        for r in group_sorted[: max(keep_latest, 0)]:
            protected_ids.add(r.video_id)

    cutoff = now_utc - dt.timedelta(days=retention_days)

    aged: List[Candidate] = []
    remaining: List[Candidate] = []

    for r in rows:
        if r.video_id in protected_ids:
            continue
        if r.ai_status in keep_statuses:
            continue
        if r.uploaded_at <= cutoff:
            aged.append(Candidate(row=r, reason=f"older_than_{retention_days}d"))
        else:
            remaining.append(Candidate(row=r, reason="disk_pressure"))

    aged.sort(key=lambda c: c.row.uploaded_at)
    selected: List[Candidate] = list(aged)

    usage_pct = disk_usage_percent(videos_dir)
    if high_watermark_percent is not None and usage_pct >= high_watermark_percent:
        remaining.sort(key=lambda c: c.row.uploaded_at)
        selected.extend(remaining)

    if limit > 0:
        selected = selected[:limit]

    return selected, usage_pct


def human_age_days(then_utc: dt.datetime, now_utc: dt.datetime) -> int:
    return int((now_utc - then_utc).total_seconds() // 86400)


def compute_video_delete_paths(videos_dir: Path, row: VideoRow) -> List[Path]:
    paths: List[Path] = []

    # Primary convention: storage/videos/{videoId}
    paths.append(videos_dir / row.video_id)

    # If local_path exists, also try parent directory (only if under videos_dir).
    if row.local_path:
        lp = Path(row.local_path)
        parent = lp.parent
        try:
            if parent.exists() and parent.resolve().is_relative_to(videos_dir.resolve()):
                if parent not in paths:
                    paths.append(parent)
        except Exception:
            pass

    # Keep unique in insertion order.
    seen: Set[str] = set()
    unique: List[Path] = []
    for p in paths:
        key = str(p)
        if key in seen:
            continue
        seen.add(key)
        unique.append(p)
    return unique


def ensure_backup(db_path: Path) -> Path:
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = backup_dir / f"{db_path.stem}-{stamp}.sqlite3"
    shutil.copy2(db_path, backup_path)
    return backup_path


def apply_deletions(
    conn: sqlite3.Connection,
    candidates: Sequence[Candidate],
    videos_dir: Path,
) -> Tuple[int, int, List[str]]:
    deleted_rows = 0
    deleted_dirs = 0
    errors: List[str] = []

    # 1) Remove files first for each candidate; if file deletion fails, skip DB deletion for safety.
    can_delete_ids: List[str] = []
    for c in candidates:
        row = c.row
        ok = True
        for p in compute_video_delete_paths(videos_dir, row):
            if not p.exists():
                continue
            try:
                if p.is_dir():
                    shutil.rmtree(p)
                else:
                    p.unlink()
                deleted_dirs += 1
            except Exception as exc:  # noqa: BLE001
                ok = False
                errors.append(f"Failed to delete path {p}: {exc}")
                break
        if ok:
            can_delete_ids.append(row.video_id)

    if not can_delete_ids:
        return deleted_rows, deleted_dirs, errors

    # 2) Delete DB rows in one transaction.
    with conn:
        if table_exists(conn, "ai_jobs"):
            conn.executemany("DELETE FROM ai_jobs WHERE video_id = ?", [(vid,) for vid in can_delete_ids])
        conn.executemany("DELETE FROM videos WHERE id = ?", [(vid,) for vid in can_delete_ids])

    deleted_rows = len(can_delete_ids)
    return deleted_rows, deleted_dirs, errors


def print_preview(candidates: Sequence[Candidate], now_utc: dt.datetime) -> None:
    if not candidates:
        print("No cleanup candidates.")
        return

    print("Candidates:")
    print("video_id | filename | uploaded_at | age_days | ai_status | reason")
    print("-" * 120)
    for c in candidates:
        r = c.row
        print(
            f"{r.video_id} | {r.filename} | {r.uploaded_at_raw} | "
            f"{human_age_days(r.uploaded_at, now_utc)} | {r.ai_status or '-'} | {c.reason}"
        )


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Cleanup local uploaded videos with safe retention rules.")
    p.add_argument("--db", default="storage/app.db", help="SQLite DB path (default: storage/app.db)")
    p.add_argument(
        "--videos-dir",
        default="storage/videos",
        help="Videos root directory (default: storage/videos)",
    )
    p.add_argument("--retention-days", type=int, default=30, help="Delete videos older than N days")
    p.add_argument(
        "--keep-latest",
        type=int,
        default=2,
        help="Keep latest N rows per filename (safe retention)",
    )
    p.add_argument(
        "--keep-statuses",
        default="PROCESSING",
        help="Comma-separated statuses that should never be deleted (default: PROCESSING)",
    )
    p.add_argument(
        "--high-watermark-percent",
        type=float,
        default=None,
        help="If set and disk usage >= threshold, also delete newer non-protected rows",
    )
    p.add_argument("--limit", type=int, default=200, help="Max rows to delete in one run")
    p.add_argument("--apply", action="store_true", help="Actually delete (default is dry-run)")
    p.add_argument(
        "--no-backup",
        action="store_true",
        help="Do not backup DB before apply (not recommended)",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()

    db_path = Path(args.db).resolve()
    videos_dir = Path(args.videos_dir).resolve()

    if not db_path.exists():
        print(f"DB not found: {db_path}", file=sys.stderr)
        return 2
    if not videos_dir.exists():
        print(f"Videos dir not found: {videos_dir}", file=sys.stderr)
        return 2

    keep_statuses = {s.strip().upper() for s in args.keep_statuses.split(",") if s.strip()}
    now_utc = dt.datetime.now(dt.timezone.utc)

    conn = sqlite3.connect(str(db_path))
    try:
        rows = fetch_videos(conn)
        candidates, usage_pct = choose_candidates(
            rows=rows,
            now_utc=now_utc,
            retention_days=args.retention_days,
            keep_latest=args.keep_latest,
            keep_statuses=keep_statuses,
            high_watermark_percent=args.high_watermark_percent,
            videos_dir=videos_dir,
            limit=args.limit,
        )

        print(f"DB: {db_path}")
        print(f"Videos dir: {videos_dir}")
        print(f"Disk usage: {usage_pct:.2f}%")
        print(
            "Mode: "
            + ("APPLY (will delete)" if args.apply else "DRY-RUN (preview only)")
        )
        print_preview(candidates, now_utc)

        if not args.apply:
            return 0

        if not args.no_backup:
            backup_path = ensure_backup(db_path)
            print(f"DB backup created: {backup_path}")

        deleted_rows, deleted_dirs, errors = apply_deletions(conn, candidates, videos_dir)
        print(f"Deleted DB rows: {deleted_rows}")
        print(f"Deleted filesystem paths: {deleted_dirs}")

        if errors:
            print("Errors:")
            for e in errors:
                print(f"- {e}")
            return 1

        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
