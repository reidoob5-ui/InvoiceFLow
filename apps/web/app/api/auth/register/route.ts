import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(10).max(72),
  organizationName: z.string().trim().min(2).max(100),
});

function makeSlug(value: string) {
  const base = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace";
  return `${base}-${randomSuffix()}`;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos. Confirma nome, email, palavra-passe (mínimo 10 caracteres) e empresa." }, { status: 400 });
  }

  const { name, email, password, organizationName } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "Não foi possível criar a conta com estes dados." }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { name, email, passwordHash } });
    await tx.organization.create({
      data: {
        name: organizationName,
        slug: makeSlug(organizationName),
        memberships: { create: { userId: created.id, role: "OWNER" } },
      },
    });
    return created;
  });

  await createSession(user.id);
  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } }, { status: 201 });
}
