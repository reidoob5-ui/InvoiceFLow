import { NextResponse } from "next/server";
import { validateDocument } from "@/lib/agt/document";

export const runtime = "nodejs";

/**
 * SIMULADOR de homologação (NÃO é a AGT). Só responde com AGT_SIMULATOR=1 e serve para testar o fluxo
 * completo antes de haver credenciais. Valida a estrutura do Anexo I mas não verifica assinaturas nem NIF,
 * e nada do que passa por aqui tem valor fiscal. Sem estado: o requestID leva os números dos documentos.
 */
export async function POST(request: Request, context: { params: Promise<{ service: string }> }) {
  if (process.env.AGT_SIMULATOR !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { service } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json([{ idError: "E96", descriptionError: "Pedido mal formado" }], { status: 400 });

  if (service === "solicitarSerie") {
    const type = typeof body.documentType === "string" ? body.documentType.replace(/[^A-Z]/g, "").slice(0, 3) : "";
    const year = Number(body.seriesYear);
    if (!type || !Number.isInteger(year)) return NextResponse.json([{ idError: "E96", descriptionError: "documentType/seriesYear" }], { status: 400 });
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return NextResponse.json({ resultCode: 1, seriesFEResult: { seriesCode: `SIM${type}${year}${rand}`, firstDocumentNo: "1", lastDocumentNo: "99999", authorizedQuantity: "99999" } });
  }

  if (service === "registarFactura") {
    const docs: Array<Record<string, unknown>> = Array.isArray(body.documents) ? body.documents : [];
    if (docs.length === 0 || docs.length > 30) return NextResponse.json([{ idError: "E96", descriptionError: "1 a 30 documentos" }], { status: 400 });
    const errors = docs.flatMap((d) => validateDocument(d).map((e) => ({ idError: "E10", descriptionError: `${e.path}: ${e.message}`, documentNo: String(d.documentNo ?? "") })));
    if (errors.length) return NextResponse.json(errors, { status: 400 });
    const nos = docs.map((d) => String(d.documentNo));
    return NextResponse.json({ requestID: `SIM${Buffer.from(JSON.stringify(nos)).toString("base64url")}` });
  }

  if (service === "obterEstado") {
    const id = typeof body.requestID === "string" ? body.requestID : "";
    let nos: string[] = [];
    try { if (id.startsWith("SIM")) nos = JSON.parse(Buffer.from(id.slice(3), "base64url").toString("utf8")); } catch { /* requestID inválido */ }
    if (!Array.isArray(nos) || nos.length === 0) return NextResponse.json({ errorEntry: { idError: "E96", descriptionError: "requestID desconhecido" } }, { status: 422 });
    return NextResponse.json({ statusResult: { requestID: id, resultCode: "0", documentStatusList: nos.map((documentNo) => ({ documentNo, documentStatus: "V" })) } });
  }

  return NextResponse.json({ error: "Serviço não suportado no simulador" }, { status: 404 });
}
