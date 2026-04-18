"use client";

import { useCallback, useEffect, useState } from "react";

import { Group as PanelGroup, Panel, Separator as PanelSeparator } from "react-resizable-panels";

import { clearAiResult, deleteVideo, fetchVideosList } from "@/client/api";
import { LayersPanel } from "@/client/components/LayersPanel";
import { AiStatus } from "@/client/types";
import { TopBar } from "@/client/components/TopBar";
import { ViewerPanel } from "@/client/components/ViewerPanel";
import { VideosListPanel } from "@/client/components/VideosListPanel";
import { useUploadTask } from "@/client/hooks/useUploadTask";
import { useLayerVisibilityState } from "@/client/hooks/useLayerVisibilityState";
import { useViewerSessionState } from "@/client/hooks/useViewerSessionState";
import { VideoListItem } from "@/client/types";

export function HomeScreen() {
  const viewerSession = useViewerSessionState();
  const layerState = useLayerVisibilityState();
  const [videos, setVideos] = useState<VideoListItem[]>([]);
  const [currentDisplayIndex, setCurrentDisplayIndex] = useState<number | null>(null);
  const [currentFrameId, setCurrentFrameId] = useState<string | null>(null);
  const [isVideosLoading, setIsVideosLoading] = useState(false);
  const [annotationRefreshKey, setAnnotationRefreshKey] = useState(0);
  const [selectedAnnotationCategoryId, setSelectedAnnotationCategoryId] = useState<string | null>(null);

  const onAnnotationMutated = useCallback(() => {
    setAnnotationRefreshKey((k) => k + 1);
  }, []);

  const loadVideos = useCallback(async () => {
    setIsVideosLoading(true);
    try {
      const data = await fetchVideosList();
      setVideos(data.items);
    } catch {
      // handled silently; VideosListPanel shows stale data
    } finally {
      setIsVideosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!viewerSession.isHydrated) return;
    void loadVideos();
  }, [loadVideos, viewerSession.isHydrated]);

  const uploadTask = useUploadTask({
    onUploadSuccess: (videoId) => {
      viewerSession.setCurrentVideoId(videoId);
      void loadVideos();
    }
  });

  const onDeleteCurrentVideo = useCallback(async () => {
    if (!viewerSession.currentVideoId) return;
    await deleteVideo(viewerSession.currentVideoId);
    viewerSession.setCurrentVideoId(null);
    await loadVideos();
  }, [loadVideos, viewerSession]);

  const onClearAiResult = useCallback(async () => {
    if (!viewerSession.currentVideoId) return;
    await clearAiResult(viewerSession.currentVideoId);
    await viewerSession.revalidateBootstrap();
    await loadVideos();
  }, [loadVideos, viewerSession]);

  const onSelectVideo = useCallback(
    (videoId: string) => {
      viewerSession.setCurrentVideoId(videoId);
    },
    [viewerSession]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: "#0a0b14"
      }}
    >
      <TopBar
        uploadTask={uploadTask}
        currentVideoId={viewerSession.currentVideoId}
        onDeleteCurrentVideo={onDeleteCurrentVideo}
        onClearAiResult={onClearAiResult}
        onClearFrontendState={viewerSession.clearFrontendState}
      />

      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        <PanelGroup orientation="horizontal" style={{ flex: 1 }}>
          {/* Left: Videos list */}
          <Panel defaultSize="18%" minSize="12%" maxSize="30%">
            <div style={{ height: "100%", overflow: "hidden", borderRight: "1px solid #252638" }}>
              <VideosListPanel
                items={videos}
                currentVideoId={viewerSession.currentVideoId}
                loading={isVideosLoading}
                onSelect={onSelectVideo}
                onReload={loadVideos}
              />
            </div>
          </Panel>

          <PanelSeparator
            style={{
              width: 4,
              background: "#252638",
              cursor: "col-resize",
              flexShrink: 0,
              transition: "background 0.15s"
            }}
          />

          {/* Center: Viewer */}
          <Panel defaultSize="57%" minSize="35%">
            <div style={{ height: "100%", overflow: "hidden" }}>
              <ViewerPanel
                currentVideoId={viewerSession.currentVideoId}
                bootstrapData={viewerSession.bootstrapData}
                loading={viewerSession.isBootstrapLoading}
                statusMessage={viewerSession.statusMessage}
                onRefresh={viewerSession.revalidateBootstrap}
                layerState={layerState}
                onFrameIndexChange={setCurrentDisplayIndex}
                onFrameIdChange={setCurrentFrameId}
                annotationRefreshKey={annotationRefreshKey}
                selectedAnnotationCategoryId={selectedAnnotationCategoryId}
                onAnnotationMutated={onAnnotationMutated}
              />
            </div>
          </Panel>

          <PanelSeparator
            style={{
              width: 4,
              background: "#252638",
              cursor: "col-resize",
              flexShrink: 0,
              transition: "background 0.15s"
            }}
          />

          {/* Right: Layers */}
          <Panel defaultSize="25%" minSize="18%" maxSize="40%">
            <div style={{ height: "100%", overflow: "hidden", borderLeft: "1px solid #252638" }}>
              <LayersPanel
                videoId={viewerSession.currentVideoId}
                bootstrapData={viewerSession.bootstrapData}
                onReload={viewerSession.revalidateBootstrap}
                layerState={layerState}
                aiStatus={(viewerSession.bootstrapData?.aiStatus ?? "IDLE") as AiStatus}
                aiUpdatedAt={viewerSession.bootstrapData?.aiSummary?.aiStatsUpdatedAt ?? null}
                currentDisplayIndex={currentDisplayIndex}
                viewerFrameId={currentFrameId}
                annotationRefreshKey={annotationRefreshKey}
                selectedAnnotationCategoryId={selectedAnnotationCategoryId}
                onAnnotationCategorySelect={setSelectedAnnotationCategoryId}
                onAnnotationMutated={onAnnotationMutated}
              />
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
