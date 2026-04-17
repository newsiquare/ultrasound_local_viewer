import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { getStoragePaths } from "@/server/paths";
import { assertUuidV7 } from "@/server/validators";

export interface TimelineFrame {
  frameId: string;
  displayIndex: number;
  ptsUs: number;
  isKeyframe: boolean;
}

export interface TimelineJson {
  schemaVersion: "1.0";
  videoId: string;
  durationUs: number;
  sourceFps: number | null;
  frames: TimelineFrame[];
}

export interface MetadataJson {
  video_width: number | null;
  video_height: number | null;
  source_fps: number | null;
  duration_sec: number | null;
  file_size_bytes: number;
  video_codec: string | null;
  pixel_format: string | null;
}

export interface CocoImage {
  id: number;
  file_name: string;
  width: number;
  height: number;
  frame_index: number;
  pts_us: number;
}

export interface CocoAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number];
  score: number;
  track_id: number;
  frame_index: number;
  pts_us: number;
  source: "AI";
}

export interface CocoCategory {
  id: number;
  name: string;
  supercategory: string;
}

export interface CocoResultJson {
  images: CocoImage[];
  annotations: CocoAnnotation[];
  categories: CocoCategory[];
}

export function videoDir(videoId: string): string {
  assertUuidV7(videoId);
  return path.join(getStoragePaths().videosRoot, videoId);
}

export function sourceVideoPath(videoId: string): string {
  return path.join(videoDir(videoId), "source.mp4");
}

export function metadataPath(videoId: string): string {
  return path.join(videoDir(videoId), "metadata.json");
}

export function timelinePath(videoId: string): string {
  return path.join(videoDir(videoId), "timeline.json");
}

export function aiDir(videoId: string): string {
  return path.join(videoDir(videoId), "ai");
}

export function aiResultPath(videoId: string): string {
  return path.join(aiDir(videoId), "latest.coco.json");
}

export async function ensureVideoDirectory(videoId: string): Promise<void> {
  await mkdir(videoDir(videoId), { recursive: true });
}

export async function writeMetadata(videoId: string, metadata: MetadataJson): Promise<void> {
  await writeFile(metadataPath(videoId), JSON.stringify(metadata, null, 2), "utf-8");
}

export async function writeTimeline(videoId: string, timeline: TimelineJson): Promise<void> {
  await writeFile(timelinePath(videoId), JSON.stringify(timeline, null, 2), "utf-8");
}

export async function writeAiResult(videoId: string, result: CocoResultJson): Promise<void> {
  await mkdir(aiDir(videoId), { recursive: true });
  await writeFile(aiResultPath(videoId), JSON.stringify(result, null, 2), "utf-8");
}

export async function readMetadata(videoId: string): Promise<MetadataJson> {
  const text = await readFile(metadataPath(videoId), "utf-8");
  return JSON.parse(text) as MetadataJson;
}

export async function readTimeline(videoId: string): Promise<TimelineJson> {
  const text = await readFile(timelinePath(videoId), "utf-8");
  return JSON.parse(text) as TimelineJson;
}

export async function readAiResult(videoId: string): Promise<CocoResultJson> {
  const text = await readFile(aiResultPath(videoId), "utf-8");
  return JSON.parse(text) as CocoResultJson;
}

export async function removeVideoAssets(videoId: string): Promise<void> {
  await rm(videoDir(videoId), { force: true, recursive: true });
}

export async function removeAiAssets(videoId: string): Promise<void> {
  await rm(aiDir(videoId), { force: true, recursive: true });
}

export async function fileSizeBytes(filePath: string): Promise<number> {
  const value = await stat(filePath);
  return value.size;
}
