"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ChevronFirst, ChevronLast, HardDriveDownload, Pause, Play, RefreshCw, SkipBack, SkipForward } from "lucide-react";

import { createAnnotation } from "@/client/api";
import { AnnotationCanvas } from "@/client/components/AnnotationCanvas";
import { FrameAnnotationBar } from "@/client/components/FrameAnnotationBar";
import { PropagateDialog } from "@/client/components/PropagateDialog";
import { ViewerAiActionDock } from "@/client/components/ViewerAiActionDock";
import { ViewerImageToolbar } from "@/client/components/ViewerImageToolbar";
import { useAiOverlayData } from "@/client/hooks/useAiOverlayData";
import { useAiStatusStream } from "@/client/hooks/useAiStatusStream";
import { AnnotationToolType, useAnnotationTool } from "@/client/hooks/useAnnotationTool";
import { useFrameAnnotations } from "@/client/hooks/useFrameAnnotations";
import { useFrameTimeline } from "@/client/hooks/useFrameTimeline";
import { UseLayerVisibilityStateResult } from "@/client/hooks/useLayerVisibilityState";
import { useViewerImageTools } from "@/client/hooks/useViewerImageTools";
import { AnnotationItem, AiStatus, BootstrapData, CategoryItem } from "@/client/types";

interface ViewerPanelProps {
  currentVideoId: string | null;
  bootstrapData: BootstrapData | null;
  loading: boolean;
  statusMessage: string | null;
  onRefresh: () => Promise<void>;
  layerState: UseLayerVisibilityStateResult;
  onFrameIndexChange?: (displayIndex: number | null) => void;
  onFrameIdChange?: (frameId: string | null) => void;
  annotationRefreshKey?: number;
  selectedAnnotationCategoryId?: string | null;
  selectedAnnotationId?: string | null;
  onAnnotationMutated?: () => void;
  onAnnotationSelect?: (id: string | null) => void;
  onAnnotationUpdated?: (id: string, geometry: import("@/client/types").AnnotationGeometry, oldGeometry?: import("@/client/types").AnnotationGeometry) => void;
  /** Called with the full item after annotation creation — for undo history */
  onAnnotationCreated?: (item: AnnotationItem) => void;
  /** Undo/Redo */
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Multi-select (rubber-band) */
  multiSelectedAnnotationIds?: string[];
  onMultiSelect?: (ids: string[]) => void;
  onBatchDeleteAnnotations?: (ids: string[]) => void;
  /** Annotation frame marks for the timeline bar: frameId → category colors */
  annotationFrameMarks?: Map<string, string[]>;
  /** AI detection id being hovered in LayersPanel */
  hoveredAiId?: number | null;
  /** AI detection id selected in LayersPanel */
  selectedAiId?: number | null;
  onAiDetectionSelect?: (id: number | null) => void;
  /** Confidence threshold 0-1 for filtering AI bbox display */
  aiConfidenceThreshold?: number;
}

function formatClock(inputSec: number): string {
  const safe = Number.isFinite(inputSec) && inputSec >= 0 ? inputSec : 0;
  const total = Math.floor(safe);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const millis = Math.floor((safe - total) * 1000);
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function ViewerPanel(props: ViewerPanelProps) {
  const { currentVideoId, bootstrapData, loading, statusMessage, onRefresh, layerState,
    onFrameIndexChange, onFrameIdChange,
    annotationRefreshKey = 0,
    selectedAnnotationCategoryId = null,
    selectedAnnotationId = null,
    onAnnotationMutated,
    onAnnotationSelect,
    onAnnotationUpdated,
    onAnnotationCreated,
    canUndo = false,
    canRedo = false,
    onUndo,
    onRedo,
    multiSelectedAnnotationIds = [],
    onMultiSelect,
    onBatchDeleteAnnotations,
    annotationFrameMarks = new Map(),
    hoveredAiId = null,
    selectedAiId = null,
    onAiDetectionSelect,
    aiConfidenceThreshold = 0
  } = props;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  // M1: hidden video for scrubber hover thumbnail
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const [scrubberHover, setScrubberHover] = useState<{ x: number; timeSec: number; dataUrl: string | null } | null>(null);
  const previewSeekingRef = useRef(false);
  const pendingPreviewTimeRef = useRef<number | null>(null);

  const imageTools = useViewerImageTools(currentVideoId);
  const timeline = useFrameTimeline({ videoId: currentVideoId, videoRef });

  // H4: frame-jump input state
  const [frameInputActive, setFrameInputActive] = useState(false);
  const [frameInputValue, setFrameInputValue] = useState("");
  // M2: propagate dialog state
  const [propagateOpen, setPropagateOpen] = useState(false);

  // M1: draw the preview video frame to an in-memory canvas, return dataURL
  const capturePreviewFrame = useCallback((): string | null => {
    const vid = previewVideoRef.current;
    if (!vid || vid.videoWidth === 0) return null;
    const w = 160;
    const h = Math.round(w * vid.videoHeight / vid.videoWidth);
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(vid, 0, 0, w, h);
    return offscreen.toDataURL("image/jpeg", 0.75);
  }, []);

  // M1: seek the preview video; queue if already seeking
  const seekPreview = useCallback((timeSec: number) => {
    const vid = previewVideoRef.current;
    if (!vid) return;
    if (previewSeekingRef.current) {
      pendingPreviewTimeRef.current = timeSec;
      return;
    }
    previewSeekingRef.current = true;
    vid.currentTime = timeSec;
  }, []);

  // M1: on seeked — capture frame as dataURL and update state
  const handlePreviewSeeked = useCallback(() => {
    const dataUrl = capturePreviewFrame();
    setScrubberHover(prev => prev ? { ...prev, dataUrl } : null);
    previewSeekingRef.current = false;
    if (pendingPreviewTimeRef.current !== null) {
      const next = pendingPreviewTimeRef.current;
      pendingPreviewTimeRef.current = null;
      seekPreview(next);
    }
  }, [capturePreviewFrame, seekPreview]);

  // M2: batch-copy selected annotations to a range of frames
  const handlePropagate = useCallback(async (items: AnnotationItem[], fromIndex: number, toIndex: number) => {
    if (!currentVideoId) return;
    const frames = timeline.frames;
    const targetFrames = frames.filter(
      (f) => f.displayIndex >= fromIndex && f.displayIndex <= toIndex
    );
    let copied = 0;
    for (const frame of targetFrames) {
      for (const item of items) {
        if (!item.geometry) continue;
        await createAnnotation(currentVideoId, {
          frameId: frame.frameId,
          categoryId: item.categoryId,
          annotationType: item.annotationType,
          geometry: item.geometry as unknown as Record<string, unknown>,
          textContent: item.textContent ?? undefined,
        });
        copied++;
      }
    }
    onAnnotationMutated?.();
    toast.success(`已複製 ${copied} 筆標註`);
  }, [currentVideoId, timeline.frames, onAnnotationMutated]);

  const annotationTool = useAnnotationTool({
    videoId: currentVideoId,
    frameId: timeline.currentFrame?.frameId ?? null,
    selectedCategoryId: selectedAnnotationCategoryId,
    onCreated: onAnnotationMutated,
    onCreatedWithItem: onAnnotationCreated,
  });

  const durationFromMeta = bootstrapData?.meta.duration_sec ?? 0;
  const sliderMax = timeline.durationSec > 0 ? timeline.durationSec : durationFromMeta > 0 ? durationFromMeta : 1;
  const sliderValue = timeline.isScrubbing ? timeline.scrubTimeSec : timeline.currentTimeSec;
  const initialAiStatus = (bootstrapData?.aiStatus ?? "IDLE") as AiStatus;
  const ai = useAiStatusStream({
    videoId: currentVideoId,
    initialStatus: initialAiStatus,
    onTerminalStatus: onRefresh
  });
  useEffect(() => {
    onFrameIndexChange?.(timeline.currentFrame?.displayIndex ?? null);
    onFrameIdChange?.(timeline.currentFrame?.frameId ?? null);
  }, [onFrameIdChange, onFrameIndexChange, timeline.currentFrame?.displayIndex, timeline.currentFrame?.frameId]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore when typing in an input/textarea/contenteditable
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

    // H1: Undo / Redo
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      if (e.key === "z" || e.key === "Z") {
        if (e.shiftKey) {
          if (canRedo) { e.preventDefault(); void onRedo?.(); toast("重做", { duration: 1200 }); }
        } else {
          if (canUndo) { e.preventDefault(); void onUndo?.(); toast("復原", { duration: 1200 }); }
        }
        return;
      }
      if ((e.key === "y" || e.key === "Y") && !e.shiftKey) {
        if (canRedo) { e.preventDefault(); void onRedo?.(); toast("重做", { duration: 1200 }); }
        return;
      }
    }

    switch (e.key) {
      case "+": case "=":
        e.preventDefault();
        imageTools.zoomIn();
        break;
      case "-":
        e.preventDefault();
        imageTools.zoomOut();
        break;
      case "f": case "F":
        e.preventDefault();
        imageTools.setFitToWindow(true);
        break;
      case "r": case "R":
        e.preventDefault();
        annotationTool.setActiveTool(annotationTool.activeTool === "RECT" ? null : "RECT");
        break;
      case "p": case "P":
        e.preventDefault();
        annotationTool.setActiveTool(annotationTool.activeTool === "POLYGON" ? null : "POLYGON");
        break;
      case "t": case "T":
        e.preventDefault();
        annotationTool.setActiveTool(annotationTool.activeTool === "TEXT" ? null : "TEXT");
        break;
      case "s": case "S":
        e.preventDefault();
        annotationTool.setActiveTool(null);
        break;
      case "Escape":
        annotationTool.setActiveTool(null);
        if (multiSelectedAnnotationIds.length > 0) onMultiSelect?.([]);
        break;
      case "Delete": case "Backspace":
        if (multiSelectedAnnotationIds.length > 0) {
          e.preventDefault();
          onBatchDeleteAnnotations?.(multiSelectedAnnotationIds);
        }
        break;
      case " ":
        e.preventDefault();
        void timeline.togglePlayPause();
        break;
      case "ArrowLeft":
        e.preventDefault();
        timeline.stepPrevFrame();
        break;
      case "ArrowRight":
        e.preventDefault();
        timeline.stepNextFrame();
        break;
    }
  }, [annotationTool, imageTools, timeline, canUndo, canRedo, onUndo, onRedo, multiSelectedAnnotationIds, onMultiSelect, onBatchDeleteAnnotations]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const timelineReady = bootstrapData?.timelineSummary.timelineStatus === "READY";
  const videoWidth = bootstrapData?.meta.video_width ?? 0;
  const videoHeight = bootstrapData?.meta.video_height ?? 0;
  const aiOverlay = useAiOverlayData({
    videoId: currentVideoId,
    aiStatus: ai.status,
    aiUpdatedAt: ai.updatedAt,
    currentDisplayIndex: timeline.currentFrame?.displayIndex ?? null
  });

  const visibleCategoryIds = useMemo(
    () => new Set((bootstrapData?.categories ?? []).filter((c) => c.is_visible !== 0).map((c) => c.id)),
    [bootstrapData?.categories]
  );

  const fallbackFrameAnnotations: AnnotationItem[] = useMemo(() => {
    const result: AnnotationItem[] = [];
    for (const item of bootstrapData?.annotationsCurrentWindow ?? []) {
      if (item.frame_id !== timeline.currentFrame?.frameId) continue;
      try {
        let geometry = null;
        if (item.geometry_json) {
          geometry = JSON.parse(item.geometry_json) as AnnotationItem["geometry"];
        } else {
          const b = JSON.parse(item.bbox_json) as { x: number; y: number; width: number; height: number };
          geometry = { type: "bbox" as const, x: b.x, y: b.y, width: b.width, height: b.height };
        }
        result.push({
          id: item.id,
          frameId: item.frame_id,
          categoryId: item.category_id,
          annotationType: (item.annotation_type ?? "BBOX") as AnnotationItem["annotationType"],
          geometry,
          geometryJson: item.geometry_json ?? item.bbox_json,
          textContent: item.text_content ?? null,
          isVisible: item.is_visible !== 0,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        });
      } catch { /* skip */ }
    }
    return result;
  }, [bootstrapData?.annotationsCurrentWindow, timeline.currentFrame?.frameId]);

  const manualOverlay = useFrameAnnotations({
    videoId: currentVideoId,
    frameId: timeline.currentFrame?.frameId ?? null,
    enabled: Boolean(currentVideoId && layerState.annotationVisible && layerState.categoryMasterVisible && timeline.currentFrame?.frameId),
    fallbackItems: fallbackFrameAnnotations,
    refreshKey: annotationRefreshKey
  });

  const categories: CategoryItem[] = bootstrapData?.categories ?? [];

  const currentFrameAnnotations = manualOverlay.items
    .filter((item) => visibleCategoryIds.has(item.categoryId) && item.isVisible);

  const videoSurfaceWidth = imageTools.fitToWindow ? "100%" : `${imageTools.zoomPercent}%`;
  const contrastPercent = Math.max(0, 100 + imageTools.contrast);
  const brightnessPercent = Math.max(0, 100 + imageTools.brightness);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "#0a0b14"
      }}
    >
      {/* Toolbars */}
      <ViewerImageToolbar
        tools={imageTools}
        disabled={!currentVideoId}
        activeTool={annotationTool.activeTool}
        onToolChange={(tool) => {
          if (tool === annotationTool.activeTool) {
            annotationTool.setActiveTool(null);
          } else {
            annotationTool.setActiveTool(tool as AnnotationToolType | null);
          }
        }}
      />
      <ViewerAiActionDock
        status={ai.status}
        progress={ai.progress}
        isMutating={ai.isMutating}
        timelineReady={timelineReady}
        hasVideo={Boolean(currentVideoId)}
        errorMessage={ai.errorMessage}
        notice={ai.notice}
        onDismissNotice={ai.dismissNotice}
        onStart={ai.startDetect}
        onCancel={ai.cancelDetect}
      />

      {/* Video canvas */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "#000",
          position: "relative",
          minHeight: 0
        }}
      >
        {/* H3: Multi-select batch toolbar */}
        {multiSelectedAnnotationIds.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: 8,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 60,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(15,16,24,0.95)",
              border: "1px solid #3c3e58",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 12,
              color: "#c9ccd8",
              pointerEvents: "auto",
            }}
          >
            <span>已選 {multiSelectedAnnotationIds.length} 筆</span>
            <button
              type="button"
              onClick={() => onBatchDeleteAnnotations?.(multiSelectedAnnotationIds)}
              style={{
                background: "#7f1d1d",
                border: "1px solid #ef4444",
                borderRadius: 4,
                color: "#fca5a5",
                fontSize: 11,
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              刪除全部
            </button>
            {/* M2: propagate selected to other frames */}
            <button
              type="button"
              onClick={() => setPropagateOpen(true)}
              style={{
                background: "rgba(79,140,255,0.15)",
                border: "1px solid #4f8cff",
                borderRadius: 4,
                color: "#93c5fd",
                fontSize: 11,
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              複製到其他幀
            </button>
            <button
              type="button"
              onClick={() => onMultiSelect?.([])}
              style={{
                background: "transparent",
                border: "1px solid #3c3e58",
                borderRadius: 4,
                color: "#7c7f9e",
                fontSize: 11,
                padding: "2px 6px",
                cursor: "pointer",
              }}
            >
              取消選取
            </button>
          </div>
        )}
        {!currentVideoId ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              color: "#585a78"
            }}
          >
            <HardDriveDownload size={40} strokeWidth={1} />
            <span style={{ fontSize: 13 }}>尚未選擇影片，請先上傳或選擇一支影片</span>
          </div>
        ) : (
          <div style={{ position: "relative", width: videoSurfaceWidth, margin: "0 auto" }}>
            <video
              ref={videoRef}
              src={`/api/videos/${currentVideoId}/stream`}
              style={{
                width: "100%",
                display: "block",
                filter: `brightness(${brightnessPercent}%) contrast(${contrastPercent}%)`,
                cursor: imageTools.measureEnabled ? "crosshair" : "default"
              }}
            />
            {/* M1: invisible preview video — must NOT be display:none so browser decodes frames */}
            <video
              ref={previewVideoRef}
              src={`/api/videos/${currentVideoId}/stream`}
              preload="auto"
              muted
              onSeeked={handlePreviewSeeked}
              style={{
                position: "absolute",
                top: 0, left: 0,
                width: 1, height: 1,
                opacity: 0,
                pointerEvents: "none"
              }}
            />

            {imageTools.showGrid && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  backgroundImage:
                    "linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)",
                  backgroundSize: "32px 32px"
                }}
              />
            )}

            {/* Manual annotation overlay — now handled by AnnotationCanvas */}
            {layerState.annotationVisible && layerState.categoryMasterVisible && videoWidth > 0 && videoHeight > 0 && (
              <AnnotationCanvas
                videoWidth={videoWidth}
                videoHeight={videoHeight}
                annotations={currentFrameAnnotations}
                categories={categories}
                annotationTool={annotationTool}
                annotationVisible={layerState.annotationVisible}
                selectedAnnotationId={selectedAnnotationId}
                onAnnotationSelect={onAnnotationSelect}
                onAnnotationUpdated={onAnnotationUpdated}
                multiSelectedAnnotationIds={multiSelectedAnnotationIds}
                onMultiSelect={onMultiSelect}
              />
            )}

            {/* AI overlay */}
            {layerState.aiVisible && videoWidth > 0 && videoHeight > 0 && (
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {layerState.aiShowTrajectory && (
                  <svg
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${videoWidth} ${videoHeight}`}
                    preserveAspectRatio="none"
                    style={{ position: "absolute", inset: 0 }}
                  >
                    {aiOverlay.trajectories.map((trajectory) => (
                      <polyline
                        key={`track-${trajectory.trackId}`}
                        points={trajectory.points.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeOpacity={0.7}
                      />
                    ))}
                  </svg>
                )}

                {layerState.aiShowBBox && aiOverlay.detections
                  .filter((d) => d.score >= aiConfidenceThreshold)
                  .map((detection) => {
                    const isHovered = detection.id === hoveredAiId;
                    const isSelected = detection.id === selectedAiId;
                    const highlight = isSelected || isHovered;
                    return (
                      <div
                        key={`ai-${detection.id}`}
                        onClick={() => onAiDetectionSelect?.(isSelected ? null : detection.id)}
                        style={{
                          position: "absolute",
                          left: `${(detection.x / videoWidth) * 100}%`,
                          top: `${(detection.y / videoHeight) * 100}%`,
                          width: `${(detection.width / videoWidth) * 100}%`,
                          height: `${(detection.height / videoHeight) * 100}%`,
                          border: highlight ? "2.5px solid #fff" : "2px solid #f59e0b",
                          outline: highlight ? "1.5px solid #f59e0b" : undefined,
                          background: isSelected ? "rgba(245,158,11,0.15)" : isHovered ? "rgba(245,158,11,0.08)" : undefined,
                          boxShadow: highlight ? "0 0 6px rgba(245,158,11,0.6)" : "0 0 0 1px rgba(0,0,0,0.5) inset",
                          pointerEvents: "auto",
                          cursor: "pointer",
                          transition: "border 0.1s, background 0.1s"
                        }}
                      >
                        {layerState.aiShowTrackId && detection.trackId !== null && (
                          <div
                            style={{
                              position: "absolute",
                              top: -18,
                              left: 0,
                              padding: "1px 5px",
                              borderRadius: 4,
                              background: "rgba(245,158,11,0.9)",
                              color: "#111",
                              fontSize: 10,
                              fontWeight: 700,
                              whiteSpace: "nowrap"
                            }}
                          >
                            #{detection.trackId} {detection.categoryName} {Math.round(detection.score * 100)}%
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Playback controls */}
      {currentVideoId && (
        <div
          style={{
            flexShrink: 0,
            background: "#0f1018",
            borderTop: "1px solid #252638",
            padding: "6px 10px",
            display: "grid",
            gap: 4
          }}
        >
          {/* Timeline slider */}
          {(() => {
            const pct = sliderMax > 0 ? (Math.min(sliderValue, sliderMax) / sliderMax) * 100 : 0;
            const trackColor = "#2a2d42";
            const fillColor = timeline.isScrubbing ? "#60a5fa" : "#4f8cff";
            return (
              <div style={{ position: "relative" }}>
                <input
                  type="range"
                  className="scrubber"
                  min={0}
                  max={sliderMax}
                  step={0.001}
                  value={Math.min(sliderValue, sliderMax)}
                  onPointerDown={timeline.startScrub}
                  onPointerUp={() => void timeline.endScrub()}
                  onPointerCancel={() => void timeline.endScrub()}
                  onChange={(e) => timeline.updateScrubTime(Number(e.target.value))}
                  onMouseMove={(e) => {
                    if (!currentVideoId) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const timeSec = ratio * sliderMax;
                    setScrubberHover(prev => ({ x: e.clientX - rect.left, timeSec, dataUrl: prev?.dataUrl ?? null }));
                    seekPreview(timeSec);
                  }}
                  onMouseLeave={() => setScrubberHover(null)}
                  style={{
                    "--scrubber-pct": `${pct}%`,
                    "--scrubber-fill": fillColor,
                    "--scrubber-track": trackColor,
                  } as React.CSSProperties}
                />

                {/* M1: Hover thumbnail tooltip */}
                {scrubberHover !== null && currentVideoId && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 6px)",
                      left: scrubberHover.x,
                      transform: "translateX(-50%)",
                      pointerEvents: "none",
                      zIndex: 60,
                      background: "#0f1018",
                      border: "1px solid #3c3e58",
                      borderRadius: 6,
                      overflow: "hidden",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      width: 160,
                      minHeight: 90
                    }}
                  >
                    {scrubberHover.dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={scrubberHover.dataUrl}
                        alt=""
                        style={{ display: "block", width: 160, height: "auto" }}
                      />
                    ) : (
                      <div style={{ width: 160, height: 90, background: "#1a1c2e" }} />
                    )}
                    <span style={{ fontSize: 11, color: "#9699b0", padding: "2px 6px 3px" }}>
                      {formatClock(scrubberHover.timeSec)}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* H2: Frame annotation bar */}
          <FrameAnnotationBar
            frames={timeline.frames}
            durationSec={timeline.durationSec > 0 ? timeline.durationSec : sliderMax}
            frameMarks={annotationFrameMarks}
            onSeekToDisplayIndex={timeline.seekToDisplayIndex}
          />

          {/* Controls row */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
            {/* Center group */}
            <PlayBtn onClick={() => timeline.seekToStart()} disabled={timeline.frames.length === 0} title="回到最前面">
              <SkipBack size={16} />
            </PlayBtn>

            <PlayBtn onClick={() => timeline.stepPrevFrame()} disabled={timeline.frames.length === 0} title="上一幀">
              <ChevronFirst size={16} />
            </PlayBtn>

            <PlayBtn onClick={() => void timeline.togglePlayPause()} title={timeline.isPlaying ? "暫停" : "播放"}>
              {timeline.isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </PlayBtn>

            <PlayBtn onClick={() => timeline.stepNextFrame()} disabled={timeline.frames.length === 0} title="下一幀">
              <ChevronLast size={16} />
            </PlayBtn>

            <PlayBtn onClick={() => timeline.seekToEnd()} disabled={timeline.frames.length === 0} title="跳到最後面">
              <SkipForward size={16} />
            </PlayBtn>

            {/* H4: Frame jump input */}
            {frameInputActive ? (
              <input
                autoFocus
                type="number"
                min={1}
                max={timeline.frames.length}
                value={frameInputValue}
                onChange={(e) => setFrameInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const n = parseInt(frameInputValue, 10);
                    if (!isNaN(n)) timeline.seekToDisplayIndex(n);
                    setFrameInputActive(false);
                    setFrameInputValue("");
                  } else if (e.key === "Escape") {
                    setFrameInputActive(false);
                    setFrameInputValue("");
                  }
                }}
                onBlur={() => { setFrameInputActive(false); setFrameInputValue(""); }}
                style={{
                  width: 52,
                  height: 22,
                  background: "#252638",
                  border: "1px solid #4f8cff",
                  borderRadius: 3,
                  color: "#d4d6f0",
                  fontSize: 11,
                  textAlign: "center",
                  outline: "none",
                  marginLeft: 8,
                }}
              />
            ) : (
              <span
                title="點擊輸入幀號跳轉"
                onClick={() => {
                  setFrameInputActive(true);
                  setFrameInputValue(String(timeline.currentFrame?.displayIndex ?? 1));
                }}
                style={{
                  fontSize: 11,
                  color: "#7c7f9e",
                  fontVariantNumeric: "tabular-nums",
                  marginLeft: 8,
                  cursor: "pointer",
                  padding: "1px 4px",
                  borderRadius: 3,
                  border: "1px solid transparent",
                  flexShrink: 0,
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLSpanElement).style.borderColor = "#3c3e58";
                  (e.currentTarget as HTMLSpanElement).style.color = "#c9ccd8";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLSpanElement).style.borderColor = "transparent";
                  (e.currentTarget as HTMLSpanElement).style.color = "#7c7f9e";
                }}
              >
                f:{timeline.currentFrame?.displayIndex ?? 0}/{timeline.frames.length}
              </span>
            )}

            <span style={{ fontSize: 12, color: "#c9ccd8", fontVariantNumeric: "tabular-nums", marginLeft: 4, flexShrink: 0 }}>
              {formatClock(timeline.currentTimeSec)} / {formatClock(sliderMax)}
            </span>

            {/* Right group — absolute so center group stays truly centered */}
            <div style={{ position: "absolute", right: 0, display: "flex", alignItems: "center", gap: 2 }}>
              {[0.25, 0.5, 1, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className={`rate-btn${timeline.playbackRate === rate ? " active" : ""}`}
                  onClick={() => timeline.setPlaybackRate(rate)}
                  title={`${rate}x`}
                >
                  {rate}x
                </button>
              ))}
              <button
                type="button"
                onClick={() => void onRefresh()}
                disabled={loading}
                title="重新校正資料"
                className="play-btn"
                style={{ width: 26, height: 26, marginLeft: 2 }}
              >
                <RefreshCw size={13} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
              </button>
            </div>
          </div>


        </div>
      )}

      {/* Errors */}
      {(timeline.error || manualOverlay.error || aiOverlay.error || statusMessage) && (
        <div style={{ flexShrink: 0, padding: "4px 10px", background: "#0f1018", borderTop: "1px solid #252638" }}>
          {[timeline.error && `timeline: ${timeline.error}`, manualOverlay.error && `overlay: ${manualOverlay.error}`, aiOverlay.error && `AI: ${aiOverlay.error}`, statusMessage]
            .filter(Boolean)
            .map((msg, i) => (
              <div
                key={i}
                style={{ fontSize: 11, color: "#f87171", padding: "2px 0" }}
              >
                {msg}
              </div>
            ))}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* M2: Propagate dialog */}
      <PropagateDialog
        open={propagateOpen}
        onClose={() => setPropagateOpen(false)}
        annotations={currentFrameAnnotations.filter((a) => multiSelectedAnnotationIds.includes(a.id))}
        currentDisplayIndex={timeline.currentFrame?.displayIndex ?? 1}
        totalFrames={timeline.frames.length}
        onPropagate={handlePropagate}
      />
    </div>
  );
}

function PlayBtn(props: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  const { onClick, disabled = false, title, children } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="play-btn"
      style={disabled ? { color: "#52547a", opacity: 0.5, cursor: "not-allowed" } : undefined}
    >
      {children}
    </button>
  );
}
