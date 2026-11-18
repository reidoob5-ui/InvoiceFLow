import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_PLANS } from "../apps/web/lib/plans";
const connectionString=process.env.DATABASE_URL;
if(!connectionString)throw new Error("DATABASE_URL é obrigatória para popular os planos.");
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString})});
async function main(){
 for(const plan of DEFAULT_PLANS){
  await prisma.plan.upsert({
   where:{key:plan.key},
   update:{name:plan.name,description:plan.description,monthlyPrice:plan.monthlyPrice,yearlyPrice:plan.yearlyPrice,currency:plan.currency,trialDays:plan.trialDays,limits:plan.limits,features:plan.features,sortOrder:plan.sortOrder,isPublic:true},
   create:{key:plan.key,name:plan.name,description:plan.description,monthlyPrice:plan.monthlyPrice,yearlyPrice:plan.yearlyPrice,currency:plan.currency,trialDays:plan.trialDays,limits:plan.limits,features:plan.features,sortOrder:plan.sortOrder,isPublic:true},
  });
 }
 await prisma.plan.updateMany({where:{key:{in:["starter","professional","enterprise"]}},data:{isPublic:false}});
 console.log(`Planos sincronizados: ${DEFAULT_PLANS.length}`);
}
main().catch(error=>{console.error("Falha ao popular os planos:",error);process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();});
