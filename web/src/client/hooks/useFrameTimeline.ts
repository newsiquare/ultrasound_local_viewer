"use client";

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchTimelineAll } from "@/client/api";
import { TimelineFrame } from "@/client/types";

interface UseFrameTimelineOptions {
  videoId: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}

interface UseFrameTimelineResult {
  frames: TimelineFrame[];
  loading: boolean;
  error: string | null;
  currentFrame: TimelineFrame | null;
  currentFrameIndex: number;
  currentTimeSec: number;
  durationSec: number;
  isPlaying: boolean;
  playbackRate: number;
  isScrubbing: boolean;
  scrubTimeSec: number;
  usesRequestVideoFrameCallback: boolean;
  refreshTimeline: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  setPlaybackRate: (nextRate: number) => void;
  stepPrevFrame: () => void;
  stepNextFrame: () => void;
  startScrub: () => void;
  updateScrubTime: (nextTimeSec: number) => void;
  endScrub: () => Promise<void>;
}

interface VideoFrameMetadataLike {
  mediaTime: number;
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameMetadataLike) => void
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findLastPtsIndex(frames: TimelineFrame[], queryPtsUs: number): number {
  if (frames.length === 0) {
    return -1;
  }

  let low = 0;
  let high = frames.length - 1;
  let answer = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const frame = frames[mid];
    if (frame.ptsUs <= queryPtsUs) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (answer < 0) {
    return 0;
  }

  return answer;
}

export function useFrameTimeline(options: UseFrameTimelineOptions): UseFrameTimelineResult {
  const { videoId, videoRef } = options;

  const [frames, setFrames] = useState<TimelineFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(-1);
  const [currentFrame, setCurrentFrame] = useState<TimelineFrame | null>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTimeSec, setScrubTimeSec] = useState(0);
  const [usesRequestVideoFrameCallback, setUsesRequestVideoFrameCallback] = useState(false);

  const framesRef = useRef<TimelineFrame[]>([]);
  const lastFrameIndexRef = useRef(-1);
  const isSeekingRef = useRef(false);
  const isScrubbingRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);

  const syncFrameFromMediaTime = useCallback((mediaTimeSec: number, applyMonotonicGuard: boolean) => {
    const safeTimeSec = Number.isFinite(mediaTimeSec) && mediaTimeSec >= 0 ? mediaTimeSec : 0;
    setCurrentTimeSec(safeTimeSec);

    if (isScrubbingRef.current) {
      return;
    }

    const timelineFrames = framesRef.current;
    if (timelineFrames.length === 0) {
      setCurrentFrameIndex(-1);
      setCurrentFrame(null);
      return;
    }

    const queryPtsUs = Math.round(safeTimeSec * 1_000_000);
    let nextIndex = findLastPtsIndex(timelineFrames, queryPtsUs);

    if (applyMonotonicGuard && !isSeekingRef.current && lastFrameIndexRef.current >= 0) {
      if (nextIndex < lastFrameIndexRef.current) {
        nextIndex = lastFrameIndexRef.current;
      }
    }

    const boundedIndex = clamp(nextIndex, 0, timelineFrames.length - 1);
    lastFrameIndexRef.current = boundedIndex;
    setCurrentFrameIndex(boundedIndex);
    setCurrentFrame(timelineFrames[boundedIndex] ?? null);
  }, []);

  const refreshTimeline = useCallback(async () => {
    if (!videoId) {
      setFrames([]);
      framesRef.current = [];
      setCurrentFrameIndex(-1);
      setCurrentFrame(null);
      setError(null);
      return;
    }

    setLoading(true);

    try {
      const loaded = await fetchTimelineAll(videoId);
      framesRef.current = loaded;
      setFrames(loaded);
      setError(null);
      lastFrameIndexRef.current = -1;

      const initialTime = videoRef.current?.currentTime ?? 0;
      syncFrameFromMediaTime(initialTime, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown timeline loading error";
      setError(msg);
      framesRef.current = [];
      setFrames([]);
      setCurrentFrameIndex(-1);
      setCurrentFrame(null);
    } finally {
      setLoading(false);
    }
  }, [syncFrameFromMediaTime, videoId, videoRef]);

  useEffect(() => {
    void refreshTimeline();
  }, [refreshTimeline]);

  useEffect(() => {
    const video = videoRef.current as VideoWithFrameCallback | null;
    if (!video) {
      return;
    }

    let rafId = 0;
    let frameCallbackId = 0;

    const onPlay = () => {
      setIsPlaying(true);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    const onRateChange = () => {
      setPlaybackRateState(video.playbackRate || 1);
    };

    const onLoadedMetadata = () => {
      setDurationSec(Number.isFinite(video.duration) ? video.duration : 0);
      syncFrameFromMediaTime(video.currentTime || 0, false);
    };

    const onDurationChange = () => {
      setDurationSec(Number.isFinite(video.duration) ? video.duration : 0);
    };

    const hasRvfc = typeof video.requestVideoFrameCallback === "function";

    const onTimeUpdate = () => {
      if (!hasRvfc) {
        syncFrameFromMediaTime(video.currentTime || 0, true);
      }
    };

    const onSeeking = () => {
      isSeekingRef.current = true;
    };

    const onSeeked = () => {
      isSeekingRef.current = false;
      lastFrameIndexRef.current = -1;
      syncFrameFromMediaTime(video.currentTime || 0, false);
    };

    setUsesRequestVideoFrameCallback(hasRvfc);

    const startFallbackLoop = () => {
      const tick = () => {
        if (!video.paused && !video.ended) {
          syncFrameFromMediaTime(video.currentTime || 0, true);
        }
        rafId = window.requestAnimationFrame(tick);
      };
      rafId = window.requestAnimationFrame(tick);
    };

    const startRvfcLoop = () => {
      if (!video.requestVideoFrameCallback) {
        return;
      }
      const tick = (_now: number, metadata: VideoFrameMetadataLike) => {
        syncFrameFromMediaTime(metadata.mediaTime ?? video.currentTime ?? 0, true);
        if (video.requestVideoFrameCallback) {
          frameCallbackId = video.requestVideoFrameCallback(tick);
        }
      };

      frameCallbackId = video.requestVideoFrameCallback(tick);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ratechange", onRateChange);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);

    setIsPlaying(!video.paused);
    setPlaybackRateState(video.playbackRate || 1);
    setDurationSec(Number.isFinite(video.duration) ? video.duration : 0);
    syncFrameFromMediaTime(video.currentTime || 0, false);

    if (hasRvfc) {
      startRvfcLoop();
    } else {
      startFallbackLoop();
    }

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);

      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      if (frameCallbackId && video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(frameCallbackId);
      }
    };
  }, [syncFrameFromMediaTime, videoId, videoRef]);

  const togglePlayPause = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused) {
      try {
        await video.play();
      } catch {
        // Autoplay restrictions can reject play().
      }
      return;
    }

    video.pause();
  }, [videoRef]);

  const seekToFrameIndex = useCallback(
    (index: number) => {
      const video = videoRef.current;
      if (!video || framesRef.current.length === 0) {
        return;
      }

      const safeIndex = clamp(index, 0, framesRef.current.length - 1);
      const frame = framesRef.current[safeIndex];
      const targetTime = frame.ptsUs / 1_000_000;
      video.pause();
      video.currentTime = targetTime;
      setCurrentTimeSec(targetTime);
      lastFrameIndexRef.current = -1;
      setCurrentFrameIndex(safeIndex);
      setCurrentFrame(frame);
    },
    [videoRef]
  );

  const stepPrevFrame = useCallback(() => {
    if (framesRef.current.length === 0) {
      return;
    }

    const baseIndex = currentFrameIndex >= 0 ? currentFrameIndex : 0;
    seekToFrameIndex(baseIndex - 1);
  }, [currentFrameIndex, seekToFrameIndex]);

  const stepNextFrame = useCallback(() => {
    if (framesRef.current.length === 0) {
      return;
    }

    const baseIndex = currentFrameIndex >= 0 ? currentFrameIndex : 0;
    seekToFrameIndex(baseIndex + 1);
  }, [currentFrameIndex, seekToFrameIndex]);

  const setPlaybackRate = useCallback(
    (nextRate: number) => {
      const safeRate = clamp(nextRate, 0.25, 4);
      const video = videoRef.current;
      if (video) {
        video.playbackRate = safeRate;
      }
      setPlaybackRateState(safeRate);
    },
    [videoRef]
  );

  const startScrub = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    wasPlayingBeforeScrubRef.current = !video.paused;
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    setScrubTimeSec(video.currentTime || currentTimeSec || 0);
    video.pause();
  }, [currentTimeSec, videoRef]);

  const updateScrubTime = useCallback(
    (nextTimeSec: number) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }

      const maxTime =
        Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Number.MAX_SAFE_INTEGER;
      const clampedTime = clamp(nextTimeSec, 0, maxTime || nextTimeSec || 0);
      setScrubTimeSec(clampedTime);
      setCurrentTimeSec(clampedTime);
      video.currentTime = clampedTime;
    },
    [videoRef]
  );

  const endScrub = useCallback(async () => {
    const video = videoRef.current;
    isScrubbingRef.current = false;
    setIsScrubbing(false);

    if (!video) {
      return;
    }

    lastFrameIndexRef.current = -1;
    syncFrameFromMediaTime(video.currentTime || scrubTimeSec || 0, false);

    if (wasPlayingBeforeScrubRef.current) {
      try {
        await video.play();
      } catch {
        // Ignore autoplay restriction errors.
      }
    }

    wasPlayingBeforeScrubRef.current = false;
  }, [scrubTimeSec, syncFrameFromMediaTime, videoRef]);

  return useMemo(
    () => ({
      frames,
      loading,
      error,
      currentFrame,
      currentFrameIndex,
      currentTimeSec,
      durationSec,
      isPlaying,
      playbackRate,
      isScrubbing,
      scrubTimeSec,
      usesRequestVideoFrameCallback,
      refreshTimeline,
      togglePlayPause,
      setPlaybackRate,
      stepPrevFrame,
      stepNextFrame,
      startScrub,
      updateScrubTime,
      endScrub
    }),
    [
      currentFrame,
      currentFrameIndex,
      currentTimeSec,
      durationSec,
      endScrub,
      error,
      frames,
      isPlaying,
      isScrubbing,
      loading,
      playbackRate,
      refreshTimeline,
      scrubTimeSec,
      setPlaybackRate,
      startScrub,
      stepNextFrame,
      stepPrevFrame,
      togglePlayPause,
      updateScrubTime,
      usesRequestVideoFrameCallback
    ]
  );
}
