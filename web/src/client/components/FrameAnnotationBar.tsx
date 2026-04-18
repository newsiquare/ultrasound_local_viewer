"use client";

import { useCallback, useEffect, useState } from "react";

import { TimelineFrame } from "@/client/types";

interface FrameAnnotationBarProps {
  frames: TimelineFrame[];
  durationSec: number;
  /** frameId → array of category hex colors to display as tick marks */
  frameMarks: Map<string, string[]>;
  onSeekToDisplayIndex?: (displayIndex: number) => void;
}

interface TooltipState {
  x: number;
  label: string;
}

export function FrameAnnotationBar({
  frames,
  durationSec,
  frameMarks,
  onSeekToDisplayIndex,
}: FrameAnnotationBarProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Build a map of frameId → frame for quick lookup
  const [frameMap, setFrameMap] = useState<Map<string, TimelineFrame>>(new Map());

  useEffect(() => {
    const m = new Map<string, TimelineFrame>();
    for (const f of frames) {
      m.set(f.frameId, f);
    }
    setFrameMap(m);
  }, [frames]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const pct = relX / rect.width;

      // Find the closest frame mark to cursor
      if (durationSec <= 0 || frames.length === 0) return;

      const cursorTimeSec = pct * durationSec;
      const cursorPtsUs = cursorTimeSec * 1_000_000;

      let closestFrame: TimelineFrame | null = null;
      let closestDist = Infinity;

      for (const [fid] of frameMarks) {
        const frame = frameMap.get(fid);
        if (!frame) continue;
        const dist = Math.abs(frame.ptsUs - cursorPtsUs);
        if (dist < closestDist) {
          closestDist = dist;
          closestFrame = frame;
        }
      }

      if (closestFrame && closestDist < (durationSec * 1_000_000) / frames.length * 3) {
        const colors = frameMarks.get(closestFrame.frameId) ?? [];
        setTooltip({
          x: relX,
          label: `f:${closestFrame.displayIndex} (${colors.length} 筆標註)`,
        });
      } else {
        setTooltip(null);
      }
    },
    [durationSec, frameMap, frameMarks, frames]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSeekToDisplayIndex || durationSec <= 0 || frames.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const cursorTimeSec = pct * durationSec;
      const cursorPtsUs = cursorTimeSec * 1_000_000;

      let closestFrame: TimelineFrame | null = null;
      let closestDist = Infinity;

      for (const [fid] of frameMarks) {
        const frame = frameMap.get(fid);
        if (!frame) continue;
        const dist = Math.abs(frame.ptsUs - cursorPtsUs);
        if (dist < closestDist) {
          closestDist = dist;
          closestFrame = frame;
        }
      }

      if (closestFrame) {
        onSeekToDisplayIndex(closestFrame.displayIndex);
      }
    },
    [durationSec, frameMap, frameMarks, frames, onSeekToDisplayIndex]
  );

  if (frameMarks.size === 0 || durationSec <= 0) {
    return <div style={{ height: 8 }} />;
  }

  const marks: Array<{ pct: number; colors: string[]; displayIndex: number }> = [];
  for (const [fid, colors] of frameMarks) {
    const frame = frameMap.get(fid);
    if (!frame) continue;
    const pct = (frame.ptsUs / (durationSec * 1_000_000)) * 100;
    marks.push({ pct: Math.min(100, Math.max(0, pct)), colors, displayIndex: frame.displayIndex });
  }

  return (
    <div
      style={{ position: "relative", height: 8, cursor: "pointer" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* Track background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "transparent",
        }}
      />

      {/* Ticks */}
      {marks.map(({ pct, colors, displayIndex }) => {
        const primaryColor = colors[0] ?? "#f59e0b";
        return (
          <div
            key={`tick-${displayIndex}`}
            style={{
              position: "absolute",
              left: `${pct}%`,
              top: 1,
              width: 2,
              height: 6,
              background: primaryColor,
              borderRadius: 1,
              transform: "translateX(-50%)",
              opacity: 0.85,
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            bottom: "110%",
            transform: "translateX(-50%)",
            background: "rgba(15,16,24,0.95)",
            border: "1px solid #3c3e58",
            borderRadius: 4,
            padding: "2px 6px",
            fontSize: 10,
            color: "#c9ccd8",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 50,
          }}
        >
          {tooltip.label}
        </div>
      )}
    </div>
  );
}
