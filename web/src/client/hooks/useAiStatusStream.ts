"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cancelAiDetect, fetchAiStatus, reportAiSseHealth, startAiDetect } from "@/client/api";
import { AiStatus, AiStatusData } from "@/client/types";

interface UseAiStatusStreamOptions {
  videoId: string | null;
  initialStatus: AiStatus;
  onTerminalStatus?: () => Promise<void> | void;
}

interface UseAiStatusStreamResult {
  status: AiStatus;
  progress: number;
  errorMessage: string | null;
  updatedAt: string | null;
  durationMs: number | null;
  isStreaming: boolean;
  isPolling: boolean;
  isMutating: boolean;
  notice: string | null;
  startDetect: () => Promise<void>;
  cancelDetect: () => Promise<void>;
  dismissNotice: () => void;
}

const TERMINAL_STATUSES = new Set<AiStatus>(["DONE", "FAILED", "CANCELED"]);
type SseHealthState = "UNKNOWN" | "HEALTHY" | "DEGRADED";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeDurationMs(input: number | null | undefined): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return null;
  }
  return Math.max(0, input);
}

export function useAiStatusStream(options: UseAiStatusStreamOptions): UseAiStatusStreamResult {
  const { videoId, initialStatus, onTerminalStatus } = options;

  const [status, setStatus] = useState<AiStatus>(initialStatus);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingTimerRef = useRef<number | null>(null);
  const staleGuardTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastEventAtRef = useRef(0);
  const healthStateRef = useRef<SseHealthState>("UNKNOWN");
  const statusRef = useRef<AiStatus>(initialStatus);
  const durationMsRef = useRef<number | null>(null);
  const durationBaseMsRef = useRef<number | null>(null);
  const durationBaseAtRef = useRef<number | null>(null);

  const currentLiveDurationMs = useCallback((nowTs: number = Date.now()): number | null => {
    const baseMs = durationBaseMsRef.current;
    const baseAt = durationBaseAtRef.current;
    if (baseMs === null || baseAt === null) {
      return durationMsRef.current;
    }
    return Math.max(0, baseMs + (nowTs - baseAt));
  }, []);

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current !== null) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const stopStaleGuard = useCallback(() => {
    if (staleGuardTimerRef.current !== null) {
      window.clearInterval(staleGuardTimerRef.current);
      staleGuardTimerRef.current = null;
    }
  }, []);

  const reportHealthState = useCallback(
    (state: "HEALTHY" | "DEGRADED", reason: string) => {
      if (!videoId) {
        return;
      }

      if (healthStateRef.current === state) {
        return;
      }
      healthStateRef.current = state;

      void reportAiSseHealth(videoId, { state, reason }).catch(() => {
        // Ignore reporting failures; monitoring must not block playback.
      });
    },
    [videoId]
  );

  const applySnapshot = useCallback(
    (snapshot: AiStatusData) => {
      const nowTs = Date.now();
      const prevStatus = statusRef.current;
      const nextStatus = snapshot.status;

      setStatus(nextStatus);
      statusRef.current = nextStatus;

      setProgress(snapshot.progress ?? (nextStatus === "DONE" ? 100 : 0));
      setErrorMessage(snapshot.errorMessage ?? null);
      setUpdatedAt(snapshot.updatedAt ?? nowIso());
      lastEventAtRef.current = nowTs;

      const providedDurationMs = normalizeDurationMs(snapshot.durationMs);
      const liveDurationMs = currentLiveDurationMs(nowTs);
      let resolvedDurationMs: number | null = null;

      if (nextStatus === "PROCESSING") {
        const baseMs =
          providedDurationMs ??
          (prevStatus === "PROCESSING" && liveDurationMs !== null ? liveDurationMs : 0);
        durationBaseMsRef.current = baseMs;
        durationBaseAtRef.current = nowTs;
        resolvedDurationMs = baseMs;
      } else if (TERMINAL_STATUSES.has(nextStatus)) {
        resolvedDurationMs = providedDurationMs ?? liveDurationMs;
        durationBaseMsRef.current = null;
        durationBaseAtRef.current = null;
      } else {
        durationBaseMsRef.current = null;
        durationBaseAtRef.current = null;
        resolvedDurationMs = null;
      }

      durationMsRef.current = resolvedDurationMs;
      setDurationMs(resolvedDurationMs);
    },
    [currentLiveDurationMs]
  );

  const pollOnce = useCallback(async () => {
    if (!videoId) {
      return;
    }

    try {
      const snapshot = await fetchAiStatus(videoId);
      applySnapshot(snapshot);
      if (TERMINAL_STATUSES.has(snapshot.status)) {
        closeEventSource();
        stopPolling();
        reportHealthState("HEALTHY", "TERMINAL_STATUS");
        void onTerminalStatus?.();
      }
    } catch {
      // Ignore transient polling errors.
    }
  }, [applySnapshot, closeEventSource, onTerminalStatus, reportHealthState, stopPolling, videoId]);

  const startPolling = useCallback(
    (reason: string) => {
      if (!videoId || pollingTimerRef.current !== null) {
        return;
      }

      reportHealthState("DEGRADED", reason);
      setIsPolling(true);
      void pollOnce();

      pollingTimerRef.current = window.setInterval(() => {
        void pollOnce();
      }, 5000);
    },
    [pollOnce, reportHealthState, videoId]
  );

  useEffect(() => {
    setStatus(initialStatus);
    setProgress(initialStatus === "DONE" ? 100 : 0);
    setErrorMessage(null);
    setUpdatedAt(null);
    setDurationMs(null);
    statusRef.current = initialStatus;
    durationMsRef.current = null;
    durationBaseMsRef.current = null;
    durationBaseAtRef.current = null;

    reconnectAttemptsRef.current = 0;
    lastEventAtRef.current = Date.now();
    healthStateRef.current = "UNKNOWN";

    stopPolling();
    stopStaleGuard();
    closeEventSource();

    if (!videoId) {
      return;
    }

    const eventSource = new EventSource(`/api/videos/${videoId}/ai-status/stream`);
    eventSourceRef.current = eventSource;

    const onAnyEvent = () => {
      lastEventAtRef.current = Date.now();
      reconnectAttemptsRef.current = 0;
      setIsStreaming(true);
      if (pollingTimerRef.current !== null) {
        stopPolling();
      }
      reportHealthState("HEALTHY", "SSE_EVENT_RECEIVED");
    };

    const parseEvent = (event: MessageEvent<string>) => {
      onAnyEvent();
      try {
        const payload = JSON.parse(event.data) as AiStatusData;
        applySnapshot(payload);
        if (TERMINAL_STATUSES.has(payload.status)) {
          closeEventSource();
          stopPolling();
          void onTerminalStatus?.();
        }
      } catch {
        // Ignore malformed event payloads.
      }
    };

    eventSource.addEventListener("status", parseEvent);
    eventSource.addEventListener("progress", parseEvent);
    eventSource.addEventListener("done", parseEvent);
    eventSource.addEventListener("failed", parseEvent);
    eventSource.addEventListener("canceled", parseEvent);

    eventSource.onerror = () => {
      reconnectAttemptsRef.current += 1;
      setIsStreaming(false);

      if (reconnectAttemptsRef.current >= 3) {
        startPolling("CONNECT_RETRY_EXCEEDED");
      }
    };

    staleGuardTimerRef.current = window.setInterval(() => {
      if (Date.now() - lastEventAtRef.current > 30000) {
        startPolling("NO_EVENT_TIMEOUT");
      }
    }, 5000);

    return () => {
      eventSource.removeEventListener("status", parseEvent);
      eventSource.removeEventListener("progress", parseEvent);
      eventSource.removeEventListener("done", parseEvent);
      eventSource.removeEventListener("failed", parseEvent);
      eventSource.removeEventListener("canceled", parseEvent);
      closeEventSource();
      stopPolling();
      stopStaleGuard();
    };
  }, [
    applySnapshot,
    closeEventSource,
    initialStatus,
    reportHealthState,
    startPolling,
    stopPolling,
    stopStaleGuard,
    videoId,
    onTerminalStatus
  ]);

  useEffect(() => {
    if (status !== "PROCESSING") {
      return;
    }

    const timer = window.setInterval(() => {
      const nextDurationMs = currentLiveDurationMs();
      durationMsRef.current = nextDurationMs;
      setDurationMs(nextDurationMs);
    }, 200);

    return () => {
      window.clearInterval(timer);
    };
  }, [currentLiveDurationMs, status]);

  const startDetect = useCallback(async () => {
    if (!videoId || status === "PROCESSING") {
      return;
    }

    setIsMutating(true);
    try {
      const result = await startAiDetect(videoId);
      applySnapshot(result);
      setNotice("開始辨識");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to start AI detection";
      setNotice(`開始辨識失敗：${msg}`);
    } finally {
      setIsMutating(false);
    }
  }, [applySnapshot, status, videoId]);

  const cancelDetect = useCallback(async () => {
    if (!videoId || status !== "PROCESSING") {
      return;
    }

    setIsMutating(true);
    try {
      const result = await cancelAiDetect(videoId);
      applySnapshot(result);
      setNotice("已取消辨識");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to cancel AI detection";
      setNotice(`取消辨識失敗：${msg}`);
    } finally {
      setIsMutating(false);
    }
  }, [applySnapshot, status, videoId]);

  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);

  return useMemo(
    () => ({
      status,
      progress,
      errorMessage,
      updatedAt,
      durationMs,
      isStreaming,
      isPolling,
      isMutating,
      notice,
      startDetect,
      cancelDetect,
      dismissNotice
    }),
    [
      cancelDetect,
      dismissNotice,
      durationMs,
      errorMessage,
      isMutating,
      isPolling,
      isStreaming,
      notice,
      progress,
      startDetect,
      status,
      updatedAt
    ]
  );
}
