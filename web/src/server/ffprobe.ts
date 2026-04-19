import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { HttpError } from "@/server/errors";
import { TimelineJson, thumbPath, videoDir } from "@/server/video-files";

interface FfprobeFormat {
  duration?: string;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
}

interface FfprobeFrame {
  pts_time?: string;
  key_frame?: number;
}

interface FfprobeOutput {
  format?: FfprobeFormat;
  streams?: FfprobeStream[];
  frames?: FfprobeFrame[];
}

export interface ProbeMetadata {
  video_width: number | null;
  video_height: number | null;
  source_fps: number | null;
  duration_sec: number | null;
  file_size_bytes: number;
  video_codec: string | null;
  pixel_format: string | null;
}

function runFfprobe(args: string[]): Promise<FfprobeOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as FfprobeOutput);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseRational(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const [numRaw, denRaw] = value.split("/");
  const num = Number(numRaw);
  const den = Number(denRaw);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    return null;
  }
  const fps = num / den;
  if (!Number.isFinite(fps) || fps <= 0) {
    return null;
  }
  return fps;
}

function parsePositiveNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const out = Number(value);
  if (!Number.isFinite(out) || out <= 0) {
    return null;
  }
  return out;
}

function pickVideoStream(output: FfprobeOutput): FfprobeStream | null {
  const streams = output.streams ?? [];
  for (const stream of streams) {
    if (stream.codec_type === "video") {
      return stream;
    }
  }
  return null;
}

export async function probeMetadata(videoPath: string, fileSize: number): Promise<ProbeMetadata> {
  const output = await runFfprobe([
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    videoPath
  ]);

  const stream = pickVideoStream(output);
  const durationFromFormat = parsePositiveNumber(output.format?.duration);
  const durationFromStream = parsePositiveNumber(stream?.duration);

  return {
    video_width: stream?.width ?? null,
    video_height: stream?.height ?? null,
    source_fps: parseRational(stream?.avg_frame_rate) ?? parseRational(stream?.r_frame_rate),
    duration_sec: durationFromFormat ?? durationFromStream,
    file_size_bytes: fileSize,
    video_codec: stream?.codec_name ?? null,
    pixel_format: stream?.pix_fmt ?? null
  };
}

export async function buildTimeline(
  videoId: string,
  videoPath: string,
  sourceFps: number | null,
  durationSec: number | null
): Promise<TimelineJson> {
  const output = await runFfprobe([
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "frame=pts_time,key_frame",
    "-of",
    "json",
    videoPath
  ]);

  const frames = output.frames ?? [];
  if (frames.length === 0) {
    throw new HttpError(422, "TIMELINE_INVALID", "No frames available for timeline generation.");
  }

  const timelineFrames: TimelineJson["frames"] = [];
  let prevPtsUs = -1;

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (!frame.pts_time) {
      throw new HttpError(422, "TIMELINE_INVALID", "Frame is missing pts_time.", {
        frameIndex: index
      });
    }

    const ptsUs = Math.round(Number(frame.pts_time) * 1_000_000);
    if (!Number.isFinite(ptsUs) || ptsUs < 0) {
      throw new HttpError(422, "TIMELINE_INVALID", "Frame pts_time is invalid.", {
        frameIndex: index,
        ptsTime: frame.pts_time
      });
    }

    if (ptsUs < prevPtsUs) {
      throw new HttpError(422, "TIMELINE_INVALID", "Frame pts_us is not monotonic.", {
        frameIndex: index,
        ptsUs,
        prevPtsUs
      });
    }

    prevPtsUs = ptsUs;

    timelineFrames.push({
      frameId: `f_${String(index + 1).padStart(6, "0")}`,
      displayIndex: index + 1,
      ptsUs,
      isKeyframe: frame.key_frame === 1
    });
  }

  const inferredDurationUs = Math.max(0, prevPtsUs);
  const computedDurationUs = durationSec ? Math.round(durationSec * 1_000_000) : inferredDurationUs;

  return {
    schemaVersion: "1.0",
    videoId,
    durationUs: Math.max(inferredDurationUs, computedDurationUs),
    sourceFps,
    frames: timelineFrames
  };
}

// Per-video mutex to avoid concurrent ffmpeg processes for the same video
const thumbLocks = new Map<string, Promise<void>>();

export async function extractThumb(videoId: string, sourcePath: string): Promise<void> {
  const existing = thumbLocks.get(videoId);
  if (existing) {
    return existing;
  }

  const work = (async () => {
    const outPath = thumbPath(videoId);
    if (existsSync(outPath)) return;

    await mkdir(videoDir(videoId), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", [
        "-ss", "0",
        "-i", sourcePath,
        "-frames:v", "1",
        "-vf", "scale=128:72",
        "-q:v", "3",
        "-y",
        outPath
      ], { stdio: ["ignore", "ignore", "pipe"] });

      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
        } else {
          resolve();
        }
      });
    });
  })().finally(() => {
    thumbLocks.delete(videoId);
  });

  thumbLocks.set(videoId, work);
  return work;
}
