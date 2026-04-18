"use client";

import { useCallback, useRef, useState } from "react";

import { UseAnnotationToolResult } from "@/client/hooks/useAnnotationTool";
import {
  AnnotationGeometry,
  AnnotationItem,
  BboxGeometry,
  CategoryItem,
  PolygonGeometry
} from "@/client/types";

interface AnnotationCanvasProps {
  videoWidth: number;
  videoHeight: number;
  annotations: AnnotationItem[];
  categories: CategoryItem[];
  annotationTool: UseAnnotationToolResult;
  annotationVisible: boolean;
  selectedAnnotationId?: string | null;
  onAnnotationSelect?: (id: string | null) => void;
  onAnnotationUpdated?: (id: string, geometry: AnnotationGeometry) => void;
}

function getCategoryColor(categories: CategoryItem[], categoryId: string): string {
  return categories.find((c) => c.id === categoryId)?.color ?? "#22d3ee";
}

// ──────────────────────────────────────
// Drag types
// ──────────────────────────────────────

type BboxHandle = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";
type HandleType = "move" | BboxHandle | `v${number}`;

interface DragState {
  annotationId: string;
  handleType: HandleType;
  startX: number;
  startY: number;
  origGeometry: AnnotationGeometry;
}

const MIN_BBOX_SIZE = 4;

function applyDrag(
  orig: AnnotationGeometry,
  handle: HandleType,
  dx: number,
  dy: number,
  vw: number,
  vh: number
): AnnotationGeometry {
  if (orig.type === "bbox") {
    let { x, y, width, height } = orig;
    switch (handle) {
      case "move": x += dx; y += dy; break;
      case "tl":   x += dx; y += dy; width -= dx; height -= dy; break;
      case "t":    y += dy; height -= dy; break;
      case "tr":   width += dx; y += dy; height -= dy; break;
      case "r":    width += dx; break;
      case "br":   width += dx; height += dy; break;
      case "b":    height += dy; break;
      case "bl":   x += dx; width -= dx; height += dy; break;
      case "l":    x += dx; width -= dx; break;
    }
    if (width < MIN_BBOX_SIZE) {
      if (handle === "tl" || handle === "l" || handle === "bl") x -= (MIN_BBOX_SIZE - width);
      width = MIN_BBOX_SIZE;
    }
    if (height < MIN_BBOX_SIZE) {
      if (handle === "tl" || handle === "t" || handle === "tr") y -= (MIN_BBOX_SIZE - height);
      height = MIN_BBOX_SIZE;
    }
    x = Math.max(0, Math.min(vw - width, x));
    y = Math.max(0, Math.min(vh - height, y));
    return { type: "bbox", x, y, width, height };
  }
  if (orig.type === "polygon") {
    if (handle === "move") {
      return { type: "polygon", points: orig.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    }
    const vMatch = /^v(\d+)$/.exec(handle);
    if (vMatch) {
      const idx = parseInt(vMatch[1], 10);
      return { type: "polygon", points: orig.points.map((p, i) => i === idx ? { x: p.x + dx, y: p.y + dy } : { ...p }) };
    }
  }
  if (orig.type === "text" && handle === "move") {
    return { type: "text", x: orig.x + dx, y: orig.y + dy };
  }
  return orig;
}

function bboxHandlePoints(g: BboxGeometry): { id: BboxHandle; cx: number; cy: number; cursor: string }[] {
  const { x, y, width: w, height: h } = g;
  return [
    { id: "tl", cx: x,         cy: y,         cursor: "nwse-resize" },
    { id: "t",  cx: x + w / 2, cy: y,         cursor: "ns-resize"   },
    { id: "tr", cx: x + w,     cy: y,         cursor: "nesw-resize" },
    { id: "r",  cx: x + w,     cy: y + h / 2, cursor: "ew-resize"   },
    { id: "br", cx: x + w,     cy: y + h,     cursor: "nwse-resize" },
    { id: "b",  cx: x + w / 2, cy: y + h,     cursor: "ns-resize"   },
    { id: "bl", cx: x,         cy: y + h,     cursor: "nesw-resize" },
    { id: "l",  cx: x,         cy: y + h / 2, cursor: "ew-resize"   }
  ];
}

// ──────────────────────────────────────
// Render helpers
// ──────────────────────────────────────

function renderGeometry(
  geometry: AnnotationGeometry | null,
  color: string,
  opacity: number = 1
): React.ReactNode {
  if (!geometry) return null;

  if (geometry.type === "bbox") {
    return (
      <rect
        x={geometry.x}
        y={geometry.y}
        width={geometry.width}
        height={geometry.height}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeOpacity={opacity}
        style={{ filter: "drop-shadow(0 0 1px rgba(0,0,0,0.6))" }}
      />
    );
  }

  if (geometry.type === "polygon") {
    const pts = geometry.points.map((p) => `${p.x},${p.y}`).join(" ");
    return (
      <polygon
        points={pts}
        fill={`${color}22`}
        stroke={color}
        strokeWidth={2}
        strokeOpacity={opacity}
        style={{ filter: "drop-shadow(0 0 1px rgba(0,0,0,0.6))" }}
      />
    );
  }

  if (geometry.type === "text") {
    return <circle cx={geometry.x} cy={geometry.y} r={5} fill={color} fillOpacity={opacity} />;
  }

  return null;
}

function renderSelectionOutline(geo: AnnotationGeometry, color: string): React.ReactNode {
  if (geo.type === "bbox") {
    return (
      <>
        <rect
          x={geo.x - 1}
          y={geo.y - 1}
          width={geo.width + 2}
          height={geo.height + 2}
          fill="none"
          stroke="white"
          strokeWidth={1}
          strokeOpacity={0.45}
          strokeDasharray="5 3"
          pointerEvents="none"
        />
        <rect
          x={geo.x}
          y={geo.y}
          width={geo.width}
          height={geo.height}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          pointerEvents="none"
        />
      </>
    );
  }
  if (geo.type === "polygon") {
    const pts = geo.points.map((p) => `${p.x},${p.y}`).join(" ");
    return (
      <polygon points={pts} fill="none" stroke="white" strokeWidth={3}
        strokeOpacity={0.35} pointerEvents="none" />
    );
  }
  if (geo.type === "text") {
    return (
      <circle cx={geo.x} cy={geo.y} r={8} fill="none" stroke="white"
        strokeWidth={1.5} strokeOpacity={0.5} pointerEvents="none" />
    );
  }
  return null;
}

function renderHitArea(
  geo: AnnotationGeometry,
  onPD: (e: React.PointerEvent) => void
): React.ReactNode {
  if (geo.type === "bbox") {
    return (
      <rect x={geo.x} y={geo.y} width={geo.width} height={geo.height}
        fill="transparent" stroke="transparent" strokeWidth={10}
        style={{ cursor: "move" }} onPointerDown={onPD} />
    );
  }
  if (geo.type === "polygon") {
    const pts = geo.points.map((p) => `${p.x},${p.y}`).join(" ");
    return (
      <polygon points={pts} fill="transparent" stroke="transparent" strokeWidth={10}
        style={{ cursor: "move" }} onPointerDown={onPD} />
    );
  }
  if (geo.type === "text") {
    return <circle cx={geo.x} cy={geo.y} r={12} fill="transparent"
      style={{ cursor: "move" }} onPointerDown={onPD} />;
  }
  return null;
}

function renderBboxHandles(
  geo: BboxGeometry,
  color: string,
  onHPD: (e: React.PointerEvent, h: BboxHandle) => void
): React.ReactNode {
  return bboxHandlePoints(geo).map(({ id, cx, cy, cursor }) => (
    <rect key={id} x={cx - 5} y={cy - 5} width={10} height={10}
      fill="white" stroke={color} strokeWidth={1.5} rx={1}
      style={{ cursor }} onPointerDown={(e) => onHPD(e, id)} />
  ));
}

function renderPolygonHandles(
  geo: PolygonGeometry,
  color: string,
  onHPD: (e: React.PointerEvent, idx: number) => void
): React.ReactNode {
  return geo.points.map((p, i) => (
    <circle key={i} cx={p.x} cy={p.y} r={6}
      fill="white" stroke={color} strokeWidth={1.5}
      style={{ cursor: "grab" }} onPointerDown={(e) => onHPD(e, i)} />
  ));
}

export function AnnotationCanvas({
  videoWidth,
  videoHeight,
  annotations,
  categories,
  annotationTool,
  annotationVisible,
  selectedAnnotationId = null,
  onAnnotationSelect,
  onAnnotationUpdated
}: AnnotationCanvasProps) {
  const {
    activeTool,
    draftPoints,
    rectAnchor,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick
  } = annotationTool;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [liveGeometry, setLiveGeometry] = useState<AnnotationGeometry | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const isDrawMode = activeTool !== null && activeTool !== "SELECT";
  const isSelectMode = activeTool === "SELECT" || activeTool === null;

  const getSvgCoords = useCallback(
    (e: React.PointerEvent | React.MouseEvent): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
      if (!svgPt) return null;
      return { x: svgPt.x, y: svgPt.y };
    },
    []
  );

  // Click/drag on annotation shape or handle
  const onAnnotationPointerDown = useCallback(
    (e: React.PointerEvent, annotation: AnnotationItem, handle: HandleType = "move") => {
      if (!isSelectMode || !annotation.geometry) return;
      e.stopPropagation();
      e.preventDefault();
      onAnnotationSelect?.(annotation.id);
      const coords = getSvgCoords(e);
      if (!coords) return;
      dragRef.current = {
        annotationId: annotation.id,
        handleType: handle,
        startX: coords.x,
        startY: coords.y,
        origGeometry: annotation.geometry
      };
      setLiveGeometry(null);
    },
    [isSelectMode, onAnnotationSelect, getSvgCoords]
  );

  // SVG-level pointer handlers
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawMode) return;
      e.preventDefault();
      const coords = getSvgCoords(e);
      if (!coords) return;
      handlePointerDown(coords.x, coords.y);
    },
    [isDrawMode, getSvgCoords, handlePointerDown]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const coords = getSvgCoords(e);
      if (!coords) return;
      setCursor(coords);

      if (isDrawMode) {
        handlePointerMove(coords.x, coords.y);
        return;
      }

      const drag = dragRef.current;
      if (drag?.origGeometry) {
        const dx = coords.x - drag.startX;
        const dy = coords.y - drag.startY;
        setLiveGeometry(applyDrag(drag.origGeometry, drag.handleType, dx, dy, videoWidth, videoHeight));
      }
    },
    [isDrawMode, getSvgCoords, handlePointerMove, videoWidth, videoHeight]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isDrawMode) {
        e.preventDefault();
        const coords = getSvgCoords(e);
        if (!coords) return;
        handlePointerUp(coords.x, coords.y);
        return;
      }
      const drag = dragRef.current;
      if (drag && liveGeometry) {
        onAnnotationUpdated?.(drag.annotationId, liveGeometry);
      }
      dragRef.current = null;
      setLiveGeometry(null);
    },
    [isDrawMode, getSvgCoords, handlePointerUp, liveGeometry, onAnnotationUpdated]
  );

  const onPointerLeave = useCallback(() => {
    setCursor(null);
    const drag = dragRef.current;
    if (drag && liveGeometry) {
      onAnnotationUpdated?.(drag.annotationId, liveGeometry);
    }
    dragRef.current = null;
    setLiveGeometry(null);
  }, [liveGeometry, onAnnotationUpdated]);

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool !== "POLYGON") return;
      e.preventDefault();
      const coords = getSvgCoords(e);
      if (!coords) return;
      handleDoubleClick(coords.x, coords.y);
    },
    [activeTool, getSvgCoords, handleDoubleClick]
  );

  const onSvgClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelectMode) return;
      if (e.target === svgRef.current) {
        onAnnotationSelect?.(null);
      }
    },
    [isSelectMode, onAnnotationSelect]
  );

  // Draft preview during drawing
  const draftPreview: React.ReactNode = (() => {
    if (!isDrawMode || draftPoints.length === 0) return null;
    const draftColor = "#f59e0b";

    if (activeTool === "RECT") {
      if (draftPoints.length < 2 || !rectAnchor) return null;
      const p2 = draftPoints[1];
      const x = Math.min(rectAnchor.x, p2.x);
      const y = Math.min(rectAnchor.y, p2.y);
      const w = Math.abs(p2.x - rectAnchor.x);
      const h = Math.abs(p2.y - rectAnchor.y);
      return (
        <rect x={x} y={y} width={w} height={h}
          fill="none" stroke={draftColor} strokeWidth={2} strokeDasharray="6 3" />
      );
    }

    if (activeTool === "POLYGON") {
      const pts = draftPoints.map((p) => `${p.x},${p.y}`).join(" ");
      return (
        <g>
          <polyline points={pts} fill="none" stroke={draftColor} strokeWidth={2} strokeDasharray="6 3" />
          {draftPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4} fill={draftColor} />
          ))}
          {cursor && (
            <line
              x1={draftPoints[draftPoints.length - 1].x}
              y1={draftPoints[draftPoints.length - 1].y}
              x2={cursor.x} y2={cursor.y}
              stroke={draftColor} strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.7}
            />
          )}
        </g>
      );
    }

    return null;
  })();

  const crosshair: React.ReactNode = (() => {
    if (activeTool !== "TEXT" || !cursor) return null;
    const { x, y } = cursor;
    return (
      <g stroke="#f59e0b" strokeWidth={1.5} opacity={0.8}>
        <line x1={x - 8} y1={y} x2={x + 8} y2={y} />
        <line x1={x} y1={y - 8} x2={x} y2={y + 8} />
      </g>
    );
  })();

  const svgCursor =
    activeTool === "TEXT" || activeTool === "RECT" || activeTool === "POLYGON"
      ? "crosshair"
      : "default";

  if (videoWidth <= 0 || videoHeight <= 0) return null;

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={`0 0 ${videoWidth} ${videoHeight}`}
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: isDrawMode || isSelectMode ? "all" : "none",
        cursor: svgCursor,
        touchAction: "none"
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onDoubleClick={onDoubleClick}
      onClick={onSvgClick}
    >
      {/* Confirmed annotations */}
      {annotationVisible &&
        annotations
          .filter((a) => a.isVisible)
          .map((annotation) => {
            const color = getCategoryColor(categories, annotation.categoryId);
            const isSelected = annotation.id === selectedAnnotationId;
            const displayGeo = isSelected && liveGeometry ? liveGeometry : annotation.geometry;

            return (
              <g key={annotation.id}>
                {/* Base shape */}
                {renderGeometry(displayGeo, color, isSelected ? 1 : 0.85)}

                {/* Text label */}
                {displayGeo?.type === "text" && annotation.textContent && (
                  <text
                    x={displayGeo.x + 8}
                    y={displayGeo.y + 4}
                    fontSize={13}
                    fill={color}
                    style={{
                      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))",
                      fontFamily: "sans-serif",
                      pointerEvents: "none"
                    }}
                  >
                    {annotation.textContent}
                  </text>
                )}

                {/* Selected: outline + handles */}
                {isSelected && displayGeo && (
                  <>
                    {renderSelectionOutline(displayGeo, color)}
                    {renderHitArea(displayGeo, (e) =>
                      onAnnotationPointerDown(e, annotation, "move")
                    )}
                    {displayGeo.type === "bbox" &&
                      renderBboxHandles(displayGeo, color, (e, h) =>
                        onAnnotationPointerDown(e, annotation, h)
                      )}
                    {displayGeo.type === "polygon" &&
                      renderPolygonHandles(displayGeo, color, (e, idx) =>
                        onAnnotationPointerDown(e, annotation, `v${idx}`)
                      )}
                  </>
                )}

                {/* Not selected: click to select */}
                {!isSelected && isSelectMode && displayGeo && (
                  renderHitArea(displayGeo, (e) =>
                    onAnnotationPointerDown(e, annotation, "move")
                  )
                )}
              </g>
            );
          })}

      {/* Draft preview */}
      {draftPreview}
      {crosshair}
    </svg>
  );
}
