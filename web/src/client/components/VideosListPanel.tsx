"use client";

import { VideoListItem } from "@/client/types";

interface VideosListPanelProps {
  items: VideoListItem[];
  currentVideoId: string | null;
  loading: boolean;
  onSelect: (videoId: string) => void;
  onReload: () => Promise<void>;
}

export function VideosListPanel(props: VideosListPanelProps) {
  const { items, currentVideoId, loading, onSelect, onReload } = props;

  return (
    <section style={{ border: "1px solid #d4d4d8", borderRadius: 12, padding: 16, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Videos</h2>
        <button type="button" onClick={() => void onReload()} disabled={loading}>
          {loading ? "載入中..." : "刷新列表"}
        </button>
      </div>

      {items.length === 0 ? <p style={{ marginBottom: 0 }}>目前沒有影片。</p> : null}

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            style={{
              textAlign: "left",
              border: item.id === currentVideoId ? "2px solid #0ea5e9" : "1px solid #d4d4d8",
              borderRadius: 8,
              padding: 10,
              background: item.id === currentVideoId ? "#f0f9ff" : "#fff"
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>{item.filename}</div>
            <div style={{ fontSize: 12 }}>video_id: {item.id}</div>
            <div style={{ fontSize: 12 }}>
              AI: {item.ai_status} | timeline: {item.timeline_status}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
