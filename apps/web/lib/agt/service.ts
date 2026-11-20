/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { retryOnConflict } from "@/lib/tx-retry";
import { buildDocument, type DocumentInput, type ReceiptSource } from "./document";
import { DOCUMENT_TYPES, RECEIPT_TYPES, SUBMISSION_DEADLINE_HOURS, MAX_DOCUMENTS_PER_REQUEST } from "./codes";
import { validateSeriesCode, formatDocumentNo, luandaParts } from "./series";
import { qrUrl } from "./qr";
import { assertValidRsaKey, generateKeyPair } from "./signing";
import { decryptSecret, encryptSecret, publicFingerprint } from "./key-crypto";
import { AgtClient, AGT_BASE_URLS, NetworkError } from "./client";

export class FiscalError extends Error {
  constructor(message: string, public code = "FISCAL_ERROR") {
    super(message);
    this.name = "FiscalError";
  }
}

type Db = PrismaClient | Prisma.TransactionClient;
const toCents = (n: number) => BigInt(Math.round(n * 100));
const json = (v: unknown) => (v === undefined ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

async function event(db: Db, organizationId: string, documentNo: string | null, kind: string, detail?: unknown, at = new Date()) {
  await db.fiscalEvent.create({ data: { organizationId, documentNo, kind, detail: json(detail), at } });
}

// ---------------------------------------------------------------------------
// Perfil fiscal e chaves
// ---------------------------------------------------------------------------

export type FiscalProfileInput = { nif: string; companyName: string; eacCode?: string | null; environment?: "HOMOLOGATION" | "PRODUCTION" };

export async function saveFiscalProfile(organizationId: string, input: FiscalProfileInput) {
  const nif = input.nif.trim();
  const companyName = input.companyName.trim();
  if (!nif || nif.length > 15) throw new FiscalError("NIF obrigatório (máx. 15 caracteres).", "INVALID_NIF");
  if (!companyName || companyName.length > 200) throw new FiscalError("Nome da empresa obrigatório (máx. 200).", "INVALID_NAME");
  if (input.eacCode && !/^\d{5}$/.test(input.eacCode)) throw new FiscalError("CAE: 5 dígitos.", "INVALID_EAC");
  const data = { nif, companyName, eacCode: input.eacCode || null, ...(input.environment ? { environment: input.environment } : {}) };
  const profile = await prisma.fiscalProfile.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data });
  await event(prisma, organizationId, null, "profile.saved", { nif, environment: profile.environment });
  return profile;
}

/** Guarda a chave privada do contribuinte cifrada. Se não vier PEM, gera um par novo (só para homologação/testes). */
export async function setTaxpayerKey(organizationId: string, opts: { privateKeyPem?: string; publicKeyPem?: string }) {
  let priv = opts.privateKeyPem?.trim();
  let pub = opts.publicKeyPem?.trim();
  if (!priv) {
    const kp = generateKeyPair();
    priv = kp.privateKey;
    pub = kp.publicKey;
  }
  assertValidRsaKey(priv, "private");
  const publicPem = pub ?? (await derivePublic(priv));
  const profile = await prisma.fiscalProfile.update({
    where: { organizationId },
    data: { privateKeyEncrypted: encryptSecret(priv), publicKeyPem: publicPem, keyFingerprint: publicFingerprint(publicPem) },
  });
  await event(prisma, organizationId, null, "key.set", { fingerprint: profile.keyFingerprint });
  return { fingerprint: profile.keyFingerprint!, publicKeyPem: publicPem };
}

async function derivePublic(privatePem: string): Promise<string> {
  const crypto = await import("node:crypto");
  return crypto.createPublicKey(privatePem).export({ type: "spki", format: "pem" }).toString();
}

export async function setFiscalEnabled(organizationId: string, enabled: boolean) {
  const p = await prisma.fiscalProfile.findUnique({ where: { organizationId } });
  if (!p) throw new FiscalError("Configure primeiro o perfil fiscal.", "NO_PROFILE");
  if (enabled && !p.privateKeyEncrypted) throw new FiscalError("Defina primeiro a chave do contribuinte.", "NO_KEY");
  await prisma.fiscalProfile.update({ where: { organizationId }, data: { enabled } });
  await event(prisma, organizationId, null, enabled ? "profile.enabled" : "profile.disabled");
}

async function loadIssuer(db: Db, organizationId: string) {
  const p = await db.fiscalProfile.findUnique({ where: { organizationId } });
  if (!p || !p.enabled) throw new FiscalError("A facturação AGT não está activa nesta organização.", "NOT_ENABLED");
  if (!p.privateKeyEncrypted) throw new FiscalError("Falta a chave do contribuinte.", "NO_KEY");
  return { nif: p.nif, companyName: p.companyName, eacCode: p.eacCode, key: decryptSecret(p.privateKeyEncrypted), environment: p.environment };
}

/** Cliente AGT para uma organização. Credenciais do produtor vêm do ambiente (nível plataforma). */
export async function agtClientFor(organizationId: string, fetchImpl?: typeof fetch): Promise<AgtClient> {
  const issuer = await loadIssuer(prisma, organizationId);
  const env = process.env;
  const need = (n: string) => {
    const v = env[n];
    if (!v) throw new FiscalError(`Variável de ambiente ${n} em falta.`, "NO_PRODUCER_CONFIG");
    return v;
  };
  return new AgtClient({
    baseUrl: env.AGT_BASE_URL || AGT_BASE_URLS[issuer.environment],
    taxpayerNif: issuer.nif,
    taxpayerPrivateKey: issuer.key,
    producerPrivateKey: need("AGT_PRODUCER_PRIVATE_KEY").replace(/\\n/g, "\n"),
    software: { productId: need("AGT_PRODUCT_ID"), productVersion: need("AGT_PRODUCT_VERSION"), validationNumber: need("AGT_SOFTWARE_VALIDATION_NUMBER") },
    credentials: env.AGT_BASIC_USER && env.AGT_BASIC_PASSWORD ? { username: env.AGT_BASIC_USER, password: env.AGT_BASIC_PASSWORD } : undefined,
    fetchImpl,
  });
}

// ---------------------------------------------------------------------------
// Séries
// ---------------------------------------------------------------------------

export async function registerSeries(
  organizationId: string,
  o: { code: string; year: number; documentType: string; firstNumber?: number; lastNumber?: number | null; establishment?: string; contingency?: boolean; now?: Date },
) {
  const errs = validateSeriesCode(o.code, o.year);
  if (!(o.documentType in DOCUMENT_TYPES)) errs.push(`documentType inválido: ${o.documentType}`);
  const first = o.firstNumber ?? 1;
  if (!Number.isInteger(first) || first < 1) errs.push("firstDocumentNumber tem de ser >= 1");
  if (errs.length) throw new FiscalError(errs.join("; "), "INVALID_SERIES");
  const row = await prisma.fiscalSeries.create({
    data: {
      organizationId, code: o.code, year: o.year, documentType: o.documentType, firstNumber: first, nextNumber: first,
      lastNumber: o.lastNumber ?? null, establishment: o.establishment ?? "SEDE", contingency: o.contingency ?? false,
    },
  });
  await event(prisma, organizationId, null, "series.registered", { code: o.code, year: o.year, documentType: o.documentType, first }, o.now);
  return row;
}

/** Pede a série à AGT (solicitarSerie) e regista-a localmente. */
export async function requestSeries(
  organizationId: string, client: AgtClient,
  o: { year: number; documentType: string; establishment?: string; contingency?: boolean; now?: Date },
) {
  const r = await client.solicitarSerie({ seriesYear: o.year, documentType: o.documentType, establishmentNumber: o.establishment, contingency: o.contingency }, { now: o.now });
  if (r.kind !== "created") return r;
  const series = await registerSeries(organizationId, {
    code: r.seriesCode, year: o.year, documentType: o.documentType, firstNumber: r.firstDocumentNo, lastNumber: r.lastDocumentNo,
    establishment: o.establishment, contingency: o.contingency, now: o.now,
  });
  return { ...r, series };
}

// ---------------------------------------------------------------------------
// Emissão
// ---------------------------------------------------------------------------

export type IssueResult = { documentNo: string; document: Record<string, any>; qrUrl: string; deadlineAt: string; fiscalDocumentId: string };

/**
 * Emite, assina e guarda um documento; fica na fila de envio com prazo de 24h.
 * Numeração sem buracos: transação Serializable + constraint única (série, seq).
 */
export async function issueFiscalDocument(
  organizationId: string, input: DocumentInput, opts: { invoiceId?: string; now?: Date } = {},
): Promise<IssueResult> {
  const now = opts.now ?? new Date();
  return retryOnConflict(() =>
    prisma.$transaction(
      async (tx) => {
        const issuer = await loadIssuer(tx, organizationId);
        const type = input.documentType;
        const { date } = luandaParts(now);
        const docDate = input.documentDate ?? date;
        if (!input.seriesCode || !input.seriesYear) throw new FiscalError("Indique a série (seriesCode/seriesYear).", "NO_SERIES");

        const series = await tx.fiscalSeries.findUnique({
          where: { organizationId_code_year_documentType: { organizationId, code: input.seriesCode, year: input.seriesYear, documentType: type } },
        });
        if (!series) throw new FiscalError(`Série ${input.seriesCode}/${input.seriesYear} (${type}) não registada.`, "SERIES_NOT_FOUND");
        if (series.status === "F") throw new FiscalError("Série fechada.", "SERIES_CLOSED");
        if (Number(docDate.slice(0, 4)) !== series.year) throw new FiscalError(`A data do documento (${docDate}) não pertence ao ano da série (${series.year}).`, "DATE_YEAR");
        if (docDate > date) throw new FiscalError("A data do documento não pode ser futura.", "DATE_FUTURE");
        if (series.lastDate && docDate < series.lastDate) throw new FiscalError(`Numeração tem de ser cronológica: já existe documento em ${series.lastDate}.`, "DATE_ORDER");

        const seq = series.nextNumber;
        if (series.lastNumber && seq > series.lastNumber) throw new FiscalError("Série esgotada: peça nova série à AGT.", "SERIES_EXHAUSTED");
        const documentNo = formatDocumentNo(type, series.code, seq);

        let sources: ReceiptSource[] | undefined;
        if (RECEIPT_TYPES.has(type)) sources = await resolveSources(tx, organizationId, input.sourceDocumentNos);

        const document = buildDocument(
          { ...input, documentDate: docDate, eacCode: input.eacCode ?? issuer.eacCode ?? undefined },
          { nif: issuer.nif, companyName: issuer.companyName, signingKey: issuer.key, documentNo, now, sources },
        );

        const created = await tx.fiscalDocument.create({
          data: {
            organizationId, seriesId: series.id, invoiceId: opts.invoiceId ?? null, documentNo, documentType: type, seq,
            documentDate: document.documentDate, systemEntryDate: document.systemEntryDate, payload: json(document),
          },
        });
        const deadline = new Date(now.getTime() + SUBMISSION_DEADLINE_HOURS * 3600 * 1000);
        await tx.fiscalDelivery.create({ data: { organizationId, documentId: created.id, state: "PENDING", deadlineAt: deadline } });
        const bumped = await tx.fiscalSeries.updateMany({
          where: { id: series.id, nextNumber: seq },
          data: { nextNumber: seq + 1, lastDate: docDate, status: "U" },
        });
        if (bumped.count !== 1) throw Object.assign(new Error("series counter conflict"), { code: "P2034" });
        await event(tx, organizationId, documentNo, "document.issued", { type, seq }, now);
        return { documentNo, document, qrUrl: qrUrl(documentNo, issuer.nif), deadlineAt: deadline.toISOString(), fiscalDocumentId: created.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

async function resolveSources(db: Db, organizationId: string, nos?: string[]): Promise<ReceiptSource[]> {
  if (!Array.isArray(nos) || nos.length === 0) throw new FiscalError("Recibo: indique sourceDocumentNos.", "NO_SOURCES");
  const out: ReceiptSource[] = [];
  for (const no of nos) {
    const row = await db.fiscalDocument.findUnique({ where: { organizationId_documentNo: { organizationId, documentNo: no } }, include: { delivery: true } });
    if (!row) throw new FiscalError(`Documento de origem não encontrado: ${no}`, "SOURCE_NOT_FOUND");
    if (RECEIPT_TYPES.has(row.documentType)) throw new FiscalError(`Um recibo não pode referir outro recibo: ${no}`, "SOURCE_IS_RECEIPT");
    if (!row.delivery || !["VALID", "PENALIZED"].includes(row.delivery.state)) {
      throw new FiscalError(`Documento de origem ${no} ainda não foi validado pela AGT (estado: ${row.delivery?.state ?? "?"}).`, "SOURCE_NOT_VALID");
    }
    const t = (row.payload as any).documentTotals;
    out.push({ documentNo: no, documentType: row.documentType, documentDate: row.documentDate, netCents: toCents(Math.abs(t.netTotal)), taxCents: toCents(Math.abs(t.taxPayable)) });
  }
  return out;
}

/** Documento de correcção (documentStatus = C) para uma factura que a AGT rejeitou. */
export async function issueCorrection(organizationId: string, rejectedDocumentNo: string, input: DocumentInput, opts?: { invoiceId?: string; now?: Date }) {
  const d = await prisma.fiscalDelivery.findFirst({ where: { organizationId, document: { documentNo: rejectedDocumentNo } } });
  if (!d) throw new FiscalError(`Documento ${rejectedDocumentNo} não encontrado.`, "NOT_FOUND");
  if (d.state !== "INVALID") throw new FiscalError(`Só se corrige um documento rejeitado pela AGT (estado actual: ${d.state}).`, "NOT_REJECTED");
  return issueFiscalDocument(organizationId, { ...input, documentStatus: "C", rejectedDocumentNo }, opts);
}

// ---------------------------------------------------------------------------
// Fila de envio (outbox)
// ---------------------------------------------------------------------------

export const backoffMs = (attempts: number) => Math.min(15_000 * 2 ** Math.max(0, attempts - 1), 300_000);

type Row = { id: string; documentId: string; attempts: number; document: { documentNo: string; payload: any } };

async function setState(organizationId: string, row: Row, state: Prisma.FiscalDeliveryUpdateInput["state"], patch: Prisma.FiscalDeliveryUpdateInput = {}, now = new Date(), detail?: unknown) {
  await prisma.fiscalDelivery.update({ where: { id: row.id }, data: { state, ...patch } });
  await event(prisma, organizationId, row.document.documentNo, `delivery.${String(state).toLowerCase()}`, detail, now);
}

const dueRows = (organizationId: string, states: any[], now: Date, take: number): Promise<Row[]> =>
  prisma.fiscalDelivery.findMany({
    where: { organizationId, state: { in: states }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    include: { document: { select: { documentNo: true, payload: true } } },
    orderBy: { document: { createdAt: "asc" } },
    take,
  }) as any;

/** Envia o que estiver pendente, por ordem de emissão e em lotes de até 30. */
export async function submitPending(organizationId: string, client: AgtClient, { now = new Date(), pollDelayMs = 5000 } = {}) {
  const out = { batches: 0, accepted: 0, rejected: 0, retried: 0, blocked: 0 };
  for (let guard = 0; guard < 100; guard++) {
    const rows = await dueRows(organizationId, ["PENDING", "RETRY"], now, MAX_DOCUMENTS_PER_REQUEST);
    if (rows.length === 0) return out;
    out.batches++;
    const docs = rows.map((r) => r.document.payload); // exactamente o que foi assinado e guardado

    const retryAll = async (why: unknown) => {
      for (const r of rows) {
        const attempts = r.attempts + 1;
        await setState(organizationId, r, "RETRY", { attempts, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)) }, now, why);
      }
      out.retried += rows.length;
    };

    let res;
    try {
      res = await client.registarFactura(docs, { now });
    } catch (err) {
      if (err instanceof NetworkError) { await retryAll({ network: err.message }); return out; }
      throw err;
    }

    if (res.kind === "accepted") {
      for (const r of rows) {
        await setState(organizationId, r, "SUBMITTED", { requestId: res.requestID, attempts: r.attempts + 1, nextAttemptAt: new Date(now.getTime() + pollDelayMs) }, now, { requestID: res.requestID });
      }
      out.accepted += rows.length;
      continue;
    }
    if (res.kind === "rate_limited" || res.kind === "wait") { await retryAll({ code: res.code }); return out; }
    if (res.kind === "rejected") {
      const byDoc = new Map<string, any[]>();
      for (const e of res.errors) if (e.documentNo) byDoc.set(e.documentNo, [...(byDoc.get(e.documentNo) ?? []), e]);
      if (byDoc.size === 0) {
        for (const r of rows) await setState(organizationId, r, "BLOCKED", { errors: json(res.errors) }, now, res.errors);
        out.blocked += rows.length;
        return out;
      }
      for (const r of rows) {
        const errs = byDoc.get(r.document.documentNo);
        if (errs) { await setState(organizationId, r, "INVALID", { errors: json(errs) }, now, errs); out.rejected++; }
      }
      continue; // os restantes do lote seguem no ciclo seguinte
    }
    for (const r of rows) await setState(organizationId, r, "BLOCKED", { errors: json(res) }, now, res);
    out.blocked += rows.length;
    return out;
  }
  return out;
}

/** Consulta o resultado dos pedidos já aceites pela AGT. */
export async function pollSubmitted(organizationId: string, client: AgtClient, { now = new Date(), pollDelayMs = 10_000 } = {}) {
  const out = { valid: 0, penalized: 0, invalid: 0, pending: 0, blocked: 0 };
  const rows = await dueRows(organizationId, ["SUBMITTED"], now, 1000);
  const byRequest = new Map<string, Array<Row & { requestId: string | null }>>();
  for (const r of rows as any[]) if (r.requestId) byRequest.set(r.requestId, [...(byRequest.get(r.requestId) ?? []), r]);
  const later = new Date(now.getTime() + pollDelayMs);

  for (const [requestID, group] of byRequest) {
    let res;
    try {
      res = await client.obterEstado(requestID, { now });
    } catch (err) {
      if (err instanceof NetworkError) continue;
      throw err;
    }
    const defer = async () => {
      await prisma.fiscalDelivery.updateMany({ where: { id: { in: group.map((g) => g.id) } }, data: { nextAttemptAt: later } });
      out.pending += group.length;
    };
    if (res.kind === "wait" || res.kind === "rate_limited") { await defer(); continue; }
    if (res.kind === "fatal") {
      for (const r of group) await setState(organizationId, r, "BLOCKED", { errors: json(res) }, now, res);
      out.blocked += group.length;
      continue;
    }
    if (res.kind !== "status") continue;
    if ([7, 8].includes(res.resultCode)) { await defer(); continue; }
    if (res.resultCode === 9) { // processamento cancelado: volta à fila
      for (const r of group) await setState(organizationId, r, "RETRY", { requestId: null, nextAttemptAt: null }, now, { cancelled: true });
      continue;
    }
    const byNo = new Map<string, any>((res.documents as any[]).map((d) => [d.documentNo, d]));
    for (const r of group) {
      const d = byNo.get(r.document.documentNo);
      if (!d) continue;
      if (d.status === "V") { await setState(organizationId, r, "VALID", {}, now); out.valid++; }
      else if (d.status === "P") { await setState(organizationId, r, "PENALIZED", {}, now); out.penalized++; }
      else if (d.status === "I") { await setState(organizationId, r, "INVALID", { errors: json(d.errors) }, now, d.errors); out.invalid++; }
    }
  }
  return out;
}

/** Documentos por enviar que já passaram o prazo de 24h (risco/efectivo de penalização). */
export const overdue = (organizationId: string, now = new Date()) =>
  prisma.fiscalDelivery.findMany({
    where: { organizationId, state: { in: ["PENDING", "RETRY", "BLOCKED"] }, deadlineAt: { lt: now } },
    select: { deadlineAt: true, state: true, document: { select: { documentNo: true } } }, orderBy: { deadlineAt: "asc" },
  });

/** Documentos por enviar cujo prazo termina dentro de `withinMinutes` minutos. */
export const dueSoon = (organizationId: string, now = new Date(), withinMinutes = 60) =>
  prisma.fiscalDelivery.findMany({
    where: { organizationId, state: { in: ["PENDING", "RETRY"] }, deadlineAt: { gte: now, lt: new Date(now.getTime() + withinMinutes * 60_000) } },
    select: { deadlineAt: true, state: true, document: { select: { documentNo: true } } }, orderBy: { deadlineAt: "asc" },
  });

export async function deliverySummary(organizationId: string) {
  const rows = await prisma.fiscalDelivery.groupBy({ by: ["state"], where: { organizationId }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.state, r._count._all]));
}

/** Ciclo completo para uma organização (usado pelo cron): envia pendentes e consulta estados. */
export async function syncOrganization(organizationId: string, now = new Date()) {
  const client = await agtClientFor(organizationId);
  const submitted = await submitPending(organizationId, client, { now });
  const polled = await pollSubmitted(organizationId, client, { now });
  return { submitted, polled };
}

/** Cron: sincroniza todas as organizações com facturação AGT activa. Um erro numa não bloqueia as outras. */
export async function runFiscalSync(now = new Date()) {
  const profiles = await prisma.fiscalProfile.findMany({ where: { enabled: true }, select: { organizationId: true } });
  const summary = { organizations: profiles.length, ok: 0, errors: [] as string[] };
  for (const p of profiles) {
    try {
      await syncOrganization(p.organizationId, now);
      summary.ok++;
    } catch (error) {
      summary.errors.push(`${p.organizationId}: ${(error as Error).message}`.slice(0, 200));
    }
  }
  return summary;
}
