import { NextRequest, NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/server/constants";
import { uuidv7 } from "@/server/uuidv7";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "UPLOAD_CANCELED"
  | "RANGE_NOT_SATISFIABLE"
  | "TIMELINE_INVALID"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export function requestIdOf(req: NextRequest): string {
  return req.headers.get(REQUEST_ID_HEADER) ?? `req_${uuidv7()}`;
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function error(
  requestId: string,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        details
      },
      requestId
    },
    { status }
  );
}
