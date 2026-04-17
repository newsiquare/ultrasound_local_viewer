"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchBootstrap } from "@/client/api";
import { BootstrapData } from "@/client/types";

interface SessionState {
  currentVideoId: string | null;
  snapshotUpdatedAt: string | null;
  lastBootstrapAt: string | null;
}

interface UseViewerSessionStateResult {
  isHydrated: boolean;
  currentVideoId: string | null;
  bootstrapData: BootstrapData | null;
  isBootstrapLoading: boolean;
  statusMessage: string | null;
  setCurrentVideoId: (videoId: string | null) => void;
  clearFrontendState: () => void;
  revalidateBootstrap: () => Promise<void>;
}

const STORAGE_KEY = "viewer:session-state:v1";

function readSession(): SessionState {
  if (typeof window === "undefined") {
    return {
      currentVideoId: null,
      snapshotUpdatedAt: null,
      lastBootstrapAt: null
    };
  }

  const text = window.localStorage.getItem(STORAGE_KEY);
  if (!text) {
    return {
      currentVideoId: null,
      snapshotUpdatedAt: null,
      lastBootstrapAt: null
    };
  }

  try {
    const parsed = JSON.parse(text) as SessionState;
    return {
      currentVideoId: parsed.currentVideoId ?? null,
      snapshotUpdatedAt: parsed.snapshotUpdatedAt ?? null,
      lastBootstrapAt: parsed.lastBootstrapAt ?? null
    };
  } catch {
    return {
      currentVideoId: null,
      snapshotUpdatedAt: null,
      lastBootstrapAt: null
    };
  }
}

function writeSession(state: SessionState): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useViewerSessionState(): UseViewerSessionStateResult {
  const [isHydrated, setIsHydrated] = useState(false);
  const [currentVideoId, setCurrentVideoIdState] = useState<string | null>(null);
  const [bootstrapData, setBootstrapData] = useState<BootstrapData | null>(null);
  const [isBootstrapLoading, setIsBootstrapLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [snapshotUpdatedAt, setSnapshotUpdatedAt] = useState<string | null>(null);
  const [lastBootstrapAt, setLastBootstrapAt] = useState<string | null>(null);

  useEffect(() => {
    const session = readSession();
    setCurrentVideoIdState(session.currentVideoId);
    setSnapshotUpdatedAt(session.snapshotUpdatedAt);
    setLastBootstrapAt(session.lastBootstrapAt);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    writeSession({
      currentVideoId,
      snapshotUpdatedAt,
      lastBootstrapAt
    });
  }, [currentVideoId, isHydrated, lastBootstrapAt, snapshotUpdatedAt]);

  const clearFrontendState = useCallback(() => {
    setCurrentVideoIdState(null);
    setBootstrapData(null);
    setStatusMessage(null);
    setSnapshotUpdatedAt(null);
    setLastBootstrapAt(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const revalidateBootstrap = useCallback(async () => {
    if (!currentVideoId) {
      setBootstrapData(null);
      return;
    }

    setIsBootstrapLoading(true);

    try {
      const data = await fetchBootstrap(currentVideoId);
      setBootstrapData(data);
      setStatusMessage(null);
      setSnapshotUpdatedAt(new Date().toISOString());
      setLastBootstrapAt(new Date().toISOString());
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      if (msg.includes("status 404") || msg.includes("NOT_FOUND")) {
        clearFrontendState();
        setStatusMessage("資料已不存在，已重置畫面");
        return;
      }

      setStatusMessage(`Bootstrap revalidate failed: ${msg}`);
    } finally {
      setIsBootstrapLoading(false);
    }
  }, [clearFrontendState, currentVideoId]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    void revalidateBootstrap();
  }, [isHydrated, revalidateBootstrap]);

  const setCurrentVideoId = useCallback((videoId: string | null) => {
    setCurrentVideoIdState(videoId);
    if (videoId) {
      setStatusMessage(null);
    }
  }, []);

  return useMemo(
    () => ({
      isHydrated,
      currentVideoId,
      bootstrapData,
      isBootstrapLoading,
      statusMessage,
      setCurrentVideoId,
      clearFrontendState,
      revalidateBootstrap
    }),
    [
      bootstrapData,
      clearFrontendState,
      currentVideoId,
      isBootstrapLoading,
      isHydrated,
      revalidateBootstrap,
      setCurrentVideoId,
      statusMessage
    ]
  );
}
