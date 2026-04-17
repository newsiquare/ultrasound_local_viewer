import { NextRequest, NextResponse } from "next/server";

import { HttpError, isHttpError } from "@/server/errors";
import { error, requestIdOf } from "@/server/response";

export function asErrorResponse(req: NextRequest, err: unknown): NextResponse {
  const requestId = requestIdOf(req);
  if (isHttpError(err)) {
    return error(requestId, err.status, err.code, err.message, err.details);
  }

  const enoent = err as NodeJS.ErrnoException;
  if (enoent?.code === "ENOENT") {
    return error(requestId, 404, "NOT_FOUND", "Requested resource not found.");
  }

  const fallback = err instanceof Error ? err.message : "Unexpected server error.";
  return error(requestId, 500, "INTERNAL_ERROR", fallback);
}

export function ensure(condition: unknown, err: HttpError): asserts condition {
  if (!condition) {
    throw err;
  }
}
