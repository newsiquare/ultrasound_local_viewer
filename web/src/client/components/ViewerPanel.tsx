"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { ChevronFirst, ChevronLast, HardDriveDownload, Pause, Play, RefreshCw, SkipBack, SkipForward } from "lucide-react";

import { AnnotationCanvas } from "@/client/components/AnnotationCanvas";
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
  onAnnotationUpdated?: (id: string, geometry: import("@/client/types").AnnotationGeometry) => void;
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
    hoveredAiId = null,
    selectedAiId = null,
    onAiDetectionSelect,
    aiConfidenceThreshold = 0
  } = props;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageTools = useViewerImageTools(currentVideoId);
  const timeline = useFrameTimeline({ videoId: currentVideoId, videoRef });

  const annotationTool = useAnnotationTool({
    videoId: currentVideoId,
    frameId: timeline.currentFrame?.frameId ?? null,
    selectedCategoryId: selectedAnnotationCategoryId,
    onCreated: onAnnotationMutated
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
  }, [annotationTool, imageTools, timeline]);

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
            gap: 6
          }}
        >
          {/* Timeline slider */}
          {(() => {
            const pct = sliderMax > 0 ? (Math.min(sliderValue, sliderMax) / sliderMax) * 100 : 0;
            const trackColor = "#2a2d42";
            const fillColor = timeline.isScrubbing ? "#60a5fa" : "#4f8cff";
            return (
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
                style={{
                  "--scrubber-pct": `${pct}%`,
                  "--scrubber-fill": fillColor,
                  "--scrubber-track": trackColor,
                } as React.CSSProperties}
              />
            );
          })()}

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

            <span style={{ fontSize: 12, color: "#c9ccd8", fontVariantNumeric: "tabular-nums", marginLeft: 8, flexShrink: 0 }}>
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
