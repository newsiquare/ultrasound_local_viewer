export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code:
      | "BAD_REQUEST"
      | "NOT_FOUND"
      | "UNSUPPORTED_MEDIA_TYPE"
      | "UPLOAD_CANCELED"
      | "RANGE_NOT_SATISFIABLE"
      | "TIMELINE_INVALID"
      | "CONFLICT"
      | "INTERNAL_ERROR",
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
