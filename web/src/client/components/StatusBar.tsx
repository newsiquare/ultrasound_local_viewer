"use client";

import { BootstrapData } from "@/client/types";

interface StatusBarProps {
  bootstrapData: BootstrapData | null;
  currentDisplayIndex: number | null;
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function StatusBar({ bootstrapData, currentDisplayIndex }: StatusBarProps) {
  const meta = bootstrapData?.meta ?? null;
  const timeline = bootstrapData?.timelineSummary ?? null;

  const parts: string[] = [];

  if (meta?.video_width && meta?.video_height) {
    parts.push(`${meta.video_width}×${meta.video_height}`);
  }
  if (meta?.source_fps) {
    const fps = meta.source_fps;
    parts.push(`${Number.isInteger(fps) ? fps : fps.toFixed(3)} fps`);
  }
  if (meta?.duration_sec) {
    parts.push(fmtDuration(meta.duration_sec));
  }
  if (timeline?.totalFrames) {
    parts.push(`${timeline.totalFrames} 幀`);
  }
  if (meta?.video_codec) {
    parts.push(meta.video_codec.toUpperCase());
  }

  const frameLabel = currentDisplayIndex != null ? `f:${currentDisplayIndex}` : null;

  return (
    <div
      style={{
        height: 24,
        background: "#080910",
        borderTop: "1px solid #1e2030",
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        flexShrink: 0,
        gap: 0,
        overflow: "hidden"
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "#585a78",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: 0.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1
        }}
      >
        {parts.length > 0 ? parts.join("  ·  ") : (bootstrapData ? "載入中…" : "未選取影片")}
      </span>
      {frameLabel && (
        <span
          style={{
            fontSize: 11,
            color: "#4f6080",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
            marginLeft: 16,
            letterSpacing: 0.3
          }}
        >
          {frameLabel}
        </span>
      )}
    </div>
  );
}
