"use client";

import { useMemo, useRef } from "react";

import { ViewerAiActionDock } from "@/client/components/ViewerAiActionDock";
import { ViewerImageToolbar } from "@/client/components/ViewerImageToolbar";
import { useAiOverlayData } from "@/client/hooks/useAiOverlayData";
import { useAiStatusStream } from "@/client/hooks/useAiStatusStream";
import { useFrameAnnotations } from "@/client/hooks/useFrameAnnotations";
import { useFrameTimeline } from "@/client/hooks/useFrameTimeline";
import { UseLayerVisibilityStateResult } from "@/client/hooks/useLayerVisibilityState";
import { useViewerImageTools } from "@/client/hooks/useViewerImageTools";
import { AiStatus, AnnotationItem, BootstrapData } from "@/client/types";

interface ViewerPanelProps {
  currentVideoId: string | null;
  bootstrapData: BootstrapData | null;
  loading: boolean;
  statusMessage: string | null;
  onRefresh: () => Promise<void>;
  layerState: UseLayerVisibilityStateResult;
}

function formatBytes(input: number): string {
  if (!Number.isFinite(input) || input <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = input;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
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
  const { currentVideoId, bootstrapData, loading, statusMessage, onRefresh, layerState } = props;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageTools = useViewerImageTools(currentVideoId);
  const timeline = useFrameTimeline({
    videoId: currentVideoId,
    videoRef
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
    () =>
      new Set(
        (bootstrapData?.categories ?? [])
          .filter((category) => category.is_visible !== 0)
          .map((category) => category.id)
      ),
    [bootstrapData?.categories]
  );

  const fallbackFrameAnnotations: AnnotationItem[] = useMemo(() => {
    const result: AnnotationItem[] = [];
    for (const item of bootstrapData?.annotationsCurrentWindow ?? []) {
      if (item.frame_id !== timeline.currentFrame?.frameId) {
        continue;
      }
      try {
        const parsed = JSON.parse(item.bbox_json) as {
          x: number;
          y: number;
          width: number;
          height: number;
        };
        result.push({
          id: item.id,
          frameId: item.frame_id,
          categoryId: item.category_id,
          bbox: {
            x: parsed.x,
            y: parsed.y,
            width: parsed.width,
            height: parsed.height
          },
          bboxJson: item.bbox_json,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        });
      } catch {
        // Ignore invalid bbox json records.
      }
    }
    return result;
  }, [bootstrapData?.annotationsCurrentWindow, timeline.currentFrame?.frameId]);

  const manualOverlay = useFrameAnnotations({
    videoId: currentVideoId,
    frameId: timeline.currentFrame?.frameId ?? null,
    enabled: Boolean(
      currentVideoId &&
        layerState.annotationVisible &&
        layerState.categoryMasterVisible &&
        timeline.currentFrame?.frameId
    ),
    fallbackItems: fallbackFrameAnnotations
  });

  const currentFrameAnnotations = manualOverlay.items
    .filter((item) => visibleCategoryIds.has(item.categoryId))
    .map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      x: item.bbox?.x ?? 0,
      y: item.bbox?.y ?? 0,
      width: item.bbox?.width ?? 0,
      height: item.bbox?.height ?? 0
    }))
    .filter((item) => item.width > 0 && item.height > 0);

  const videoSurfaceWidth = imageTools.fitToWindow ? "100%" : `${imageTools.zoomPercent}%`;
  const contrastPercent = Math.max(0, 100 + imageTools.contrast);
  const brightnessPercent = Math.max(0, 100 + imageTools.brightness);

  return (
    <section
      style={{
        border: "1px solid #d4d4d8",
        borderRadius: 12,
        padding: 16,
        background: "#fff",
        display: "grid",
        gap: 12
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Viewer Panel</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void timeline.refreshTimeline()} disabled={!currentVideoId || timeline.loading}>
            {timeline.loading ? "讀取 timeline..." : "刷新 timeline"}
          </button>
          <button type="button" onClick={() => void onRefresh()} disabled={!currentVideoId || loading}>
            {loading ? "同步中..." : "重新校正資料"}
          </button>
        </div>
      </div>

      {!currentVideoId ? <p>尚未選擇影片。請先上傳一支影片。</p> : null}

      {currentVideoId ? (
        <>
          <ViewerImageToolbar tools={imageTools} disabled={!currentVideoId} />

          <div style={{ position: "relative", background: "#09090b", borderRadius: 8, overflow: "auto", maxHeight: 460 }}>
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

              {imageTools.showGrid ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    backgroundImage:
                      "linear-gradient(to right, rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.25) 1px, transparent 1px)",
                    backgroundSize: "32px 32px"
                  }}
                />
              ) : null}

              {layerState.annotationVisible && layerState.categoryMasterVisible && videoWidth > 0 && videoHeight > 0 ? (
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  {currentFrameAnnotations.map((annotation) => (
                    <div
                      key={annotation.id}
                      style={{
                        position: "absolute",
                        left: `${(annotation.x / videoWidth) * 100}%`,
                        top: `${(annotation.y / videoHeight) * 100}%`,
                        width: `${(annotation.width / videoWidth) * 100}%`,
                        height: `${(annotation.height / videoHeight) * 100}%`,
                        border: "2px solid #22d3ee",
                        boxShadow: "0 0 0 1px rgba(0,0,0,0.5) inset"
                      }}
                    />
                  ))}
                </div>
              ) : null}

              {layerState.aiVisible && videoWidth > 0 && videoHeight > 0 ? (
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  {layerState.aiShowTrajectory ? (
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
                          points={trajectory.points.map((point) => `${point.x},${point.y}`).join(" ")}
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeOpacity={0.8}
                        />
                      ))}
                    </svg>
                  ) : null}

                  {layerState.aiShowBBox
                    ? aiOverlay.detections.map((detection) => (
                        <div
                          key={`ai-${detection.id}`}
                          style={{
                            position: "absolute",
                            left: `${(detection.x / videoWidth) * 100}%`,
                            top: `${(detection.y / videoHeight) * 100}%`,
                            width: `${(detection.width / videoWidth) * 100}%`,
                            height: `${(detection.height / videoHeight) * 100}%`,
                            border: "2px solid #f59e0b",
                            boxShadow: "0 0 0 1px rgba(0,0,0,0.5) inset"
                          }}
                        >
                          {layerState.aiShowTrackId && detection.trackId !== null ? (
                            <div
                              style={{
                                position: "absolute",
                                top: -18,
                                left: 0,
                                padding: "1px 5px",
                                borderRadius: 4,
                                background: "rgba(245,158,11,0.95)",
                                color: "#111827",
                                fontSize: 11,
                                fontWeight: 700,
                                whiteSpace: "nowrap"
                              }}
                            >
                              #{detection.trackId} {Math.round(detection.score * 100)}%
                            </div>
                          ) : null}
                        </div>
                      ))
                    : null}
                </div>
              ) : null}
            </div>

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
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" onClick={() => void timeline.togglePlayPause()}>
                {timeline.isPlaying ? "暫停" : "播放"}
              </button>
              <button type="button" onClick={timeline.stepPrevFrame} disabled={timeline.frames.length === 0}>
                上一幀
              </button>
              <button type="button" onClick={timeline.stepNextFrame} disabled={timeline.frames.length === 0}>
                下一幀
              </button>

              <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 14 }}>
                倍速
                <select
                  value={timeline.playbackRate}
                  onChange={(event) => timeline.setPlaybackRate(Number(event.target.value))}
                >
                  {[0.25, 0.5, 1, 1.5, 2].map((rate) => (
                    <option key={rate} value={rate}>
                      {rate}x
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <input
              type="range"
              min={0}
              max={sliderMax}
              step={0.001}
              value={Math.min(sliderValue, sliderMax)}
              onPointerDown={timeline.startScrub}
              onPointerUp={() => void timeline.endScrub()}
              onPointerCancel={() => void timeline.endScrub()}
              onChange={(event) => {
                timeline.updateScrubTime(Number(event.target.value));
              }}
              style={{ width: "100%" }}
            />

            <div style={{ fontSize: 13, color: "#3f3f46", display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span>
                時間：{formatClock(timeline.currentTimeSec)} / {formatClock(sliderMax)}
              </span>
              <span>display_index：{timeline.currentFrame?.displayIndex ?? "-"}</span>
              <span>pts_us：{timeline.currentFrame?.ptsUs ?? "-"}</span>
              <span>對齊來源：{timeline.usesRequestVideoFrameCallback ? "mediaTime(rvfc)" : "currentTime(fallback)"}</span>
              <span>影像：{imageTools.fitToWindow ? "fit" : `${imageTools.zoomPercent}%`}</span>
            </div>
          </div>

          {timeline.error ? (
            <div style={{ borderRadius: 8, padding: 10, background: "#fee2e2", color: "#7f1d1d" }}>
              timeline 載入失敗：{timeline.error}
            </div>
          ) : null}

          {manualOverlay.error ? (
            <div style={{ borderRadius: 8, padding: 10, background: "#fee2e2", color: "#7f1d1d" }}>
              manual overlay 載入失敗：{manualOverlay.error}
            </div>
          ) : null}

          {aiOverlay.error ? (
            <div style={{ borderRadius: 8, padding: 10, background: "#fee2e2", color: "#7f1d1d" }}>
              AI overlay 載入失敗：{aiOverlay.error}
            </div>
          ) : null}

          {bootstrapData ? (
            <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
              <div>檔名：{bootstrapData.meta.filename}</div>
              <div>
                解析度：{bootstrapData.meta.video_width ?? "?"} x {bootstrapData.meta.video_height ?? "?"}
              </div>
              <div>FPS：{bootstrapData.meta.source_fps ?? "?"}</div>
              <div>長度：{bootstrapData.meta.duration_sec ?? "?"} 秒</div>
              <div>大小：{formatBytes(bootstrapData.meta.file_size_bytes)}</div>
              <div>
                timeline 幀數：{timeline.frames.length || bootstrapData.timelineSummary.totalFrames}（window:
                {bootstrapData.timelineSummary.window.startDisplayIndex} -
                {bootstrapData.timelineSummary.window.endDisplayIndex}）
              </div>
              <div>
                manual overlay：{manualOverlay.loading ? "載入中" : "已同步"} · 當前幀框數 {currentFrameAnnotations.length}
              </div>
              <div>
                AI overlay：{aiOverlay.loading ? "載入中" : aiOverlay.hasData ? "已同步" : "無資料"} · 當前幀框數{" "}
                {aiOverlay.detections.length}
              </div>
              <div>
                目前 AI 狀態：{ai.status}
                {ai.status === "PROCESSING" ? ` (${ai.progress}%)` : ""}
                {ai.isStreaming ? " · SSE" : ai.isPolling ? " · POLLING" : ""}
              </div>
              <div>timeline 狀態：{bootstrapData.timelineSummary.timelineStatus}</div>
            </div>
          ) : (
            <p>尚未取得 bootstrap 資料。</p>
          )}
        </>
      ) : null}

      {statusMessage ? (
        <div style={{ borderRadius: 8, padding: 10, background: "#fef3c7", color: "#78350f" }}>
          {statusMessage}
        </div>
      ) : null}
    </section>
  );
}
