import { NextRequest, NextResponse } from "next/server";

const BASIC_REALM = 'Basic realm="File Admin"';

function unauthorized(): NextResponse {
  return new NextResponse("Unauthorized", {
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
    const decoded = atob(token);
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

function isAuthorized(req: NextRequest): boolean {
  const provided = parseAuthorizationHeader(req.headers.get("authorization"));
  if (!provided) {
    return false;
  }

  const expectedUser = process.env.ADMIN_USER ?? "admin";
  const expectedPassword = process.env.ADMIN_PASSWORD ?? "change-me";
  return provided.user === expectedUser && provided.password === expectedPassword;
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (pathname === "/file/logout") {
    return unauthorized();
  }

  if (!isAuthorized(req)) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/file/:path*", "/api/admin/file/:path*"]
};
