import { NextRequest, NextResponse } from "next/server";

const BASIC_REALM = 'Basic realm="File Admin"';

export function getAdminCredentialFromEnv(): { user: string; password: string } {
  return {
    user: process.env.ADMIN_USER ?? "admin",
    password: process.env.ADMIN_PASSWORD ?? "change-me"
  };
}

export function unauthorizedBasic(message = "Unauthorized"): NextResponse {
  return new NextResponse(message, {
    status: 401,
    headers: {
      "WWW-Authenticate": BASIC_REALM
    }
  });
}

function parseAuthorizationHeader(header: string | null): { user: string; password: string } | null {
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "basic") {
    return null;
  }

  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return null;
    }

    return {
      user: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
}

export function isAuthorizedAdmin(req: NextRequest): boolean {
  const provided = parseAuthorizationHeader(req.headers.get("authorization"));
  if (!provided) {
    return false;
  }

  const expected = getAdminCredentialFromEnv();
  return provided.user === expected.user && provided.password === expected.password;
}
