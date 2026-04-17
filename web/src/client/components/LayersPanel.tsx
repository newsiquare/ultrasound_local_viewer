"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, Info, Plus, RefreshCw, Square, Trash2, X } from "lucide-react";
import {
  createAnnotation,
  createCategory,
  deleteAnnotation,
  deleteCategory,
  fetchAnnotations,
  fetchCategories,
  updateAnnotation,
  updateCategory
} from "@/client/api";
import { useAiOverlayData } from "@/client/hooks/useAiOverlayData";
import { UseLayerVisibilityStateResult } from "@/client/hooks/useLayerVisibilityState";
import { AiStatus, AnnotationItem, BootstrapData, CategoryItem } from "@/client/types";

interface LayersPanelProps {
  videoId: string | null;
  bootstrapData: BootstrapData | null;
  onReload: () => Promise<void>;
  layerState: UseLayerVisibilityStateResult;
  aiStatus: AiStatus;
  aiUpdatedAt: string | null;
  currentDisplayIndex: number | null;
}

function sortCategories(categories: CategoryItem[]): CategoryItem[] {
  return [...categories].sort((a, b) => {
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    return a.name.localeCompare(b.name);
  });
}

export function LayersPanel(props: LayersPanelProps) {
  const { videoId, bootstrapData, onReload, layerState, aiStatus, aiUpdatedAt, currentDisplayIndex } = props;

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
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [infoOpenId, setInfoOpenId] = useState<string | null>(null);
  const [hiddenAnnIds, setHiddenAnnIds] = useState<Set<string>>(new Set<string>());
  const [frameNavIndex, setFrameNavIndex] = useState(0);

  const aiOverlay = useAiOverlayData({
    videoId,
    aiStatus,
    aiUpdatedAt,
    currentDisplayIndex
  });
  const aiCurrentDetections = aiOverlay.detections;

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
      if (firstFrame && !editingAnnotationId) setNewAnnotationFrameId(firstFrame);
      if (editingAnnotationId && !nextAnnotations.items.some((item) => item.id === editingAnnotationId)) {
        setEditingAnnotationId(null);
      }
      setNotice(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "載入圖層資料失敗";
      setNotice(`圖層資料同步失敗：${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [bootstrapData?.annotationsCurrentWindow, editingAnnotationId, newAnnotationCategoryId, videoId]);

  useEffect(() => { void loadLayerData(); }, [loadLayerData]);
  useEffect(() => { setFrameNavIndex(0); setHiddenAnnIds(new Set<string>()); }, [videoId]);

  const visibleCategoryCount = useMemo(() => {
    if (!layerState.categoryMasterVisible) return 0;
    return categories.reduce((sum, c) => sum + (c.is_visible !== 0 ? 1 : 0), 0);
  }, [categories, layerState.categoryMasterVisible]);

  const handleToggleCategoryVisible = useCallback(async (category: CategoryItem, nextVisible: boolean) => {
    if (!videoId) return;
    setBusyKey(`cat-visible-${category.id}`);
    try {
      await updateCategory(videoId, category.id, { isVisible: nextVisible });
      await Promise.all([loadLayerData(), onReload()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新類別可見性失敗");
    } finally { setBusyKey(null); }
  }, [loadLayerData, onReload, videoId]);

  const handleCreateCategory = useCallback(async () => {
    if (!videoId) return;
    setBusyKey("create-category");
    try {
      await createCategory(videoId, { name: newCategoryName, color: newCategoryColor });
      setNewCategoryName("");
      await Promise.all([loadLayerData(), onReload()]);
      setNotice("類別已新增");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "新增類別失敗");
    } finally { setBusyKey(null); }
  }, [loadLayerData, newCategoryColor, newCategoryName, onReload, videoId]);

  const handleDeleteCategory = useCallback(async (category: CategoryItem) => {
    if (!videoId) return;
    setBusyKey(`delete-category-${category.id}`);
    try {
      await deleteCategory(videoId, category.id);
      await Promise.all([loadLayerData(), onReload()]);
      setNotice("類別已刪除");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "刪除類別失敗");
    } finally { setBusyKey(null); }
  }, [loadLayerData, onReload, videoId]);

  const loadAnnotationToForm = useCallback((annotation: AnnotationItem) => {
    setEditingAnnotationId(annotation.id);
    setNewAnnotationFrameId(annotation.frameId);
    setNewAnnotationCategoryId(annotation.categoryId);
    setBboxX(String(annotation.bbox?.x ?? 0));
    setBboxY(String(annotation.bbox?.y ?? 0));
    setBboxW(String(annotation.bbox?.width ?? 100));
    setBboxH(String(annotation.bbox?.height ?? 80));
  }, []);

  const cancelAnnotationEditing = useCallback(() => { setEditingAnnotationId(null); setShowAddForm(false); }, []);

  const handleInlineCategoryChange = useCallback(async (annotation: AnnotationItem, newCategoryId: string) => {
    if (!videoId) return;
    setBusyKey(`update-annotation-${annotation.id}`);
    try {
      await updateAnnotation(videoId, annotation.id, { categoryId: newCategoryId });
      await Promise.all([loadLayerData(), onReload()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新類別失敗");
    } finally { setBusyKey(null); }
  }, [loadLayerData, onReload, videoId]);

  const frameIds = useMemo(() => [...new Set(annotations.map((a) => a.frameId))].sort(), [annotations]);
  const safeFrameNavIdx = frameIds.length > 0 ? Math.min(frameNavIndex, frameIds.length - 1) : 0;
  const currentFrameId = frameIds[safeFrameNavIdx] ?? null;
  const visibleAnnotations = currentFrameId != null ? annotations.filter((a) => a.frameId === currentFrameId) : annotations;

  const handleUpsertAnnotation = useCallback(async () => {
    if (!videoId) return;
    const x = Number(bboxX), y = Number(bboxY), width = Number(bboxW), height = Number(bboxH);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
      setNotice("bbox 欄位必須是有效數字");
      return;
    }
    setBusyKey(editingAnnotationId ? `update-annotation-${editingAnnotationId}` : "create-annotation");
    try {
      if (editingAnnotationId) {
        await updateAnnotation(videoId, editingAnnotationId, { categoryId: newAnnotationCategoryId, bbox: { x, y, width, height } });
        setNotice("標註已更新");
      } else {
        await createAnnotation(videoId, { frameId: newAnnotationFrameId, categoryId: newAnnotationCategoryId, bbox: { x, y, width, height } });
        setNotice("標註已新增");
      }
      await Promise.all([loadLayerData(), onReload()]);
      if (!editingAnnotationId) { setBboxX("0"); setBboxY("0"); setBboxW("120"); setBboxH("80"); }
      setEditingAnnotationId(null);
      setShowAddForm(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : editingAnnotationId ? "更新標註失敗" : "新增標註失敗");
    } finally { setBusyKey(null); }
  }, [bboxH, bboxW, bboxX, bboxY, editingAnnotationId, loadLayerData, newAnnotationCategoryId, newAnnotationFrameId, onReload, videoId]);

  const handleDeleteAnnotation = useCallback(async (annotationId: string) => {
    if (!videoId) return;
    setBusyKey(`delete-annotation-${annotationId}`);
    try {
      await deleteAnnotation(videoId, annotationId);
      await Promise.all([loadLayerData(), onReload()]);
      setNotice("標註已刪除");
      if (editingAnnotationId === annotationId) setEditingAnnotationId(null);
      setDeleteConfirmId(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "刪除標註失敗");
    } finally { setBusyKey(null); }
  }, [editingAnnotationId, loadLayerData, onReload, videoId]);

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
          onClick={() => void loadLayerData()}
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
            return (
              <div
                key={category.id}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 4px", borderRadius: 5, marginBottom: 2 }}
              >
                <div style={{ width: 10, height: 10, borderRadius: 2, background: category.color, flexShrink: 0 }} />
                <button
                  type="button"
                  onClick={() => { void handleToggleCategoryVisible(category, !rowVisible); }}
                  disabled={!layerState.categoryMasterVisible || rowBusy}
                  style={iconBtnStyle(rowVisible)}
                  title={rowVisible ? "隱藏" : "顯示"}
                >
                  {rowVisible ? <Eye size={11} /> : <EyeOff size={11} />}
                </button>
                <span style={{ flex: 1, fontSize: 12, color: rowVisible ? "#c8cae8" : "#7880a0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
        <div style={{ height: 1, background: "#252638", margin: "0 0" }} />

        {/* ── Section 2: 標註圖層 ── */}
        <div style={{ padding: "8px 10px 10px" }}>
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", height: 30, gap: 4, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => layerState.setAnnotationVisible(!layerState.annotationVisible)}
              style={iconBtnStyle(layerState.annotationVisible)}
              title={layerState.annotationVisible ? "隱藏標註" : "顯示標註"}
            >
              {layerState.annotationVisible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#d4d6f0" }}>標註圖層</span>
            <button
              type="button"
              onClick={() => setFrameNavIndex((i) => Math.max(0, i - 1))}
              disabled={frameIds.length === 0 || safeFrameNavIdx === 0}
              style={iconBtnStyle(false)}
              title="上一幀"
            >
              <ChevronLeft size={12} />
            </button>
            <div
              style={{
                minWidth: 28, textAlign: "center", padding: "0 4px",
                height: 22, lineHeight: "22px",
                background: "#171824", border: "1px solid #3c3e58",
                borderRadius: 5, fontSize: 11, color: "#d4d6f0",
                fontVariantNumeric: "tabular-nums"
              }}
            >
              {frameIds.length === 0 ? "—" : safeFrameNavIdx}
            </div>
            <button
              type="button"
              onClick={() => setFrameNavIndex((i) => Math.min(frameIds.length - 1, i + 1))}
              disabled={frameIds.length === 0 || safeFrameNavIdx >= frameIds.length - 1}
              style={iconBtnStyle(false)}
              title="下一幀"
            >
              <ChevronRight size={12} />
            </button>
            <button
              type="button"
              onClick={() => { setShowAddForm((v) => !v); setEditingAnnotationId(null); }}
              disabled={!videoId}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 22, height: 22, borderRadius: 5, border: "1px solid",
                borderColor: showAddForm ? "rgba(79,140,255,0.3)" : "#3c3e58",
                background: showAddForm ? "rgba(79,140,255,0.15)" : "transparent",
                color: showAddForm ? "#4f8cff" : "#9699b0",
                cursor: !videoId ? "not-allowed" : "pointer", flexShrink: 0
              }}
              title={showAddForm ? "收合" : "新增標註"}
            >
              {showAddForm ? <X size={12} /> : <Plus size={12} />}
            </button>
          </div>

          {/* Collapsible upsert form */}
          {(showAddForm || editingAnnotationId) && (
            <div
              style={{
                background: "#171824", border: "1px solid #3c3e58",
                borderRadius: 6, padding: "8px 8px 6px",
                marginBottom: 10, display: "flex", flexDirection: "column", gap: 5
              }}
            >
              <input
                value={newAnnotationFrameId}
                onChange={(e) => setNewAnnotationFrameId(e.target.value)}
                placeholder="Frame ID（如 f_000001）"
                disabled={!videoId || Boolean(editingAnnotationId)}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
              <select
                value={newAnnotationCategoryId}
                onChange={(e) => setNewAnnotationCategoryId(e.target.value)}
                disabled={!videoId}
                style={{ width: "100%", boxSizing: "border-box" }}
              >
                <option value="">選擇類別</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {([["x", bboxX, setBboxX], ["y", bboxY, setBboxY], ["w", bboxW, setBboxW], ["h", bboxH, setBboxH]] as const).map(([label, val, setter]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <span style={{ fontSize: 10, color: "#9699b0", width: 10, flexShrink: 0 }}>{label}</span>
                    <input
                      value={val}
                      onChange={(e) => setter(e.target.value)}
                      placeholder={label}
                      style={{ flex: 1, minWidth: 0, boxSizing: "border-box" }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => void handleUpsertAnnotation()}
                  disabled={!videoId || !newAnnotationCategoryId || busyKey === "create-annotation" || busyKey === `update-annotation-${editingAnnotationId}`}
                  style={actionBtnStyle("primary", !videoId || !newAnnotationCategoryId)}
                >
                  {editingAnnotationId ? "更新標註" : "新增標註"}
                </button>
                {editingAnnotationId && (
                  <button type="button" onClick={cancelAnnotationEditing} style={actionBtnStyle("ghost", false)}>
                    取消
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {visibleAnnotations.length === 0 && (
            <div style={{ fontSize: 12, color: "#585a78", padding: "4px 0", textAlign: "center" }}>
              {annotations.length === 0 ? "尚無人工標註" : "此幀無標註"}
            </div>
          )}

          {/* Single-row annotation list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {visibleAnnotations.map((item) => {
              const cat = categories.find((c) => c.id === item.categoryId);
              const isHidden = hiddenAnnIds.has(item.id);
              const isInfoOpen = infoOpenId === item.id;
              const isEditing = editingAnnotationId === item.id;
              const isConfirming = deleteConfirmId === item.id;
              const rowBusy = busyKey === `delete-annotation-${item.id}`;

              return (
                <div key={item.id}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", height: 34, gap: 5, padding: "0 6px",
                      borderRadius: isInfoOpen ? "6px 6px 0 0" : 6,
                      border: `1px solid ${isEditing ? "rgba(79,140,255,0.4)" : "#3c3e58"}`,
                      background: isEditing ? "rgba(79,140,255,0.06)" : "#171824"
                    }}
                  >
                    <Square size={13} style={{ color: "#7880a0", flexShrink: 0 }} />
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
                        disabled={!videoId || Boolean(busyKey)}
                        style={{
                          flex: 1, minWidth: 0, background: "transparent", border: "none",
                          color: "#c8cae8", fontSize: 11, cursor: "pointer",
                          fontFamily: "inherit", outline: "none"
                        }}
                      >
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <button type="button" onClick={() => setInfoOpenId(isInfoOpen ? null : item.id)} style={iconBtnStyle(isInfoOpen)} title="詳細資訊">
                      <Info size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setHiddenAnnIds((prev) => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}
                      style={iconBtnStyle(!isHidden)}
                      title={isHidden ? "顯示" : "隱藏"}
                    >
                      {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
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
                      <button type="button" onClick={() => setDeleteConfirmId(item.id)} style={iconBtnStyle(false, "danger")} title="刪除標註">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  {isInfoOpen && (
                    <div
                      style={{
                        padding: "8px 10px", background: "#111220",
                        border: "1px solid #3c3e58", borderTop: "none",
                        borderRadius: "0 0 6px 6px",
                        fontSize: 11, color: "#c9ccd8",
                        display: "flex", flexDirection: "column", gap: 3
                      }}
                    >
                      <span>幀：{item.frameId}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        x:{item.bbox?.x ?? "?"} y:{item.bbox?.y ?? "?"}&nbsp; w:{item.bbox?.width ?? "?"} h:{item.bbox?.height ?? "?"}
                      </span>
                      <button
                        type="button"
                        onClick={() => { loadAnnotationToForm(item); setShowAddForm(true); setInfoOpenId(null); }}
                        style={{ ...actionBtnStyle("ghost", false), marginTop: 4, alignSelf: "flex-start" }}
                      >
                        編輯
                      </button>
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
            <div style={{ fontSize: 11, color: "#585a78", padding: "8px 0", textAlign: "center" }}>此兤無偉測結果</div>
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


