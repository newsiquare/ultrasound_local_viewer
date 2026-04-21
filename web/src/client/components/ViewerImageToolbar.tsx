"use client";

import { Grid3x3, Maximize2, Minus, MousePointer2, Pentagon, Plus, Rotate3D, Ruler, SlidersHorizontal, Square, Type } from "lucide-react";
import { useState } from "react";

import { AnnotationToolType } from "@/client/hooks/useAnnotationTool";
import { UseViewerImageToolsResult } from "@/client/hooks/useViewerImageTools";

interface ViewerImageToolbarProps {
  tools: UseViewerImageToolsResult;
  disabled?: boolean;
  activeTool?: AnnotationToolType | null;
  onToolChange?: (tool: AnnotationToolType | null) => void;
  embedded?: boolean;
}

export function ViewerImageToolbar(props: ViewerImageToolbarProps) {
  const { tools, disabled = false, activeTool = null, onToolChange, embedded = false } = props;
  const [showAdjust, setShowAdjust] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: embedded ? 0 : "4px 8px",
        background: embedded ? "transparent" : "#0f1018",
        borderBottom: embedded ? "none" : "1px solid #252638",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>

      {/* Group 1: Zoom controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
        <ToolBtn onClick={tools.zoomOut} disabled={disabled || tools.fitToWindow} title="縮小" bright>
          <Minus size={15} />
        </ToolBtn>
        <div
          style={{
            minWidth: 52,
            textAlign: "center",
            fontSize: 12,
            color: "#e2e3f0",
            padding: "0 4px",
            fontVariantNumeric: "tabular-nums"
          }}
        >
          {tools.fitToWindow ? "Fit" : `${tools.zoomPercent}%`}
        </div>
        <ToolBtn onClick={tools.zoomIn} disabled={disabled || tools.fitToWindow} title="放大" bright>
          <Plus size={15} />
        </ToolBtn>
      </div>

      <Divider />

      {/* Group 2: Fit + Reset */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <ToolBtn
          onClick={() => tools.setFitToWindow(!tools.fitToWindow)}
          disabled={disabled}
          active={tools.fitToWindow}
          title="自適應視窗"
        >
          <Maximize2 size={15} />
        </ToolBtn>

        <ToolBtn onClick={tools.resetView} disabled={disabled} title="重設視圖">
          <Rotate3D size={15} />
        </ToolBtn>
      </div>

      <Divider />

      {/* Group 3: Grid + Ruler */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <ToolBtn
          onClick={() => tools.setShowGrid(!tools.showGrid)}
          disabled={disabled}
          active={tools.showGrid}
          title="格線"
        >
          <Grid3x3 size={15} />
        </ToolBtn>

        <ToolBtn
          onClick={() => tools.setMeasureEnabled(!tools.measureEnabled)}
          disabled={disabled}
          active={tools.measureEnabled}
          title="量測"
        >
          <Ruler size={15} />
        </ToolBtn>
      </div>

      <Divider />

      {/* Group 4: Contrast/Brightness popover */}
      <div style={{ position: "relative" }}>
        <ToolBtn
          onClick={() => setShowAdjust(!showAdjust)}
          disabled={disabled}
          active={showAdjust || tools.contrast !== 0 || tools.brightness !== 0}
          title="亮度/對比"
        >
          <SlidersHorizontal size={15} />
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
                background: "#171824",
                border: "1px solid #3c3e58",
                borderRadius: 8,
                padding: 12,
                minWidth: 200,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                display: "grid",
                gap: 10
              }}
            >
              <label style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#c9ccd8" }}>
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
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#c9ccd8" }}>
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
                  color: "#9699b0",
                  background: "none",
                  border: "1px solid #3c3e58",
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

      <Divider />

      {/* Group 5: Annotation tools */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <ToolBtn
          onClick={() => onToolChange?.(activeTool === "SELECT" ? null : "SELECT")}
          disabled={disabled}
          active={activeTool === "SELECT"}
          title="選取 (S)"
        >
          <MousePointer2 size={15} />
        </ToolBtn>
        <ToolBtn
          onClick={() => onToolChange?.(activeTool === "RECT" ? null : "RECT")}
          disabled={disabled}
          active={activeTool === "RECT"}
          title="矩形標註 (R)"
        >
          <Square size={15} />
        </ToolBtn>
        <ToolBtn
          onClick={() => onToolChange?.(activeTool === "POLYGON" ? null : "POLYGON")}
          disabled={disabled}
          active={activeTool === "POLYGON"}
          title="多邊形標註 (P)，雙擊完成"
        >
          <Pentagon size={15} />
        </ToolBtn>
        <ToolBtn
          onClick={() => onToolChange?.(activeTool === "TEXT" ? null : "TEXT")}
          disabled={disabled}
          active={activeTool === "TEXT"}
          title="文字標籤 (T)"
        >
          <Type size={15} />
        </ToolBtn>
      </div>

      </div>
    </div>
  );
}

function ToolBtn(props: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  bright?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  const { onClick, disabled = false, active = false, bright = false, title, children } = props;

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
        width: 32,
        height: 32,
        borderRadius: 6,
        border: active ? "1px solid rgba(79,140,255,0.4)" : "1px solid transparent",
        background: active ? "rgba(79,140,255,0.15)" : "transparent",
        color: active ? "#4f8cff" : disabled ? "#52547a" : bright ? "#7880a0" : "#c9ccd8",
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
  return <div style={{ width: 1, height: 20, background: "#3c3e58", flexShrink: 0, margin: "0 4px" }} />;
}
