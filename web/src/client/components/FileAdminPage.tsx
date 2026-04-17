"use client";

import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  cleanupAdminFiles,
  deleteVideo,
  fetchAdminCleanupHistory,
  fetchAdminRiskEvents,
  fetchAdminRiskSummary,
  fetchAdminVideoHistory,
  fetchAdminFileConsistency,
  fetchAdminFileList,
  reconcileAdminFiles
} from "@/client/api";
import {
  AdminFileAuditHistoryData,
  AdminFileAuditHistoryItem,
  AdminFileCleanupCandidate,
  AdminFileCleanupData,
  AdminFileConsistencyAction,
  AdminFileConsistencyData,
  AdminFileConsistencyProblem,
  AdminFileListData,
  AdminFileListItem,
  AdminFileRiskEventsData,
  AdminFileRiskEventItem,
  AdminFileRiskSummaryData
} from "@/client/types";

const AI_STATUS_OPTIONS = ["ALL", "IDLE", "PROCESSING", "DONE", "FAILED", "CANCELED"] as const;
const CONSISTENCY_STATUS_OPTIONS = [
  "ALL",
  "HEALTHY",
  "MISSING_FILE",
  "MISSING_METADATA",
  "MISSING_AI_RESULT",
  "ORPHAN_DB",
  "ORPHAN_FS",
  "PROCESSING_LOCKED"
] as const;

function formatTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatBytes(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

function metadataTooltip(item: AdminFileListItem): string {
  const meta = item.metadata_preview;
  return [
    `resolution: ${meta.video_width ?? "-"} x ${meta.video_height ?? "-"}`,
    `fps: ${meta.source_fps ?? "-"}`,
    `duration: ${meta.duration_sec ?? "-"}`,
    `codec: ${meta.video_codec ?? "-"}`,
    `pixel format: ${meta.pixel_format ?? "-"}`,
    `storage path: ${meta.storage_path}`,
    `file size: ${formatBytes(meta.file_size_bytes)}`
  ].join("\n");
}

function consistencyTooltip(item: AdminFileListItem): string {
  const info = item.consistency_info;
  return [
    `last checked: ${formatTime(info.last_checked_at)}`,
    `reason: ${info.consistency_reason ?? "-"}`,
    `locked by processing: ${info.locked_by_processing ? "yes" : "no"}`
  ].join("\n");
}

export function FileAdminPage() {
  const [data, setData] = useState<AdminFileListData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingVideoId, setCheckingVideoId] = useState<string | null>(null);
  const [consistencyDetail, setConsistencyDetail] = useState<AdminFileConsistencyData | null>(null);
  const [consistencyError, setConsistencyError] = useState<string | null>(null);
  const [repairingVideoId, setRepairingVideoId] = useState<string | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);
  const [cleanupDetail, setCleanupDetail] = useState<AdminFileCleanupData | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [previewingFilename, setPreviewingFilename] = useState<string | null>(null);
  const [applyingCleanup, setApplyingCleanup] = useState(false);
  const [riskSummary, setRiskSummary] = useState<AdminFileRiskSummaryData | null>(null);
  const [riskSummaryError, setRiskSummaryError] = useState<string | null>(null);
  const [riskEvents, setRiskEvents] = useState<AdminFileRiskEventsData | null>(null);
  const [riskEventsError, setRiskEventsError] = useState<string | null>(null);
  const [riskEventsLoading, setRiskEventsLoading] = useState(false);
  const [showRiskEvents, setShowRiskEvents] = useState(false);
  const [riskStatusFilter, setRiskStatusFilter] = useState<"OPEN" | "RESOLVED">("OPEN");
  const [auditHistory, setAuditHistory] = useState<AdminFileAuditHistoryData | null>(null);
  const [auditHistoryLoading, setAuditHistoryLoading] = useState(false);
  const [auditHistoryError, setAuditHistoryError] = useState<string | null>(null);
  const [showAuditHistory, setShowAuditHistory] = useState(false);
  const [selectedVideoDetail, setSelectedVideoDetail] = useState<AdminFileListItem | null>(null);
  const [videoHistory, setVideoHistory] = useState<AdminFileAuditHistoryData | null>(null);
  const [videoHistoryLoading, setVideoHistoryLoading] = useState(false);
  const [videoHistoryError, setVideoHistoryError] = useState<string | null>(null);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [batchActionLoading, setBatchActionLoading] = useState<"scan" | "preview" | "apply" | null>(null);
  const [cleanupApplyContext, setCleanupApplyContext] = useState<{
    filename?: string;
    videoIds?: string[];
  } | null>(null);

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [aiStatus, setAiStatus] = useState<(typeof AI_STATUS_OPTIONS)[number]>("ALL");
  const [consistencyStatus, setConsistencyStatus] =
    useState<(typeof CONSISTENCY_STATUS_OPTIONS)[number]>("ALL");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const loadList = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchAdminFileList({
        q,
        aiStatus,
        consistencyStatus,
        page,
        pageSize,
        sortBy: "uploaded_at",
        sortDir: "desc"
      });
      setData(result);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unknown list error";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [aiStatus, consistencyStatus, page, pageSize, q]);

  const loadRiskSummary = useCallback(async () => {
    try {
      const result = await fetchAdminRiskSummary();
      setRiskSummary(result);
      setRiskSummaryError(null);
    } catch (summaryError) {
      const message = summaryError instanceof Error ? summaryError.message : "Unknown risk summary error";
      setRiskSummaryError(message);
    }
  }, []);

  const loadRiskEvents = useCallback(
    async (status: "OPEN" | "RESOLVED") => {
      setRiskEventsLoading(true);
      try {
        const result = await fetchAdminRiskEvents({
          status,
          page: 1,
          pageSize: 20
        });
        setRiskEvents(result);
        setRiskEventsError(null);
      } catch (eventsError) {
        const message = eventsError instanceof Error ? eventsError.message : "Unknown risk events error";
        setRiskEventsError(message);
      } finally {
        setRiskEventsLoading(false);
      }
    },
    []
  );

  const loadAuditHistory = useCallback(async () => {
    setAuditHistoryLoading(true);
    try {
      const result = await fetchAdminCleanupHistory({ page: 1, pageSize: 20 });
      setAuditHistory(result);
      setAuditHistoryError(null);
    } catch (historyError) {
      const message = historyError instanceof Error ? historyError.message : "Unknown audit history error";
      setAuditHistoryError(message);
    } finally {
      setAuditHistoryLoading(false);
    }
  }, []);

  const loadVideoHistory = useCallback(async (videoId: string) => {
    setVideoHistoryLoading(true);
    try {
      const result = await fetchAdminVideoHistory(videoId, { page: 1, pageSize: 20 });
      setVideoHistory(result);
      setVideoHistoryError(null);
    } catch (historyError) {
      const message = historyError instanceof Error ? historyError.message : "Unknown video history error";
      setVideoHistoryError(message);
    } finally {
      setVideoHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
    void loadRiskSummary();
  }, [loadList, loadRiskSummary]);

  const totalPages = useMemo(() => {
    const total = data?.total ?? 0;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [data?.total, pageSize]);
  const selectedIdSet = useMemo(() => new Set(selectedVideoIds), [selectedVideoIds]);
  const visibleVideoIds = useMemo(() => data?.items.map((item) => item.video_id) ?? [], [data?.items]);
  const allVisibleSelected = useMemo(
    () => visibleVideoIds.length > 0 && visibleVideoIds.every((videoId) => selectedIdSet.has(videoId)),
    [selectedIdSet, visibleVideoIds]
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!showRiskEvents) {
      return;
    }
    void loadRiskEvents(riskStatusFilter);
  }, [loadRiskEvents, riskStatusFilter, showRiskEvents]);

  useEffect(() => {
    if (!showAuditHistory) {
      return;
    }
    void loadAuditHistory();
  }, [loadAuditHistory, showAuditHistory]);

  useEffect(() => {
    if (!selectedVideoDetail || !data?.items) {
      return;
    }
    const refreshed = data.items.find((item) => item.video_id === selectedVideoDetail.video_id) ?? null;
    setSelectedVideoDetail(refreshed);
  }, [data?.items, selectedVideoDetail]);

  useEffect(() => {
    if (!data?.items) {
      setSelectedVideoIds([]);
      return;
    }
    const visible = new Set(data.items.map((item) => item.video_id));
    setSelectedVideoIds((current) => current.filter((videoId) => visible.has(videoId)));
  }, [data?.items]);

  function onSearchSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  }

  function onOpenMetadata(item: AdminFileListItem): void {
    setSelectedVideoDetail(item);
    setVideoHistory(null);
    setVideoHistoryError(null);
    void loadVideoHistory(item.video_id);
  }

  function toggleVideoSelection(videoId: string): void {
    setSelectedVideoIds((current) => {
      if (current.includes(videoId)) {
        return current.filter((id) => id !== videoId);
      }
      return [...current, videoId];
    });
  }

  function toggleSelectAllVisible(checked: boolean): void {
    if (!checked) {
      setSelectedVideoIds([]);
      return;
    }
    setSelectedVideoIds(visibleVideoIds);
  }

  function onOpenVideoDetailById(videoId: string): void {
    const target = data?.items.find((item) => item.video_id === videoId) ?? null;
    if (target) {
      onOpenMetadata(target);
      return;
    }

    setQInput(videoId);
    setQ(videoId);
    setPage(1);
    setReconcileMessage(`已套用 video_id 搜尋：${videoId}，列表更新後可點 metadata 開啟詳情。`);
  }

  async function onCheckConsistency(item: AdminFileListItem): Promise<void> {
    setCheckingVideoId(item.video_id);
    setConsistencyError(null);
    setReconcileMessage(null);
    setCleanupError(null);
    try {
      const detail = await fetchAdminFileConsistency(item.video_id);
      setConsistencyDetail(detail);
      await loadList();
      await loadRiskSummary();
    } catch (checkError) {
      const message = checkError instanceof Error ? checkError.message : "Unknown consistency check error";
      setConsistencyError(message);
    } finally {
      setCheckingVideoId(null);
    }
  }

  async function onRepair(item: AdminFileListItem): Promise<void> {
    setRepairingVideoId(item.video_id);
    setConsistencyError(null);
    setReconcileMessage(null);
    setCleanupError(null);

    try {
      const dryRun = await reconcileAdminFiles({
        videoIds: [item.video_id],
        mode: "dry-run",
        actions: ["remove_orphan_db", "rebuild_ai_status"]
      });
      const preview = dryRun.items[0];

      if (!preview || !preview.changed) {
        const skipped = preview?.skippedActions.map((entry) => `${entry.action}:${entry.reason}`).join(", ") ?? "no-op";
        setReconcileMessage(`無可套用修復（${skipped}）。`);
        return;
      }

      const confirmed = window.confirm(
        `將套用修復至 ${item.video_id}\nactions: ${preview.appliedActions.join(", ")}\n是否繼續？`
      );
      if (!confirmed) {
        setReconcileMessage("已取消修復操作。");
        return;
      }

      const applied = await reconcileAdminFiles({
        videoIds: [item.video_id],
        mode: "apply",
        actions: preview.appliedActions
      });
      const appliedItem = applied.items[0];
      const appliedSummary = appliedItem?.appliedActions.join(", ") ?? "none";
      setReconcileMessage(`修復完成：${appliedSummary}`);
      await loadList();
      await loadRiskSummary();
      if (showAuditHistory) {
        await loadAuditHistory();
      }
      if (selectedVideoDetail?.video_id === item.video_id) {
        await loadVideoHistory(item.video_id);
      }
    } catch (repairError) {
      const message = repairError instanceof Error ? repairError.message : "Unknown reconcile error";
      setConsistencyError(message);
    } finally {
      setRepairingVideoId(null);
    }
  }

  async function onDelete(item: AdminFileListItem): Promise<void> {
    const confirmed = window.confirm(
      `即將刪除影片與相關資料：\n${item.video_id}\n${item.filename}\n是否繼續？`
    );
    if (!confirmed) {
      return;
    }

    setDeletingVideoId(item.video_id);
    setConsistencyError(null);
    setReconcileMessage(null);
    setCleanupError(null);
    try {
      await deleteVideo(item.video_id);
      if (consistencyDetail?.videoId === item.video_id) {
        setConsistencyDetail(null);
      }
      setReconcileMessage(`已刪除影片：${item.video_id}`);
      await loadList();
      await loadRiskSummary();
      if (selectedVideoDetail?.video_id === item.video_id) {
        setSelectedVideoDetail(null);
        setVideoHistory(null);
      }
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unknown delete error";
      setConsistencyError(message);
    } finally {
      setDeletingVideoId(null);
    }
  }

  async function onPreviewCleanup(item: AdminFileListItem): Promise<void> {
    setPreviewingFilename(item.filename);
    setCleanupError(null);
    setConsistencyError(null);
    setReconcileMessage(null);
    try {
      const preview = await cleanupAdminFiles({
        mode: "dry-run",
        retentionDays: 30,
        keepLatestPerFilename: 2,
        highWatermarkPercent: 80,
        filename: item.filename
      });
      setCleanupDetail(preview);
      setCleanupApplyContext({ filename: item.filename });
      if (preview.summary.eligible === 0) {
        setReconcileMessage(`此檔名目前無可清理版本：${item.filename}`);
      }
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : "Unknown cleanup preview error";
      setCleanupError(message);
    } finally {
      setPreviewingFilename(null);
    }
  }

  async function onApplyCleanup(): Promise<void> {
    if (!cleanupDetail?.confirmationToken) {
      setCleanupError("缺少 confirmation token，請先重新做預覽。");
      return;
    }
    if (!cleanupApplyContext) {
      setCleanupError("缺少 cleanup 上下文，請重新做預覽。");
      return;
    }

    const scopeName = cleanupDetail.policy.filename ?? "(all videos)";
    const confirmed = window.confirm(
      `即將套用清理：${scopeName}\n` +
        `eligible: ${cleanupDetail.summary.eligible}\n` +
        `預估釋放: ${formatBytes(cleanupDetail.summary.estimatedReclaimedBytes)}\n` +
        "是否繼續？"
    );
    if (!confirmed) {
      return;
    }

    setApplyingCleanup(true);
    setCleanupError(null);
    setConsistencyError(null);
    setReconcileMessage(null);
    try {
      const applied = await cleanupAdminFiles({
        mode: "apply",
        retentionDays: cleanupDetail.policy.retentionDays,
        keepLatestPerFilename: cleanupDetail.policy.keepLatestPerFilename,
        highWatermarkPercent: cleanupDetail.policy.highWatermarkPercent,
        filename: cleanupApplyContext.filename,
        videoIds: cleanupApplyContext.videoIds,
        confirmationToken: cleanupDetail.confirmationToken
      });
      setCleanupDetail(applied);
      setReconcileMessage(
        `清理完成：刪除 ${applied.summary.deleted} 筆，釋放 ${formatBytes(applied.summary.estimatedReclaimedBytes)}`
      );
      await loadList();
      await loadRiskSummary();
      if (showAuditHistory) {
        await loadAuditHistory();
      }
      if (selectedVideoDetail?.video_id) {
        await loadVideoHistory(selectedVideoDetail.video_id);
      }
      if (consistencyDetail) {
        const stillExists = applied.candidates.some((candidate) => candidate.videoId === consistencyDetail.videoId);
        if (stillExists) {
          setConsistencyDetail(null);
        }
      }
    } catch (applyError) {
      const message = applyError instanceof Error ? applyError.message : "Unknown cleanup apply error";
      setCleanupError(message);
    } finally {
      setApplyingCleanup(false);
    }
  }

  async function onBatchConsistencyScan(): Promise<void> {
    if (selectedVideoIds.length === 0) {
      setReconcileMessage("請先勾選至少一筆影片。");
      return;
    }

    setBatchActionLoading("scan");
    setConsistencyError(null);
    setCleanupError(null);
    setReconcileMessage(null);
    try {
      const settled = await Promise.allSettled(
        selectedVideoIds.map((videoId) => fetchAdminFileConsistency(videoId))
      );
      const success = settled.filter((item) => item.status === "fulfilled");
      const failed = settled.length - success.length;
      const unhealthy = success.filter(
        (item) =>
          item.status === "fulfilled" &&
          item.value.consistencyStatus !== "HEALTHY" &&
          item.value.consistencyStatus !== "PROCESSING_LOCKED"
      ).length;
      setReconcileMessage(
        `批次掃描完成：成功 ${success.length}，失敗 ${failed}，異常 ${unhealthy}`
      );
      await loadList();
      await loadRiskSummary();
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : "Unknown batch scan error";
      setConsistencyError(message);
    } finally {
      setBatchActionLoading(null);
    }
  }

  async function onBatchPreviewCleanup(): Promise<void> {
    if (selectedVideoIds.length === 0) {
      setReconcileMessage("請先勾選至少一筆影片。");
      return;
    }

    setBatchActionLoading("preview");
    setCleanupError(null);
    setConsistencyError(null);
    setReconcileMessage(null);
    try {
      const preview = await cleanupAdminFiles({
        mode: "dry-run",
        retentionDays: 30,
        keepLatestPerFilename: 2,
        highWatermarkPercent: 80,
        videoIds: selectedVideoIds
      });
      setCleanupDetail(preview);
      setCleanupApplyContext({ videoIds: selectedVideoIds });
      setReconcileMessage(
        `批次預覽完成：checked ${preview.summary.checked}，eligible ${preview.summary.eligible}`
      );
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : "Unknown batch cleanup preview error";
      setCleanupError(message);
    } finally {
      setBatchActionLoading(null);
    }
  }

  async function onBatchApplyCleanup(): Promise<void> {
    if (!cleanupDetail?.confirmationToken || !cleanupApplyContext?.videoIds?.length) {
      setCleanupError("請先執行批次預覽清理（dry-run）。");
      return;
    }
    setBatchActionLoading("apply");
    try {
      await onApplyCleanup();
    } finally {
      setBatchActionLoading(null);
    }
  }

  return (
    <main style={{ maxWidth: 1480, margin: "0 auto", padding: 20, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>File Admin</h1>
          <p style={{ margin: "6px 0 0", color: "#374151" }}>
            管理影片資產、一致性狀態與維運資料。
          </p>
        </div>
        <a
          href="/file/logout"
          style={{
            display: "inline-block",
            textDecoration: "none",
            border: "1px solid #d4d4d8",
            borderRadius: 8,
            padding: "8px 12px",
            color: "#111827",
            background: "#fafafa"
          }}
        >
          切換帳號
        </a>
      </header>

      <form onSubmit={onSearchSubmit} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <input
          type="text"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
          placeholder="搜尋 filename / video_id / category"
          style={{
            minWidth: 320,
            flex: "1 1 320px",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db"
          }}
        />

        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          AI 狀態
          <select
            value={aiStatus}
            onChange={(event) => {
              setAiStatus(event.target.value as (typeof AI_STATUS_OPTIONS)[number]);
              setPage(1);
            }}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", minWidth: 130 }}
          >
            {AI_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          一致性
          <select
            value={consistencyStatus}
            onChange={(event) => {
              setConsistencyStatus(event.target.value as (typeof CONSISTENCY_STATUS_OPTIONS)[number]);
              setPage(1);
            }}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", minWidth: 180 }}
          >
            {CONSISTENCY_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <button type="submit">搜尋</button>
        <button
          type="button"
          onClick={() => {
            setQInput("");
            setQ("");
            setAiStatus("ALL");
            setConsistencyStatus("ALL");
            setPage(1);
          }}
        >
          重設
        </button>
        <button type="button" onClick={() => void loadList()}>
          重新整理
        </button>
        <button
          type="button"
          onClick={() => void onBatchConsistencyScan()}
          disabled={selectedVideoIds.length === 0 || batchActionLoading !== null}
          title="針對已勾選影片執行一致性檢查"
        >
          批次一致性掃描
        </button>
        <button
          type="button"
          onClick={() => void onBatchPreviewCleanup()}
          disabled={selectedVideoIds.length === 0 || batchActionLoading !== null}
          title="針對已勾選影片預覽清理"
        >
          批次預覽清理(dry-run)
        </button>
        <button
          type="button"
          onClick={() => void onBatchApplyCleanup()}
          disabled={
            batchActionLoading !== null ||
            !cleanupDetail?.confirmationToken ||
            !cleanupApplyContext?.videoIds?.length
          }
          title="需先完成批次預覽清理"
        >
          批次套用(apply)
        </button>
        <span style={{ color: "#374151", fontSize: 12 }}>已勾選 {selectedVideoIds.length} 筆</span>
      </form>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 12,
          background: "#ffffff",
          display: "grid",
          gap: 10
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <strong>風險監控摘要</strong>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              事件狀態
              <select
                value={riskStatusFilter}
                onChange={(event) => setRiskStatusFilter(event.target.value as "OPEN" | "RESOLVED")}
                style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #d1d5db" }}
              >
                <option value="OPEN">OPEN</option>
                <option value="RESOLVED">RESOLVED</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setShowRiskEvents((current) => !current);
              }}
            >
              {showRiskEvents ? "隱藏風險列表" : "顯示風險列表"}
            </button>
            <button
              type="button"
              onClick={() => {
                void loadRiskSummary();
                if (showRiskEvents) {
                  void loadRiskEvents(riskStatusFilter);
                }
              }}
            >
              更新風險資料
            </button>
          </div>
        </header>

        {riskSummaryError ? (
          <div style={{ background: "#fff1f2", color: "#9f1239", padding: 10, borderRadius: 8 }}>
            風險摘要載入失敗：{riskSummaryError}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
          <RiskSummaryCard title="Open P0" value={riskSummary?.open_p0 ?? 0} />
          <RiskSummaryCard title="Open P1" value={riskSummary?.open_p1 ?? 0} />
          <RiskSummaryCard title="Open P2" value={riskSummary?.open_p2 ?? 0} />
          <RiskSummaryCard title="New 24h" value={riskSummary?.new_24h ?? 0} />
          <RiskSummaryCard title="Resolved 24h" value={riskSummary?.resolved_24h ?? 0} />
        </div>
        <div style={{ color: "#6b7280", fontSize: 12 }}>
          generated_at: {riskSummary ? formatTime(riskSummary.generated_at) : "-"}
        </div>

        {showRiskEvents ? (
          <section style={{ display: "grid", gap: 6 }}>
            <strong>風險事件列表</strong>
            {riskEventsError ? (
              <div style={{ background: "#fff1f2", color: "#9f1239", padding: 10, borderRadius: 8 }}>
                風險事件載入失敗：{riskEventsError}
              </div>
            ) : null}
            {riskEventsLoading ? <div style={{ color: "#374151" }}>載入風險事件...</div> : null}
            {!riskEventsLoading && (riskEvents?.items.length ?? 0) === 0 ? (
              <div style={{ color: "#6b7280" }}>目前無風險事件。</div>
            ) : (
              riskEvents?.items.map((item, index) => (
                <RiskEventCard
                  key={`${item.video_id ?? "none"}-${index}`}
                  item={item}
                  onOpenVideoDetail={onOpenVideoDetailById}
                />
              ))
            )}
          </section>
        ) : null}
      </section>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 12,
          background: "#ffffff",
          display: "grid",
          gap: 10
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <strong>操作歷史（reconcile / cleanup）</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setShowAuditHistory((current) => !current);
              }}
            >
              {showAuditHistory ? "隱藏歷史" : "顯示歷史"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (showAuditHistory) {
                  void loadAuditHistory();
                }
              }}
              disabled={!showAuditHistory}
            >
              更新歷史
            </button>
          </div>
        </header>

        {showAuditHistory ? (
          <section style={{ display: "grid", gap: 6 }}>
            {auditHistoryError ? (
              <div style={{ background: "#fff1f2", color: "#9f1239", padding: 10, borderRadius: 8 }}>
                歷史載入失敗：{auditHistoryError}
              </div>
            ) : null}
            {auditHistoryLoading ? <div style={{ color: "#374151" }}>載入歷史中...</div> : null}
            {!auditHistoryLoading && (auditHistory?.items.length ?? 0) === 0 ? (
              <div style={{ color: "#6b7280" }}>目前沒有操作歷史。</div>
            ) : (
              auditHistory?.items.map((item) => <AuditHistoryCard key={item.id} item={item} />)
            )}
          </section>
        ) : (
          <div style={{ color: "#6b7280" }}>可檢視最近 20 筆 reconcile/cleanup 套用紀錄。</div>
        )}
      </section>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 12,
          background: "#ffffff",
          display: "grid",
          gap: 10
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <strong>影片總數：{data?.total ?? 0}</strong>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            每頁筆數
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #d1d5db" }}
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                <th style={cellHeadStyle}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => toggleSelectAllVisible(event.target.checked)}
                    aria-label="select all visible videos"
                  />
                </th>
                <th style={cellHeadStyle}>video_id</th>
                <th style={cellHeadStyle}>filename</th>
                <th style={cellHeadStyle}>uploaded_at</th>
                <th style={cellHeadStyle}>category/annotation</th>
                <th style={cellHeadStyle}>ai_status</th>
                <th style={cellHeadStyle}>ai category/annotation</th>
                <th style={cellHeadStyle}>consistency</th>
                <th style={cellHeadStyle}>actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((item) => (
                <tr key={item.video_id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={cellBodyStyle}>
                    <input
                      type="checkbox"
                      checked={selectedIdSet.has(item.video_id)}
                      onChange={() => toggleVideoSelection(item.video_id)}
                      aria-label={`select ${item.video_id}`}
                    />
                  </td>
                  <td style={cellBodyStyle}>
                    <code>{item.video_id}</code>
                  </td>
                  <td style={cellBodyStyle}>{item.filename}</td>
                  <td style={cellBodyStyle}>{formatTime(item.uploaded_at)}</td>
                  <td style={cellBodyStyle}>
                    {item.category_count} / {item.annotation_count}
                  </td>
                  <td style={cellBodyStyle}>{item.ai_status}</td>
                  <td style={cellBodyStyle}>
                    {item.ai_category_count} / {item.ai_annotation_count}
                  </td>
                  <td style={cellBodyStyle}>
                    <span>{item.consistency_status}</span>
                    <button type="button" title={consistencyTooltip(item)} style={{ marginLeft: 6 }}>
                      info
                    </button>
                  </td>
                  <td style={cellBodyStyle}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => onOpenMetadata(item)}
                        title={metadataTooltip(item)}
                      >
                        metadata
                      </button>
                      <button
                        type="button"
                        onClick={() => void onCheckConsistency(item)}
                        disabled={checkingVideoId === item.video_id}
                        title="檢查單支影片一致性"
                      >
                        檢查
                      </button>
                      <button
                        type="button"
                        onClick={() => void onPreviewCleanup(item)}
                        disabled={previewingFilename === item.filename}
                        title="預覽同檔名歷史版本清理"
                      >
                        預覽清理
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDelete(item)}
                        disabled={deletingVideoId === item.video_id}
                        title="刪除影片與相關檔案"
                      >
                        刪除
                      </button>
                      <button
                        type="button"
                        onClick={() => void onRepair(item)}
                        disabled={repairingVideoId === item.video_id}
                        title="先 dry-run，再確認 apply"
                      >
                        修復
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && (data?.items.length ?? 0) === 0 ? (
                <tr>
                  <td style={{ ...cellBodyStyle, textAlign: "center", color: "#6b7280" }} colSpan={9}>
                    查無資料
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {error ? (
          <div style={{ background: "#fef2f2", color: "#991b1b", padding: 10, borderRadius: 8 }}>{error}</div>
        ) : null}
        {consistencyError ? (
          <div style={{ background: "#fff1f2", color: "#9f1239", padding: 10, borderRadius: 8 }}>
            操作失敗：{consistencyError}
          </div>
        ) : null}
        {cleanupError ? (
          <div style={{ background: "#fff1f2", color: "#9f1239", padding: 10, borderRadius: 8 }}>
            清理失敗：{cleanupError}
          </div>
        ) : null}
        {reconcileMessage ? (
          <div style={{ background: "#eff6ff", color: "#1e3a8a", padding: 10, borderRadius: 8 }}>
            {reconcileMessage}
          </div>
        ) : null}
        {isLoading ? <div style={{ color: "#374151" }}>載入中...</div> : null}

        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            第 {page} / {totalPages} 頁
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              上一頁
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
            >
              下一頁
            </button>
          </div>
        </footer>
      </section>

      {selectedVideoDetail ? (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 12,
            background: "#ffffff",
            display: "grid",
            gap: 10
          }}
        >
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <strong>Details Drawer</strong>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => void loadVideoHistory(selectedVideoDetail.video_id)}>
                刷新歷史
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedVideoDetail(null);
                  setVideoHistory(null);
                }}
              >
                關閉
              </button>
            </div>
          </header>

          <div style={{ display: "grid", gap: 6 }}>
            <div>
              video_id: <code>{selectedVideoDetail.video_id}</code>
            </div>
            <div>filename: {selectedVideoDetail.filename}</div>
            <div>uploaded_at: {formatTime(selectedVideoDetail.uploaded_at)}</div>
            <div>
              category/annotation: {selectedVideoDetail.category_count} / {selectedVideoDetail.annotation_count}
            </div>
            <div>
              ai status/category/annotation: {selectedVideoDetail.ai_status} /{" "}
              {selectedVideoDetail.ai_category_count} / {selectedVideoDetail.ai_annotation_count}
            </div>
            <div>
              consistency: {selectedVideoDetail.consistency_status} (
              {selectedVideoDetail.consistency_info.locked_by_processing ? "locked" : "unlocked"})
            </div>
            <div>
              consistency checked: {formatTime(selectedVideoDetail.consistency_info.last_checked_at)} / reason:{" "}
              {selectedVideoDetail.consistency_info.consistency_reason ?? "-"}
            </div>
          </div>

          <section style={{ display: "grid", gap: 6 }}>
            <strong>metadata</strong>
            <div style={{ display: "grid", gap: 4 }}>
              <div>
                resolution: {selectedVideoDetail.metadata_preview.video_width ?? "-"} x{" "}
                {selectedVideoDetail.metadata_preview.video_height ?? "-"}
              </div>
              <div>fps: {selectedVideoDetail.metadata_preview.source_fps ?? "-"}</div>
              <div>duration: {selectedVideoDetail.metadata_preview.duration_sec ?? "-"}</div>
              <div>codec: {selectedVideoDetail.metadata_preview.video_codec ?? "-"}</div>
              <div>pixel format: {selectedVideoDetail.metadata_preview.pixel_format ?? "-"}</div>
              <div>storage path: {selectedVideoDetail.metadata_preview.storage_path}</div>
              <div>file size: {formatBytes(selectedVideoDetail.metadata_preview.file_size_bytes)}</div>
            </div>
          </section>

          <section style={{ display: "grid", gap: 6 }}>
            <strong>related history</strong>
            {videoHistoryError ? (
              <div style={{ background: "#fff1f2", color: "#9f1239", padding: 10, borderRadius: 8 }}>
                歷史載入失敗：{videoHistoryError}
              </div>
            ) : null}
            {videoHistoryLoading ? <div style={{ color: "#374151" }}>載入歷史中...</div> : null}
            {!videoHistoryLoading && (videoHistory?.items.length ?? 0) === 0 ? (
              <div style={{ color: "#6b7280" }}>此影片目前無歷史紀錄。</div>
            ) : (
              videoHistory?.items.map((item) => <AuditHistoryCard key={`detail-${item.id}`} item={item} />)
            )}
          </section>
        </section>
      ) : null}

      {consistencyDetail ? (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 12,
            background: "#ffffff",
            display: "grid",
            gap: 10
          }}
        >
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>一致性檢查結果</strong>
            <button type="button" onClick={() => setConsistencyDetail(null)}>
              關閉
            </button>
          </header>
          <div style={{ display: "grid", gap: 6, color: "#1f2937" }}>
            <div>
              video_id: <code>{consistencyDetail.videoId}</code>
            </div>
            <div>status: {consistencyDetail.consistencyStatus}</div>
            <div>checked_at: {formatTime(consistencyDetail.checkedAt)}</div>
            <div>locked_by_processing: {consistencyDetail.lockedByProcessing ? "yes" : "no"}</div>
          </div>

          <section style={{ display: "grid", gap: 6 }}>
            <strong>problems</strong>
            {consistencyDetail.problems.length === 0 ? (
              <div style={{ color: "#065f46", background: "#ecfdf5", borderRadius: 8, padding: 8 }}>
                無異常，狀態健康。
              </div>
            ) : (
              consistencyDetail.problems.map((problem, index) => (
                <ProblemCard key={`${problem.code}-${index}`} problem={problem} />
              ))
            )}
          </section>

          <section style={{ display: "grid", gap: 6 }}>
            <strong>suggested actions</strong>
            {consistencyDetail.suggestedActions.length === 0 ? (
              <div style={{ color: "#6b7280" }}>目前無建議操作。</div>
            ) : (
              consistencyDetail.suggestedActions.map((action, index) => (
                <ActionCard key={`${action.code}-${action.mode}-${index}`} action={action} />
              ))
            )}
          </section>
        </section>
      ) : null}

      {cleanupDetail ? (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 12,
            background: "#ffffff",
            display: "grid",
            gap: 10
          }}
        >
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <strong>清理預覽 / 結果</strong>
            <div style={{ display: "flex", gap: 8 }}>
              {cleanupDetail.mode === "dry-run" &&
              cleanupDetail.summary.eligible > 0 &&
              cleanupDetail.confirmationToken ? (
                <button type="button" onClick={() => void onApplyCleanup()} disabled={applyingCleanup}>
                  套用清理
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setCleanupDetail(null);
                  setCleanupApplyContext(null);
                }}
              >
                關閉
              </button>
            </div>
          </header>

          <div style={{ display: "grid", gap: 4 }}>
            <div>mode: {cleanupDetail.mode}</div>
            <div>filename scope: {cleanupDetail.policy.filename ?? "(all videos)"}</div>
            <div>
              policy: retention {cleanupDetail.policy.retentionDays}d / keep latest{" "}
              {cleanupDetail.policy.keepLatestPerFilename}
            </div>
            <div>
              summary: checked {cleanupDetail.summary.checked}, eligible {cleanupDetail.summary.eligible}, deleted{" "}
              {cleanupDetail.summary.deleted}, reclaimed {formatBytes(cleanupDetail.summary.estimatedReclaimedBytes)}
            </div>
          </div>

          <section style={{ display: "grid", gap: 6 }}>
            <strong>candidates</strong>
            {cleanupDetail.candidates.length === 0 ? (
              <div style={{ color: "#6b7280" }}>無資料。</div>
            ) : (
              cleanupDetail.candidates.map((candidate) => (
                <CleanupCandidateCard key={candidate.videoId} candidate={candidate} />
              ))
            )}
          </section>
        </section>
      ) : null}
    </main>
  );
}

function ProblemCard({ problem }: { problem: AdminFileConsistencyProblem }) {
  return (
    <div
      style={{
        border: "1px solid #fecaca",
        background: "#fff7ed",
        borderRadius: 8,
        padding: 8,
        color: "#7c2d12"
      }}
    >
      <div>
        <strong>{problem.code}</strong> ({problem.severity})
      </div>
      <div>{problem.message}</div>
      {problem.path ? (
        <div>
          path: <code>{problem.path}</code>
        </div>
      ) : null}
    </div>
  );
}

function ActionCard({ action }: { action: AdminFileConsistencyAction }) {
  return (
    <div
      style={{
        border: "1px solid #bfdbfe",
        background: "#eff6ff",
        borderRadius: 8,
        padding: 8,
        color: "#1e3a8a"
      }}
    >
      <div>
        <strong>{action.code}</strong> [{action.mode}]
      </div>
      <div>{action.title}</div>
    </div>
  );
}

function CleanupCandidateCard({ candidate }: { candidate: AdminFileCleanupCandidate }) {
  return (
    <div
      style={{
        border: "1px solid #d1d5db",
        background: candidate.candidate ? "#fef3c7" : "#f9fafb",
        borderRadius: 8,
        padding: 8,
        color: "#1f2937"
      }}
    >
      <div>
        <strong>{candidate.videoId}</strong> ({candidate.filename})
      </div>
      <div>uploaded: {formatTime(candidate.uploadedAt)}</div>
      <div>size: {formatBytes(candidate.fileSizeBytes)}</div>
      <div>ai: {candidate.aiStatus}</div>
      <div>rank: {candidate.rankInFilename}</div>
      <div>candidate: {candidate.candidate ? "yes" : "no"}</div>
      <div>reasons: {candidate.reasons.length > 0 ? candidate.reasons.join(", ") : "-"}</div>
    </div>
  );
}

function RiskSummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div
      style={{
        border: "1px solid #dbeafe",
        borderRadius: 8,
        background: "#eff6ff",
        padding: 10,
        color: "#1e3a8a"
      }}
    >
      <div style={{ fontSize: 12 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function RiskEventCard({
  item,
  onOpenVideoDetail
}: {
  item: AdminFileRiskEventItem;
  onOpenVideoDetail: (videoId: string) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 8,
        background: item.status === "OPEN" ? "#fff7ed" : "#f0fdf4",
        color: "#1f2937"
      }}
    >
      <div>
        <strong>{item.risk_code}</strong> ({item.severity}) [{item.status}]
      </div>
      <div>video_id: {item.video_id ?? "-"}</div>
      <div>trigger: {formatTime(item.trigger_time)}</div>
      <div>resolved: {formatTime(item.resolved_time)}</div>
      <div>source: {item.trigger_source ?? "-"}</div>
      <div>note: {item.latest_note ?? "-"}</div>
      {item.video_id ? (
        <div style={{ marginTop: 6 }}>
          <button type="button" onClick={() => onOpenVideoDetail(item.video_id ?? "")}>
            打開影片詳情
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AuditHistoryCard({ item }: { item: AdminFileAuditHistoryItem }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 8,
        background: "#f9fafb",
        color: "#111827"
      }}
    >
      <div>
        <strong>{item.event_type}</strong> @ {formatTime(item.created_at)}
      </div>
      <div>actor: {item.actor}</div>
      <div>
        payload: <code>{JSON.stringify(item.payload)}</code>
      </div>
      <div>
        result: <code>{JSON.stringify(item.result)}</code>
      </div>
    </div>
  );
}

const cellHeadStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 12,
  color: "#4b5563",
  whiteSpace: "nowrap"
};

const cellBodyStyle: CSSProperties = {
  padding: "10px 8px",
  fontSize: 14,
  verticalAlign: "top"
};
