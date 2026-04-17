import { rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES } from "@/server/constants";
import { ensureDatabase } from "@/server/db";
import { HttpError } from "@/server/errors";
import { buildTimeline, probeMetadata } from "@/server/ffprobe";
import { ok } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import {
  ensureVideoDirectory,
  fileSizeBytes,
  removeVideoAssets,
  sourceVideoPath,
  writeMetadata,
  writeTimeline
} from "@/server/video-files";
import { createVideoRecordWithAiIdle } from "@/server/video-repository";
import { uuidv7 } from "@/server/uuidv7";
import { normalizeUploadFilename } from "@/server/validators";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let videoId: string | null = null;

  try {
    await ensureDatabase();

    const form = await req.formData();
    const fileEntry = form.get("file");

    if (!(fileEntry instanceof File)) {
      throw new HttpError(400, "BAD_REQUEST", "Missing upload file field: file");
    }

    const filename = normalizeUploadFilename(fileEntry.name);
    const extension = path.extname(filename).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(fileEntry.type)) {
      throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Unsupported video format.", {
        filename,
        mimeType: fileEntry.type
      });
    }

    videoId = uuidv7();
    await ensureVideoDirectory(videoId);

    const sourcePath = sourceVideoPath(videoId);
    const tempPath = `${sourcePath}.part`;

    const bytes = Buffer.from(await fileEntry.arrayBuffer());

    if (req.signal.aborted) {
      throw new HttpError(499, "UPLOAD_CANCELED", "Upload canceled by client.");
    }

    await writeFile(tempPath, bytes);

    if (req.signal.aborted) {
      throw new HttpError(499, "UPLOAD_CANCELED", "Upload canceled by client.");
    }

    await rename(tempPath, sourcePath);

    const size = await fileSizeBytes(sourcePath);
    const metadata = await probeMetadata(sourcePath, size);
    const timeline = await buildTimeline(videoId, sourcePath, metadata.source_fps, metadata.duration_sec);

    await writeMetadata(videoId, metadata);
    await writeTimeline(videoId, timeline);

    const uploadedAt = new Date().toISOString();

    await createVideoRecordWithAiIdle({
      id: videoId,
      filename,
      localPath: sourcePath,
      uploadedAt,
      durationSec: metadata.duration_sec,
      sourceFps: metadata.source_fps,
      videoWidth: metadata.video_width,
      videoHeight: metadata.video_height,
      fileSizeBytes: metadata.file_size_bytes,
      videoCodec: metadata.video_codec,
      pixelFormat: metadata.pixel_format,
      timelineStatus: "READY",
      timelineError: null
    });

    return ok(
      {
        videoId,
        status: "READY",
        metadata: {
          videoWidth: metadata.video_width,
          videoHeight: metadata.video_height,
          sourceFps: metadata.source_fps,
          durationSec: metadata.duration_sec,
          videoCodec: metadata.video_codec
        }
      },
      201
    );
  } catch (err) {
    if (videoId) {
      await removeVideoAssets(videoId);
    }
    return asErrorResponse(req, err);
  }
}
