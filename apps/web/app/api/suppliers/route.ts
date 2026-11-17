import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession, audit } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";

export const runtime = "nodejs";
export async function GET(request:NextRequest){
 const current=await getCurrentSession();
 if(!current)return NextResponse.json({error:"Não autenticado."},{status:401});
 if(!current.membership)return NextResponse.json({error:"Selecciona uma empresa."},{status:409});
 try{assertCan(current.membership.role,"suppliers:read");}catch(error){if(error instanceof ForbiddenError)return NextResponse.json({error:"Sem permissão."},{status:403});throw error;}
 const q=request.nextUrl.searchParams.get("q")?.trim().slice(0,100)??"";
 const suppliers=await prisma.supplier.findMany({where:{organizationId:current.membership.organizationId,archivedAt:null,...(q?{OR:[{name:{contains:q,mode:"insensitive"}},{email:{contains:q,mode:"insensitive"}},{taxId:{contains:q,mode:"insensitive"}}]}:{})},orderBy:{name:"asc"},take:200,select:{id:true,name:true,email:true,phone:true,taxId:true,country:true,address:true,notes:true,createdAt:true}});
 return NextResponse.json({suppliers});
}
export async function POST(request:NextRequest){
 const current=await getCurrentSession();
 if(!current)return NextResponse.json({error:"Não autenticado."},{status:401});
 if(!current.membership)return NextResponse.json({error:"Selecciona uma empresa."},{status:409});
 try{assertCan(current.membership.role,"suppliers:write");}catch(error){if(error instanceof ForbiddenError)return NextResponse.json({error:"Sem permissão."},{status:403});throw error;}
 const body=await request.json().catch(()=>null),name=typeof body?.name==="string"?body.name.trim().slice(0,160):"",email=typeof body?.email==="string"?body.email.trim().toLowerCase().slice(0,254):"";
 if(name.length<2)return NextResponse.json({error:"O nome deve ter pelo menos 2 caracteres."},{status:400});
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"E-mail inválido."},{status:400});
 const supplier=await prisma.supplier.create({data:{organizationId:current.membership.organizationId,name,email:email||null,phone:typeof body?.phone==="string"?body.phone.trim().slice(0,40)||null:null,taxId:typeof body?.taxId==="string"?body.taxId.trim().slice(0,80)||null:null,country:typeof body?.country==="string"?body.country.trim().slice(0,2).toUpperCase()||null:null,address:typeof body?.address==="string"?body.address.trim().slice(0,300)||null:null,notes:typeof body?.notes==="string"?body.notes.trim().slice(0,2000)||null:null},select:{id:true,name:true,email:true,phone:true,taxId:true,country:true,address:true,notes:true,createdAt:true}});
 await audit({action:"supplier.created",userId:current.user.id,organizationId:current.membership.organizationId,entityType:"Supplier",entityId:supplier.id});
 return NextResponse.json({supplier},{status:201});
}
