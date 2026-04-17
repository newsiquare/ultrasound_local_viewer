"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchAiResult } from "@/client/api";
import {
  AiOverlayDetection,
  createOverlayStore,
  OverlayPoint,
  OverlayStore,
  resolveDetectionsForFrame
} from "@/client/ai-overlay-stability";
import { AiStatus } from "@/client/types";

export type { AiOverlayDetection };

interface UseAiOverlayDataOptions {
  videoId: string | null;
  aiStatus: AiStatus;
  aiUpdatedAt: string | null;
  currentDisplayIndex: number | null;
}

interface UseAiOverlayDataResult {
  detections: AiOverlayDetection[];
  trajectories: Array<{ trackId: number; points: OverlayPoint[] }>;
  loading: boolean;
  error: string | null;
  hasData: boolean;
  sortedFrameIndices: number[];
  resolveFrame: (frameIndex: number) => AiOverlayDetection[];
}

export function useAiOverlayData(options: UseAiOverlayDataOptions): UseAiOverlayDataResult {
  const { videoId, aiStatus, aiUpdatedAt, currentDisplayIndex } = options;

  const [store, setStore] = useState<OverlayStore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoId) {
      setStore(null);
      setLoading(false);
      setError(null);
      return;
    }

    if (aiStatus === "IDLE" || aiStatus === "FAILED" || aiStatus === "CANCELED") {
      setStore(null);
      setLoading(false);
      setError(null);
      return;
    }

    if (aiStatus !== "DONE") {
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    void (async () => {
      try {
        const payload = await fetchAiResult(videoId, controller.signal);
        const categoryNames = new Map<number, string>();
        for (const category of payload.coco.categories ?? []) {
          categoryNames.set(category.id, category.name);
        }

        const detections: AiOverlayDetection[] = (payload.coco.annotations ?? []).map((annotation) => {
          const [x, y, width, height] = annotation.bbox;
          return {
            id: annotation.id,
            frameIndex: annotation.frame_index,
            x,
            y,
            width,
            height,
            score: annotation.score,
            trackId: Number.isFinite(annotation.track_id) ? annotation.track_id : null,
            categoryName: categoryNames.get(annotation.category_id) ?? `cat-${annotation.category_id}`
          };
        });

        setStore(createOverlayStore(detections));
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI result load failed";
        if (msg.includes("status 404") || msg.includes("NOT_FOUND")) {
          setStore(null);
          setError(null);
        } else {
          setStore(null);
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [aiStatus, aiUpdatedAt, videoId]);

  const detections = useMemo(() => {
    return resolveDetectionsForFrame(store, currentDisplayIndex);
  }, [currentDisplayIndex, store]);

  const trajectories = useMemo(() => {
    if (!store || !currentDisplayIndex) {
      return [];
    }

    const output: Array<{ trackId: number; points: OverlayPoint[] }> = [];
    for (const [trackId, points] of store.byTrackId.entries()) {
      const sliced = points.filter((point) => point.frameIndex <= currentDisplayIndex);
      if (sliced.length >= 2) {
        output.push({ trackId, points: sliced });
      }
    }

    output.sort((a, b) => a.trackId - b.trackId);
    return output;
  }, [currentDisplayIndex, store]);

  const sortedFrameIndices = useMemo(() => store?.sortedFrameIndices ?? [], [store]);

  const resolveFrame = useCallback(
    (frameIndex: number) => resolveDetectionsForFrame(store, frameIndex),
    [store]
  );

  return {
    detections,
    trajectories,
    loading,
    error,
    hasData: Boolean(store),
    sortedFrameIndices,
    resolveFrame
  };
}
