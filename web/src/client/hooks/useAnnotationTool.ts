"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createAnnotation } from "@/client/api";
import { AnnotationGeometry, AnnotationType } from "@/client/types";

export type AnnotationToolType = "SELECT" | "TEXT" | "RECT" | "POLYGON";

export interface DraftPoint {
  x: number;
  y: number;
}

export interface UseAnnotationToolOptions {
  videoId: string | null;
  frameId: string | null;
  selectedCategoryId: string | null;
  onCreated?: () => void;
}

export interface UseAnnotationToolResult {
  activeTool: AnnotationToolType | null;
  setActiveTool: (tool: AnnotationToolType | null) => void;
  isDrawing: boolean;
  draftPoints: DraftPoint[];
  /** First point of a rect drag — only populated during RECT mode drag */
  rectAnchor: DraftPoint | null;
  clearDraft: () => void;
  /** Call when the user presses a canvas pointer down */
  handlePointerDown: (x: number, y: number) => void;
  /** Call when the user moves the pointer while drawing */
  handlePointerMove: (x: number, y: number) => void;
  /** Call when the user releases the pointer */
  handlePointerUp: (x: number, y: number) => void;
  /** Call on double-click (POLYGON finish) */
  handleDoubleClick: (x: number, y: number) => void;
  /** Submitting state — prevents double creation */
  isSubmitting: boolean;
  lastError: string | null;
}

export function useAnnotationTool(options: UseAnnotationToolOptions): UseAnnotationToolResult {
  const { videoId, frameId, selectedCategoryId, onCreated } = options;

  const [activeTool, setActiveToolState] = useState<AnnotationToolType | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<DraftPoint[]>([]);
  const [rectAnchor, setRectAnchor] = useState<DraftPoint | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Keep a stable ref to avoid stale closures in event handlers
  const stateRef = useRef({ activeTool, isDrawing, draftPoints, rectAnchor });
  stateRef.current = { activeTool, isDrawing, draftPoints, rectAnchor };

  const clearDraft = useCallback(() => {
    setIsDrawing(false);
    setDraftPoints([]);
    setRectAnchor(null);
  }, []);

  const setActiveTool = useCallback(
    (tool: AnnotationToolType | null) => {
      clearDraft();
      setLastError(null);
      setActiveToolState(tool);
    },
    [clearDraft]
  );

  // Clear draft when frameId or videoId changes (user navigated away)
  useEffect(() => {
    clearDraft();
  }, [frameId, videoId, clearDraft]);

  // Press Escape to deactivate tool / cancel draft
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const { isDrawing: drawing, draftPoints: pts } = stateRef.current;
        if (drawing || pts.length > 0) {
          clearDraft();
        } else {
          setActiveToolState(null);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearDraft]);

  const submitAnnotation = useCallback(
    async (geometry: AnnotationGeometry, textContent?: string | null) => {
      if (!videoId || !frameId || !selectedCategoryId) {
        setLastError("請先選擇類別，並確認已選擇影片與幀");
        return;
      }

      const typeMap: Record<AnnotationGeometry["type"], AnnotationType> = {
        bbox: "BBOX",
        polygon: "POLYGON",
        text: "TEXT"
      };

      setIsSubmitting(true);
      setLastError(null);
      try {
        await createAnnotation(videoId, {
          frameId,
          categoryId: selectedCategoryId,
          annotationType: typeMap[geometry.type],
          geometry: geometry as unknown as Record<string, unknown>,
          textContent: textContent ?? null
        });
        clearDraft();
        onCreated?.();
      } catch (err) {
        setLastError(err instanceof Error ? err.message : "建立標註失敗");
      } finally {
        setIsSubmitting(false);
      }
    },
    [videoId, frameId, selectedCategoryId, clearDraft, onCreated]
  );

  const handlePointerDown = useCallback(
    (x: number, y: number) => {
      const { activeTool: tool } = stateRef.current;
      if (!tool || tool === "SELECT") return;

      if (tool === "RECT") {
        setRectAnchor({ x, y });
        setDraftPoints([{ x, y }]);
        setIsDrawing(true);
        return;
      }

      if (tool === "TEXT") {
        // TEXT: single click → submit immediately
        void submitAnnotation({ type: "text", x, y });
        return;
      }

      // POLYGON: add point on each click
      if (tool === "POLYGON") {
        setDraftPoints((prev) => [...prev, { x, y }]);
        setIsDrawing(true);
      }
    },
    [submitAnnotation]
  );

  const handlePointerMove = useCallback((x: number, y: number) => {
    const { activeTool: tool, isDrawing: drawing, rectAnchor: anchor } = stateRef.current;
    if (!drawing) return;

    if (tool === "RECT" && anchor) {
      // Update second point of rect preview
      setDraftPoints([anchor, { x, y }]);
    }
    // POLYGON uses separate points; live cursor handled by AnnotationCanvas via separate state
  }, []);

  const handlePointerUp = useCallback(
    (x: number, y: number) => {
      const { activeTool: tool, rectAnchor: anchor } = stateRef.current;

      if (tool === "RECT" && anchor) {
        const minX = Math.min(anchor.x, x);
        const minY = Math.min(anchor.y, y);
        const w = Math.abs(x - anchor.x);
        const h = Math.abs(y - anchor.y);
        if (w < 4 || h < 4) {
          clearDraft();
          return;
        }
        void submitAnnotation({ type: "bbox", x: minX, y: minY, width: w, height: h });
      }
    },
    [clearDraft, submitAnnotation]
  );

  const handleDoubleClick = useCallback(
    (_x: number, _y: number) => {
      const { activeTool: tool, draftPoints: pts } = stateRef.current;
      if (tool !== "POLYGON" || pts.length < 3) return;
      // Remove the duplicate point added by the last click before dblclick fires
      const finalPoints = pts.slice(0, -1);
      if (finalPoints.length < 3) return;
      void submitAnnotation({ type: "polygon", points: finalPoints });
    },
    [submitAnnotation]
  );

  return {
    activeTool,
    setActiveTool,
    isDrawing,
    draftPoints,
    rectAnchor,
    clearDraft,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
    isSubmitting,
    lastError
  };
}
