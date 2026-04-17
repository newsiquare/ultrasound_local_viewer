"use client";

import { UseViewerImageToolsResult } from "@/client/hooks/useViewerImageTools";

interface ViewerImageToolbarProps {
  tools: UseViewerImageToolsResult;
  disabled?: boolean;
}

export function ViewerImageToolbar(props: ViewerImageToolbarProps) {
  const { tools, disabled = false } = props;

  return (
    <div
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 8,
        padding: 10,
        display: "grid",
        gap: 10,
        background: "#fafafa"
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={tools.zoomOut} disabled={disabled}>
          Zoom -
        </button>
        <button type="button" onClick={tools.zoomIn} disabled={disabled}>
          Zoom +
        </button>
        <button
          type="button"
          onClick={() => tools.setFitToWindow(!tools.fitToWindow)}
          disabled={disabled}
          style={{ fontWeight: tools.fitToWindow ? 700 : 400 }}
        >
          Fit to Window
        </button>
        <button type="button" onClick={tools.resetView} disabled={disabled}>
          Reset View
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={tools.showGrid}
            onChange={(event) => tools.setShowGrid(event.target.checked)}
            disabled={disabled}
          />
          Grid
        </label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={tools.measureEnabled}
            onChange={(event) => tools.setMeasureEnabled(event.target.checked)}
            disabled={disabled}
          />
          Measure
        </label>
        <span style={{ color: "#52525b" }}>
          {tools.fitToWindow ? "Fit" : `Zoom ${tools.zoomPercent}%`}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          Contrast: {tools.contrast}
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={tools.contrast}
            onChange={(event) => tools.setContrast(Number(event.target.value))}
            disabled={disabled}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          Brightness: {tools.brightness}
          <input
            type="range"
            min={-100}
            max={100}
            step={1}
            value={tools.brightness}
            onChange={(event) => tools.setBrightness(Number(event.target.value))}
            disabled={disabled}
          />
        </label>
      </div>
    </div>
  );
}
