"use client";

import { Brain, Loader2, X } from "lucide-react";

import { AiStatus } from "@/client/types";

interface ViewerAiActionDockProps {
  status: AiStatus;
  statusLoading?: boolean;
  progress: number;
  durationMs: number | null;
  isMutating: boolean;
  timelineReady: boolean;
  hasVideo: boolean;
  errorMessage: string | null;
  notice: string | null;
  onDismissNotice: () => void;
  onStart: () => Promise<void>;
  onCancel: () => Promise<void>;
  embedded?: boolean;
}

const STATUS_CONFIG: Record<AiStatus, { label: string; color: string }> = {
  IDLE: { label: "IDLE", color: "#7880a0" },
  PROCESSING: { label: "處理中", color: "#f59e0b" },
  DONE: { label: "完成", color: "#34d399" },
  FAILED: { label: "失敗", color: "#f87171" },
  CANCELED: { label: "已取消", color: "#6b7280" }
};

function formatDurationLabel(durationMs: number | null): string | null {
  if (durationMs === null || !Number.isFinite(durationMs)) {
    return null;
  }

  const seconds = Math.max(0, durationMs) / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} 秒`;
  }

  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const restSeconds = rounded % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

export function ViewerAiActionDock(props: ViewerAiActionDockProps) {
  const {
    status,
    statusLoading = false,
    progress,
    durationMs,
    isMutating,
    timelineReady,
    hasVideo,
    errorMessage,
    notice,
    onDismissNotice,
    onStart,
    onCancel,
    embedded = false
  } = props;

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.IDLE;
  const canStart = hasVideo && timelineReady && status !== "PROCESSING" && !isMutating;
  const showCancel = status === "PROCESSING";
  const durationLabel = formatDurationLabel(durationMs);
  const showDuration = durationLabel !== null && status !== "IDLE";
  const durationPrefix = status === "PROCESSING" ? "" : "耗時 ";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: embedded ? 0 : "4px 8px",
        background: embedded ? "transparent" : "#0f1018",
        borderBottom: embedded ? "none" : "1px solid #252638",
        flexShrink: 0,
        flexWrap: "nowrap"
      }}
    >
      {/* AI label */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Brain size={13} style={{ color: "#9699b0" }} />
        <span style={{ fontSize: 11, color: "#9699b0", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
          AI
        </span>
      </div>

      {/* Status badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 999,
          background: statusLoading ? "rgba(120,128,160,0.14)" : `${cfg.color}22`,
          border: statusLoading ? "1px solid rgba(120,128,160,0.35)" : `1px solid ${cfg.color}55`,
          fontSize: 11,
          fontWeight: 600,
          color: statusLoading ? "#9ca3b9" : cfg.color
        }}
      >
        {statusLoading ? "同步中" : cfg.label}
        {!statusLoading && status === "PROCESSING" ? ` ${progress}%` : ""}
        {!statusLoading && showDuration ? `（${durationPrefix}${durationLabel}）` : ""}
      </div>

      {/* Start button */}
      <button
        type="button"
        onClick={() => void onStart()}
        disabled={!canStart}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          background: canStart ? "rgba(79,140,255,0.15)" : "transparent",
          border: `1px solid ${canStart ? "rgba(79,140,255,0.3)" : "#3c3e58"}`,
          color: canStart ? "#4f8cff" : "#585a78",
          cursor: canStart ? "pointer" : "not-allowed",
          opacity: canStart ? 1 : 0.5,
          fontFamily: "inherit",
          transition: "background 0.15s"
        }}
      >
        {isMutating && status !== "PROCESSING" ? (
          <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
        ) : null}
        開始辨識
      </button>

      {/* Cancel button */}
      {showCancel && (
        <button
          type="button"
          onClick={() => void onCancel()}
          disabled={isMutating}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.25)",
            color: "#f87171",
            cursor: isMutating ? "not-allowed" : "pointer",
            opacity: isMutating ? 0.5 : 1,
            fontFamily: "inherit"
          }}
        >
          {isMutating ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : null}
          取消辨識
        </button>
      )}

      {/* Error/notice */}
      {(errorMessage || notice) && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px",
            borderRadius: 6,
            fontSize: 11,
            background: errorMessage ? "rgba(248,113,113,0.1)" : "rgba(79,140,255,0.1)",
            border: errorMessage ? "1px solid rgba(248,113,113,0.2)" : "1px solid rgba(79,140,255,0.2)",
            color: errorMessage ? "#f87171" : "#c9ccd8"
          }}
        >
          {errorMessage ?? notice}
          <button
            type="button"
            onClick={onDismissNotice}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "inherit",
              display: "flex",
              opacity: 0.7
            }}
          >
            <X size={10} />
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
