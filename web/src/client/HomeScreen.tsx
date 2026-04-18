"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Group as PanelGroup, Panel, Separator as PanelSeparator } from "react-resizable-panels";

import { clearAiResult, createAnnotation, deleteAnnotation, deleteVideo, fetchAnnotationsAll, fetchVideosList, updateAnnotation } from "@/client/api";
import { LayersPanel } from "@/client/components/LayersPanel";
import { StatusBar } from "@/client/components/StatusBar";
import { AiStatus, AnnotationGeometry, AnnotationItem } from "@/client/types";
import { AiOverlayDetection } from "@/client/ai-overlay-stability";
import { TopBar } from "@/client/components/TopBar";
import { ViewerPanel } from "@/client/components/ViewerPanel";
import { VideosListPanel } from "@/client/components/VideosListPanel";
import { useAnnotationHistory } from "@/client/hooks/useAnnotationHistory";
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
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [hoveredAiId, setHoveredAiId] = useState<number | null>(null);
  const [selectedAiId, setSelectedAiId] = useState<number | null>(null);
  const [aiConfidenceThreshold, setAiConfidenceThreshold] = useState(0);
  // H3: multi-select
  const [multiSelectedAnnotationIds, setMultiSelectedAnnotationIds] = useState<string[]>([]);
  // H2: annotation frame marks (frameId → category colors)
  const [annotationFrameMarks, setAnnotationFrameMarks] = useState<Map<string, string[]>>(new Map());

  const onAnnotationMutated = useCallback(() => {
    setAnnotationRefreshKey((k) => k + 1);
  }, []);

  // H1: Undo/Redo history
  const history = useAnnotationHistory(onAnnotationMutated);

  // H1: clear history when video changes
  useEffect(() => {
    history.clearHistory();
    setMultiSelectedAnnotationIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerSession.currentVideoId]);

  // H2: fetch frame marks whenever annotations change
  const refreshFrameMarks = useCallback(async () => {
    const videoId = viewerSession.currentVideoId;
    const cats = viewerSession.bootstrapData?.categories ?? [];
    if (!videoId || cats.length === 0) {
      setAnnotationFrameMarks(new Map());
      return;
    }
    try {
      const items = await fetchAnnotationsAll(videoId, { source: "MANUAL" });
      const catColorMap = new Map(cats.map((c) => [c.id, c.color]));
      const marks = new Map<string, string[]>();
      for (const item of items) {
        const color = catColorMap.get(item.categoryId) ?? "#f59e0b";
        const existing = marks.get(item.frameId);
        if (existing) {
          if (!existing.includes(color)) existing.push(color);
        } else {
          marks.set(item.frameId, [color]);
        }
      }
      setAnnotationFrameMarks(marks);
    } catch {
      // silent — bar simply won't show
    }
  }, [viewerSession.currentVideoId, viewerSession.bootstrapData?.categories]);

  useEffect(() => {
    void refreshFrameMarks();
  }, [refreshFrameMarks, annotationRefreshKey]);

  // H1: annotation created callback
  const handleAnnotationCreated = useCallback(
    (item: AnnotationItem) => {
      const videoId = viewerSession.currentVideoId;
      if (!videoId) return;
      history.pushCreate(videoId, item);
    },
    [viewerSession.currentVideoId, history]
  );

  // H1: annotation deleted callback (from LayersPanel)
  const handleAnnotationDeleted = useCallback(
    (item: AnnotationItem) => {
      const videoId = viewerSession.currentVideoId;
      if (!videoId) return;
      history.pushDelete(videoId, item);
    },
    [viewerSession.currentVideoId, history]
  );

  const handleAnnotationUpdated = useCallback(
    async (annotationId: string, geometry: AnnotationGeometry, oldGeometry?: AnnotationGeometry) => {
      const videoId = viewerSession.currentVideoId;
      if (!videoId) return;
      if (oldGeometry) {
        history.pushUpdate(videoId, annotationId, oldGeometry, geometry);
      }
      try {
        await updateAnnotation(videoId, annotationId, { geometry });
        onAnnotationMutated();
      } catch {
        // silent — canvas snaps back on next refresh
      }
    },
    [viewerSession.currentVideoId, onAnnotationMutated, history]
  );

  // H3: batch delete
  const handleBatchDeleteAnnotations = useCallback(
    async (ids: string[]) => {
      const videoId = viewerSession.currentVideoId;
      if (!videoId || ids.length === 0) return;
      for (const id of ids) {
        try {
          await deleteAnnotation(videoId, id);
        } catch { /* skip failed */ }
      }
      setMultiSelectedAnnotationIds([]);
      onAnnotationMutated();
      toast.success(`已刪除 ${ids.length} 筆標註`);
    },
    [viewerSession.currentVideoId, onAnnotationMutated]
  );

  const handleAiCopyToManual = useCallback(
    async (det: AiOverlayDetection) => {
      const videoId = viewerSession.currentVideoId;
      const frameId = currentFrameId;
      if (!videoId || !frameId || !viewerSession.bootstrapData) return;
      const cats = viewerSession.bootstrapData.categories;
      const matched = cats.find(
        (c) => c.name.toLowerCase() === det.categoryName.toLowerCase()
      ) ?? cats[0];
      if (!matched) return;
      try {
        await createAnnotation(videoId, {
          frameId,
          categoryId: matched.id,
          annotationType: "BBOX",
          geometry: { type: "bbox", x: det.x, y: det.y, width: det.width, height: det.height }
        });
        onAnnotationMutated();
      } catch {
        // silent
      }
    },
    [viewerSession.currentVideoId, viewerSession.bootstrapData, currentFrameId, onAnnotationMutated]
  );

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

  const onDeleteVideo = useCallback(async (videoId: string) => {
    await deleteVideo(videoId);
    if (viewerSession.currentVideoId === videoId) viewerSession.setCurrentVideoId(null);
    await loadVideos();
  }, [loadVideos, viewerSession]);

  const onClearAiResult = useCallback(async () => {
    if (!viewerSession.currentVideoId) return;
    await clearAiResult(viewerSession.currentVideoId);
    await viewerSession.revalidateBootstrap();
    await loadVideos();
  }, [loadVideos, viewerSession]);

  const onClearAiResultForVideo = useCallback(async (videoId: string) => {
    await clearAiResult(videoId);
    if (viewerSession.currentVideoId === videoId) await viewerSession.revalidateBootstrap();
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
                onDelete={onDeleteVideo}
                onClearAi={onClearAiResultForVideo}
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
                selectedAnnotationId={selectedAnnotationId}
                onAnnotationMutated={onAnnotationMutated}
                onAnnotationSelect={setSelectedAnnotationId}
                onAnnotationUpdated={handleAnnotationUpdated}
                onAnnotationCreated={handleAnnotationCreated}
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                onUndo={history.undo}
                onRedo={history.redo}
                multiSelectedAnnotationIds={multiSelectedAnnotationIds}
                onMultiSelect={setMultiSelectedAnnotationIds}
                onBatchDeleteAnnotations={handleBatchDeleteAnnotations}
                annotationFrameMarks={annotationFrameMarks}
                hoveredAiId={hoveredAiId}
                selectedAiId={selectedAiId}
                onAiDetectionSelect={setSelectedAiId}
                aiConfidenceThreshold={aiConfidenceThreshold}
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
                selectedAnnotationId={selectedAnnotationId}
                onAnnotationCategorySelect={setSelectedAnnotationCategoryId}
                onAnnotationMutated={onAnnotationMutated}
                onAnnotationDeleted={handleAnnotationDeleted}
                onAnnotationSelect={setSelectedAnnotationId}
                hoveredAiId={hoveredAiId}
                selectedAiId={selectedAiId}
                onAiDetectionSelect={setSelectedAiId}
                onAiDetectionHover={setHoveredAiId}
                aiConfidenceThreshold={aiConfidenceThreshold}
                onAiConfidenceThresholdChange={setAiConfidenceThreshold}
                onAiCopyToManual={handleAiCopyToManual}
              />
            </div>
          </Panel>
        </PanelGroup>
      </div>
      <StatusBar
        bootstrapData={viewerSession.bootstrapData}
        currentDisplayIndex={currentDisplayIndex}
      />
    </div>
  );
}
