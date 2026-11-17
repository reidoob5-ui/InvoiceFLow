import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  currency: z.string().trim().length(3).default("USD"),
  timezone: z.string().trim().min(1).max(80).default("UTC"),
  locale: z.string().trim().min(2).max(12).default("en"),
});

function slugify(value: string) {
  const base = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace";
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json({
    organizations: user.memberships.map(({ organization, role }) => ({
      id: organization.id, name: organization.name, slug: organization.slug, role,
      currency: organization.currency, timezone: organization.timezone, locale: organization.locale,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados da empresa inválidos." }, { status: 400 });

  const organization = await prisma.organization.create({
    data: {
      ...parsed.data,
      currency: parsed.data.currency.toUpperCase(),
      slug: slugify(parsed.data.name),
      memberships: { create: { userId: user.id, role: "OWNER" } },
    },
    select: { id: true, name: true, slug: true, currency: true, timezone: true, locale: true },
  });

  return NextResponse.json({ organization }, { status: 201 });
}
