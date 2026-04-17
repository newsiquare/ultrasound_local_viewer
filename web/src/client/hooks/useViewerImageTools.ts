"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "viewer:image-tools:v1";

const MIN_ZOOM = 25;
const MAX_ZOOM = 400;

export interface ViewerImageToolsState {
  zoomPercent: number;
  fitToWindow: boolean;
  showGrid: boolean;
  measureEnabled: boolean;
  contrast: number;
  brightness: number;
}

export interface UseViewerImageToolsResult extends ViewerImageToolsState {
  zoomIn: () => void;
  zoomOut: () => void;
  setFitToWindow: (value: boolean) => void;
  setShowGrid: (value: boolean) => void;
  setMeasureEnabled: (value: boolean) => void;
  setContrast: (value: number) => void;
  setBrightness: (value: number) => void;
  resetView: () => void;
}

const defaultState: ViewerImageToolsState = {
  zoomPercent: 100,
  fitToWindow: true,
  showGrid: false,
  measureEnabled: false,
  contrast: 0,
  brightness: 0
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeState(input: Partial<ViewerImageToolsState>): ViewerImageToolsState {
  return {
    zoomPercent: clamp(Math.round(input.zoomPercent ?? defaultState.zoomPercent), MIN_ZOOM, MAX_ZOOM),
    fitToWindow: Boolean(input.fitToWindow ?? defaultState.fitToWindow),
    showGrid: Boolean(input.showGrid ?? defaultState.showGrid),
    measureEnabled: Boolean(input.measureEnabled ?? defaultState.measureEnabled),
    contrast: clamp(Math.round(input.contrast ?? defaultState.contrast), -100, 100),
    brightness: clamp(Math.round(input.brightness ?? defaultState.brightness), -100, 100)
  };
}

function readState(): ViewerImageToolsState {
  if (typeof window === "undefined") {
    return defaultState;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ViewerImageToolsState>;
    return normalizeState(parsed);
  } catch {
    return defaultState;
  }
}

export function useViewerImageTools(videoId: string | null): UseViewerImageToolsResult {
  const [state, setState] = useState<ViewerImageToolsState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const lastActiveVideoIdRef = useRef<string | null>(null);

  useEffect(() => {
    setState(readState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const lastActiveVideoId = lastActiveVideoIdRef.current;
    if (videoId && lastActiveVideoId && videoId !== lastActiveVideoId) {
      setState(defaultState);
    }

    if (videoId) {
      lastActiveVideoIdRef.current = videoId;
    }
  }, [hydrated, videoId]);

  const zoomIn = useCallback(() => {
    setState((prev) => ({
      ...prev,
      fitToWindow: false,
      zoomPercent: clamp(prev.zoomPercent + 10, MIN_ZOOM, MAX_ZOOM)
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setState((prev) => ({
      ...prev,
      fitToWindow: false,
      zoomPercent: clamp(prev.zoomPercent - 10, MIN_ZOOM, MAX_ZOOM)
    }));
  }, []);

  const setFitToWindow = useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, fitToWindow: value }));
  }, []);

  const setShowGrid = useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, showGrid: value }));
  }, []);

  const setMeasureEnabled = useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, measureEnabled: value }));
  }, []);

  const setContrast = useCallback((value: number) => {
    setState((prev) => ({ ...prev, contrast: clamp(value, -100, 100) }));
  }, []);

  const setBrightness = useCallback((value: number) => {
    setState((prev) => ({ ...prev, brightness: clamp(value, -100, 100) }));
  }, []);

  const resetView = useCallback(() => {
    setState(defaultState);
  }, []);

  return useMemo(
    () => ({
      ...state,
      zoomIn,
      zoomOut,
      setFitToWindow,
      setShowGrid,
      setMeasureEnabled,
      setContrast,
      setBrightness,
      resetView
    }),
    [state, zoomIn, zoomOut, setFitToWindow, setShowGrid, setMeasureEnabled, setContrast, setBrightness, resetView]
  );
}
