"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = [
  {
    title: "播放控制",
    shortcuts: [
      { keys: ["Space"], desc: "播放 / 暫停" },
      { keys: ["←"], desc: "上一幀" },
      { keys: ["→"], desc: "下一幀" },
      { keys: ["Shift", "←"], desc: "後退 10 幀" },
      { keys: ["Shift", "→"], desc: "前進 10 幀" },
      { keys: ["Home"], desc: "跳至第一幀" },
      { keys: ["End"], desc: "跳至最後一幀" },
    ],
  },
  {
    title: "標註工具",
    shortcuts: [
      { keys: ["R"], desc: "矩形框工具" },
      { keys: ["P"], desc: "多邊形工具" },
      { keys: ["T"], desc: "文字標籤工具" },
      { keys: ["V"], desc: "選取工具" },
      { keys: ["Esc"], desc: "取消目前繪製" },
      { keys: ["Delete"], desc: "刪除已選取標註（多選時批次刪除）" },
    ],
  },
  {
    title: "編輯",
    shortcuts: [
      { keys: ["Ctrl / ⌘", "Z"], desc: "復原 (Undo)" },
      { keys: ["Ctrl / ⌘", "Shift", "Z"], desc: "重做 (Redo)" },
      { keys: ["Ctrl / ⌘", "Y"], desc: "重做 (Redo)" },
    ],
  },
  {
    title: "影像調整",
    shortcuts: [
      { keys: ["Ctrl / ⌘", "+"], desc: "放大" },
      { keys: ["Ctrl / ⌘", "-"], desc: "縮小" },
      { keys: ["Ctrl / ⌘", "0"], desc: "重置縮放" },
    ],
  },
  {
    title: "其他",
    shortcuts: [
      { keys: ["?"], desc: "顯示 / 隱藏快捷鍵說明" },
    ],
  },
];

export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#1a1c2e", border: "1px solid #2e3052", borderRadius: 12,
          width: 520, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 64px)",
          overflowY: "auto", padding: "24px 28px", position: "relative",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: "#d4d6f0" }}>快捷鍵說明</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#7880a0", padding: 4, borderRadius: 4,
              display: "flex", alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: "#585a78",
                textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8,
              }}>
                {section.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {section.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.desc}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <div style={{ display: "flex", gap: 4, flexShrink: 0, width: 200 }}>
                      {shortcut.keys.map((k) => (
                        <kbd
                          key={k}
                          style={{
                            display: "inline-block", fontSize: 11, padding: "2px 6px",
                            background: "#252638", border: "1px solid #3c3e58",
                            borderRadius: 4, color: "#c8cae8",
                            fontFamily: "ui-monospace, monospace",
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                    <span style={{ fontSize: 13, color: "#9699b0" }}>{shortcut.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, fontSize: 11, color: "#585a78" }}>
          按 <kbd style={{ fontSize: 11, padding: "1px 5px", background: "#252638", border: "1px solid #3c3e58", borderRadius: 4, color: "#9699b0" }}>?</kbd> 或 <kbd style={{ fontSize: 11, padding: "1px 5px", background: "#252638", border: "1px solid #3c3e58", borderRadius: 4, color: "#9699b0" }}>Esc</kbd> 關閉
        </div>
      </div>
    </div>
  );
}
