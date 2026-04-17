import { HttpError } from "@/server/errors";

export interface ManualBbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeCategoryName(input: unknown): string {
  if (typeof input !== "string") {
    throw new HttpError(400, "BAD_REQUEST", "Category name must be a string.");
  }
  const name = input.trim();
  if (name.length < 1 || name.length > 32) {
    throw new HttpError(400, "BAD_REQUEST", "Category name length must be 1~32.");
  }
  return name;
}

export function normalizeHexColor(input: unknown): string {
  if (typeof input !== "string") {
    throw new HttpError(400, "BAD_REQUEST", "Category color must be a string.");
  }
  const color = input.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new HttpError(400, "BAD_REQUEST", "Category color must be a hex value like #22C55E.");
  }
  return color.toUpperCase();
}

export function normalizeAnnotationFrameId(input: unknown): string {
  if (typeof input !== "string") {
    throw new HttpError(400, "BAD_REQUEST", "frameId must be a string.");
  }
  const frameId = input.trim();
  if (frameId.length < 1 || frameId.length > 64) {
    throw new HttpError(400, "BAD_REQUEST", "frameId length is invalid.");
  }
  return frameId;
}

export function normalizeEntityId(input: unknown, fieldName: string): string {
  if (typeof input !== "string") {
    throw new HttpError(400, "BAD_REQUEST", `${fieldName} must be a string.`);
  }
  const id = input.trim();
  if (id.length < 1 || id.length > 128) {
    throw new HttpError(400, "BAD_REQUEST", `${fieldName} is invalid.`);
  }
  return id;
}

function asFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, "BAD_REQUEST", `${field} must be a finite number.`);
  }
  return value;
}

export function normalizeManualBbox(input: unknown): ManualBbox {
  if (!input || typeof input !== "object") {
    throw new HttpError(400, "BAD_REQUEST", "bbox must be an object.");
  }

  const obj = input as Record<string, unknown>;
  const x = asFiniteNumber(obj.x, "bbox.x");
  const y = asFiniteNumber(obj.y, "bbox.y");
  const width = asFiniteNumber(obj.width, "bbox.width");
  const height = asFiniteNumber(obj.height, "bbox.height");

  if (width <= 0 || height <= 0) {
    throw new HttpError(400, "BAD_REQUEST", "bbox width/height must be > 0.");
  }

  return { x, y, width, height };
}

export function parseCursor(raw: string | null): number {
  if (!raw) {
    return 0;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, "BAD_REQUEST", "cursor must be a non-negative integer.");
  }
  return parsed;
}

export function parseLimit(raw: string | null, fallback: number, max: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HttpError(400, "BAD_REQUEST", "limit must be a positive integer.");
  }
  return Math.min(parsed, max);
}
