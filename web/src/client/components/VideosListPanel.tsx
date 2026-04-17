"use client";

import { RefreshCw } from "lucide-react";

import { VideoListItem } from "@/client/types";

interface VideosListPanelProps {
  items: VideoListItem[];
  currentVideoId: string | null;
  loading: boolean;
  onSelect: (videoId: string) => void;
  onReload: () => Promise<void>;
}

function statusDot(aiStatus: string, timelineStatus: string): { color: string; title: string } {
  if (aiStatus === "PROCESSING") return { color: "#fbbf24", title: "AI 處理中" };
  if (aiStatus === "DONE" && timelineStatus === "READY") return { color: "#34d399", title: "就緒" };
  if (aiStatus === "FAILED") return { color: "#f87171", title: "AI 失敗" };
  if (timelineStatus === "READY") return { color: "#60a5fa", title: "有 timeline" };
  return { color: "#7880a0", title: "尚未處理" };
}

export function VideosListPanel(props: VideosListPanelProps) {
  const { items, currentVideoId, loading, onSelect, onReload } = props;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0f1018",
        overflow: "hidden"
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 12px 8px",
          borderBottom: "1px solid #252638",
          flexShrink: 0
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: "#9699b0", textTransform: "uppercase", letterSpacing: 0.8 }}>
          影片列表
        </span>
        <button
          type="button"
          onClick={() => void onReload()}
          disabled={loading}
          title="刷新列表"
          style={{
            background: "none",
            border: "none",
            padding: 4,
            cursor: loading ? "not-allowed" : "pointer",
            color: loading ? "#585a78" : "#9699b0",
            display: "flex",
            alignItems: "center",
            borderRadius: 4,
            transition: "color 0.15s"
          }}
        >
          <RefreshCw size={13} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {items.length === 0 && !loading ? (
          <div style={{ padding: "20px 12px", fontSize: 12, color: "#585a78", textAlign: "center" }}>
            暫無影片
          </div>
        ) : null}

        {items.map((item) => {
          const isSelected = item.id === currentVideoId;
          const dot = statusDot(item.ai_status, item.timeline_status);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px 8px 14px",
                background: isSelected ? "rgba(79,140,255,0.1)" : "transparent",
                border: "none",
                borderLeft: isSelected ? "3px solid #4f8cff" : "3px solid transparent",
                cursor: "pointer",
                transition: "background 0.1s",
                fontFamily: "inherit"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: dot.color,
                    flexShrink: 0,
                    boxShadow: isSelected ? `0 0 6px ${dot.color}` : "none"
                  }}
                  title={dot.title}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? "#c8cae8" : "#d4d6f0",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1
                  }}
                >
                  {item.filename}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#7880a0", paddingLeft: 14 }}>
                AI: {item.ai_status} · {item.timeline_status}
              </div>
            </button>
          );
        })}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
