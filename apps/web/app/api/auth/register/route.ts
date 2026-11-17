import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, checkPasswordStrength } from "@/lib/auth/password";
import { createSession, audit } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      return NextResponse.json({ error: "Nome e e-mail válidos são obrigatórios." }, { status: 400 });
    const issues = checkPasswordStrength(password);
    if (issues.length) return NextResponse.json({ error: "A palavra-passe não cumpre os requisitos.", issues }, { status: 400 });
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return NextResponse.json({ error: "Não foi possível criar a conta com estes dados." }, { status: 409 });
    const user = await prisma.user.create({ data: { name, email, passwordHash: await hashPassword(password) }, select: { id: true, name: true, email: true } });
    await createSession(user.id);
    await audit({ action: "auth.register", userId: user.id, entityType: "User", entityId: user.id });
    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Não foi possível concluir o registo." }, { status: 500 });
  }
}
