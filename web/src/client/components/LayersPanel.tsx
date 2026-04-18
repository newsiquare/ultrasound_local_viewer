"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Check, Eye, EyeOff, Info, Pentagon, Plus, RefreshCw, Square, Trash2, Type, X } from "lucide-react";
import {
  createCategory,
  deleteAnnotation,
  deleteCategory,
  fetchCategories,
  updateAnnotation,
  updateCategory
} from "@/client/api";
import { useAiOverlayData } from "@/client/hooks/useAiOverlayData";
import { useFrameAnnotations } from "@/client/hooks/useFrameAnnotations";
import { UseLayerVisibilityStateResult } from "@/client/hooks/useLayerVisibilityState";
import { AiStatus, AnnotationItem, AnnotationType, BootstrapData, CategoryItem } from "@/client/types";

interface LayersPanelProps {
  videoId: string | null;
  bootstrapData: BootstrapData | null;
  onReload: () => Promise<void>;
  layerState: UseLayerVisibilityStateResult;
  aiStatus: AiStatus;
  aiUpdatedAt: string | null;
  currentDisplayIndex: number | null;
  viewerFrameId: string | null;
  /** Increment to force annotation list refresh (shared with ViewerPanel) */
  annotationRefreshKey?: number;
  /** The category ID that will be used when the user draws a new annotation */
  selectedAnnotationCategoryId?: string | null;
  /** Called when the user selects a category to use for new annotations */
  onAnnotationCategorySelect?: (id: string) => void;
  /** Called after annotation delete/visibility mutations (triggers ViewerPanel refresh) */
  onAnnotationMutated?: () => void;
}

function sortCategories(categories: CategoryItem[]): CategoryItem[] {
  return [...categories].sort((a, b) => {
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    return a.name.localeCompare(b.name);
  });
}

function AnnotationTypeIcon({ type }: { type: string }) {
  if (type === "POLYGON") return <Pentagon size={13} style={{ color: "#7880a0", flexShrink: 0 }} />;
  if (type === "TEXT") return <Type size={13} style={{ color: "#7880a0", flexShrink: 0 }} />;
  return <Square size={13} style={{ color: "#7880a0", flexShrink: 0 }} />;
}

function formatGeometryInfo(annotation: AnnotationItem): string {
  const g = annotation.geometry;
  if (!g) return "無幾何資訊";
  if (g.type === "bbox") {
    return `x:${Math.round(g.x)} y:${Math.round(g.y)} w:${Math.round(g.width)} h:${Math.round(g.height)}`;
  }
  if (g.type === "polygon") {
    return `多邊形, ${g.points.length} 頂點`;
  }
  if (g.type === "text") {
    return `文字錨點 (${Math.round(g.x)}, ${Math.round(g.y)})`;
  }
  return "未知類型";
}

const TYPE_LABEL: Record<AnnotationType, string> = {
  BBOX: "矩形",
  POLYGON: "多邊形",
  TEXT: "文字"
};

export function LayersPanel(props: LayersPanelProps) {
  const {
    videoId, bootstrapData, onReload, layerState, aiStatus, aiUpdatedAt, currentDisplayIndex,
    viewerFrameId,
    annotationRefreshKey = 0,
    selectedAnnotationCategoryId,
    onAnnotationCategorySelect,
    onAnnotationMutated
  } = props;

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#22C55E");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [infoOpenId, setInfoOpenId] = useState<string | null>(null);

  const aiOverlay = useAiOverlayData({ videoId, aiStatus, aiUpdatedAt, currentDisplayIndex });
  const aiCurrentDetections = aiOverlay.detections;

  // Per-frame annotations — shares refreshKey with ViewerPanel
  const frameAnnotations = useFrameAnnotations({
    videoId,
    frameId: viewerFrameId,
    enabled: Boolean(videoId && viewerFrameId),
    refreshKey: annotationRefreshKey
  });

  const loadCategories = useCallback(async () => {
    if (!videoId) { setCategories([]); return; }
    setIsLoading(true);
    try {
      const next = await fetchCategories(videoId);
      setCategories(sortCategories(next));
      setNotice(null);
    } catch (error) {
      setNotice(`類別資料同步失敗：${error instanceof Error ? error.message : "未知錯誤"}`);
    } finally { setIsLoading(false); }
  }, [videoId]);

  useEffect(() => { void loadCategories(); }, [loadCategories]);

  // Fast-path: sync categories from bootstrap
  useEffect(() => {
    if (bootstrapData?.categories && bootstrapData.categories.length > 0) {
      setCategories(sortCategories(bootstrapData.categories));
    }
  }, [bootstrapData?.categories]);

  const visibleCategoryCount = useMemo(() => {
    if (!layerState.categoryMasterVisible) return 0;
    return categories.reduce((sum, c) => sum + (c.is_visible !== 0 ? 1 : 0), 0);
  }, [categories, layerState.categoryMasterVisible]);

  const handleToggleCategoryVisible = useCallback(async (category: CategoryItem, nextVisible: boolean) => {
    if (!videoId) return;
    setBusyKey(`cat-visible-${category.id}`);
    try {
      await updateCategory(videoId, category.id, { isVisible: nextVisible });
      await Promise.all([loadCategories(), onReload()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新類別可見性失敗");
    } finally { setBusyKey(null); }
  }, [loadCategories, onReload, videoId]);

  const handleCreateCategory = useCallback(async () => {
    if (!videoId) return;
    setBusyKey("create-category");
    try {
      await createCategory(videoId, { name: newCategoryName, color: newCategoryColor });
      setNewCategoryName("");
      await Promise.all([loadCategories(), onReload()]);
      setNotice("類別已新增");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "新增類別失敗");
    } finally { setBusyKey(null); }
  }, [loadCategories, newCategoryColor, newCategoryName, onReload, videoId]);

  const handleDeleteCategory = useCallback(async (category: CategoryItem) => {
    if (!videoId) return;
    setBusyKey(`delete-category-${category.id}`);
    try {
      await deleteCategory(videoId, category.id);
      await Promise.all([loadCategories(), onReload()]);
      setNotice("類別已刪除");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "刪除類別失敗");
    } finally { setBusyKey(null); }
  }, [loadCategories, onReload, videoId]);

  const handleInlineCategoryChange = useCallback(async (annotation: AnnotationItem, newCategoryId: string) => {
    if (!videoId) return;
    setBusyKey(`update-annotation-${annotation.id}`);
    try {
      await updateAnnotation(videoId, annotation.id, { categoryId: newCategoryId });
      onAnnotationMutated?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新類別失敗");
    } finally { setBusyKey(null); }
  }, [onAnnotationMutated, videoId]);

  const handleToggleAnnotationVisible = useCallback(async (annotation: AnnotationItem) => {
    if (!videoId) return;
    setBusyKey(`ann-visible-${annotation.id}`);
    try {
      await updateAnnotation(videoId, annotation.id, { isVisible: !annotation.isVisible });
      onAnnotationMutated?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新可見性失敗");
    } finally { setBusyKey(null); }
  }, [onAnnotationMutated, videoId]);

  const handleDeleteAnnotation = useCallback(async (annotationId: string) => {
    if (!videoId) return;
    setBusyKey(`delete-annotation-${annotationId}`);
    try {
      await deleteAnnotation(videoId, annotationId);
      onAnnotationMutated?.();
      setNotice("標註已刪除");
      setDeleteConfirmId(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "刪除標註失敗");
    } finally { setBusyKey(null); }
  }, [onAnnotationMutated, videoId]);

  const activeCategory = categories.find((c) => c.id === selectedAnnotationCategoryId) ?? null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "#0f1018"
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 38,
          padding: "0 10px",
          borderBottom: "1px solid #252638",
          flexShrink: 0,
          gap: 6
        }}
      >
        <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "#9699b0", textTransform: "uppercase", letterSpacing: 0.8 }}>圖層面板</span>
        <button
          type="button"
          onClick={() => void loadCategories()}
          disabled={!videoId || isLoading}
          title="刷新圖層"
          style={{
            padding: 4, background: "none", border: "none",
            cursor: !videoId || isLoading ? "not-allowed" : "pointer",
            color: !videoId || isLoading ? "#3c3e58" : "#9699b0",
            display: "flex", alignItems: "center", borderRadius: 4
          }}
        >
          <RefreshCw size={12} style={isLoading ? { animation: "spin 1s linear infinite" } : {}} />
        </button>
      </div>

      {/* Notice */}
      {notice && (
        <div
          style={{
            padding: "6px 10px",
            background: "rgba(251,191,36,0.1)",
            borderBottom: "1px solid rgba(251,191,36,0.2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            flexShrink: 0
          }}
        >
          <span style={{ fontSize: 11, color: "#fbbf24" }}>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#fbbf24", display: "flex" }}
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Scrollable content: 3 stacked sections */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>

        {/* ── Section 1: 類別圖層 ── */}
        <div style={{ padding: "8px 10px 10px" }}>
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", height: 30, gap: 6, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => layerState.setCategoryMasterVisible(!layerState.categoryMasterVisible)}
              style={iconBtnStyle(layerState.categoryMasterVisible)}
              title={layerState.categoryMasterVisible ? "隱藏所有類別" : "顯示所有類別"}
            >
              {layerState.categoryMasterVisible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#d4d6f0" }}>類別圖層</span>
            <span style={{ fontSize: 10, color: "#7880a0" }}>
              {visibleCategoryCount}/{categories.length}
            </span>
          </div>

          {/* New category form */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 4, marginBottom: 8 }}>
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="新類別名稱"
              disabled={!videoId}
              onKeyDown={(e) => { if (e.key === "Enter" && newCategoryName) void handleCreateCategory(); }}
            />
            <input
              type="color"
              value={newCategoryColor}
              onChange={(e) => setNewCategoryColor(e.target.value)}
              disabled={!videoId}
            />
            <button
              type="button"
              onClick={() => void handleCreateCategory()}
              disabled={!videoId || !newCategoryName || busyKey === "create-category"}
              style={actionBtnStyle("primary", !videoId || !newCategoryName || busyKey === "create-category")}
              title="新增類別"
            >
              <Plus size={13} />
            </button>
          </div>

          {/* Category list */}
          {categories.length === 0 && (
            <div style={{ fontSize: 12, color: "#585a78", padding: "4px 0" }}>尚無類別資料</div>
          )}
          {categories.map((category) => {
            const rowVisible = layerState.categoryMasterVisible && category.is_visible !== 0;
            const rowBusy = busyKey === `cat-visible-${category.id}` || busyKey === `delete-category-${category.id}`;
            const isSelected = category.id === selectedAnnotationCategoryId;
            return (
              <div
                key={category.id}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "4px 4px", borderRadius: 5, marginBottom: 2,
                  background: isSelected ? "rgba(79,140,255,0.06)" : "transparent",
                  border: isSelected ? "1px solid rgba(79,140,255,0.25)" : "1px solid transparent"
                }}
              >
                <button
                  type="button"
                  onClick={() => onAnnotationCategorySelect?.(category.id)}
                  style={{
                    width: 10, height: 10, borderRadius: 2, background: category.color,
                    flexShrink: 0, border: isSelected ? "1px solid #4f8cff" : "1px solid transparent",
                    cursor: "pointer", padding: 0
                  }}
                  title={`設為標註類別：${category.name}`}
                />
                <button
                  type="button"
                  onClick={() => { void handleToggleCategoryVisible(category, !rowVisible); }}
                  disabled={!layerState.categoryMasterVisible || rowBusy}
                  style={iconBtnStyle(rowVisible)}
                  title={rowVisible ? "隱藏" : "顯示"}
                >
                  {rowVisible ? <Eye size={11} /> : <EyeOff size={11} />}
                </button>
                <span style={{ flex: 1, fontSize: 12, color: rowVisible ? "#c8cae8" : "#7880a0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                  onClick={() => onAnnotationCategorySelect?.(category.id)}
                >
                  {category.name}
                </span>
                <span style={{ fontSize: 10, color: "#585a78", flexShrink: 0 }}>#{category.annotation_count}</span>
                {category.source !== "AI" && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteCategory(category)}
                    disabled={rowBusy}
                    style={iconBtnStyle(false, "danger")}
                    title="刪除類別"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#252638" }} />

        {/* ── Section 2: 標註圖層 ── */}
        <div style={{ padding: "8px 10px 10px" }}>
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", height: 30, gap: 6, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => layerState.setAnnotationVisible(!layerState.annotationVisible)}
              style={iconBtnStyle(layerState.annotationVisible)}
              title={layerState.annotationVisible ? "隱藏標註" : "顯示標註"}
            >
              {layerState.annotationVisible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#d4d6f0" }}>標註圖層</span>
            {frameAnnotations.loading && (
              <RefreshCw size={11} style={{ color: "#7880a0", animation: "spin 1s linear infinite", flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 10, color: "#585a78", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {frameAnnotations.items.length > 0 ? `${frameAnnotations.items.length} 個` : ""}
            </span>
          </div>

          {/* Active category for drawing */}
          {activeCategory && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 8px", marginBottom: 8,
                background: "rgba(79,140,255,0.08)",
                border: "1px solid rgba(79,140,255,0.2)",
                borderRadius: 5, fontSize: 11, color: "#9cacf5"
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: 2, background: activeCategory.color, flexShrink: 0 }} />
              <span>繪製類別：{activeCategory.name}</span>
            </div>
          )}

          {/* No frame selected */}
          {!viewerFrameId && (
            <div style={{ fontSize: 12, color: "#585a78", padding: "4px 0", textAlign: "center" }}>
              請先播放影片至某一幀
            </div>
          )}

          {/* Empty frame */}
          {viewerFrameId && !frameAnnotations.loading && frameAnnotations.items.length === 0 && (
            <div style={{ fontSize: 12, color: "#585a78", padding: "8px 0", textAlign: "center", lineHeight: 1.5 }}>
              此幀無手動標註<br />
              <span style={{ fontSize: 11 }}>請使用工具列中的矩形 / 多邊形 / 文字工具繪製</span>
            </div>
          )}

          {/* Annotation rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {frameAnnotations.items.map((item) => {
              const cat = categories.find((c) => c.id === item.categoryId);
              const isInfoOpen = infoOpenId === item.id;
              const isConfirming = deleteConfirmId === item.id;
              const rowBusy = busyKey === `delete-annotation-${item.id}` || busyKey === `ann-visible-${item.id}` || busyKey === `update-annotation-${item.id}`;

              return (
                <div key={item.id}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", height: 34, gap: 5, padding: "0 6px",
                      borderRadius: isInfoOpen ? "6px 6px 0 0" : 6,
                      border: `1px solid ${isInfoOpen ? "rgba(79,140,255,0.4)" : "#3c3e58"}`,
                      background: "#171824",
                      opacity: item.isVisible ? 1 : 0.5
                    }}
                  >
                    {/* Type icon */}
                    <AnnotationTypeIcon type={item.annotationType} />

                    {/* Color dot + category dropdown */}
                    <div
                      style={{
                        display: "flex", alignItems: "center", flex: 1, minWidth: 0, gap: 4,
                        background: "rgba(255,255,255,0.04)", borderRadius: 999,
                        padding: "0 8px 0 6px", height: 22
                      }}
                    >
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: cat?.color ?? "#7880a0", flexShrink: 0 }} />
                      <select
                        value={item.categoryId}
                        onChange={(e) => void handleInlineCategoryChange(item, e.target.value)}
                        disabled={!videoId || rowBusy}
                        style={{
                          flex: 1, minWidth: 0, background: "transparent", border: "none",
                          color: "#c8cae8", fontSize: 11, cursor: "pointer",
                          fontFamily: "inherit", outline: "none"
                        }}
                      >
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    {/* Info toggle */}
                    <button
                      type="button"
                      onClick={() => setInfoOpenId(isInfoOpen ? null : item.id)}
                      style={iconBtnStyle(isInfoOpen)}
                      title="詳細資訊"
                    >
                      <Info size={12} />
                    </button>

                    {/* Eye toggle (persisted to server) */}
                    <button
                      type="button"
                      onClick={() => void handleToggleAnnotationVisible(item)}
                      disabled={rowBusy}
                      style={iconBtnStyle(item.isVisible)}
                      title={item.isVisible ? "隱藏標註" : "顯示標註"}
                    >
                      {item.isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>

                    {/* Delete with confirm */}
                    {isConfirming ? (
                      <>
                        <span style={{ fontSize: 10, color: "#f87171", whiteSpace: "nowrap" }}>刪除？</span>
                        <button type="button" onClick={() => void handleDeleteAnnotation(item.id)} disabled={rowBusy} style={iconBtnStyle(false, "danger")} title="確認刪除">
                          <Check size={12} />
                        </button>
                        <button type="button" onClick={() => setDeleteConfirmId(null)} style={iconBtnStyle(false)} title="取消">
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(item.id)}
                        style={iconBtnStyle(false, "danger")}
                        title="刪除標註"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  {/* Info popover */}
                  {isInfoOpen && (
                    <div
                      style={{
                        padding: "8px 10px", background: "#111220",
                        border: "1px solid #3c3e58", borderTop: "none",
                        borderRadius: "0 0 6px 6px",
                        fontSize: 11, color: "#c9ccd8",
                        display: "flex", flexDirection: "column", gap: 4
                      }}
                    >
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ color: "#d4d6f0", fontWeight: 600 }}>{TYPE_LABEL[item.annotationType] ?? item.annotationType}</span>
                        <span style={{ color: "#9699b0" }}>幀：{item.frameId}</span>
                      </div>
                      <span style={{ fontVariantNumeric: "tabular-nums", color: "#a8aac8" }}>
                        {formatGeometryInfo(item)}
                      </span>
                      {item.textContent && (
                        <span style={{ color: "#d4d6f0" }}>內容：{item.textContent}</span>
                      )}
                      <span style={{ fontSize: 10, color: "#585a78" }}>
                        建立：{new Date(item.createdAt).toLocaleString("zh-TW")}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#252638" }} />

        {/* ── Section 3: AI 圖層 ── */}
        <div style={{ padding: "8px 10px 12px" }}>
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", height: 30, gap: 6, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => layerState.setAiVisible(!layerState.aiVisible)}
              style={iconBtnStyle(layerState.aiVisible)}
            >
              {layerState.aiVisible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#d4d6f0" }}>AI 圖層</span>
            {aiOverlay.hasData && currentDisplayIndex !== null && (
              <span style={{ fontSize: 10, color: "#7880a0", fontVariantNumeric: "tabular-nums" }}>f:{currentDisplayIndex}</span>
            )}
          </div>

          {/* Display options */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0", marginBottom: 4, flexWrap: "wrap" }}>
            {[
              { label: "BBox 框", value: layerState.aiShowBBox, toggle: () => layerState.setAiShowBBox(!layerState.aiShowBBox) },
              { label: "Track ID", value: layerState.aiShowTrackId, toggle: () => layerState.setAiShowTrackId(!layerState.aiShowTrackId) },
              { label: "軌跡線", value: layerState.aiShowTrajectory, toggle: () => layerState.setAiShowTrajectory(!layerState.aiShowTrajectory) }
            ].map((opt) => (
              <label
                key={opt.label}
                style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}
              >
                <input type="checkbox" checked={opt.value} onChange={opt.toggle} />
                <span style={{ fontSize: 12, color: opt.value ? "#c8cae8" : "#9699b0" }}>{opt.label}</span>
              </label>
            ))}
          </div>

          {/* AI detection rows */}
          {aiOverlay.loading && (
            <div style={{ fontSize: 11, color: "#7880a0", padding: "8px 0", textAlign: "center" }}>載入中…</div>
          )}
          {!aiOverlay.loading && !aiOverlay.hasData && aiStatus === "DONE" && (
            <div style={{ fontSize: 11, color: "#585a78", padding: "8px 0", textAlign: "center" }}>無 AI 資料</div>
          )}
          {!aiOverlay.loading && aiOverlay.hasData && aiCurrentDetections.length === 0 && (
            <div style={{ fontSize: 11, color: "#585a78", padding: "8px 0", textAlign: "center" }}>此幀無偵測結果</div>
          )}
          {!aiOverlay.loading && aiCurrentDetections.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 8 }}>
              {aiCurrentDetections.map((det, idx) => (
                <div
                  key={det.id}
                  style={{
                    display: "flex", alignItems: "center", height: 30, gap: 6,
                    padding: "0 8px",
                    borderRadius: 5,
                    border: "1px solid #3c3e58",
                    background: "#171824",
                    fontVariantNumeric: "tabular-nums"
                  }}
                >
                  <span style={{ fontSize: 10, color: "#7880a0", width: 32, flexShrink: 0, textAlign: "right" }}>
                    {det.trackId !== null ? `#${det.trackId}` : `${idx + 1}`}
                  </span>
                  <span style={{ fontSize: 11, color: "#d4d6f0", flex: "0 0 auto", minWidth: 40 }}>
                    {det.categoryName}
                  </span>
                  <span style={{ fontSize: 10, color: "#9699b0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    [{Math.round(det.x)}, {Math.round(det.y)}, {Math.round(det.width)}, {Math.round(det.height)}]
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function iconBtnStyle(active: boolean, variant?: "danger"): React.CSSProperties {
  const color = variant === "danger"
    ? (active ? "#f87171" : "#7880a0")
    : (active ? "#4f8cff" : "#7880a0");

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: 4,
    border: "none",
    background: "transparent",
    color,
    cursor: "pointer",
    flexShrink: 0,
    transition: "color 0.1s"
  };
}

function actionBtnStyle(variant: "primary" | "ghost" | "danger", disabled: boolean): React.CSSProperties {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "rgba(79,140,255,0.15)", border: "1px solid rgba(79,140,255,0.3)", color: "#4f8cff" },
    ghost: { background: "transparent", border: "1px solid #3c3e58", color: "#c9ccd8" },
    danger: { background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }
  };

  return {
    ...styles[variant],
    padding: "3px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1
  };
}


