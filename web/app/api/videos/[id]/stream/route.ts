import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { NextRequest, NextResponse } from "next/server";

import { HttpError } from "@/server/errors";
import { error, requestIdOf } from "@/server/response";
import { asErrorResponse } from "@/server/route-error";
import { sourceVideoPath } from "@/server/video-files";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseRangeHeader(rangeHeader: string, size: number): { start: number; end: number } {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    throw new HttpError(416, "RANGE_NOT_SATISFIABLE", "Invalid range header.");
  }

  const [, startRaw, endRaw] = match;
  const start = startRaw ? Number.parseInt(startRaw, 10) : 0;
  const end = endRaw ? Number.parseInt(endRaw, 10) : size - 1;

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    throw new HttpError(416, "RANGE_NOT_SATISFIABLE", "Requested range not satisfiable.");
  }

  return {
    start,
    end: Math.min(end, size - 1)
  };
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    assertUuidV7(id);

    const filePath = sourceVideoPath(id);
    const fileStat = await stat(filePath);
    const size = fileStat.size;

    const rangeHeader = req.headers.get("range");
    if (!rangeHeader) {
      const stream = createReadStream(filePath);
      return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(size),
          "Accept-Ranges": "bytes"
        }
      });
    }

    const { start, end } = parseRangeHeader(rangeHeader, size);
    const chunkSize = end - start + 1;
    const stream = createReadStream(filePath, { start, end });

    return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(chunkSize),
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${size}`
      }
    });
  } catch (err) {
    if (err instanceof HttpError && err.status === 416) {
      const requestId = requestIdOf(req);
      return error(requestId, 416, "RANGE_NOT_SATISFIABLE", err.message);
    }
    return asErrorResponse(req, err);
  }
}
