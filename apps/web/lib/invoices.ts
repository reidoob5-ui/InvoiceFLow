import { computeTotals, type LineInput } from "@/lib/invoice-calc";
import { D } from "@/lib/money";
import { prisma } from "@/lib/db";

export class InvoiceInputError extends Error {}

export async function prepareInvoiceLines(input: unknown, organizationId: string, currency?: string) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) {
    throw new InvoiceInputError("Adiciona entre 1 e 100 linhas à factura.");
  }
  const productIds = [...new Set(input.map((line) => line?.productId).filter((id): id is string => typeof id === "string" && id.length > 0))];
  const taxIds = [...new Set(input.map((line) => line?.taxRateId).filter((id): id is string => typeof id === "string" && id.length > 0))];
  const products = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds }, organizationId, archivedAt: null } }) : [];
  if (products.length !== productIds.length) throw new InvoiceInputError("Um ou mais produtos não existem ou não pertencem a esta empresa.");
  if (currency && products.some((p) => p.currency !== currency)) throw new InvoiceInputError("A moeda da factura deve corresponder à moeda de cada produto do catálogo. Actualiza o produto ou escolhe outra moeda.");
  const productTaxIds = products.map((p) => p.taxRateId).filter((id): id is string => !!id);
  const allTaxIds = [...new Set([...taxIds, ...productTaxIds])];
  const taxes = allTaxIds.length ? await prisma.taxRate.findMany({ where: { id: { in: allTaxIds }, organizationId, active: true } }) : [];
  if (taxes.length !== allTaxIds.length) throw new InvoiceInputError("Uma ou mais taxas não existem ou estão inactivas.");
  const productMap = new Map(products.map((p) => [p.id, p]));
  const taxMap = new Map(taxes.map((t) => [t.id, t]));
  const prepared = input.map((raw, index) => {
    const product = raw?.productId ? productMap.get(raw.productId) : undefined;
    const taxId = typeof raw?.taxRateId === "string" && raw.taxRateId ? raw.taxRateId : product?.taxRateId ?? null;
    const tax = taxId ? taxMap.get(taxId) : undefined;
    if (taxId && !tax) throw new InvoiceInputError(`A taxa da linha ${index + 1} não está activa ou não pertence à empresa.`);
    const description = product?.name ?? (typeof raw?.description === "string" ? raw.description.trim().slice(0, 500) : "");
    const quantity = Number(raw?.quantity);
    const unitPrice = product ? Number(product.unitPrice) : Number(raw?.unitPrice);
    const discountPercent = Number(raw?.discountPercent ?? 0);
    if (!description || description.length < 2) throw new InvoiceInputError(`A descrição da linha ${index + 1} é obrigatória.`);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000) throw new InvoiceInputError(`Quantidade inválida na linha ${index + 1}.`);
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000000000) throw new InvoiceInputError(`Preço inválido na linha ${index + 1}.`);
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) throw new InvoiceInputError(`Desconto inválido na linha ${index + 1}.`);
    return {
      productId: product?.id ?? null, description, quantity: String(quantity), unitPrice: String(unitPrice),
      discountPercent: String(discountPercent), taxRate: String(tax ? Number(tax.rate) : 0), taxName: tax?.name ?? null,
      taxRateId: tax?.id ?? null,
    };
  });
  return prepared;
}

export function calculatePreparedLines(lines: Awaited<ReturnType<typeof prepareInvoiceLines>>, withholdingRate = 0) {
  const totals = computeTotals(lines as LineInput[], { withholdingRate });
  return {
    lines: lines.map((line, index) => ({
      productId: line.productId, position: index, description: line.description,
      quantity: D(line.quantity).toString(), unitPrice: D(line.unitPrice).toString(),
      discountPercent: D(line.discountPercent).toString(), taxRate: D(line.taxRate).toString(),
      taxName: line.taxName, lineTotal: totals.lines[index].net.toFixed(2),
    })),
    subtotal: totals.subtotal.toFixed(2), discountTotal: totals.discountTotal.toFixed(2),
    taxTotal: totals.taxTotal.toFixed(2), withholdingTotal: totals.withholdingTotal.toFixed(2),
    total: totals.total.toFixed(2),
  };
}
