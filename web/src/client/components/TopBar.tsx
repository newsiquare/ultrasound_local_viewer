"use client";

import { ChangeEvent, useRef, useState } from "react";

import { Loader2, Settings, Trash2, Upload, X } from "lucide-react";

import { UploadTaskState } from "@/client/hooks/useUploadTask";

interface TopBarProps {
  uploadTask: UploadTaskState;
  currentVideoId: string | null;
  onDeleteCurrentVideo: () => Promise<void>;
  onClearAiResult: () => Promise<void>;
  onClearFrontendState: () => void;
}

export function TopBar(props: TopBarProps) {
  const { uploadTask, currentVideoId, onDeleteCurrentVideo, onClearAiResult, onClearFrontendState } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClearingAi, setIsClearingAi] = useState(false);

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

        {canCancel && (
          <button
            type="button"
            onClick={uploadTask.cancelUpload}
            style={btnStyle("ghost", false)}
          >
            <X size={13} />
            取消
          </button>
        )}

        {uploadTask.isUploading && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#c9ccd8", fontSize: 12 }}>
            <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
            {uploadTask.progressPercent}%
          </div>
        )}
      </div>

      {/* Upload notification */}
      {uploadTask.notification && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 10px",
            borderRadius: 6,
            fontSize: 12,
            background:
              uploadTask.notification.kind === "success"
                ? "rgba(52, 211, 153, 0.15)"
                : uploadTask.notification.kind === "error"
                  ? "rgba(248, 113, 113, 0.15)"
                  : "rgba(79, 140, 255, 0.15)",
            color:
              uploadTask.notification.kind === "success"
                ? "#34d399"
                : uploadTask.notification.kind === "error"
                  ? "#f87171"
                  : "#4f8cff",
            border: `1px solid ${uploadTask.notification.kind === "success" ? "rgba(52,211,153,0.25)" : uploadTask.notification.kind === "error" ? "rgba(248,113,113,0.25)" : "rgba(79,140,255,0.25)"}`
          }}
        >
          {uploadTask.notification.message}
          <button
            type="button"
            onClick={uploadTask.dismissNotification}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", display: "flex" }}
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

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

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </header>
  );
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
