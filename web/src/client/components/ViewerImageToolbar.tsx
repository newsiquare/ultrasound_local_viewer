"use client";

import { Grid3x3, Maximize2, Minus, Plus, Rotate3D, Ruler, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { UseViewerImageToolsResult } from "@/client/hooks/useViewerImageTools";

interface ViewerImageToolbarProps {
  tools: UseViewerImageToolsResult;
  disabled?: boolean;
}

export function ViewerImageToolbar(props: ViewerImageToolbarProps) {
  const { tools, disabled = false } = props;
  const [showAdjust, setShowAdjust] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        background: "#13141f",
        borderBottom: "1px solid #1e2035",
        flexShrink: 0,
        flexWrap: "wrap"
      }}
    >
      {/* Zoom controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
        <ToolBtn onClick={tools.zoomOut} disabled={disabled || tools.fitToWindow} title="縮小">
          <Minus size={13} />
        </ToolBtn>
        <div
          style={{
            minWidth: 52,
            textAlign: "center",
            fontSize: 11,
            color: "#7c7e9a",
            padding: "0 4px",
            fontVariantNumeric: "tabular-nums"
          }}
        >
          {tools.fitToWindow ? "Fit" : `${tools.zoomPercent}%`}
        </div>
        <ToolBtn onClick={tools.zoomIn} disabled={disabled || tools.fitToWindow} title="放大">
          <Plus size={13} />
        </ToolBtn>
      </div>

      <Divider />

      <ToolBtn
        onClick={() => tools.setFitToWindow(!tools.fitToWindow)}
        disabled={disabled}
        active={tools.fitToWindow}
        title="自適應視窗"
      >
        <Maximize2 size={13} />
      </ToolBtn>

      <ToolBtn onClick={tools.resetView} disabled={disabled} title="重設視圖">
        <Rotate3D size={13} />
      </ToolBtn>

      <Divider />

      <ToolBtn
        onClick={() => tools.setShowGrid(!tools.showGrid)}
        disabled={disabled}
        active={tools.showGrid}
        title="格線"
      >
        <Grid3x3 size={13} />
      </ToolBtn>

      <ToolBtn
        onClick={() => tools.setMeasureEnabled(!tools.measureEnabled)}
        disabled={disabled}
        active={tools.measureEnabled}
        title="量測"
      >
        <Ruler size={13} />
      </ToolBtn>

      <Divider />

      {/* Contrast/Brightness popover */}
      <div style={{ position: "relative" }}>
        <ToolBtn
          onClick={() => setShowAdjust(!showAdjust)}
          disabled={disabled}
          active={showAdjust || tools.contrast !== 0 || tools.brightness !== 0}
          title="亮度/對比"
        >
          <SlidersHorizontal size={13} />
        </ToolBtn>

        {showAdjust && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 40 }}
              onClick={() => setShowAdjust(false)}
            />
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                zIndex: 50,
                background: "#1a1b28",
                border: "1px solid #2e2f45",
                borderRadius: 8,
                padding: 12,
                minWidth: 200,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                display: "grid",
                gap: 10
              }}
            >
              <label style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7c7e9a" }}>
                  <span>對比</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{tools.contrast > 0 ? "+" : ""}{tools.contrast}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={tools.contrast}
                  onChange={(e) => tools.setContrast(Number(e.target.value))}
                  disabled={disabled}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7c7e9a" }}>
                  <span>亮度</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{tools.brightness > 0 ? "+" : ""}{tools.brightness}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={tools.brightness}
                  onChange={(e) => tools.setBrightness(Number(e.target.value))}
                  disabled={disabled}
                />
              </label>
              <button
                type="button"
                onClick={() => { tools.setContrast(0); tools.setBrightness(0); }}
                style={{
                  fontSize: 11,
                  color: "#5a5c7a",
                  background: "none",
                  border: "1px solid #2e2f45",
                  borderRadius: 4,
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontFamily: "inherit"
                }}
              >
                重設
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ToolBtn(props: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  const { onClick, disabled = false, active = false, title, children } = props;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 5,
        border: active ? "1px solid rgba(79,140,255,0.4)" : "1px solid transparent",
        background: active ? "rgba(79,140,255,0.15)" : "transparent",
        color: active ? "#4f8cff" : disabled ? "#2e3052" : "#7c7e9a",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.1s, color 0.1s",
        flexShrink: 0
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 18, background: "#1e2035", flexShrink: 0, margin: "0 2px" }} />;
}
