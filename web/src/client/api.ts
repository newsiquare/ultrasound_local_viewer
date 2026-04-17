import {
  AiStatusData,
  AnnotationItem,
  ApiErrorPayload,
  ApiOkPayload,
  BootstrapData,
  CategoryItem,
  TimelineFrame,
  TimelinePageData,
  UploadResponseData,
  VideosListData
} from "@/client/types";

function buildErrorMessage(status: number, payload?: ApiErrorPayload): string {
  const code = payload?.error?.code;
  const message = payload?.error?.message;
  if (message && code) {
    return `[${code}] ${message}`;
  }
  if (message) {
    return message;
  }
  return `Request failed with status ${status}`;
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const json = text ? (JSON.parse(text) as ApiOkPayload<T> | ApiErrorPayload) : null;

  if (!response.ok) {
    throw new Error(buildErrorMessage(response.status, json as ApiErrorPayload | undefined));
  }

  if (!json || !("ok" in json) || json.ok !== true || !("data" in json)) {
    throw new Error("Invalid API response shape.");
  }

  return json.data;
}

export async function fetchVideosList(signal?: AbortSignal): Promise<VideosListData> {
  const response = await fetch("/api/videos?page=1&pageSize=50", {
    method: "GET",
    signal,
    cache: "no-store"
  });
  return parseJsonResponse<VideosListData>(response);
}

export async function fetchBootstrap(
  videoId: string,
  options?: {
    windowBefore?: number;
    windowAfter?: number;
    signal?: AbortSignal;
  }
): Promise<BootstrapData> {
  const before = options?.windowBefore ?? 60;
  const after = options?.windowAfter ?? 60;

  const response = await fetch(
    `/api/videos/${videoId}/bootstrap?windowBefore=${before}&windowAfter=${after}`,
    {
      method: "GET",
      signal: options?.signal,
      cache: "no-store"
    }
  );
  return parseJsonResponse<BootstrapData>(response);
}

export async function fetchTimelinePage(
  videoId: string,
  options?: {
    cursor?: number;
    limit?: number;
    signal?: AbortSignal;
  }
): Promise<TimelinePageData> {
  const cursor = options?.cursor ?? 0;
  const limit = options?.limit ?? 2000;

  const response = await fetch(`/api/videos/${videoId}/timeline?cursor=${cursor}&limit=${limit}`, {
    method: "GET",
    signal: options?.signal,
    cache: "no-store"
  });
  return parseJsonResponse<TimelinePageData>(response);
}

export async function fetchTimelineAll(videoId: string, signal?: AbortSignal): Promise<TimelineFrame[]> {
  const frames: TimelineFrame[] = [];
  let cursor: number | null = 0;

  while (cursor !== null) {
    const page = await fetchTimelinePage(videoId, { cursor, limit: 2000, signal });
    frames.push(...page.items);
    cursor = page.nextCursor;
  }

  return frames;
}

export async function startAiDetect(videoId: string): Promise<AiStatusData> {
  const response = await fetch(`/api/videos/${videoId}/ai-detect`, {
    method: "POST"
  });

  const data = await parseJsonResponse<{ videoId: string; status: string; updatedAt: string }>(response);
  return {
    videoId: data.videoId,
    status: data.status as AiStatusData["status"],
    errorMessage: null,
    updatedAt: data.updatedAt,
    progress: 0
  };
}

export async function cancelAiDetect(videoId: string): Promise<AiStatusData> {
  const response = await fetch(`/api/videos/${videoId}/ai-cancel`, {
    method: "POST"
  });

  const data = await parseJsonResponse<{ videoId: string; status: string; updatedAt: string }>(response);
  return {
    videoId: data.videoId,
    status: data.status as AiStatusData["status"],
    errorMessage: null,
    updatedAt: data.updatedAt,
    progress: 0
  };
}

export async function fetchAiStatus(videoId: string, signal?: AbortSignal): Promise<AiStatusData> {
  const response = await fetch(`/api/videos/${videoId}/ai-status`, {
    method: "GET",
    signal,
    cache: "no-store"
  });
  return parseJsonResponse<AiStatusData>(response);
}

export async function fetchCategories(videoId: string): Promise<CategoryItem[]> {
  const response = await fetch(`/api/videos/${videoId}/categories`, {
    method: "GET",
    cache: "no-store"
  });
  return parseJsonResponse<CategoryItem[]>(response);
}

export async function createCategory(
  videoId: string,
  payload: {
    name: string;
    color: string;
  }
): Promise<CategoryItem> {
  const response = await fetch(`/api/videos/${videoId}/categories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return parseJsonResponse<CategoryItem>(response);
}

export async function updateCategory(
  videoId: string,
  categoryId: string,
  payload: {
    name?: string;
    color?: string;
    isVisible?: boolean;
  }
): Promise<CategoryItem> {
  const response = await fetch(`/api/videos/${videoId}/categories/${categoryId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return parseJsonResponse<CategoryItem>(response);
}

export async function deleteCategory(videoId: string, categoryId: string): Promise<void> {
  const response = await fetch(`/api/videos/${videoId}/categories/${categoryId}`, {
    method: "DELETE"
  });
  if (response.status === 204) {
    return;
  }
  if (!response.ok) {
    const text = await response.text();
    let payload: ApiErrorPayload | undefined;
    try {
      payload = text ? (JSON.parse(text) as ApiErrorPayload) : undefined;
    } catch {
      payload = undefined;
    }
    throw new Error(buildErrorMessage(response.status, payload));
  }
}

export async function fetchAnnotations(
  videoId: string,
  options?: {
    frameId?: string;
    source?: "MANUAL" | "AI";
    cursor?: number;
    limit?: number;
  }
): Promise<{ total: number; nextCursor: number | null; items: AnnotationItem[] }> {
  const query = new URLSearchParams();
  if (options?.frameId) {
    query.set("frameId", options.frameId);
  }
  if (options?.source) {
    query.set("source", options.source);
  }
  query.set("cursor", String(options?.cursor ?? 0));
  query.set("limit", String(options?.limit ?? 200));

  const response = await fetch(`/api/videos/${videoId}/annotations?${query.toString()}`, {
    method: "GET",
    cache: "no-store"
  });
  return parseJsonResponse<{ total: number; nextCursor: number | null; items: AnnotationItem[] }>(response);
}

export async function createAnnotation(
  videoId: string,
  payload: {
    frameId: string;
    categoryId: string;
    bbox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }
): Promise<AnnotationItem> {
  const response = await fetch(`/api/videos/${videoId}/annotations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return parseJsonResponse<AnnotationItem>(response);
}

export async function updateAnnotation(
  videoId: string,
  annotationId: string,
  payload: {
    categoryId?: string;
    bbox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }
): Promise<AnnotationItem> {
  const response = await fetch(`/api/videos/${videoId}/annotations/${annotationId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return parseJsonResponse<AnnotationItem>(response);
}

export async function deleteAnnotation(videoId: string, annotationId: string): Promise<void> {
  const response = await fetch(`/api/videos/${videoId}/annotations/${annotationId}`, {
    method: "DELETE"
  });
  if (response.status === 204) {
    return;
  }
  if (!response.ok) {
    const text = await response.text();
    let payload: ApiErrorPayload | undefined;
    try {
      payload = text ? (JSON.parse(text) as ApiErrorPayload) : undefined;
    } catch {
      payload = undefined;
    }
    throw new Error(buildErrorMessage(response.status, payload));
  }
}

export async function deleteVideo(videoId: string): Promise<void> {
  const response = await fetch(`/api/videos/${videoId}`, {
    method: "DELETE"
  });

  if (response.status === 204) {
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    let payload: ApiErrorPayload | undefined;
    try {
      payload = text ? (JSON.parse(text) as ApiErrorPayload) : undefined;
    } catch {
      payload = undefined;
    }
    throw new Error(buildErrorMessage(response.status, payload));
  }
}

export async function clearAiResult(videoId: string): Promise<void> {
  const response = await fetch(`/api/videos/${videoId}/ai-result`, {
    method: "DELETE"
  });

  if (response.status === 204) {
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    let payload: ApiErrorPayload | undefined;
    try {
      payload = text ? (JSON.parse(text) as ApiErrorPayload) : undefined;
    } catch {
      payload = undefined;
    }
    throw new Error(buildErrorMessage(response.status, payload));
  }
}

interface UploadWithXhrOptions {
  file: File;
  signal: AbortSignal;
  onProgress: (loaded: number, total: number) => void;
  onParsing: () => void;
}

export function uploadWithXhr(options: UploadWithXhrOptions): Promise<UploadResponseData> {
  const { file, signal, onProgress, onParsing } = options;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.open("POST", "/api/videos/upload");
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded, event.total);
        if (event.loaded >= event.total) {
          onParsing();
        }
      }
    };

    xhr.onerror = () => {
      signal.removeEventListener("abort", abortHandler);
      reject(new Error("Network error while uploading file."));
    };

    xhr.onabort = () => {
      signal.removeEventListener("abort", abortHandler);
      reject(new DOMException("Upload canceled.", "AbortError"));
    };

    xhr.onload = () => {
      signal.removeEventListener("abort", abortHandler);
      const payload = xhr.response as ApiOkPayload<UploadResponseData> | ApiErrorPayload | null;
      if (xhr.status >= 200 && xhr.status < 300 && payload && "ok" in payload && payload.ok) {
        resolve(payload.data);
        return;
      }

      const msg = buildErrorMessage(xhr.status, payload as ApiErrorPayload | undefined);
      reject(new Error(msg));
    };

    const abortHandler = () => {
      xhr.abort();
    };

    signal.addEventListener("abort", abortHandler, { once: true });
    xhr.send(formData);
  });
}
