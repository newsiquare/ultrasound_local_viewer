import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "admin_session";
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSecret(): string {
  return process.env.SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? "local-dev-secret";
}

export function signSession(user: string): string {
  const payload = JSON.stringify({ user, exp: Date.now() + SESSION_EXPIRY_MS });
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifySession(token: string): string | null {
  const dot = token.indexOf(".");
  if (dot < 0) return null;

  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = createHmac("sha256", getSecret()).update(b64).digest("base64url");

  try {
    // Timing-safe comparison (pad to same length to avoid length leaks)
    const eBuf = Buffer.from(expected, "utf-8");
    const sBuf = Buffer.from(sig, "utf-8");
    if (eBuf.length !== sBuf.length || !timingSafeEqual(eBuf, sBuf)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8")) as unknown;
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as Record<string, unknown>).user !== "string" ||
      typeof (payload as Record<string, unknown>).exp !== "number"
    ) {
      return null;
    }
    const { user, exp } = payload as { user: string; exp: number };
    if (exp < Date.now()) return null;
    return user || null;
  } catch {
    return null;
  }
}

/**
 * Constant-time string comparison using HMAC to avoid timing attacks on variable-length inputs.
 */
export function safeStringEqual(a: string, b: string): boolean {
  const key = randomBytes(32);
  const hA = createHmac("sha256", key).update(a).digest();
  const hB = createHmac("sha256", key).update(b).digest();
  return timingSafeEqual(hA, hB);
}
