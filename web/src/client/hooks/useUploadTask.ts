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
        setNotification({ kind: "success", message: "Upload completed" });
        toast.success("影片上傳成功");
        onUploadSuccess(payload.videoId);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setStatus("CANCELED");
          setNotification({ kind: "info", message: "Upload canceled" });
          toast.info("上傳已取消");
        } else {
          setStatus("FAILED");
          const message = error instanceof Error ? error.message : "Unknown upload error";
          setNotification({ kind: "error", message: `Upload failed: ${message}` });
          toast.error(`上傳失敗：${message}`);
        }
      } finally {
        abortRef.current = null;
      }
    },
    [onUploadSuccess]
  );

  const cancelUpload = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const dismissNotification = useCallback(() => {
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
    notification,
    startUpload,
    cancelUpload,
    dismissNotification
  };
}
