import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { generateKeyPair } from "@/lib/agt/signing";
import { AgtClient } from "@/lib/agt/client";
import {
  issueFiscalDocument, saveFiscalProfile, setFiscalEnabled, setTaxpayerKey, registerSeries,
  submitPending, pollSubmitted, overdue, FiscalError,
} from "@/lib/agt/service";

/**
 * Corre contra um PostgreSQL REAL (migrações aplicadas). Opt-in: INTEGRATION_DB=1 DATABASE_URL=...
 * Usa uma AGT simulada (fetch injectado); nunca contacta a AGT.
 */
const run = process.env.INTEGRATION_DB === "1";
const NIF = "5417012345";
const input = (over = {}) => ({
  documentType: "FT", seriesCode: "FT26X", seriesYear: new Date().getFullYear(), customer: { taxId: "5000123456" },
  lines: [{ operationType: "SG", productCode: "P", productDescription: "x", quantity: 1, unitPrice: "100", unitOfMeasure: "UN", tax: { taxType: "IVA", taxCode: "NOR" } }], ...over,
});

describe.skipIf(!run)("facturação AGT (PostgreSQL real, AGT simulada)", () => {
  const suffix = randomBytes(4).toString("hex");
  let org: string; let other: string;
  const producer = generateKeyPair();
  let behaviour: "accept" | "reject" | "down" = "accept";
  let statusByNo: Record<string, string> = {};

  const fakeFetch = (async (url: string, init: { body: string }) => {
    if (behaviour === "down") throw new Error("ECONNREFUSED");
    const body = JSON.parse(init.body);
    const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s });
    if (url.endsWith("/registarFactura")) {
      if (behaviour === "reject") return json(400, [{ idError: "E10", descriptionError: "estrutura", documentNo: body.documents[0].documentNo }]);
      return json(200, { requestID: "REQ1" });
    }
    if (url.endsWith("/obterEstado")) {
      return json(200, { statusResult: { requestID: "REQ1", resultCode: "0", documentStatusList: Object.entries(statusByNo).map(([documentNo, documentStatus]) => ({ documentNo, documentStatus })) } });
    }
    return json(404, {});
  }) as unknown as typeof fetch;
  const client = async () => new AgtClient({
    baseUrl: "http://agt.test", taxpayerNif: NIF, taxpayerPrivateKey: (await import("@/lib/agt/key-crypto")).decryptSecret((await prisma.fiscalProfile.findUniqueOrThrow({ where: { organizationId: org } })).privateKeyEncrypted!),
    producerPrivateKey: producer.privateKey, software: { productId: "IF", productVersion: "1", validationNumber: "T" }, fetchImpl: fakeFetch,
  });

  beforeAll(async () => {
    process.env.FISCAL_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    org = (await prisma.organization.create({ data: { name: "Fiscal A", slug: `fx-a-${suffix}` } })).id;
    other = (await prisma.organization.create({ data: { name: "Fiscal B", slug: `fx-b-${suffix}` } })).id;
    await saveFiscalProfile(org, { nif: NIF, companyName: "Fiscal A Lda" });
    await setTaxpayerKey(org, {});
    await setFiscalEnabled(org, true);
    await registerSeries(org, { code: "FT26X", year: new Date().getFullYear(), documentType: "FT" });
  });
  afterAll(async () => {
    // Documentos fiscais são imutáveis e protegidos por triggers: só em testes os desactivamos para limpar.
    await prisma.$transaction([
      prisma.$executeRawUnsafe('ALTER TABLE "FiscalDocument" DISABLE TRIGGER "FiscalDocument_immutable"'),
      prisma.$executeRawUnsafe('ALTER TABLE "FiscalEvent" DISABLE TRIGGER "FiscalEvent_append_only"'),
      prisma.fiscalEvent.deleteMany({ where: { organizationId: { in: [org, other] } } }),
      prisma.fiscalDelivery.deleteMany({ where: { organizationId: { in: [org, other] } } }),
      prisma.fiscalDocument.deleteMany({ where: { organizationId: { in: [org, other] } } }),
      prisma.$executeRawUnsafe('ALTER TABLE "FiscalDocument" ENABLE TRIGGER "FiscalDocument_immutable"'),
      prisma.$executeRawUnsafe('ALTER TABLE "FiscalEvent" ENABLE TRIGGER "FiscalEvent_append_only"'),
      prisma.organization.deleteMany({ where: { id: { in: [org, other] } } }),
    ]);
    await prisma.$disconnect();
  });

  it("numeração sequencial sem buracos, mesmo em emissões concorrentes", async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => issueFiscalDocument(org, input())));
    const nos = results.map((r) => Number(r.documentNo.split("/")[1])).sort((a, b) => a - b);
    expect(nos).toEqual([1, 2, 3, 4]);
  });

  it("documento fiscal é imutável na base de dados", async () => {
    const doc = await prisma.fiscalDocument.findFirstOrThrow({ where: { organizationId: org } });
    await expect(prisma.fiscalDocument.update({ where: { id: doc.id }, data: { documentDate: "2020-01-01" } })).rejects.toThrow(/immutable/);
    await expect(prisma.fiscalDocument.delete({ where: { id: doc.id } })).rejects.toThrow(/immutable/);
    const ev = await prisma.fiscalEvent.findFirstOrThrow({ where: { organizationId: org } });
    await expect(prisma.fiscalEvent.delete({ where: { id: ev.id } })).rejects.toThrow(/immutable/);
  });

  it("recusa série inexistente, data futura e organização sem AGT activa", async () => {
    await expect(issueFiscalDocument(org, input({ seriesCode: "NOPE" }))).rejects.toThrow(FiscalError);
    await expect(issueFiscalDocument(org, input({ documentDate: "2999-01-01" }))).rejects.toThrow(/futura|ano da série/);
    await expect(issueFiscalDocument(other, input())).rejects.toThrow(/não está activa/);
  });

  it("envia pendentes, consulta o estado e fica VALID", async () => {
    behaviour = "accept";
    const c = await client();
    const sent = await submitPending(org, c, { pollDelayMs: 0 });
    expect(sent.accepted).toBeGreaterThanOrEqual(4);
    const docs = await prisma.fiscalDocument.findMany({ where: { organizationId: org } });
    statusByNo = Object.fromEntries(docs.map((d) => [d.documentNo, "V"]));
    const polled = await pollSubmitted(org, c, { now: new Date(Date.now() + 60_000) });
    expect(polled.valid).toBe(docs.length);
    expect((await prisma.fiscalDelivery.count({ where: { organizationId: org, state: "VALID" } }))).toBe(docs.length);
  });

  it("recibo só sobre documento validado; rede em baixo => RETRY com backoff", async () => {
    const first = await prisma.fiscalDocument.findFirstOrThrow({ where: { organizationId: org }, orderBy: { seq: "asc" } });
    await registerSeries(org, { code: "AR26X", year: new Date().getFullYear(), documentType: "AR" });
    const r = await issueFiscalDocument(org, { documentType: "AR", seriesCode: "AR26X", seriesYear: new Date().getFullYear(), customer: { taxId: "5000123456" }, sourceDocumentNos: [first.documentNo] });
    expect(r.documentNo).toMatch(/^AR AR26X\/1$/);

    const fresh = await issueFiscalDocument(org, input());
    await expect(issueFiscalDocument(org, { documentType: "AR", seriesCode: "AR26X", seriesYear: new Date().getFullYear(), sourceDocumentNos: [fresh.documentNo] })).rejects.toThrow(/ainda não foi validado/);

    behaviour = "down";
    await submitPending(org, await client());
    const d = await prisma.fiscalDelivery.findFirstOrThrow({ where: { document: { documentNo: fresh.documentNo } } });
    expect(d.state).toBe("RETRY");
    expect(d.attempts).toBe(1);
    expect(d.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejeição da AGT => INVALID; passado o prazo aparece em overdue", async () => {
    behaviour = "reject";
    const bad = await issueFiscalDocument(org, input());
    await submitPending(org, await client(), { now: new Date(Date.now() + 3600_000) });
    const d = await prisma.fiscalDelivery.findFirstOrThrow({ where: { document: { documentNo: bad.documentNo } } });
    expect(d.state).toBe("INVALID");
    const late = await overdue(org, new Date(Date.now() + 25 * 3600_000));
    expect(late.length).toBeGreaterThan(0);
  });
});
