"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

import { Download, ExternalLink, HelpCircle, LogOut, Settings, Trash2, Upload, X } from "lucide-react";

import { exportAnnotations, ExportFormat } from "@/client/api";
import { KeyboardShortcutsModal } from "@/client/components/KeyboardShortcutsModal";
import { UploadTaskState } from "@/client/hooks/useUploadTask";

interface TopBarProps {
  uploadTask: UploadTaskState;
  currentVideoId: string | null;
  onDeleteCurrentVideo: () => Promise<void>;
  onClearAiResult: () => Promise<void>;
  onClearFrontendState: () => void;
  adminUser?: string | null;
  onAdminLogout?: () => Promise<void>;
}

export function TopBar(props: TopBarProps) {
  const { uploadTask, currentVideoId, onDeleteCurrentVideo, onClearAiResult, onClearFrontendState, adminUser, onAdminLogout } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClearingAi, setIsClearingAi] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // L3: `?` global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "?") setShortcutsOpen((prev) => !prev);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const onPickFile = () => {
    inputRef.current?.click();
  };

  const onChangeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadTask.startUpload(file);
    event.target.value = "";
  };

  const onDelete = async () => {
    if (!currentVideoId) return;
    setIsDeleting(true);
    try {
      await onDeleteCurrentVideo();
    } finally {
      setIsDeleting(false);
      setSettingsOpen(false);
    }
  };

  const onClearAi = async () => {
    if (!currentVideoId) return;
    setIsClearingAi(true);
    try {
      await onClearAiResult();
    } finally {
      setIsClearingAi(false);
      setSettingsOpen(false);
    }
  };

  const canUpload = !uploadTask.isUploading;
  const canCancel = uploadTask.isUploading;

  return (
    <header
      style={{
        height: 48,
        background: "#0f1018",
        borderBottom: "1px solid #252638",
        display: "flex",
        alignItems: "center",
        paddingLeft: 16,
        paddingRight: 16,
        gap: 12,
        flexShrink: 0,
        position: "relative"
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: "linear-gradient(135deg, #4f8cff, #7c5cbf)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            flexShrink: 0
          }}
        >
          🫀
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#c8cae8", letterSpacing: 0.3 }}>
          Ultrasound Viewer
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: "#3c3e58", flexShrink: 0 }} />

      {/* Upload controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          onClick={onPickFile}
          disabled={!canUpload}
          style={btnStyle("primary", !canUpload)}
        >
          <Upload size={13} />
          上傳影片
        </button>

        {/* Inline upload status widget */}
        {(uploadTask.isUploading || uploadTask.notification) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

            {/* Filename + size */}
            {uploadTask.isUploading && uploadTask.filename && (
              <span style={{ fontSize: 11, color: "#9699b0", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {uploadTask.filename}
                {uploadTask.fileSizeBytes !== null && (
                  <span style={{ color: "#585a78" }}> · {formatFileSize(uploadTask.fileSizeBytes)}</span>
                )}
              </span>
            )}

            {/* Capsule progress bar */}
            {uploadTask.isUploading && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 99,
                  padding: "2px 8px 2px 4px",
                  height: 22,
                  overflow: "hidden",
                  position: "relative"
                }}
              >
                {uploadTask.status === "UPLOADING" ? (
                  <>
                    {/* Determinate bar */}
                    <div style={{ width: 64, height: 6, borderRadius: 99, background: "rgba(79,140,255,0.2)", overflow: "hidden", flexShrink: 0 }}>
                      <div style={{
                        height: "100%",
                        width: `${uploadTask.progressPercent}%`,
                        background: "#4f8cff",
                        borderRadius: 99,
                        transition: "width 0.2s ease"
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#c8cae8", fontVariantNumeric: "tabular-nums", minWidth: 26, textAlign: "right" }}>
                      {uploadTask.progressPercent}%
                    </span>
                  </>
                ) : (
                  <>
                    {/* Indeterminate bar (PARSING_METADATA) */}
                    <div style={{ width: 64, height: 6, borderRadius: 99, background: "rgba(245,158,11,0.2)", overflow: "hidden", flexShrink: 0, position: "relative" }}>
                      <div style={{
                        position: "absolute",
                        height: "100%",
                        width: "40%",
                        background: "#f59e0b",
                        borderRadius: 99,
                        animation: "indeterminate 1.4s ease-in-out infinite"
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#f59e0b" }}>分析中…</span>
                  </>
                )}
              </div>
            )}

            {/* Notification (success / failed / canceled) */}
            {!uploadTask.isUploading && uploadTask.notification && (
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "2px 8px",
                borderRadius: 99,
                fontSize: 11,
                background: uploadTask.notification.kind === "success"
                  ? "rgba(52,211,153,0.12)"
                  : uploadTask.notification.kind === "error"
                    ? "rgba(248,113,113,0.12)"
                    : "rgba(79,140,255,0.12)",
                color: uploadTask.notification.kind === "success"
                  ? "#34d399"
                  : uploadTask.notification.kind === "error"
                    ? "#f87171"
                    : "#60a5fa",
                border: `1px solid ${uploadTask.notification.kind === "success" ? "rgba(52,211,153,0.2)" : uploadTask.notification.kind === "error" ? "rgba(248,113,113,0.2)" : "rgba(79,140,255,0.2)"}`
              }}>
                {uploadTask.notification.kind === "success" ? "✅" : uploadTask.notification.kind === "error" ? "❌" : "ℹ️"}
                <span>{uploadTask.notification.message}</span>
                {uploadTask.notification.kind === "error" && (
                  <button
                    type="button"
                    onClick={uploadTask.dismissNotification}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", display: "flex", marginLeft: 2 }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            )}

            {/* Cancel button */}
            {canCancel && (
              <button
                type="button"
                onClick={uploadTask.cancelUpload}
                style={{ ...btnStyle("ghost", false), padding: "3px 6px" }}
                title="取消上傳"
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Export dropdown — L2 */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setExportOpen(!exportOpen)}
          disabled={!currentVideoId}
          style={btnStyle("ghost", !currentVideoId)}
          title="匯出標註"
        >
          <Download size={15} />
          匯出
        </button>

        {exportOpen && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 40 }}
              onClick={() => setExportOpen(false)}
            />
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                zIndex: 50,
                background: "#171824",
                border: "1px solid #3c3e58",
                borderRadius: 8,
                padding: "4px 0",
                minWidth: 200,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
              }}
            >
              <div style={{ padding: "4px 12px 6px", fontSize: 11, color: "#9699b0", textTransform: "uppercase", letterSpacing: 0.5 }}>
                匯出格式
              </div>
              {([
                ["coco", "COCO JSON（全部）", "包含手動 + AI 標註"],
                ["coco-manual", "COCO JSON（手動）", "僅手動標註"],
                ["yolo", "YOLO TXT（手動 bbox）", "正規化座標格式"]
              ] as [ExportFormat, string, string][]).map(([fmt, label, desc]) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => {
                    if (currentVideoId) exportAnnotations(currentVideoId, fmt);
                    setExportOpen(false);
                  }}
                  style={menuItemStyle("muted", false)}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                    <span style={{ fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: 11, color: "#9699b0", marginTop: 1 }}>{desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Help button — L3 */}
      <button
        type="button"
        onClick={() => setShortcutsOpen(true)}
        style={btnStyle("ghost", false)}
        title="快捷鍵說明 (?)"
      >
        <HelpCircle size={15} />
      </button>

      {/* Settings */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setSettingsOpen(!settingsOpen)}
          style={btnStyle("ghost", false)}
          title="設定"
        >
          <Settings size={15} />
        </button>

        {settingsOpen && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 40 }}
              onClick={() => setSettingsOpen(false)}
            />
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                zIndex: 50,
                background: "#171824",
                border: "1px solid #3c3e58",
                borderRadius: 8,
                padding: "4px 0",
                minWidth: 180,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
              }}
            >
              <div style={{ padding: "4px 12px 6px", fontSize: 11, color: "#9699b0", textTransform: "uppercase", letterSpacing: 0.5 }}>
                影片操作
              </div>
              <button
                type="button"
                onClick={() => void onDelete()}
                disabled={!currentVideoId || isDeleting}
                style={menuItemStyle("danger", !currentVideoId || isDeleting)}
              >
                <Trash2 size={13} />
                {isDeleting ? "刪除中..." : "刪除當前影片"}
              </button>
              <button
                type="button"
                onClick={() => void onClearAi()}
                disabled={!currentVideoId || isClearingAi}
                style={menuItemStyle("danger", !currentVideoId || isClearingAi)}
              >
                <Trash2 size={13} />
                {isClearingAi ? "清除中..." : "清除 AI 結果"}
              </button>
              <div style={{ height: 1, background: "#3c3e58", margin: "4px 0" }} />
              <button
                type="button"
                onClick={() => { onClearFrontendState(); setSettingsOpen(false); }}
                style={menuItemStyle("muted", false)}
              >
                清除前端狀態
              </button>
            </div>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.mov,.avi,.mkv"
        onChange={(e) => void onChangeFile(e)}
        style={{ display: "none" }}
      />

      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Admin user avatar */}
      {adminUser && (
        <div style={{ position: "relative", marginLeft: 4 }}>
          <button
            type="button"
            onClick={() => setAvatarMenuOpen((v) => !v)}
            title={`管理員：${adminUser}`}
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #4f8cff, #7c5cbf)",
              border: "2px solid rgba(79,140,255,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              color: "#fff",
              cursor: "pointer",
              flexShrink: 0,
              padding: 0,
            }}
          >
            {adminUser[0]?.toUpperCase()}
          </button>

          {avatarMenuOpen && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 40 }}
                onClick={() => setAvatarMenuOpen(false)}
              />
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  zIndex: 50,
                  background: "#171824",
                  border: "1px solid #3c3e58",
                  borderRadius: 10,
                  padding: "6px 0",
                  minWidth: 200,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                }}
              >
                {/* User info header */}
                <div style={{ padding: "8px 14px 10px", borderBottom: "1px solid #252638" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: "linear-gradient(135deg, #4f8cff, #7c5cbf)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0,
                    }}>
                      {adminUser[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e3f0" }}>{adminUser}</div>
                      <div style={{ fontSize: 11, color: "#585a78", marginTop: 1 }}>管理員</div>
                    </div>
                  </div>
                </div>

                {/* Admin panel link */}
                <a
                  href="/file"
                  onClick={() => setAvatarMenuOpen(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 14px",
                    color: "#d4d6f0", textDecoration: "none",
                    fontSize: 13,
                  }}
                >
                  <ExternalLink size={13} />
                  管理後台
                </a>

                <div style={{ height: 1, background: "#252638", margin: "4px 0" }} />

                {/* Logout */}
                <button
                  type="button"
                  onClick={async () => {
                    setAvatarMenuOpen(false);
                    if (!onAdminLogout) return;
                    setIsLoggingOut(true);
                    try { await onAdminLogout(); } finally { setIsLoggingOut(false); }
                  }}
                  disabled={isLoggingOut}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "8px 14px",
                    background: "none", border: "none",
                    color: "#f87171", fontSize: 13, fontFamily: "inherit",
                    cursor: isLoggingOut ? "not-allowed" : "pointer",
                    opacity: isLoggingOut ? 0.5 : 1,
                    textAlign: "left",
                  }}
                >
                  <LogOut size={13} />
                  {isLoggingOut ? "登出中…" : "登出管理員"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes indeterminate {
          0%   { left: -40%; }
          60%  { left: 100%; }
          100% { left: 100%; }
        }
      `}</style>
    </header>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function btnStyle(variant: "primary" | "ghost", disabled: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    border: "none",
    padding: "5px 10px",
    fontFamily: "inherit",
    transition: "background 0.15s",
    flexShrink: 0
  };

  if (variant === "primary") {
    return { ...base, background: "#4f8cff", color: "#fff" };
  }
  return { ...base, background: "transparent", color: "#d4d6f0" };
}

function menuItemStyle(variant: "danger" | "muted", disabled: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "7px 12px",
    background: "none",
    border: "none",
    fontSize: 13,
    fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    color: variant === "danger" ? "#f87171" : "#d4d6f0",
    textAlign: "left"
  };
}
