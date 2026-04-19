import { NextRequest, NextResponse } from "next/server";

import { getAdminCredentialFromEnv } from "@/server/auth-basic";
import { safeStringEqual, SESSION_COOKIE, signSession } from "@/server/auth-session";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { message: "請求格式錯誤" } },
      { status: 400 }
    );
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { ok: false, error: { message: "請求格式錯誤" } },
      { status: 400 }
    );
  }

  const { username, password } = body as Record<string, unknown>;

  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return NextResponse.json(
      { ok: false, error: { message: "請填寫使用者名稱與密碼" } },
      { status: 400 }
    );
  }

  const creds = getAdminCredentialFromEnv();

  // Constant-time comparison to prevent timing attacks
  const usernameOk = safeStringEqual(username, creds.user);
  const passwordOk = safeStringEqual(password, creds.password);

  if (!usernameOk || !passwordOk) {
    return NextResponse.json(
      { ok: false, error: { message: "使用者名稱或密碼不正確" } },
      { status: 401 }
    );
  }

  const token = signSession(username);
  const res = NextResponse.json({ ok: true, data: { user: username } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 24 * 60 * 60,
  });
  return res;
}
