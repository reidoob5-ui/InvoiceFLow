import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const revalidate = 3600;
export async function GET(request:Request) {
  const base=new URL(request.url).searchParams.get("base")||"AOA";
  if(base!=="AOA") return NextResponse.json({error:"Moeda base não suportada."},{status:400});
  try {
    const response=await fetch("https://open.er-api.com/v6/latest/AOA",{next:{revalidate:3600}});
    if(!response.ok) throw new Error("Exchange-rate provider unavailable");
    const data=await response.json() as {result?:string;rates?:Record<string,number>;time_last_update_utc?:string};
    if(data.result!=="success"||!data.rates) throw new Error("Invalid exchange-rate response");
    return NextResponse.json({base:"AOA",rates:data.rates,updatedAt:data.time_last_update_utc??null},{headers:{"Cache-Control":"public, s-maxage=3600, stale-while-revalidate=86400"}});
  } catch { return NextResponse.json({error:"Não foi possível obter taxas de câmbio."},{status:503}); }
}