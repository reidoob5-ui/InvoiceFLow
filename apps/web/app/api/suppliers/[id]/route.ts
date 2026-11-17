import { NextRequest,NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession,audit } from "@/lib/auth/session";
import { assertCan,ForbiddenError } from "@/lib/permissions";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function PATCH(request:NextRequest,context:Context){
 const current=await getCurrentSession();
 if(!current)return NextResponse.json({error:"Não autenticado."},{status:401});
 if(!current.membership)return NextResponse.json({error:"Selecciona uma empresa."},{status:409});
 try{assertCan(current.membership.role,"suppliers:write");}catch(error){if(error instanceof ForbiddenError)return NextResponse.json({error:"Sem permissão."},{status:403});throw error;}
 const {id}=await context.params,body=await request.json().catch(()=>null),name=typeof body?.name==="string"?body.name.trim().slice(0,160):"",email=typeof body?.email==="string"?body.email.trim().toLowerCase().slice(0,254):"";
 if(name.length<2)return NextResponse.json({error:"O nome deve ter pelo menos 2 caracteres."},{status:400});
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"E-mail inválido."},{status:400});
 const existing=await prisma.supplier.findFirst({where:{id,organizationId:current.membership.organizationId,archivedAt:null},select:{id:true}});
 if(!existing)return NextResponse.json({error:"Fornecedor não encontrado."},{status:404});
 const supplier=await prisma.supplier.update({where:{id},data:{name,email:email||null,phone:typeof body?.phone==="string"?body.phone.trim().slice(0,40)||null:null,taxId:typeof body?.taxId==="string"?body.taxId.trim().slice(0,80)||null:null,country:typeof body?.country==="string"?body.country.trim().slice(0,2).toUpperCase()||null:null,address:typeof body?.address==="string"?body.address.trim().slice(0,300)||null:null,notes:typeof body?.notes==="string"?body.notes.trim().slice(0,2000)||null:null},select:{id:true,name:true,email:true,phone:true,taxId:true,country:true,address:true,notes:true,createdAt:true}});
 await audit({action:"supplier.updated",userId:current.user.id,organizationId:current.membership.organizationId,entityType:"Supplier",entityId:id});
 return NextResponse.json({supplier});
}
export async function DELETE(_request:NextRequest,context:Context){
 const current=await getCurrentSession();
 if(!current)return NextResponse.json({error:"Não autenticado."},{status:401});
 if(!current.membership)return NextResponse.json({error:"Selecciona uma empresa."},{status:409});
 try{assertCan(current.membership.role,"suppliers:delete");}catch(error){if(error instanceof ForbiddenError)return NextResponse.json({error:"Sem permissão."},{status:403});throw error;}
 const {id}=await context.params,result=await prisma.supplier.updateMany({where:{id,organizationId:current.membership.organizationId,archivedAt:null},data:{archivedAt:new Date()}});
 if(!result.count)return NextResponse.json({error:"Fornecedor não encontrado."},{status:404});
 await audit({action:"supplier.archived",userId:current.user.id,organizationId:current.membership.organizationId,entityType:"Supplier",entityId:id});
 return NextResponse.json({archived:true});
}
