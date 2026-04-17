"use client";

import { useEffect, useMemo, useState } from "react";

import { useLayerVisibilityState } from "@/client/hooks/useLayerVisibilityState";
import { BootstrapData } from "@/client/types";

interface LayersPanelProps {
  bootstrapData: BootstrapData | null;
}

function SectionHeader(props: {
  title: string;
  open: boolean;
  onToggle: () => void;
  rightSlot?: React.ReactNode;
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

export function LayersPanel(props: LayersPanelProps) {
  const { bootstrapData } = props;
  const layerState = useLayerVisibilityState();

  const [categoryVisibility, setCategoryVisibility] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const map: Record<string, boolean> = {};
    for (const category of bootstrapData?.categories ?? []) {
      map[category.id] = category.is_visible !== 0;
    }
    setCategoryVisibility(map);
  }, [bootstrapData?.videoId, bootstrapData?.categories]);

  const categories = useMemo(() => bootstrapData?.categories ?? [], [bootstrapData?.categories]);
  const annotationCount = bootstrapData?.annotationsCurrentWindow.length ?? 0;

  const visibleCategoryCount = useMemo(() => {
    if (!layerState.categoryMasterVisible) {
      return 0;
    }

    return categories.reduce((sum, category) => {
      return sum + (categoryVisibility[category.id] ? 1 : 0);
    }, 0);
  }, [categories, categoryVisibility, layerState.categoryMasterVisible]);

  return (
    <section style={{ border: "1px solid #d4d4d8", borderRadius: 12, padding: 16, background: "#fff" }}>
      <h2 style={{ marginTop: 0 }}>Layers Panel</h2>
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
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#52525b" }}>
                可見類別：{visibleCategoryCount} / {categories.length}
              </div>
              {categories.length === 0 ? <div style={{ fontSize: 13 }}>尚無類別資料</div> : null}
              {categories.map((category) => {
                const rowVisible = layerState.categoryMasterVisible && (categoryVisibility[category.id] ?? true);

                return (
                  <label
                    key={category.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto auto",
                      gap: 8,
                      alignItems: "center",
                      fontSize: 13
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={rowVisible}
                      disabled={!layerState.categoryMasterVisible}
                      onChange={(event) => {
                        const next = event.target.checked;
                        setCategoryVisibility((prev) => ({ ...prev, [category.id]: next }));
                      }}
                    />
                    <span>{category.name}</span>
                    <span style={{ color: "#71717a" }}>{category.source}</span>
                    <span style={{ color: "#71717a" }}>#{category.annotation_count}</span>
                  </label>
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
            <div style={{ fontSize: 13, color: "#3f3f46" }}>目前視窗標註數：{annotationCount}</div>
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
    </section>
  );
}
