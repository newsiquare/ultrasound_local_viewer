"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchAiResult } from "@/client/api";
import { AiResultAnnotation, AiStatus } from "@/client/types";

interface OverlayPoint {
  frameIndex: number;
  x: number;
  y: number;
}

export interface AiOverlayDetection {
  id: number;
  frameIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  trackId: number | null;
  categoryName: string;
}

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
}

interface OverlayStore {
  byFrameIndex: Map<number, AiOverlayDetection[]>;
  byTrackId: Map<number, OverlayPoint[]>;
}

function toOverlayStore(annotations: AiResultAnnotation[], categoryNames: Map<number, string>): OverlayStore {
  const byFrameIndex = new Map<number, AiOverlayDetection[]>();
  const byTrackId = new Map<number, OverlayPoint[]>();

  for (const annotation of annotations) {
    const [x, y, width, height] = annotation.bbox;
    const frameIndex = annotation.frame_index;

    const detection: AiOverlayDetection = {
      id: annotation.id,
      frameIndex,
      x,
      y,
      width,
      height,
      score: annotation.score,
      trackId: Number.isFinite(annotation.track_id) ? annotation.track_id : null,
      categoryName: categoryNames.get(annotation.category_id) ?? `cat-${annotation.category_id}`
    };

    const frameList = byFrameIndex.get(frameIndex) ?? [];
    frameList.push(detection);
    byFrameIndex.set(frameIndex, frameList);

    if (detection.trackId !== null) {
      const points = byTrackId.get(detection.trackId) ?? [];
      points.push({
        frameIndex,
        x: x + width / 2,
        y: y + height / 2
      });
      byTrackId.set(detection.trackId, points);
    }
  }

  for (const [key, value] of byFrameIndex.entries()) {
    value.sort((a, b) => a.id - b.id);
    byFrameIndex.set(key, value);
  }

  for (const [key, value] of byTrackId.entries()) {
    value.sort((a, b) => a.frameIndex - b.frameIndex);
    byTrackId.set(key, value);
  }

  return {
    byFrameIndex,
    byTrackId
  };
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

        setStore(toOverlayStore(payload.coco.annotations ?? [], categoryNames));
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
    if (!store || !currentDisplayIndex) {
      return [];
    }
    return store.byFrameIndex.get(currentDisplayIndex) ?? [];
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

  return {
    detections,
    trajectories,
    loading,
    error,
    hasData: Boolean(store)
  };
}
