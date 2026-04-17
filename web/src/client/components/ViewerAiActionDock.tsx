"use client";

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

function badgeColor(status: AiStatus): string {
  switch (status) {
    case "PROCESSING":
      return "#f59e0b";
    case "DONE":
      return "#22c55e";
    case "FAILED":
      return "#ef4444";
    case "CANCELED":
      return "#6b7280";
    default:
      return "#3b82f6";
  }
}

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

  const canStart = hasVideo && timelineReady && status !== "PROCESSING" && !isMutating;
  const showCancel = status === "PROCESSING";

  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        display: "grid",
        gap: 8,
        justifyItems: "end"
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => void onStart()} disabled={!canStart}>
          {isMutating && status !== "PROCESSING" ? "啟動中..." : "開始辨識"}
        </button>
        {showCancel ? (
          <button type="button" onClick={() => void onCancel()} disabled={isMutating}>
            {isMutating ? "取消中..." : "取消辨識"}
          </button>
        ) : null}
      </div>

      <div
        style={{
          padding: "6px 10px",
          borderRadius: 999,
          background: badgeColor(status),
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          minWidth: 100,
          textAlign: "center"
        }}
      >
        {status}
      </div>

      {status === "PROCESSING" ? (
        <div
          style={{
            padding: "4px 8px",
            borderRadius: 999,
            background: "rgba(17,24,39,0.75)",
            color: "#fff",
            fontSize: 12
          }}
        >
          {progress}%
        </div>
      ) : null}

      {(errorMessage || notice) && (
        <div
          style={{
            maxWidth: 320,
            borderRadius: 8,
            padding: 8,
            background: "rgba(17,24,39,0.8)",
            color: "#fff",
            fontSize: 12,
            display: "grid",
            gap: 6
          }}
        >
          <div>{errorMessage ?? notice}</div>
          <button type="button" onClick={onDismissNotice}>
            關閉
          </button>
        </div>
      )}
    </div>
  );
}
