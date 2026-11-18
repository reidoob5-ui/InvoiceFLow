import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession, audit } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { parseCsv } from "@/lib/csv";
import { withOrganizationPlanLimit, planLimitResponse } from "@/lib/plan-access";

export const runtime = "nodejs";
const clean = (v: string | undefined, max: number) => (v ?? "").trim().slice(0,max);
export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error:"Não autenticado." }, { status:401 });
  if (!current.membership) return NextResponse.json({ error:"Selecciona uma empresa." }, { status:409 });
  try { assertCan(current.membership.role,"clients:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error:"Sem permissão." }, { status:403 });
    throw error;
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error:"Envia um ficheiro CSV." }, { status:400 });
  if (file.size > 1_000_000) return NextResponse.json({ error:"O ficheiro não pode exceder 1 MB." }, { status:413 });
  const matrix = parseCsv(await file.text());
  if (matrix.length < 2) return NextResponse.json({ error:"O CSV não contém linhas para importar." }, { status:400 });
  const headers = matrix[0].map(h => h.trim().toLowerCase());
  if (!headers.includes("name")) return NextResponse.json({ error:"A coluna obrigatória 'name' não foi encontrada." }, { status:400 });
  const valid: Array<{organizationId:string;name:string;type:"COMPANY"|"INDIVIDUAL";email:string|null;company:string|null;phone:string|null;taxId:string|null;country:string|null;city:string|null;currency:string|null}> = [];
  let skipped = 0;
  for (const row of matrix.slice(1).slice(0,500)) {
    const data = Object.fromEntries(headers.map((h,i)=>[h,row[i]??""])) as Record<string,string>;
    const name = clean(data.name,160);
    const email = clean(data.email,254).toLowerCase();
    if (name.length < 2 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) { skipped++; continue; }
    valid.push({ organizationId:current.membership.organizationId,name,type:data.type?.toUpperCase()==="INDIVIDUAL"?"INDIVIDUAL":"COMPANY",email:email||null,company:clean(data.company,160)||null,phone:clean(data.phone,40)||null,taxId:clean(data.taxid,80)||null,country:clean(data.country,2).toUpperCase()||null,city:clean(data.city,100)||null,currency:clean(data.currency,3).toUpperCase()||null });
  }
  if (matrix.length - 1 > 500) skipped += matrix.length - 1 - 500;
  if (valid.length) {
    const execution = await withOrganizationPlanLimit(current.membership.organizationId, "maxClients", valid.length, (tx) => tx.client.createMany({ data:valid }));
    if (!execution.allowed) return NextResponse.json(planLimitResponse(execution.result), { status: 402 });
  }
  if (valid.length) await audit({ action:"client.csv_imported",userId:current.user.id,organizationId:current.membership.organizationId,entityType:"Client",entityId:null });
  return NextResponse.json({ imported:valid.length,skipped });
}
