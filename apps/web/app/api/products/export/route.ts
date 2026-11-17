import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";
export async function GET() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error:"Não autenticado." }, { status:401 });
  if (!current.membership) return NextResponse.json({ error:"Selecciona uma empresa." }, { status:409 });
  try { assertCan(current.membership.role,"products:read"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error:"Sem permissão." }, { status:403 });
    throw error;
  }
  const rows = await prisma.product.findMany({ where:{organizationId:current.membership.organizationId,archivedAt:null},orderBy:{name:"asc"},select:{name:true,type:true,sku:true,description:true,unitPrice:true,costPrice:true,taxRate:true,currency:true,trackStock:true,stockQty:true,lowStockThreshold:true} });
  const csv = toCsv(["name","type","sku","description","unitPrice","costPrice","taxRate","currency","trackStock","stockQty","lowStockThreshold"],rows.map(x=>[x.name,x.type,x.sku,x.description,x.unitPrice.toString(),x.costPrice.toString(),x.taxRate.toString(),x.currency,x.trackStock,x.stockQty.toString(),x.lowStockThreshold.toString()]));
  return new NextResponse(csv,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":'attachment; filename="invoiceflow-products.csv"',"cache-control":"no-store"}});
}
