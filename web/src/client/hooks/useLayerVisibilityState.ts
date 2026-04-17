"use client";

import { useEffect, useMemo, useState } from "react";

interface LayerPanelsState {
  categoryOpen: boolean;
  annotationOpen: boolean;
  aiOpen: boolean;
}

interface LayerVisibilityState {
  categoryMasterVisible: boolean;
  annotationVisible: boolean;
  aiVisible: boolean;
  aiShowBBox: boolean;
  aiShowTrackId: boolean;
  aiShowTrajectory: boolean;
}

interface UseLayerVisibilityStateResult extends LayerPanelsState, LayerVisibilityState {
  togglePanel: (panel: keyof LayerPanelsState) => void;
  setCategoryMasterVisible: (value: boolean) => void;
  setAnnotationVisible: (value: boolean) => void;
  setAiVisible: (value: boolean) => void;
  setAiShowBBox: (value: boolean) => void;
  setAiShowTrackId: (value: boolean) => void;
  setAiShowTrajectory: (value: boolean) => void;
}

const STORAGE_KEY = "viewer:layer-panels:v1";

const defaultState: LayerPanelsState & LayerVisibilityState = {
  categoryOpen: true,
  annotationOpen: true,
  aiOpen: true,
  categoryMasterVisible: true,
  annotationVisible: true,
  aiVisible: true,
  aiShowBBox: true,
  aiShowTrackId: true,
  aiShowTrajectory: false
};

function readState() {
  if (typeof window === "undefined") {
    return defaultState;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<typeof defaultState>;
    return {
      ...defaultState,
      ...parsed
    };
  } catch {
    return defaultState;
  }
}

export function useLayerVisibilityState(): UseLayerVisibilityStateResult {
  const [state, setState] = useState(defaultState);

  useEffect(() => {
    setState(readState());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  return useMemo(
    () => ({
      ...state,
      togglePanel: (panel: keyof LayerPanelsState) => {
        setState((prev) => ({
          ...prev,
          [panel]: !prev[panel]
        }));
      },
      setCategoryMasterVisible: (value: boolean) => {
        setState((prev) => ({ ...prev, categoryMasterVisible: value }));
      },
      setAnnotationVisible: (value: boolean) => {
        setState((prev) => ({ ...prev, annotationVisible: value }));
      },
      setAiVisible: (value: boolean) => {
        setState((prev) => ({ ...prev, aiVisible: value }));
      },
      setAiShowBBox: (value: boolean) => {
        setState((prev) => ({ ...prev, aiShowBBox: value }));
      },
      setAiShowTrackId: (value: boolean) => {
        setState((prev) => ({ ...prev, aiShowTrackId: value }));
      },
      setAiShowTrajectory: (value: boolean) => {
        setState((prev) => ({ ...prev, aiShowTrajectory: value }));
      }
    }),
    [state]
  );
}
