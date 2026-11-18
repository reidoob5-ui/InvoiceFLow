import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "invoiceflow_session";
const SESSION_DAYS = 30;

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getClientIp() {
  const headerStore = await headers();
  return headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || headerStore.get("x-real-ip")?.trim() || null;
}

export async function createSession(userId: string, activeOrganizationId?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const headerStore = await headers();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      activeOrganizationId: activeOrganizationId ?? null,
      userAgent: headerStore.get("user-agent")?.slice(0, 500),
      ip: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", expires: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
  });
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { select: { id: true, name: true, email: true, locale: true, status: true, isPlatformAdmin: true, twoFactorEnabled: true } } },
  });
  if (!session || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") return null;
  await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  const membership = session.activeOrganizationId
    ? await prisma.membership.findFirst({
        where: { userId: session.userId, organizationId: session.activeOrganizationId, status: "ACTIVE", organization: { status: "ACTIVE" } },
        include: { organization: { select: { id: true, name: true, slug: true, currency: true, locale: true, timezone: true } } },
      })
    : null;
  return { session, user: session.user, membership };
}

export async function audit(input: {
  action: string; userId?: string | null; organizationId?: string | null;
  entityType?: string | null; entityId?: string | null; metadata?: Record<string, unknown>;
}) {
  const headerStore = await headers();
  await prisma.auditLog.create({
    data: {
      action: input.action, userId: input.userId ?? null, organizationId: input.organizationId ?? null,
      entityType: input.entityType ?? null, entityId: input.entityId ?? null,
      metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
      ip: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });
}
