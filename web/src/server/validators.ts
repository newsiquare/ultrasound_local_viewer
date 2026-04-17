import path from "node:path";

import { HttpError } from "@/server/errors";

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function assertUuidV7(id: string): void {
  if (!UUID_V7_PATTERN.test(id)) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid video id format.", { id });
  }
}

export function normalizeUploadFilename(filename: string): string {
  const basename = path.basename(filename || "").trim();
  if (!basename) {
    throw new HttpError(400, "BAD_REQUEST", "Filename is empty.");
  }
  if (basename.length > 255) {
    throw new HttpError(400, "BAD_REQUEST", "Filename is too long.");
  }
  return basename;
}

export function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid integer query parameter.", {
      value
    });
  }
  return Math.min(parsed, max);
}
