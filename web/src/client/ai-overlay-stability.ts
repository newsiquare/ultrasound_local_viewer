export interface AiOverlayDetection {
  id: number;
  frameIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  trackId: number | null;
  categoryName: string;
}

export interface OverlayPoint {
  frameIndex: number;
  x: number;
  y: number;
}

export interface OverlayStore {
  byFrameIndex: Map<number, AiOverlayDetection[]>;
  byTrackId: Map<number, OverlayPoint[]>;
  byTrackDetections: Map<number, AiOverlayDetection[]>;
  sortedFrameIndices: number[];
}

export const MAX_INTERPOLATION_GAP = 8;
export const MAX_CARRY_FORWARD_GAP = 2;

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function findPrevDetectionIndex(
  detections: AiOverlayDetection[],
  targetFrameIndex: number
): number {
  let low = 0;
  let high = detections.length - 1;
  let answer = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const frameIndex = detections[mid].frameIndex;
    if (frameIndex <= targetFrameIndex) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return answer;
}

function interpolateDetection(
  trackId: number,
  currentDisplayIndex: number,
  prev: AiOverlayDetection,
  next: AiOverlayDetection
): AiOverlayDetection {
  const span = Math.max(1, next.frameIndex - prev.frameIndex);
  const t = Math.min(1, Math.max(0, (currentDisplayIndex - prev.frameIndex) / span));

  return {
    ...prev,
    id: trackId * 1_000_000 + currentDisplayIndex,
    frameIndex: currentDisplayIndex,
    x: lerp(prev.x, next.x, t),
    y: lerp(prev.y, next.y, t),
    width: lerp(prev.width, next.width, t),
    height: lerp(prev.height, next.height, t),
    score: lerp(prev.score, next.score, t)
  };
}

export function createOverlayStore(detections: AiOverlayDetection[]): OverlayStore {
  const byFrameIndex = new Map<number, AiOverlayDetection[]>();
  const byTrackId = new Map<number, OverlayPoint[]>();
  const byTrackDetections = new Map<number, AiOverlayDetection[]>();

  for (const detection of detections) {
    const frameList = byFrameIndex.get(detection.frameIndex) ?? [];
    frameList.push(detection);
    byFrameIndex.set(detection.frameIndex, frameList);

    if (detection.trackId !== null) {
      const points = byTrackId.get(detection.trackId) ?? [];
      points.push({
        frameIndex: detection.frameIndex,
        x: detection.x + detection.width / 2,
        y: detection.y + detection.height / 2
      });
      byTrackId.set(detection.trackId, points);

      const list = byTrackDetections.get(detection.trackId) ?? [];
      list.push(detection);
      byTrackDetections.set(detection.trackId, list);
    }
  }

  for (const [key, value] of byFrameIndex.entries()) {
    value.sort((a, b) => a.id - b.id);
    byFrameIndex.set(key, value);
  }

  for (const [key, value] of byTrackId.entries()) {
    value.sort((a, b) => a.frameIndex - b.frameIndex);
    byTrackId.set(key, value);
  }

  for (const [key, value] of byTrackDetections.entries()) {
    value.sort((a, b) => a.frameIndex - b.frameIndex || a.id - b.id);
    byTrackDetections.set(key, value);
  }

  const sortedFrameIndices = Array.from(byFrameIndex.keys()).sort((a, b) => a - b);

  return {
    byFrameIndex,
    byTrackId,
    byTrackDetections,
    sortedFrameIndices
  };
}

export function resolveDetectionsForFrame(
  store: OverlayStore | null,
  currentDisplayIndex: number | null
): AiOverlayDetection[] {
  if (!store || !currentDisplayIndex) {
    return [];
  }

  const exact = store.byFrameIndex.get(currentDisplayIndex);
  if (exact && exact.length > 0) {
    return exact;
  }

  const blended: AiOverlayDetection[] = [];

  for (const [trackId, list] of store.byTrackDetections.entries()) {
    if (list.length === 0) {
      continue;
    }

    const prevIndex = findPrevDetectionIndex(list, currentDisplayIndex);
    if (prevIndex < 0) {
      continue;
    }

    const prev = list[prevIndex];
    if (prev.frameIndex === currentDisplayIndex) {
      blended.push(prev);
      continue;
    }

    const next = list[prevIndex + 1];
    if (
      next &&
      next.frameIndex > currentDisplayIndex &&
      next.frameIndex - prev.frameIndex <= MAX_INTERPOLATION_GAP
    ) {
      blended.push(interpolateDetection(trackId, currentDisplayIndex, prev, next));
      continue;
    }

    if (currentDisplayIndex - prev.frameIndex <= MAX_CARRY_FORWARD_GAP) {
      blended.push({
        ...prev,
        id: trackId * 1_000_000 + currentDisplayIndex,
        frameIndex: currentDisplayIndex
      });
    }
  }

  if (blended.length > 0) {
    blended.sort((a, b) => a.id - b.id);
    return blended;
  }

  // Fallback for outputs without track_id: carry one frame from latest available detections.
  let prevFrameWithDetections: number | null = null;
  for (const frameIndex of store.sortedFrameIndices) {
    if (frameIndex > currentDisplayIndex) {
      break;
    }
    prevFrameWithDetections = frameIndex;
  }

  if (prevFrameWithDetections !== null && currentDisplayIndex - prevFrameWithDetections <= 1) {
    const fallback = store.byFrameIndex.get(prevFrameWithDetections) ?? [];
    return fallback.map((item, index) => ({
      ...item,
      id: item.id * 10 + index + 1,
      frameIndex: currentDisplayIndex
    }));
  }

  return [];
}
