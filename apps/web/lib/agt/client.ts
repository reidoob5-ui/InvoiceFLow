/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";
import { signJws, signSoftware } from "./signing";
import { MAX_DOCUMENTS_PER_REQUEST } from "./codes";

export class NetworkError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "NetworkError";
  }
}

export const AGT_BASE_URLS = {
  HOMOLOGATION: "https://sifphml.minfin.gov.ao",
  PRODUCTION: "https://sifp.minfin.gov.ao",
} as const;

const SERVICES = ["registarFactura", "obterEstado", "listarFacturas", "consultarFactura", "solicitarSerie", "listarSeries", "validarDocumento"] as const;
type Service = (typeof SERVICES)[number];
const DEFAULT_PATHS = Object.fromEntries(SERVICES.map((s) => [s, `/sigt/fe/v1/${s}`])) as Record<Service, string>;

export const SCHEMA_VERSION = "2.0";
const codeOf = (e: any) => e?.idError ?? e?.errorCode ?? e?.code;

export type AgtClientOptions = {
  baseUrl: string;
  taxpayerNif: string;
  taxpayerPrivateKey: string;
  software: { productId: string; productVersion: string; validationNumber: string };
  producerPrivateKey: string;
  credentials?: { username: string; password: string };
  fetchImpl?: typeof fetch;
  paths?: Partial<Record<Service, string>>;
  timeoutMs?: number;
};

export type AgtResult = Record<string, any> & { kind: string };

/** Cliente REST dos 7 serviços do Anexo III. Auth: Basic do produtor (pedidas à AGT). */
export class AgtClient {
  private baseUrl: string;
  private nif: string;
  private key: string;
  private software: AgtClientOptions["software"];
  private producerKey: string;
  private authHeader?: string;
  private fetchFn: typeof fetch;
  private paths: Record<Service, string>;
  private timeoutMs: number;

  constructor(o: AgtClientOptions) {
    for (const [k, v] of Object.entries({ baseUrl: o.baseUrl, taxpayerNif: o.taxpayerNif, taxpayerPrivateKey: o.taxpayerPrivateKey, producerPrivateKey: o.producerPrivateKey })) {
      if (!v) throw new TypeError(`AgtClient: "${k}" é obrigatório`);
    }
    if (!o.software?.productId || !o.software?.productVersion || !o.software?.validationNumber) {
      throw new TypeError("AgtClient: software.{productId, productVersion, validationNumber} obrigatórios");
    }
    this.baseUrl = o.baseUrl.replace(/\/$/, "");
    this.nif = o.taxpayerNif;
    this.key = o.taxpayerPrivateKey;
    this.software = o.software;
    this.producerKey = o.producerPrivateKey;
    if (o.credentials) this.authHeader = `Basic ${Buffer.from(`${o.credentials.username}:${o.credentials.password}`, "utf8").toString("base64")}`;
    this.fetchFn = o.fetchImpl ?? globalThis.fetch;
    this.paths = { ...DEFAULT_PATHS, ...o.paths };
    this.timeoutMs = o.timeoutMs ?? 30_000;
  }

  private softwareInfo() {
    const softwareInfoDetail = {
      productId: this.software.productId,
      productVersion: this.software.productVersion,
      softwareValidationNumber: this.software.validationNumber,
    };
    return { softwareInfoDetail, jwsSoftwareSignature: signSoftware(softwareInfoDetail, this.producerKey) };
  }

  private envelope(now: Date) {
    return {
      schemaVersion: SCHEMA_VERSION,
      submissionUUID: crypto.randomUUID(),
      taxRegistrationNumber: this.nif,
      submissionTimeStamp: now.toISOString(),
      softwareInfo: this.softwareInfo(),
    };
  }

  private async post(service: Service, body: unknown): Promise<{ status: number; json: any }> {
    let res: Response;
    try {
      res = await this.fetchFn(this.baseUrl + this.paths[service], {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", ...(this.authHeader ? { authorization: this.authHeader } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new NetworkError(`${service}: ${(err as Error).message}`, err);
    }
    let json: any = null;
    const text = await res.text();
    if (text) {
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
    }
    if (res.status >= 500) throw new NetworkError(`${service}: HTTP ${res.status}`);
    return { status: res.status, json };
  }

  private classifyError(status: number, json: any): AgtResult {
    const entry = json?.errorEntry ?? json;
    const code = codeOf(entry);
    if (status === 429 || code === "E98") return { kind: "rate_limited", code: "E98" };
    if (code === "E94" || code === "E95") return { kind: "fatal", code, message: entry?.descriptionError ?? entry?.errorDescription };
    if (status === 422 && (code === "E96" || code === "E97")) return { kind: "wait", code };
    const list = Array.isArray(json) ? json : json?.errorList;
    if (status === 400) {
      return {
        kind: "rejected",
        errors: (list ?? [entry]).map((e: any) => ({ idError: codeOf(e), descriptionError: e?.descriptionError ?? e?.errorDescription, documentNo: e?.documentNo })),
      };
    }
    return { kind: "unexpected", status, body: json };
  }

  async registarFactura(documents: unknown[], { now = new Date() } = {}): Promise<AgtResult> {
    if (documents.length === 0) throw new RangeError("Nenhum documento para enviar");
    if (documents.length > MAX_DOCUMENTS_PER_REQUEST) throw new RangeError(`Máximo de ${MAX_DOCUMENTS_PER_REQUEST} documentos por pedido (recebeu ${documents.length})`);
    const body = { ...this.envelope(now), numberOfEntries: documents.length, documents };
    const { status, json } = await this.post("registarFactura", body);
    if (status === 200 && json?.requestID) return { kind: "accepted", requestID: json.requestID, submissionUUID: body.submissionUUID };
    return this.classifyError(status, json);
  }

  async obterEstado(requestID: string, { now = new Date() } = {}): Promise<AgtResult> {
    const body = { ...this.envelope(now), jwsSignature: signJws({ taxRegistrationNumber: this.nif, requestID }, this.key), requestID };
    const { status, json } = await this.post("obterEstado", body);
    if (status === 200) {
      const r = json?.statusResult ?? json;
      return {
        kind: "status",
        requestID: r.requestID ?? requestID,
        resultCode: Number(r.resultCode),
        successRequestID: r.successRequestID || undefined,
        requestErrors: r.requestErrorList ?? [],
        documents: (r.documentStatusList ?? []).map((d: any) => ({
          documentNo: d.documentNo,
          status: d.documentStatus, // V | I | P
          errors: (d.errorList ?? []).map((e: any) => ({ errorCode: e.errorCode, errorDescription: e.errorDescription })),
        })),
      };
    }
    return this.classifyError(status, json);
  }

  /** A AGT gera o seriesCode (ex. "LD6325S2042N"); nós só pedimos. */
  async solicitarSerie(
    { seriesYear, documentType, establishmentNumber = "SEDE", contingency = false }: { seriesYear: number; documentType: string; establishmentNumber?: string; contingency?: boolean },
    { now = new Date() } = {},
  ): Promise<AgtResult> {
    const seriesContingencyIndicator = contingency ? "C" : "N";
    const body = {
      ...this.envelope(now),
      seriesYear: Number(seriesYear),
      documentType,
      establishmentNumber,
      seriesContingencyIndicator,
      jwsSignature: signJws({ taxRegistrationNumber: this.nif, establishmentNumber, seriesYear: String(seriesYear), documentType, seriesContingencyIndicator }, this.key),
    };
    const { status, json } = await this.post("solicitarSerie", body);
    if (status === 200 && Number(json?.resultCode) === 1 && json?.seriesFEResult?.seriesCode) {
      const r = json.seriesFEResult;
      return {
        kind: "created", seriesCode: r.seriesCode, seriesYear: Number(seriesYear), documentType, establishmentNumber, contingency,
        firstDocumentNo: Number(r.firstDocumentNo ?? 1), lastDocumentNo: Number(r.lastDocumentNo), authorizedQuantity: Number(r.authorizedQuantity),
      };
    }
    if (status === 200) return { kind: "refused", resultCode: Number(json?.resultCode), errors: json?.errorList ?? [] };
    return this.classifyError(status, json);
  }

  async listarSeries(filters: Record<string, unknown> = {}, { now = new Date() } = {}): Promise<AgtResult> {
    // PRESSUPOSTO: assinamos o NIF e os filtros (o anexo lista "documentNo", que o serviço não recebe). Confirmar com a AGT.
    const body = { ...this.envelope(now), jwsSignature: signJws({ taxRegistrationNumber: this.nif, ...filters }, this.key), ...filters };
    const { status, json } = await this.post("listarSeries", body);
    return status === 200 ? { kind: "ok", result: json?.seriesListResult ?? json } : this.classifyError(status, json);
  }

  async listarFacturas({ queryStartDate, queryEndDate }: { queryStartDate: string; queryEndDate: string }, { now = new Date() } = {}): Promise<AgtResult> {
    const body = { ...this.envelope(now), jwsSignature: signJws({ taxRegistrationNumber: this.nif, queryStartDate, queryEndDate }, this.key), queryStartDate, queryEndDate };
    const { status, json } = await this.post("listarFacturas", body);
    return status === 200 ? { kind: "ok", result: json?.documentListResult ?? json } : this.classifyError(status, json);
  }

  async consultarFactura(documentNo: string, { now = new Date() } = {}): Promise<AgtResult> {
    const body = { ...this.envelope(now), jwsSignature: signJws({ taxRegistrationNumber: this.nif, documentNo }, this.key), documentNo };
    const { status, json } = await this.post("consultarFactura", body);
    return status === 200 ? { kind: "ok", result: json?.statusResult ?? json } : this.classifyError(status, json);
  }

  /** Lado do adquirente: confirmar (C) ou rejeitar (R) uma factura recebida. */
  async validarDocumento(
    { documentNo, action, deductibleVATPercentage }: { documentNo: string; action: "C" | "R"; deductibleVATPercentage?: number },
    { now = new Date() } = {},
  ): Promise<AgtResult> {
    if (!["C", "R"].includes(action)) throw new RangeError("action: C (confirmar) ou R (rejeitar)");
    const body: Record<string, unknown> = {
      ...this.envelope(now),
      jwsSignature: signJws({ taxRegistrationNumber: this.nif, documentNo }, this.key),
      documentNo, action,
    };
    if (deductibleVATPercentage !== undefined) {
      if (action !== "C") throw new RangeError("deductibleVATPercentage só com action = C");
      body.deductibleVATPercentage = deductibleVATPercentage;
    }
    const { status, json } = await this.post("validarDocumento", body);
    return status === 200 ? { kind: "ok", result: json } : this.classifyError(status, json);
  }
}
