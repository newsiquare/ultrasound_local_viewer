"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import {
  createAnnotation,
  createCategory,
  deleteAnnotation,
  deleteCategory,
  fetchAnnotations,
  fetchCategories,
  updateCategory
} from "@/client/api";
import { useLayerVisibilityState } from "@/client/hooks/useLayerVisibilityState";
import { AnnotationItem, BootstrapData, CategoryItem } from "@/client/types";

interface LayersPanelProps {
  videoId: string | null;
  bootstrapData: BootstrapData | null;
  onReload: () => Promise<void>;
}

function SectionHeader(props: {
  title: string;
  open: boolean;
  onToggle: () => void;
  rightSlot?: ReactNode;
}) {
  const { title, open, onToggle, rightSlot } = props;

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <button type="button" onClick={onToggle} style={{ fontWeight: 700 }}>
        {open ? "▾" : "▸"} {title}
      </button>
      {rightSlot}
    </div>
  );
}

function sortCategories(categories: CategoryItem[]): CategoryItem[] {
  return [...categories].sort((a, b) => {
    if (a.source !== b.source) {
      return a.source.localeCompare(b.source);
    }
    return a.name.localeCompare(b.name);
  });
}

export function LayersPanel(props: LayersPanelProps) {
  const { videoId, bootstrapData, onReload } = props;
  const layerState = useLayerVisibilityState();

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#22C55E");
  const [newAnnotationFrameId, setNewAnnotationFrameId] = useState("f_000001");
  const [newAnnotationCategoryId, setNewAnnotationCategoryId] = useState("");
  const [bboxX, setBboxX] = useState("0");
  const [bboxY, setBboxY] = useState("0");
  const [bboxW, setBboxW] = useState("120");
  const [bboxH, setBboxH] = useState("80");

  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadLayerData = useCallback(async () => {
    if (!videoId) {
      setCategories([]);
      setAnnotations([]);
      return;
    }

    setIsLoading(true);
    try {
      const [nextCategories, nextAnnotations] = await Promise.all([
        fetchCategories(videoId),
        fetchAnnotations(videoId, { source: "MANUAL", cursor: 0, limit: 200 })
      ]);
      const sorted = sortCategories(nextCategories);
      setCategories(sorted);
      setAnnotations(nextAnnotations.items);

      if (!newAnnotationCategoryId) {
        const firstManual = sorted.find((item) => item.source === "MANUAL") ?? sorted[0];
        setNewAnnotationCategoryId(firstManual?.id ?? "");
      }

      const firstFrame = bootstrapData?.annotationsCurrentWindow[0]?.frame_id;
      if (firstFrame) {
        setNewAnnotationFrameId(firstFrame);
      }

      setNotice(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "載入圖層資料失敗";
      setNotice(`圖層資料同步失敗：${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [bootstrapData?.annotationsCurrentWindow, newAnnotationCategoryId, videoId]);

  useEffect(() => {
    void loadLayerData();
  }, [loadLayerData]);

  const annotationCount = annotations.length;

  const visibleCategoryCount = useMemo(() => {
    if (!layerState.categoryMasterVisible) {
      return 0;
    }

    return categories.reduce((sum, category) => {
      return sum + (category.is_visible !== 0 ? 1 : 0);
    }, 0);
  }, [categories, layerState.categoryMasterVisible]);

  const handleToggleCategoryVisible = useCallback(
    async (category: CategoryItem, nextVisible: boolean) => {
      if (!videoId) {
        return;
      }
      setBusyKey(`cat-visible-${category.id}`);
      try {
        await updateCategory(videoId, category.id, { isVisible: nextVisible });
        await loadLayerData();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "更新類別可見性失敗";
        setNotice(msg);
      } finally {
        setBusyKey(null);
      }
    },
    [loadLayerData, videoId]
  );

  const handleCreateCategory = useCallback(async () => {
    if (!videoId) {
      return;
    }
    setBusyKey("create-category");
    try {
      await createCategory(videoId, {
        name: newCategoryName,
        color: newCategoryColor
      });
      setNewCategoryName("");
      await Promise.all([loadLayerData(), onReload()]);
      setNotice("類別已新增");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "新增類別失敗";
      setNotice(msg);
    } finally {
      setBusyKey(null);
    }
  }, [loadLayerData, newCategoryColor, newCategoryName, onReload, videoId]);

  const handleDeleteCategory = useCallback(
    async (category: CategoryItem) => {
      if (!videoId) {
        return;
      }
      setBusyKey(`delete-category-${category.id}`);
      try {
        await deleteCategory(videoId, category.id);
        await Promise.all([loadLayerData(), onReload()]);
        setNotice("類別已刪除");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "刪除類別失敗";
        setNotice(msg);
      } finally {
        setBusyKey(null);
      }
    },
    [loadLayerData, onReload, videoId]
  );

  const handleCreateAnnotation = useCallback(async () => {
    if (!videoId) {
      return;
    }

    const x = Number(bboxX);
    const y = Number(bboxY);
    const width = Number(bboxW);
    const height = Number(bboxH);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
      setNotice("bbox 欄位必須是有效數字");
      return;
    }

    setBusyKey("create-annotation");
    try {
      await createAnnotation(videoId, {
        frameId: newAnnotationFrameId,
        categoryId: newAnnotationCategoryId,
        bbox: { x, y, width, height }
      });
      await Promise.all([loadLayerData(), onReload()]);
      setNotice("標註已新增");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "新增標註失敗";
      setNotice(msg);
    } finally {
      setBusyKey(null);
    }
  }, [bboxH, bboxW, bboxX, bboxY, loadLayerData, newAnnotationCategoryId, newAnnotationFrameId, onReload, videoId]);

  const handleDeleteAnnotation = useCallback(
    async (annotationId: string) => {
      if (!videoId) {
        return;
      }
      setBusyKey(`delete-annotation-${annotationId}`);
      try {
        await deleteAnnotation(videoId, annotationId);
        await Promise.all([loadLayerData(), onReload()]);
        setNotice("標註已刪除");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "刪除標註失敗";
        setNotice(msg);
      } finally {
        setBusyKey(null);
      }
    },
    [loadLayerData, onReload, videoId]
  );

  return (
    <section style={{ border: "1px solid #d4d4d8", borderRadius: 12, padding: 16, background: "#fff" }}>
      <h2 style={{ marginTop: 0 }}>Layers Panel</h2>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "#52525b" }}>{videoId ? `video: ${videoId}` : "尚未選擇影片"}</span>
        <button type="button" onClick={() => void loadLayerData()} disabled={!videoId || isLoading}>
          {isLoading ? "同步中..." : "刷新圖層"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ border: "1px solid #e4e4e7", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
          <SectionHeader
            title="Category Layers"
            open={layerState.categoryOpen}
            onToggle={() => layerState.togglePanel("categoryOpen")}
            rightSlot={
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={layerState.categoryMasterVisible}
                  onChange={(event) => layerState.setCategoryMasterVisible(event.target.checked)}
                />
                Master
              </label>
            }
          />

          {layerState.categoryOpen ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: "#52525b" }}>
                可見類別：{visibleCategoryCount} / {categories.length}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 6 }}>
                <input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="新類別名稱"
                  disabled={!videoId}
                />
                <input
                  type="color"
                  value={newCategoryColor}
                  onChange={(event) => setNewCategoryColor(event.target.value)}
                  disabled={!videoId}
                />
                <button
                  type="button"
                  onClick={() => void handleCreateCategory()}
                  disabled={!videoId || busyKey === "create-category"}
                >
                  新增
                </button>
              </div>

              {categories.length === 0 ? <div style={{ fontSize: 13 }}>尚無類別資料</div> : null}
              {categories.map((category) => {
                const rowVisible = layerState.categoryMasterVisible && category.is_visible !== 0;
                const rowBusy = busyKey === `cat-visible-${category.id}` || busyKey === `delete-category-${category.id}`;

                return (
                  <div
                    key={category.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto auto auto",
                      gap: 8,
                      alignItems: "center",
                      fontSize: 13
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={rowVisible}
                      disabled={!layerState.categoryMasterVisible || rowBusy}
                      onChange={(event) => {
                        void handleToggleCategoryVisible(category, event.target.checked);
                      }}
                    />
                    <span>
                      {category.name}
                      <span style={{ color: "#71717a", marginLeft: 6 }}>{category.source}</span>
                    </span>
                    <span style={{ color: "#71717a" }}>#{category.annotation_count}</span>
                    <span style={{ width: 16, height: 16, borderRadius: 3, background: category.color }} />
                    <button
                      type="button"
                      onClick={() => void handleDeleteCategory(category)}
                      disabled={rowBusy || category.source === "AI"}
                    >
                      刪除
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div style={{ border: "1px solid #e4e4e7", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
          <SectionHeader
            title="Annotation Layers"
            open={layerState.annotationOpen}
            onToggle={() => layerState.togglePanel("annotationOpen")}
            rightSlot={
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={layerState.annotationVisible}
                  onChange={(event) => layerState.setAnnotationVisible(event.target.checked)}
                />
                Visible
              </label>
            }
          />

          {layerState.annotationOpen ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, color: "#3f3f46" }}>目前人工標註數：{annotationCount}</div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <input
                    value={newAnnotationFrameId}
                    onChange={(event) => setNewAnnotationFrameId(event.target.value)}
                    placeholder="frameId (e.g. f_000123)"
                    disabled={!videoId}
                  />
                  <select
                    value={newAnnotationCategoryId}
                    onChange={(event) => setNewAnnotationCategoryId(event.target.value)}
                    disabled={!videoId}
                  >
                    <option value="">選擇類別</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  <input value={bboxX} onChange={(event) => setBboxX(event.target.value)} placeholder="x" />
                  <input value={bboxY} onChange={(event) => setBboxY(event.target.value)} placeholder="y" />
                  <input value={bboxW} onChange={(event) => setBboxW(event.target.value)} placeholder="w" />
                  <input value={bboxH} onChange={(event) => setBboxH(event.target.value)} placeholder="h" />
                </div>
                <button
                  type="button"
                  onClick={() => void handleCreateAnnotation()}
                  disabled={!videoId || !newAnnotationCategoryId || busyKey === "create-annotation"}
                >
                  新增標註
                </button>
              </div>

              <div style={{ display: "grid", gap: 6, maxHeight: 240, overflow: "auto" }}>
                {annotations.map((item) => {
                  const rowBusy = busyKey === `delete-annotation-${item.id}`;
                  return (
                    <div
                      key={item.id}
                      style={{ border: "1px solid #e4e4e7", borderRadius: 6, padding: 8, display: "grid", gap: 4 }}
                    >
                      <div style={{ fontSize: 12, color: "#52525b" }}>
                        {item.frameId} · {item.categoryId}
                      </div>
                      <div style={{ fontSize: 12 }}>
                        bbox: {item.bbox ? `${item.bbox.x}, ${item.bbox.y}, ${item.bbox.width}, ${item.bbox.height}` : "invalid"}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteAnnotation(item.id)}
                        disabled={rowBusy}
                      >
                        刪除標註
                      </button>
                    </div>
                  );
                })}
                {annotations.length === 0 ? <div style={{ fontSize: 13 }}>尚無人工標註</div> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ border: "1px solid #e4e4e7", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
          <SectionHeader
            title="AI Layers"
            open={layerState.aiOpen}
            onToggle={() => layerState.togglePanel("aiOpen")}
            rightSlot={
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={layerState.aiVisible}
                  onChange={(event) => layerState.setAiVisible(event.target.checked)}
                />
                Visible
              </label>
            }
          />

          {layerState.aiOpen ? (
            <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={layerState.aiShowBBox}
                  onChange={(event) => layerState.setAiShowBBox(event.target.checked)}
                />
                BBox
              </label>
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={layerState.aiShowTrackId}
                  onChange={(event) => layerState.setAiShowTrackId(event.target.checked)}
                />
                Track ID
              </label>
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={layerState.aiShowTrajectory}
                  onChange={(event) => layerState.setAiShowTrajectory(event.target.checked)}
                />
                Trajectory
              </label>
            </div>
          ) : null}
        </div>
      </div>

      {notice ? (
        <div style={{ marginTop: 10, borderRadius: 8, padding: 10, background: "#fef3c7", color: "#78350f" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)}>
              關閉
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
