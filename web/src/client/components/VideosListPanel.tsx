"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RefreshCw, Search, Trash2, X, XCircle } from "lucide-react";

import { VideoListItem } from "@/client/types";

interface VideosListPanelProps {
  items: VideoListItem[];
  currentVideoId: string | null;
  loading: boolean;
  onSelect: (videoId: string) => void;
  onReload: () => Promise<void>;
  onDelete?: (videoId: string) => void;
  onClearAi?: (videoId: string) => void;
}

interface CtxMenu {
  x: number;
  y: number;
  videoId: string;
  filename: string;
  aiStatus: string;
}

function statusDot(aiStatus: string, timelineStatus: string): { color: string; title: string } {
  if (aiStatus === "PROCESSING") return { color: "#fbbf24", title: "AI 處理中" };
  if (aiStatus === "DONE" && timelineStatus === "READY") return { color: "#34d399", title: "就緒" };
  if (aiStatus === "FAILED") return { color: "#f87171", title: "AI 失敗" };
  if (timelineStatus === "READY") return { color: "#60a5fa", title: "有 timeline" };
  return { color: "#7880a0", title: "尚未處理" };
}

export function VideosListPanel(props: VideosListPanelProps) {
  const { items, currentVideoId, loading, onSelect, onReload, onDelete, onClearAi } = props;
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const closeMenu = useCallback(() => setCtxMenu(null), []);

  // Close context menu on outside click or scroll
  useEffect(() => {
    if (!ctxMenu) return;
    const handleDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("scroll", closeMenu, true);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("scroll", closeMenu, true);
    };
  }, [ctxMenu, closeMenu]);

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

      {/* Search bar */}
      <div style={{ padding: "6px 10px", borderBottom: "1px solid #252638", flexShrink: 0 }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={12} style={{ position: "absolute", left: 8, color: "#585a78", pointerEvents: "none", flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋檔名…"
            style={{
              width: "100%",
              background: "#0a0b14",
              border: "1px solid #252638",
              borderRadius: 5,
              color: "#d4d6f0",
              fontSize: 12,
              padding: "5px 24px 5px 26px",
              outline: "none",
              fontFamily: "inherit"
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              style={{ position: "absolute", right: 6, background: "none", border: "none", padding: 0, cursor: "pointer", color: "#585a78", display: "flex", alignItems: "center" }}
            >
              <X size={11} />
            </button>
          )}
        </div>
        {/* Status filter chips */}
        <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
          {(["ALL", "IDLE", "PROCESSING", "DONE", "FAILED"] as const).map((s) => {
            const active = statusFilter === s;
            const chipColor: Record<string, string> = { IDLE: "#7880a0", PROCESSING: "#fbbf24", DONE: "#34d399", FAILED: "#f87171", ALL: "#4f8cff" };
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                style={{
                  fontSize: 10,
                  padding: "2px 7px",
                  borderRadius: 10,
                  border: `1px solid ${active ? chipColor[s] : "#3c3e58"}`,
                  background: active ? `${chipColor[s]}22` : "transparent",
                  color: active ? chipColor[s] : "#585a78",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.1s"
                }}
              >
                {s === "ALL" ? "全部" : s}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {(() => {
          const filtered = items.filter((item) => {
            const matchQuery = searchQuery === "" || item.filename.toLowerCase().includes(searchQuery.toLowerCase());
            const matchStatus = statusFilter === "ALL" || item.ai_status === statusFilter;
            return matchQuery && matchStatus;
          });
          if (filtered.length === 0) return (
            <div style={{ padding: "20px 12px", fontSize: 12, color: "#585a78", textAlign: "center" }}>
              {items.length === 0 ? "暫無影片" : "無符合結果"}
            </div>
          );
          return filtered.map((item) => {
          const isSelected = item.id === currentVideoId;
          const dot = statusDot(item.ai_status, item.timeline_status);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setCtxMenu({ x: e.clientX, y: e.clientY, videoId: item.id, filename: item.filename, aiStatus: item.ai_status });
              }}
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
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                {/* Thumbnail */}
                <img
                  src={`/api/videos/${item.id}/thumb`}
                  width={64}
                  height={36}
                  alt=""
                  style={{ objectFit: "cover", borderRadius: 3, flexShrink: 0, background: "#1a1c2e" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
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
                </div>
              </div>
            </button>
          );
        });
        })()}
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: ctxMenu.y,
            left: ctxMenu.x,
            zIndex: 9999,
            background: "#1a1c2e",
            border: "1px solid #3c3e58",
            borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            padding: "4px 0",
            minWidth: 180
          }}
        >
          {/* Title */}
          <div style={{
            padding: "4px 12px 6px",
            fontSize: 11,
            color: "#585a78",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            borderBottom: "1px solid #252638",
            marginBottom: 4
          }}>
            {ctxMenu.filename}
          </div>
          {onClearAi && ctxMenu.aiStatus === "DONE" && (
            <button
              type="button"
              onClick={() => { closeMenu(); onClearAi(ctxMenu.videoId); }}
              style={ctxMenuItemStyle}
            >
              <XCircle size={13} style={{ flexShrink: 0 }} />
              清除 AI 結果
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => { closeMenu(); onDelete(ctxMenu.videoId); }}
              style={{ ...ctxMenuItemStyle, color: "#f87171" }}
            >
              <Trash2 size={13} style={{ flexShrink: 0 }} />
              刪除影片
            </button>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const ctxMenuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "6px 12px",
  background: "transparent",
  border: "none",
  color: "#c8cae8",
  fontSize: 13,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit"
};
