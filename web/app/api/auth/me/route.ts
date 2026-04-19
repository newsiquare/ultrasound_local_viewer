import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/server/auth-session";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get(SESSION_COOKIE);
  const user = cookie ? verifySession(cookie.value) : null;

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { message: "未登入" } },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true, data: { user } });
}
