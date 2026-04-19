"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { uploadWithXhr } from "@/client/api";
import { UploadNotification, UploadResponseData, UploadStatus } from "@/client/types";

interface UseUploadTaskOptions {
  onUploadSuccess: (videoId: string) => void;
}

export interface UploadTaskState {
  status: UploadStatus;
  progressPercent: number;
  isUploading: boolean;
  filename: string | null;
  fileSizeBytes: number | null;
  notification: UploadNotification | null;
  startUpload: (file: File) => Promise<void>;
  cancelUpload: () => void;
  dismissNotification: () => void;
}

export function useUploadTask(options: UseUploadTaskOptions): UploadTaskState {
  const { onUploadSuccess } = options;

  const [status, setStatus] = useState<UploadStatus>("IDLE");
  const [progressPercent, setProgressPercent] = useState(0);
  const [notification, setNotification] = useState<UploadNotification | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);

  // Auto-dismiss timer for success / canceled notifications
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleAutoDismiss = useCallback(() => {
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    autoDismissRef.current = setTimeout(() => {
      setNotification(null);
      autoDismissRef.current = null;
    }, 3000);
  }, []);

  const abortRef = useRef<AbortController | null>(null);

  const startUpload = useCallback(
    async (file: File) => {
      if (abortRef.current) {
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("PICKED");
      setProgressPercent(0);
      setFilename(file.name);
      setFileSizeBytes(file.size);

      try {
        setStatus("UPLOADING");

        const payload: UploadResponseData = await uploadWithXhr({
          file,
          signal: controller.signal,
          onProgress: (loaded, total) => {
            if (total <= 0) {
              return;
            }
            setProgressPercent(Math.min(100, Math.round((loaded / total) * 100)));
          },
          onParsing: () => setStatus("PARSING_METADATA")
        });

        setStatus("READY");
        setProgressPercent(100);
        setNotification({ kind: "success", message: "上傳完成" });
        scheduleAutoDismiss();
        toast.success("影片上傳成功");
        onUploadSuccess(payload.videoId);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setStatus("CANCELED");
          setNotification({ kind: "info", message: "上傳已取消" });
          scheduleAutoDismiss();
          toast.info("上傳已取消");
        } else {
          setStatus("FAILED");
          const message = error instanceof Error ? error.message : "Unknown upload error";
          setNotification({ kind: "error", message: `上傳失敗：${message}` });
          toast.error(`上傳失敗：${message}`);
        }
      } finally {
        abortRef.current = null;
      }
    },
    [onUploadSuccess, scheduleAutoDismiss]
  );

  const cancelUpload = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const dismissNotification = useCallback(() => {
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
      autoDismissRef.current = null;
    }
    setNotification(null);
  }, []);

  const isUploading = useMemo(
    () => status === "UPLOADING" || status === "PARSING_METADATA",
    [status]
  );

  return {
    status,
    progressPercent,
    isUploading,
    filename,
    fileSizeBytes,
    notification,
    startUpload,
    cancelUpload,
    dismissNotification
  };
}
