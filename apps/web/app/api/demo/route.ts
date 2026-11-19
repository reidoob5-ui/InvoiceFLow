import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, createSession, getClientIp } from "@/lib/auth/session";
import { ensureDemo } from "@/lib/demo";

export const runtime = "nodejs";
export const maxDuration = 40;

/** Opens a read-only session on a shared demo company filled with fictional data. */
export async function GET(request: NextRequest) {
  try {
    const ip = await getClientIp();
    if (ip) {
      const recent = await prisma.auditLog.count({
        where: { action: "demo.start", ip, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
      });
      if (recent >= 30) return NextResponse.json({ error: "Demasiados acessos à demonstração. Tenta mais tarde." }, { status: 429 });
    }
    const { userId, organizationId } = await ensureDemo();
    await createSession(userId, organizationId);
    await audit({ action: "demo.start", userId, organizationId });
    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error) {
    console.error("[demo]", error instanceof Error ? `${error.name}: ${error.message}` : error);
    return NextResponse.json({ error: "Não foi possível abrir a demonstração agora." }, { status: 500 });
  }
}
