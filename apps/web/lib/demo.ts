import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const DEMO_EMAIL = "demo@invoiceflow.app";
export const DEMO_SLUG = "demo-comercio";
const REFRESH_AFTER_DAYS = 21;
const DAY = 24 * 60 * 60 * 1000;

// Deterministic pseudo-random so the demo always looks the same shape.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r2 = (n: number) => Math.round(n * 100) / 100;

const CLIENTS = [
  ["Mercado Bom Preço, Lda", "COMPANY", "Luanda"], ["Construtora Kilamba, SA", "COMPANY", "Luanda"],
  ["Clínica Vida Nova", "COMPANY", "Talatona"], ["Escola Futuro Brilhante", "COMPANY", "Viana"],
  ["Transportes Luanda Express", "COMPANY", "Luanda"], ["Restaurante Sabor da Terra", "COMPANY", "Benguela"],
  ["Hotel Marginal Sul", "COMPANY", "Lobito"], ["Tech Angola Solutions", "COMPANY", "Luanda"],
] as const;
const PRODUCTS = [
  ["Consultoria mensal", "SERVICE", 150000], ["Instalação de sistema", "SERVICE", 280000],
  ["Suporte técnico (hora)", "SERVICE", 25000], ["Licença de software (anual)", "PRODUCT", 420000],
  ["Kit de material de escritório", "PRODUCT", 35000],
] as const;
const SUPPLIERS = ["Imobiliária Central", "Angola Telecom Serviços", "Distribuidora Papelaria Norte", "Agência Criativa Mais"];
const EXPENSES = [
  ["Renda do escritório", 300000], ["Electricidade e internet", 85000], ["Combustível", 60000], ["Marketing digital", 120000], ["Salários", 800000],
] as const;

export async function ensureDemo() {
  const existing = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
    select: { id: true, memberships: { select: { organizationId: true, organization: { select: { createdAt: true } } }, take: 1 } },
  });
  const membership = existing?.memberships[0];
  if (existing && membership) {
    const age = Date.now() - membership.organization.createdAt.getTime();
    if (age < REFRESH_AFTER_DAYS * DAY) return { userId: existing.id, organizationId: membership.organizationId };
    await wipeDemoOrganization(membership.organizationId);
    return seed(existing.id);
  }
  const user = existing ?? await prisma.user.create({
    data: { email: DEMO_EMAIL, name: "Utilizador Demo", status: "ACTIVE", emailVerifiedAt: new Date() },
    select: { id: true },
  }).catch(async (error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL }, select: { id: true } });
    throw error;
  });
  return seed(user.id);
}

async function wipeDemoOrganization(organizationId: string) {
  // Invoices/bills reference clients/suppliers with RESTRICT, so remove them first.
  await prisma.$transaction([
    prisma.payment.deleteMany({ where: { organizationId } }),
    prisma.invoice.deleteMany({ where: { organizationId } }),
    prisma.expense.deleteMany({ where: { organizationId } }),
    prisma.bill.deleteMany({ where: { organizationId } }),
    prisma.organization.delete({ where: { id: organizationId } }),
  ]);
}

async function seed(userId: string) {
  const existingOrg = await prisma.organization.findUnique({ where: { slug: DEMO_SLUG }, select: { id: true } });
  if (existingOrg) {
    const linked = await prisma.membership.findFirst({ where: { userId, organizationId: existingOrg.id }, select: { id: true } });
    if (!linked) await prisma.membership.create({ data: { userId, organizationId: existingOrg.id, role: "VIEWER", status: "ACTIVE" } });
    return { userId, organizationId: existingOrg.id };
  }
  const plan = await prisma.plan.findFirst({ where: { key: "business" }, select: { id: true } })
    ?? await prisma.plan.findFirst({ orderBy: { sortOrder: "desc" }, select: { id: true } });
  const rand = rng(20261119);
  const now = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: "Demo Comércio, Lda", slug: DEMO_SLUG, legalName: "Demo Comércio, Lda", taxId: "5000000000", email: "geral@demo.example",
          phone: "+244 900 000 000", city: "Luanda", country: "AO", currency: "AOA", timezone: "Africa/Luanda", locale: "pt",
          invoicePrefix: "FT", defaultPaymentTerms: 30,
        },
        select: { id: true },
      });
      const organizationId = org.id;
      await tx.membership.create({ data: { userId, organizationId, role: "VIEWER", status: "ACTIVE" } });
      if (plan) await tx.subscription.create({
        data: { organizationId, planId: plan.id, status: "ACTIVE", currentPeriodEnd: new Date(now.getTime() + 3650 * DAY) },
      });

      const clients = await Promise.all(CLIENTS.map(([name, type, city], i) => tx.client.create({
        data: {
          organizationId, name, type, city, country: "AO", currency: "AOA",
          email: `contacto${i + 1}@cliente-demo.example`, phone: `+244 92${i} 000 00${i}`, taxId: `54170000${i}1`,
        },
        select: { id: true },
      })));
      const products = await Promise.all(PRODUCTS.map(([name, type, unitPrice]) => tx.product.create({
        data: { organizationId, name, type, unitPrice, currency: "AOA", taxRate: 14 },
        select: { id: true, name: true, unitPrice: true },
      })));
      const suppliers = await Promise.all(SUPPLIERS.map((name, i) => tx.supplier.create({
        data: { organizationId, name, country: "AO", email: `fornecedor${i + 1}@demo.example` },
        select: { id: true },
      })));

      let seq = 0;
      for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo--) {
        const count = 4 + Math.floor(rand() * 3);
        for (let k = 0; k < count; k++) {
          const issue = new Date(now.getTime() - monthsAgo * 30 * DAY - Math.floor(rand() * 26) * DAY);
          if (issue > now) issue.setTime(now.getTime() - DAY);
          const due = new Date(issue.getTime() + 30 * DAY);
          const lineCount = 1 + Math.floor(rand() * 3);
          const lines = Array.from({ length: lineCount }, (_, i) => {
            const product = products[Math.floor(rand() * products.length)];
            const quantity = 1 + Math.floor(rand() * 3);
            const unitPrice = Number(product.unitPrice);
            return { productId: product.id, position: i, description: product.name, quantity, unitPrice, discountPercent: 0, taxRate: 14, taxName: "IVA 14%", lineTotal: r2(quantity * unitPrice) };
          });
          const subtotal = r2(lines.reduce((s, l) => s + l.lineTotal, 0));
          const taxTotal = r2(subtotal * 0.14);
          const total = r2(subtotal + taxTotal);
          const age = (now.getTime() - issue.getTime()) / DAY;
          const roll = rand();
          let status: "PAID" | "PARTIALLY_PAID" | "ISSUED" | "OVERDUE" = "ISSUED";
          if (age > 35) status = roll < 0.88 ? "PAID" : "OVERDUE";
          else status = roll < 0.4 ? "PAID" : roll < 0.6 ? "PARTIALLY_PAID" : "ISSUED";
          if ((status === "ISSUED" || status === "PARTIALLY_PAID") && due < now) status = "OVERDUE";
          const amountPaid = status === "PAID" ? total : status === "PARTIALLY_PAID" ? r2(total * 0.5) : 0;
          seq += 1;
          const client = clients[Math.floor(rand() * clients.length)];
          const invoice = await tx.invoice.create({
            data: {
              organizationId, clientId: client.id, number: `FT ${issue.getUTCFullYear()}/${String(seq).padStart(4, "0")}`, status, currency: "AOA",
              issueDate: issue, dueDate: due, paymentTermsDays: 30, subtotal, taxTotal, total, amountPaid, sentAt: issue,
              lines: { create: lines },
            },
            select: { id: true },
          });
          if (amountPaid > 0) {
            const received = new Date(Math.min(now.getTime() - 3600_000, issue.getTime() + (3 + Math.floor(rand() * 14)) * DAY));
            await tx.payment.create({
              data: {
                organizationId, invoiceId: invoice.id, clientId: client.id, amount: amountPaid, currency: "AOA", status: "CONFIRMED",
                method: rand() < 0.6 ? "BANK_TRANSFER" : rand() < 0.5 ? "MOBILE_MONEY" : "CASH", receivedAt: received, receiptNumber: `RC ${String(seq).padStart(4, "0")}`,
              },
            });
          }
        }
      }

      for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo--) {
        for (const [description, amount] of EXPENSES) {
          const date = new Date(now.getTime() - monthsAgo * 30 * DAY - Math.floor(rand() * 10) * DAY);
          await tx.expense.create({
            data: {
              organizationId, description, amount: r2(amount * (0.9 + rand() * 0.2)), currency: "AOA", date: date > now ? now : date,
              status: "PAID", paymentMethod: "BANK_TRANSFER", supplierId: suppliers[Math.floor(rand() * suppliers.length)].id,
            },
          });
        }
      }
      const bills = [[-12, 180000], [3, 250000], [9, 96000], [20, 410000]] as const;
      for (const [offset, total] of bills) {
        const due = new Date(now.getTime() + offset * DAY);
        await tx.bill.create({
          data: {
            organizationId, supplierId: suppliers[Math.floor(rand() * suppliers.length)].id, number: `FF-${Math.floor(1000 + rand() * 8999)}`,
            issueDate: new Date(due.getTime() - 30 * DAY), dueDate: due, currency: "AOA", total, amountPaid: 0, status: "OPEN",
          },
        });
      }
      return { userId, organizationId };
    }, { timeout: 25_000, maxWait: 10_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const org = await prisma.organization.findUniqueOrThrow({ where: { slug: DEMO_SLUG }, select: { id: true } });
      return { userId, organizationId: org.id };
    }
    throw error;
  }
}
