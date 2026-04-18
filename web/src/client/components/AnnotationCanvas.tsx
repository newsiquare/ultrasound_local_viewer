"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { UseAnnotationToolResult } from "@/client/hooks/useAnnotationTool";
import { AnnotationGeometry, AnnotationItem, CategoryItem } from "@/client/types";

interface AnnotationCanvasProps {
  videoWidth: number;
  videoHeight: number;
  annotations: AnnotationItem[];
  categories: CategoryItem[];
  annotationTool: UseAnnotationToolResult;
  annotationVisible: boolean;
}

function getCategoryColor(categories: CategoryItem[], categoryId: string): string {
  return categories.find((c) => c.id === categoryId)?.color ?? "#22d3ee";
}

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
    return (
      <circle
        cx={geometry.x}
        cy={geometry.y}
        r={5}
        fill={color}
        fillOpacity={opacity}
      />
    );
  }

  return null;
}

export function AnnotationCanvas({
  videoWidth,
  videoHeight,
  annotations,
  categories,
  annotationTool,
  annotationVisible
}: AnnotationCanvasProps) {
  const { activeTool, isDrawing, draftPoints, rectAnchor,
    handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick } = annotationTool;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [cursor, setCursor] = useState<DOMPointReadOnly | null>(null);

  const isAnnotationMode = activeTool !== null && activeTool !== "SELECT";

  const getSvgCoords = useCallback((e: React.PointerEvent | React.MouseEvent): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    if (!svgPt) return null;
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isAnnotationMode) return;
    e.preventDefault();
    const coords = getSvgCoords(e);
    if (!coords) return;
    handlePointerDown(coords.x, coords.y);
  }, [isAnnotationMode, getSvgCoords, handlePointerDown]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const coords = getSvgCoords(e);
    if (!coords) return;
    if (coords) {
      const svg = svgRef.current;
      if (svg) {
        const pt = svg.createSVGPoint();
        pt.x = coords.x;
        pt.y = coords.y;
        setCursor(pt);
      }
    }
    if (!isAnnotationMode) return;
    handlePointerMove(coords.x, coords.y);
  }, [isAnnotationMode, getSvgCoords, handlePointerMove]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isAnnotationMode) return;
    e.preventDefault();
    const coords = getSvgCoords(e);
    if (!coords) return;
    handlePointerUp(coords.x, coords.y);
  }, [isAnnotationMode, getSvgCoords, handlePointerUp]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    if (activeTool !== "POLYGON") return;
    e.preventDefault();
    const coords = getSvgCoords(e);
    if (!coords) return;
    handleDoubleClick(coords.x, coords.y);
  }, [activeTool, getSvgCoords, handleDoubleClick]);

  const onPointerLeave = useCallback(() => {
    setCursor(null);
  }, []);

  // Build draft preview shape
  const draftPreview: React.ReactNode = (() => {
    if (!isAnnotationMode || draftPoints.length === 0) return null;
    const draftColor = "#f59e0b";

    if (activeTool === "RECT") {
      if (draftPoints.length < 2 || !rectAnchor) return null;
      const p2 = draftPoints[1];
      const x = Math.min(rectAnchor.x, p2.x);
      const y = Math.min(rectAnchor.y, p2.y);
      const w = Math.abs(p2.x - rectAnchor.x);
      const h = Math.abs(p2.y - rectAnchor.y);
      return <rect x={x} y={y} width={w} height={h} fill="none" stroke={draftColor} strokeWidth={2} strokeDasharray="6 3" />;
    }

    if (activeTool === "POLYGON") {
      const pts = draftPoints.map((p) => `${p.x},${p.y}`).join(" ");
      return (
        <g>
          <polyline points={pts} fill="none" stroke={draftColor} strokeWidth={2} strokeDasharray="6 3" />
          {draftPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4} fill={draftColor} />
          ))}
          {/* Line from last point to cursor */}
          {cursor && (
            <line
              x1={draftPoints[draftPoints.length - 1].x}
              y1={draftPoints[draftPoints.length - 1].y}
              x2={cursor.x}
              y2={cursor.y}
              stroke={draftColor}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeOpacity={0.7}
            />
          )}
        </g>
      );
    }

    return null;
  })();

  // Cursor crosshair for TEXT mode
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

  const cursorStyle =
    activeTool === "SELECT" ? "default" :
    activeTool === "TEXT" ? "crosshair" :
    activeTool === "RECT" ? "crosshair" :
    activeTool === "POLYGON" ? "crosshair" :
    "default";

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
        pointerEvents: isAnnotationMode ? "all" : "none",
        cursor: cursorStyle,
        touchAction: "none"
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onDoubleClick={onDoubleClick}
    >
      {/* Confirmed annotations */}
      {annotationVisible &&
        annotations
          .filter((a) => a.isVisible)
          .map((annotation) => {
            const color = getCategoryColor(categories, annotation.categoryId);
            return (
              <g key={annotation.id}>
                {renderGeometry(annotation.geometry, color)}
                {/* Text content label */}
                {annotation.geometry?.type === "text" && annotation.textContent && (
                  <text
                    x={annotation.geometry.x + 8}
                    y={annotation.geometry.y + 4}
                    fontSize={13}
                    fill={color}
                    style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))", fontFamily: "sans-serif" }}
                  >
                    {annotation.textContent}
                  </text>
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
