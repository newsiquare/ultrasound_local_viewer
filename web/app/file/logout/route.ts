import { NextResponse } from "next/server";

import { unauthorizedBasic } from "@/server/auth-basic";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return unauthorizedBasic();
}
