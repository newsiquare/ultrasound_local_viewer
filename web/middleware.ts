import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "admin_session";

function b64urlToBytes(b64url: string): Uint8Array {
  const std = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = std + "=".repeat((4 - (std.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function verifySessionEdge(token: string): Promise<string | null> {
  const secret = process.env.SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? "local-dev-secret";
  const dot = token.indexOf(".");
  if (dot < 0) return null;

  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = b64urlToBytes(sig);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(b64));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(b64))) as unknown;
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

function isAuthorizedByBasic(req: NextRequest): boolean {
  const header = req.headers.get("authorization");
  if (!header) return false;

  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "basic") return false;

  try {
    const decoded = atob(token);
    const idx = decoded.indexOf(":");
    if (idx < 0) return false;
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    const expectedUser = process.env.ADMIN_USER ?? "admin";
    const expectedPassword = process.env.ADMIN_PASSWORD ?? "change-me";
    return user === expectedUser && pass === expectedPassword;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  // Check session cookie first
  const cookie = req.cookies.get(SESSION_COOKIE);
  if (cookie) {
    const user = await verifySessionEdge(cookie.value);
    if (user) return NextResponse.next();
  }

  // Fall back to Basic Auth for programmatic / legacy access
  if (isAuthorizedByBasic(req)) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { ok: false, error: { message: "未登入" } },
    { status: 401 }
  );
}

export const config = {
  matcher: ["/api/admin/file/:path*"]
};
