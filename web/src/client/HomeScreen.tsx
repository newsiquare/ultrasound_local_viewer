"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { clearAiResult, deleteVideo, fetchVideosList } from "@/client/api";
import { LayersPanel } from "@/client/components/LayersPanel";
import { UploadPanel } from "@/client/components/UploadPanel";
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
  const [isVideosLoading, setIsVideosLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const loadVideos = useCallback(async () => {
    setIsVideosLoading(true);
    try {
      const data = await fetchVideosList();
      setVideos(data.items);
      setListError(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown list error";
      setListError(msg);
    } finally {
      setIsVideosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!viewerSession.isHydrated) {
      return;
    }
    void loadVideos();
  }, [loadVideos, viewerSession.isHydrated]);

  const uploadTask = useUploadTask({
    onUploadSuccess: (videoId) => {
      viewerSession.setCurrentVideoId(videoId);
      void loadVideos();
    }
  });

  const onDeleteCurrentVideo = useCallback(async () => {
    if (!viewerSession.currentVideoId) {
      return;
    }

    await deleteVideo(viewerSession.currentVideoId);
    viewerSession.setCurrentVideoId(null);
    await loadVideos();
  }, [loadVideos, viewerSession]);

  const onClearAiResult = useCallback(async () => {
    if (!viewerSession.currentVideoId) {
      return;
    }

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

  const panelStyle = useMemo(
    () => ({
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
      gap: 16,
      alignItems: "start" as const
    }),
    []
  );

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: 20, display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Ultrasound Local Viewer</h1>

      <UploadPanel
        uploadTask={uploadTask}
        currentVideoId={viewerSession.currentVideoId}
        onDeleteCurrentVideo={onDeleteCurrentVideo}
        onClearAiResult={onClearAiResult}
        onClearFrontendState={viewerSession.clearFrontendState}
      />

      <div style={panelStyle}>
        <ViewerPanel
          currentVideoId={viewerSession.currentVideoId}
          bootstrapData={viewerSession.bootstrapData}
          loading={viewerSession.isBootstrapLoading}
          statusMessage={viewerSession.statusMessage}
          onRefresh={viewerSession.revalidateBootstrap}
          layerState={layerState}
        />

        <div style={{ display: "grid", gap: 16 }}>
          <VideosListPanel
            items={videos}
            currentVideoId={viewerSession.currentVideoId}
            loading={isVideosLoading}
            onSelect={onSelectVideo}
            onReload={loadVideos}
          />
          <LayersPanel
            videoId={viewerSession.currentVideoId}
            bootstrapData={viewerSession.bootstrapData}
            onReload={viewerSession.revalidateBootstrap}
            layerState={layerState}
          />
        </div>
      </div>

      {listError ? (
        <div style={{ borderRadius: 8, padding: 10, background: "#fee2e2", color: "#7f1d1d" }}>
          影片列表載入失敗：{listError}
        </div>
      ) : null}
    </main>
  );
}
