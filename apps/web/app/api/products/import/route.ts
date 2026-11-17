import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession, audit } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { parseCsv } from "@/lib/csv";

export const runtime = "nodejs";
const clean = (v:string|undefined,max:number)=>(v??"").trim().slice(0,max);
const numeric = (v:string|undefined, fallback:number)=>v===undefined||v.trim()===""?fallback:Number(v);
export async function POST(request:NextRequest){
 const current=await getCurrentSession();
 if(!current)return NextResponse.json({error:"Não autenticado."},{status:401});
 if(!current.membership)return NextResponse.json({error:"Selecciona uma empresa."},{status:409});
 try{assertCan(current.membership.role,"products:write");}catch(error){if(error instanceof ForbiddenError)return NextResponse.json({error:"Sem permissão."},{status:403});throw error;}
 const form=await request.formData(),file=form.get("file");
 if(!(file instanceof File))return NextResponse.json({error:"Envia um ficheiro CSV."},{status:400});
 if(file.size>1_000_000)return NextResponse.json({error:"O ficheiro não pode exceder 1 MB."},{status:413});
 const matrix=parseCsv(await file.text());
 if(matrix.length<2)return NextResponse.json({error:"O CSV não contém linhas para importar."},{status:400});
 const headers=matrix[0].map(h=>h.trim().toLowerCase());
 if(!headers.includes("name")||!headers.includes("unitprice"))return NextResponse.json({error:"As colunas 'name' e 'unitPrice' são obrigatórias."},{status:400});
 const valid:Array<{organizationId:string;name:string;type:"PRODUCT"|"SERVICE";sku:string|null;description:string|null;unitPrice:number;costPrice:number;taxRate:number;currency:string;trackStock:boolean;stockQty:number;lowStockThreshold:number}>=[];
 let skipped=0;
 for(const row of matrix.slice(1).slice(0,500)){
  const d=Object.fromEntries(headers.map((h,i)=>[h,row[i]??""])) as Record<string,string>;
  const name=clean(d.name,160),unitPrice=numeric(d.unitprice,NaN),costPrice=numeric(d.costprice,0),taxRate=numeric(d.taxrate,0),stockQty=numeric(d.stockqty,0),lowStockThreshold=numeric(d.lowstockthreshold,0);
  if(name.length<2||![unitPrice,costPrice,taxRate,stockQty,lowStockThreshold].every(Number.isFinite)||unitPrice<0||costPrice<0||taxRate<0||taxRate>100||stockQty<0||lowStockThreshold<0){skipped++;continue;}
  valid.push({organizationId:current.membership.organizationId,name,type:d.type?.toUpperCase()==="SERVICE"?"SERVICE":"PRODUCT",sku:clean(d.sku,80)||null,description:clean(d.description,1000)||null,unitPrice,costPrice,taxRate,currency:clean(d.currency,3).toUpperCase()||current.membership.organization.currency,trackStock:["true","1","yes","sim"].includes((d.trackstock??"").toLowerCase()),stockQty,lowStockThreshold});
 }
 if(matrix.length-1>500)skipped+=matrix.length-1-500;
 const result=valid.length?await prisma.product.createMany({data:valid,skipDuplicates:true}):{count:0};
 skipped+=valid.length-result.count;
 if(result.count)await audit({action:"product.csv_imported",userId:current.user.id,organizationId:current.membership.organizationId,entityType:"Product",entityId:null});
 return NextResponse.json({imported:result.count,skipped});
}
