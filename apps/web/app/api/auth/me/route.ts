import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: current.user, activeOrganization: current.membership?.organization ?? null, role: current.membership?.role ?? null });
}
