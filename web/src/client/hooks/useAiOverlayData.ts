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
  byTrackDetections: Map<number, AiOverlayDetection[]>;
  sortedFrameIndices: number[];
}

function toOverlayStore(annotations: AiResultAnnotation[], categoryNames: Map<number, string>): OverlayStore {
  const byFrameIndex = new Map<number, AiOverlayDetection[]>();
  const byTrackId = new Map<number, OverlayPoint[]>();
  const byTrackDetections = new Map<number, AiOverlayDetection[]>();

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

      const list = byTrackDetections.get(detection.trackId) ?? [];
      list.push(detection);
      byTrackDetections.set(detection.trackId, list);
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

  for (const [key, value] of byTrackDetections.entries()) {
    value.sort((a, b) => a.frameIndex - b.frameIndex || a.id - b.id);
    byTrackDetections.set(key, value);
  }

  const sortedFrameIndices = Array.from(byFrameIndex.keys()).sort((a, b) => a - b);

  return {
    byFrameIndex,
    byTrackId,
    byTrackDetections,
    sortedFrameIndices
  };
}

const MAX_INTERPOLATION_GAP = 8;
const MAX_CARRY_FORWARD_GAP = 2;

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function findPrevDetectionIndex(
  detections: AiOverlayDetection[],
  targetFrameIndex: number
): number {
  let low = 0;
  let high = detections.length - 1;
  let answer = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const frameIndex = detections[mid].frameIndex;
    if (frameIndex <= targetFrameIndex) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return answer;
}

function interpolateDetection(
  trackId: number,
  currentDisplayIndex: number,
  prev: AiOverlayDetection,
  next: AiOverlayDetection
): AiOverlayDetection {
  const span = Math.max(1, next.frameIndex - prev.frameIndex);
  const t = Math.min(1, Math.max(0, (currentDisplayIndex - prev.frameIndex) / span));

  return {
    ...prev,
    id: trackId * 1_000_000 + currentDisplayIndex,
    frameIndex: currentDisplayIndex,
    x: lerp(prev.x, next.x, t),
    y: lerp(prev.y, next.y, t),
    width: lerp(prev.width, next.width, t),
    height: lerp(prev.height, next.height, t),
    score: lerp(prev.score, next.score, t)
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

    const exact = store.byFrameIndex.get(currentDisplayIndex);
    if (exact && exact.length > 0) {
      return exact;
    }

    const blended: AiOverlayDetection[] = [];

    for (const [trackId, list] of store.byTrackDetections.entries()) {
      if (list.length === 0) {
        continue;
      }

      const prevIndex = findPrevDetectionIndex(list, currentDisplayIndex);
      if (prevIndex < 0) {
        continue;
      }

      const prev = list[prevIndex];
      if (prev.frameIndex === currentDisplayIndex) {
        blended.push(prev);
        continue;
      }

      const next = list[prevIndex + 1];
      if (
        next &&
        next.frameIndex > currentDisplayIndex &&
        next.frameIndex - prev.frameIndex <= MAX_INTERPOLATION_GAP
      ) {
        blended.push(interpolateDetection(trackId, currentDisplayIndex, prev, next));
        continue;
      }

      if (currentDisplayIndex - prev.frameIndex <= MAX_CARRY_FORWARD_GAP) {
        blended.push({
          ...prev,
          id: trackId * 1_000_000 + currentDisplayIndex,
          frameIndex: currentDisplayIndex
        });
      }
    }

    if (blended.length > 0) {
      blended.sort((a, b) => a.id - b.id);
      return blended;
    }

    // Fallback for old outputs without track_id: carry one frame from latest available detections.
    let prevFrameWithDetections: number | null = null;
    for (const frameIndex of store.sortedFrameIndices) {
      if (frameIndex > currentDisplayIndex) {
        break;
      }
      prevFrameWithDetections = frameIndex;
    }

    if (
      prevFrameWithDetections !== null &&
      currentDisplayIndex - prevFrameWithDetections <= 1
    ) {
      const fallback = store.byFrameIndex.get(prevFrameWithDetections) ?? [];
      return fallback.map((item, index) => ({
        ...item,
        id: item.id * 10 + index + 1,
        frameIndex: currentDisplayIndex
      }));
    }

    return [];
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
