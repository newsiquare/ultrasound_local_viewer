"use client";

import { Brain, Loader2, X } from "lucide-react";

import { AiStatus } from "@/client/types";

interface ViewerAiActionDockProps {
  status: AiStatus;
  progress: number;
  isMutating: boolean;
  timelineReady: boolean;
  hasVideo: boolean;
  errorMessage: string | null;
  notice: string | null;
  onDismissNotice: () => void;
  onStart: () => Promise<void>;
  onCancel: () => Promise<void>;
}

const STATUS_CONFIG: Record<AiStatus, { label: string; color: string; pulse: boolean }> = {
  IDLE: { label: "IDLE", color: "#4b5580", pulse: false },
  PROCESSING: { label: "處理中", color: "#f59e0b", pulse: true },
  DONE: { label: "完成", color: "#34d399", pulse: false },
  FAILED: { label: "失敗", color: "#f87171", pulse: false },
  CANCELED: { label: "已取消", color: "#6b7280", pulse: false }
};

export function ViewerAiActionDock(props: ViewerAiActionDockProps) {
  const {
    status,
    progress,
    isMutating,
    timelineReady,
    hasVideo,
    errorMessage,
    notice,
    onDismissNotice,
    onStart,
    onCancel
  } = props;

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.IDLE;
  const canStart = hasVideo && timelineReady && status !== "PROCESSING" && !isMutating;
  const showCancel = status === "PROCESSING";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 8px",
        background: "#13141f",
        borderBottom: "1px solid #1e2035",
        flexShrink: 0,
        flexWrap: "wrap"
      }}
    >
      {/* AI label */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Brain size={13} style={{ color: "#5a5c7a" }} />
        <span style={{ fontSize: 11, color: "#5a5c7a", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
          AI
        </span>
      </div>

      {/* Status badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "2px 8px",
          borderRadius: 999,
          background: `${cfg.color}22`,
          border: `1px solid ${cfg.color}55`,
          fontSize: 11,
          fontWeight: 600,
          color: cfg.color
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: cfg.color,
            animation: cfg.pulse ? "pulse-dot 1.2s ease-in-out infinite" : "none"
          }}
        />
        {cfg.label}
        {status === "PROCESSING" ? ` ${progress}%` : ""}
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
          border: `1px solid ${canStart ? "rgba(79,140,255,0.3)" : "#2e2f45"}`,
          color: canStart ? "#4f8cff" : "#3a3c55",
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
            color: errorMessage ? "#f87171" : "#7c7e9a"
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
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}
