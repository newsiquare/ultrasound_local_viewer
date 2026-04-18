"use client";

import { useCallback, useRef, useState } from "react";

import { createAnnotation, deleteAnnotation, updateAnnotation } from "@/client/api";
import { AnnotationGeometry, AnnotationItem, AnnotationType } from "@/client/types";

type HistoryEntry =
  | { type: "CREATE"; videoId: string; annotation: AnnotationItem }
  | { type: "DELETE"; videoId: string; annotation: AnnotationItem }
  | {
      type: "UPDATE";
      videoId: string;
      annotationId: string;
      oldGeometry: AnnotationGeometry;
      newGeometry: AnnotationGeometry;
    };

const GEOMETRY_TYPE_MAP: Record<string, AnnotationType> = {
  bbox: "BBOX",
  polygon: "POLYGON",
  text: "TEXT",
};

export interface UseAnnotationHistoryResult {
  canUndo: boolean;
  canRedo: boolean;
  pushCreate: (videoId: string, annotation: AnnotationItem) => void;
  pushDelete: (videoId: string, annotation: AnnotationItem) => void;
  pushUpdate: (
    videoId: string,
    annotationId: string,
    oldGeometry: AnnotationGeometry,
    newGeometry: AnnotationGeometry
  ) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clearHistory: () => void;
}

export function useAnnotationHistory(onMutated: () => void): UseAnnotationHistoryResult {
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const sync = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const pushCreate = useCallback(
    (videoId: string, annotation: AnnotationItem) => {
      undoStackRef.current.push({ type: "CREATE", videoId, annotation });
      redoStackRef.current = [];
      sync();
    },
    [sync]
  );

  const pushDelete = useCallback(
    (videoId: string, annotation: AnnotationItem) => {
      undoStackRef.current.push({ type: "DELETE", videoId, annotation });
      redoStackRef.current = [];
      sync();
    },
    [sync]
  );

  const pushUpdate = useCallback(
    (
      videoId: string,
      annotationId: string,
      oldGeometry: AnnotationGeometry,
      newGeometry: AnnotationGeometry
    ) => {
      undoStackRef.current.push({ type: "UPDATE", videoId, annotationId, oldGeometry, newGeometry });
      redoStackRef.current = [];
      sync();
    },
    [sync]
  );

  const undo = useCallback(async () => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;

    try {
      let redoEntry: HistoryEntry;

      if (entry.type === "CREATE") {
        // Undo create → delete
        await deleteAnnotation(entry.videoId, entry.annotation.id);
        redoEntry = entry; // redo = re-create
      } else if (entry.type === "DELETE") {
        // Undo delete → re-create with original geometry
        const ann = entry.annotation;
        const created = await createAnnotation(entry.videoId, {
          frameId: ann.frameId,
          categoryId: ann.categoryId,
          annotationType: GEOMETRY_TYPE_MAP[ann.geometry?.type ?? "bbox"] ?? "BBOX",
          geometry: ann.geometry as unknown as Record<string, unknown>,
          textContent: ann.textContent,
        });
        redoEntry = { type: "DELETE", videoId: entry.videoId, annotation: created };
      } else {
        // Undo update → restore old geometry
        await updateAnnotation(entry.videoId, entry.annotationId, { geometry: entry.oldGeometry });
        redoEntry = {
          type: "UPDATE",
          videoId: entry.videoId,
          annotationId: entry.annotationId,
          oldGeometry: entry.newGeometry,
          newGeometry: entry.oldGeometry,
        };
      }

      redoStackRef.current.push(redoEntry);
      onMutated();
    } catch {
      // Restore entry on failure
      undoStackRef.current.push(entry);
    }
    sync();
  }, [onMutated, sync]);

  const redo = useCallback(async () => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;

    try {
      let undoEntry: HistoryEntry;

      if (entry.type === "CREATE") {
        // Redo create → re-create
        const ann = entry.annotation;
        const created = await createAnnotation(entry.videoId, {
          frameId: ann.frameId,
          categoryId: ann.categoryId,
          annotationType: GEOMETRY_TYPE_MAP[ann.geometry?.type ?? "bbox"] ?? "BBOX",
          geometry: ann.geometry as unknown as Record<string, unknown>,
          textContent: ann.textContent,
        });
        undoEntry = { type: "CREATE", videoId: entry.videoId, annotation: created };
      } else if (entry.type === "DELETE") {
        // Redo delete → delete again
        await deleteAnnotation(entry.videoId, entry.annotation.id);
        undoEntry = entry; // undo = re-create
      } else {
        // Redo update → apply new geometry
        await updateAnnotation(entry.videoId, entry.annotationId, { geometry: entry.newGeometry });
        undoEntry = {
          type: "UPDATE",
          videoId: entry.videoId,
          annotationId: entry.annotationId,
          oldGeometry: entry.oldGeometry,
          newGeometry: entry.newGeometry,
        };
      }

      undoStackRef.current.push(undoEntry);
      onMutated();
    } catch {
      redoStackRef.current.push(entry);
    }
    sync();
  }, [onMutated, sync]);

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    sync();
  }, [sync]);

  return { canUndo, canRedo, pushCreate, pushDelete, pushUpdate, undo, redo, clearHistory };
}
