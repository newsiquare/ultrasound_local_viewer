"use client";

import { useRef } from "react";

import { ViewerAiActionDock } from "@/client/components/ViewerAiActionDock";
import { useAiStatusStream } from "@/client/hooks/useAiStatusStream";
import { useFrameTimeline } from "@/client/hooks/useFrameTimeline";
import { AiStatus, BootstrapData } from "@/client/types";

interface ViewerPanelProps {
  currentVideoId: string | null;
  bootstrapData: BootstrapData | null;
  loading: boolean;
  statusMessage: string | null;
  onRefresh: () => Promise<void>;
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
  const { currentVideoId, bootstrapData, loading, statusMessage, onRefresh } = props;

  const videoRef = useRef<HTMLVideoElement | null>(null);
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
          <div style={{ position: "relative", background: "#09090b", borderRadius: 8, overflow: "hidden" }}>
            <video
              ref={videoRef}
              src={`/api/videos/${currentVideoId}/stream`}
              style={{ width: "100%", maxHeight: 460, display: "block" }}
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
            </div>
          </div>

          {timeline.error ? (
            <div style={{ borderRadius: 8, padding: 10, background: "#fee2e2", color: "#7f1d1d" }}>
              timeline 載入失敗：{timeline.error}
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
