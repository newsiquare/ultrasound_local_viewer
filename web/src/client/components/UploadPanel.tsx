"use client";

import { ChangeEvent, useRef, useState } from "react";

import { UploadTaskState } from "@/client/hooks/useUploadTask";

interface UploadPanelProps {
  uploadTask: UploadTaskState;
  currentVideoId: string | null;
  onDeleteCurrentVideo: () => Promise<void>;
  onClearAiResult: () => Promise<void>;
  onClearFrontendState: () => void;
}

export function UploadPanel(props: UploadPanelProps) {
  const { uploadTask, currentVideoId, onDeleteCurrentVideo, onClearAiResult, onClearFrontendState } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClearingAi, setIsClearingAi] = useState(false);

  const onPickFile = () => {
    inputRef.current?.click();
  };

  const onChangeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await uploadTask.startUpload(file);
    event.target.value = "";
  };

  const onDelete = async () => {
    if (!currentVideoId) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDeleteCurrentVideo();
    } finally {
      setIsDeleting(false);
    }
  };

  const onClearAi = async () => {
    if (!currentVideoId) {
      return;
    }
    setIsClearingAi(true);
    try {
      await onClearAiResult();
    } finally {
      setIsClearingAi(false);
    }
  };

  const canUpload = !uploadTask.isUploading;
  const canCancel = uploadTask.isUploading;

  return (
    <section style={{ border: "1px solid #d4d4d8", borderRadius: 12, padding: 16, background: "#fff" }}>
      <h2 style={{ marginTop: 0 }}>Upload Panel</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={onPickFile} disabled={!canUpload}>
          建立上傳任務
        </button>
        <button type="button" onClick={uploadTask.cancelUpload} disabled={!canCancel}>
          取消上傳
        </button>
        <button type="button" onClick={onDelete} disabled={!currentVideoId || uploadTask.isUploading || isDeleting}>
          清除當前影片
        </button>
        <button
          type="button"
          onClick={onClearAi}
          disabled={!currentVideoId || uploadTask.isUploading || isClearingAi}
        >
          {isClearingAi ? "清除AI中..." : "清除 AI 結果"}
        </button>
        <button type="button" onClick={onClearFrontendState}>
          清除當前所有資料（前端）
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.mov,.avi,.mkv"
        onChange={onChangeFile}
        style={{ display: "none" }}
      />

      <div style={{ marginTop: 12, fontSize: 14, color: "#27272a" }}>
        <div>上傳狀態：{uploadTask.status}</div>
        <div>上傳進度：{uploadTask.progressPercent}%</div>
        <div>目前影片：{currentVideoId ?? "(none)"}</div>
      </div>

      {uploadTask.notification ? (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 8,
            background:
              uploadTask.notification.kind === "success"
                ? "#dcfce7"
                : uploadTask.notification.kind === "error"
                  ? "#fee2e2"
                  : "#dbeafe"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>{uploadTask.notification.message}</span>
            <button type="button" onClick={uploadTask.dismissNotification}>
              關閉
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
