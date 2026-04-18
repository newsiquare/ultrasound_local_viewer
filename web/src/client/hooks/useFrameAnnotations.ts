"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchAnnotations } from "@/client/api";
import { AnnotationItem } from "@/client/types";

interface UseFrameAnnotationsOptions {
  videoId: string | null;
  frameId: string | null;
  enabled: boolean;
  fallbackItems?: AnnotationItem[];
  /** Increment to force a cache bust + re-fetch for the current frame */
  refreshKey?: number;
}

interface UseFrameAnnotationsResult {
  items: AnnotationItem[];
  loading: boolean;
  error: string | null;
}

const REQUEST_THROTTLE_MS = 120;

export function useFrameAnnotations(options: UseFrameAnnotationsOptions): UseFrameAnnotationsResult {
  const { videoId, frameId, enabled, fallbackItems, refreshKey } = options;

  const [items, setItems] = useState<AnnotationItem[]>(fallbackItems ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheRef = useRef<Map<string, AnnotationItem[]>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<AnnotationItem[]>>>(new Map());
  const lastFetchAtRef = useRef(0);
  const queuedFrameIdRef = useRef<string | null>(null);
  const throttleTimerRef = useRef<number | null>(null);
  const activeKeyRef = useRef<string | null>(null);

  const runFetch = useCallback(
    async (targetFrameId: string) => {
      if (!videoId || !enabled) {
        return;
      }

      const key = `${videoId}:${targetFrameId}`;
      activeKeyRef.current = key;

      const cached = cacheRef.current.get(key);
      if (cached) {
        setItems(cached);
        setLoading(false);
        setError(null);
        return;
      }

      const existing = inFlightRef.current.get(key);
      if (existing) {
        setLoading(true);
        try {
          const resolved = await existing;
          if (activeKeyRef.current === key) {
            setItems(resolved);
            setError(null);
          }
        } catch (err) {
          if (activeKeyRef.current === key) {
            const msg = err instanceof Error ? err.message : "Fetch frame annotations failed";
            setError(msg);
          }
        } finally {
          if (activeKeyRef.current === key) {
            setLoading(false);
          }
        }
        return;
      }

      const requestPromise = (async () => {
        const result = await fetchAnnotations(videoId, {
          frameId: targetFrameId,
          source: "MANUAL",
          cursor: 0,
          limit: 500
        });
        return result.items;
      })();

      inFlightRef.current.set(key, requestPromise);
      setLoading(true);
      lastFetchAtRef.current = Date.now();

      try {
        const resolved = await requestPromise;
        cacheRef.current.set(key, resolved);

        if (cacheRef.current.size > 1200) {
          const firstKey = cacheRef.current.keys().next().value;
          if (firstKey) {
            cacheRef.current.delete(firstKey);
          }
        }

        if (activeKeyRef.current === key) {
          setItems(resolved);
          setError(null);
        }
      } catch (err) {
        if (activeKeyRef.current === key) {
          const msg = err instanceof Error ? err.message : "Fetch frame annotations failed";
          setError(msg);
        }
      } finally {
        inFlightRef.current.delete(key);
        if (activeKeyRef.current === key) {
          setLoading(false);
        }
      }
    },
    [enabled, videoId]
  );

  const scheduleFetch = useCallback(
    (targetFrameId: string) => {
      const elapsed = Date.now() - lastFetchAtRef.current;
      if (elapsed >= REQUEST_THROTTLE_MS) {
        if (throttleTimerRef.current !== null) {
          window.clearTimeout(throttleTimerRef.current);
          throttleTimerRef.current = null;
        }
        void runFetch(targetFrameId);
        return;
      }

      queuedFrameIdRef.current = targetFrameId;
      if (throttleTimerRef.current !== null) {
        return;
      }

      throttleTimerRef.current = window.setTimeout(() => {
        throttleTimerRef.current = null;
        const queued = queuedFrameIdRef.current;
        queuedFrameIdRef.current = null;
        if (queued) {
          void runFetch(queued);
        }
      }, REQUEST_THROTTLE_MS - elapsed);
    },
    [runFetch]
  );

  useEffect(() => {
    cacheRef.current = new Map();
    inFlightRef.current = new Map();
    activeKeyRef.current = null;
    queuedFrameIdRef.current = null;
    lastFetchAtRef.current = 0;

    if (throttleTimerRef.current !== null) {
      window.clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }

    setItems([]);
    setError(null);
    setLoading(false);
  }, [videoId]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (!videoId || !frameId) {
      setItems([]);
      setLoading(false);
      return;
    }

    const cacheKey = `${videoId}:${frameId}`;
    if (!cacheRef.current.has(cacheKey) && fallbackItems && fallbackItems.length > 0) {
      setItems(fallbackItems);
    }

    scheduleFetch(frameId);
  }, [enabled, fallbackItems, frameId, scheduleFetch, videoId]);

  // When refreshKey increments, bust cache for the current key and re-fetch
  useEffect(() => {
    if (refreshKey === undefined || !videoId || !frameId || !enabled) return;
    const cacheKey = `${videoId}:${frameId}`;
    cacheRef.current.delete(cacheKey);
    void runFetch(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    return () => {
      if (throttleTimerRef.current !== null) {
        window.clearTimeout(throttleTimerRef.current);
      }
    };
  }, []);

  return useMemo(
    () => ({
      items,
      loading,
      error
    }),
    [error, items, loading]
  );
}
