"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { AnnotationItem } from "@/client/types";

export interface PropagateDialogProps {
  open: boolean;
  onClose: () => void;
  annotations: AnnotationItem[]; // the items to copy
  currentDisplayIndex: number;
  totalFrames: number;
  onPropagate: (annotations: AnnotationItem[], fromIndex: number, toIndex: number) => Promise<void>;
}

export function PropagateDialog({
  open, onClose, annotations, currentDisplayIndex, totalFrames, onPropagate,
}: PropagateDialogProps) {
  const [fromIndex, setFromIndex] = useState<number>(currentDisplayIndex + 1);
  const [toIndex, setToIndex] = useState<number>(Math.min(currentDisplayIndex + 10, totalFrames));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const totalTarget = Math.max(0, toIndex - fromIndex + 1);

  const handleConfirm = async () => {
    if (fromIndex > toIndex) { setError("起始幀必須小於等於結束幀"); return; }
    if (fromIndex < 1 || toIndex > totalFrames) { setError(`幀範圍必須在 1 ~ ${totalFrames} 之間`); return; }
    setBusy(true);
    setError(null);
    try {
      await onPropagate(annotations, fromIndex, toIndex);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "複製失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div
        style={{
          background: "#1a1c2e", border: "1px solid #2e3052", borderRadius: 12,
          width: 380, maxWidth: "calc(100vw - 32px)",
          padding: "22px 24px", position: "relative",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#d4d6f0" }}>複製標註到其他幀</span>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#7880a0", padding: 4, borderRadius: 4, display: "flex" }}>
            <X size={15} />
          </button>
        </div>

        {/* Info */}
        <div style={{ fontSize: 12, color: "#9699b0", marginBottom: 16 }}>
          複製第 <strong style={{ color: "#c8cae8" }}>{currentDisplayIndex}</strong> 幀的{" "}
          <strong style={{ color: "#c8cae8" }}>{annotations.length}</strong> 筆標註到以下幀範圍：
        </div>

        {/* Range inputs */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            <label style={{ fontSize: 11, color: "#7880a0" }}>起始幀</label>
            <input
              type="number" min={1} max={totalFrames} value={fromIndex}
              onChange={(e) => setFromIndex(Number(e.target.value))}
              style={inputStyle}
            />
          </div>
          <span style={{ color: "#585a78", marginTop: 18 }}>–</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            <label style={{ fontSize: 11, color: "#7880a0" }}>結束幀</label>
            <input
              type="number" min={1} max={totalFrames} value={toIndex}
              onChange={(e) => setToIndex(Number(e.target.value))}
              style={inputStyle}
            />
          </div>
        </div>

        {totalTarget > 0 && !error && (
          <div style={{ fontSize: 12, color: "#585a78", marginBottom: 14 }}>
            將新增 {annotations.length} × {totalTarget} = <strong style={{ color: "#c8cae8" }}>{annotations.length * totalTarget}</strong> 筆標註
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: "#f87171", marginBottom: 14 }}>{error}</div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={busy} style={cancelBtnStyle}>取消</button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy || annotations.length === 0 || totalTarget === 0}
            style={confirmBtnStyle(busy || annotations.length === 0 || totalTarget === 0)}
          >
            {busy ? "複製中..." : "確認複製"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "5px 8px", fontSize: 13,
  background: "rgba(255,255,255,0.06)", border: "1px solid #3c3e58",
  borderRadius: 6, color: "#c8cae8", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "6px 14px", fontSize: 13, borderRadius: 6,
  background: "rgba(255,255,255,0.06)", border: "1px solid #3c3e58",
  color: "#9699b0", cursor: "pointer", fontFamily: "inherit",
};

const confirmBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "6px 14px", fontSize: 13, borderRadius: 6,
  background: disabled ? "rgba(79,140,255,0.3)" : "#4f8cff",
  border: "none", color: "#fff",
  cursor: disabled ? "not-allowed" : "pointer",
  fontFamily: "inherit", opacity: disabled ? 0.6 : 1,
});
