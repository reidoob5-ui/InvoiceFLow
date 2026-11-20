import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgtClient, NetworkError } from "@/lib/agt/client";
import { generateKeyPair, verifyJws } from "@/lib/agt/signing";
import { buildDocument } from "@/lib/agt/document";
import { encryptSecret, decryptSecret } from "@/lib/agt/key-crypto";

const NIF = "5417012345";
const keys = { taxpayer: generateKeyPair(), producer: generateKeyPair() };
const reqs: Array<{ path: string; body: any; auth?: string }> = [];
let mode: "ok" | "rate" | "nif" | "reject" = "ok";
let server: http.Server;
let baseUrl = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const send = (s: number, b: unknown) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
      const body = raw ? JSON.parse(raw) : {};
      reqs.push({ path: req.url!, body, auth: req.headers.authorization });
      if (mode === "rate") return send(429, { errorEntry: { idError: "E98" } });
      if (mode === "nif") return send(422, { errorEntry: { idError: "E94", descriptionError: "nif diferente" } });
      const sw = verifyJws(body.softwareInfo?.jwsSoftwareSignature, keys.producer.publicKey);
      if (!sw.valid) return send(400, [{ idError: "E96" }]);
      if (req.url!.endsWith("/registarFactura")) {
        if (mode === "reject") return send(400, [{ idError: "E10", descriptionError: "estrutura", documentNo: body.documents[0].documentNo }]);
        return send(200, { requestID: "REQ000000000001" });
      }
      if (req.url!.endsWith("/solicitarSerie")) {
        const sig = verifyJws(body.jwsSignature, keys.taxpayer.publicKey);
        if (!sig.valid) return send(400, [{ idError: "E96" }]);
        return send(200, { resultCode: 1, seriesFEResult: { seriesCode: "FT26S1N", firstDocumentNo: "1", lastDocumentNo: "999", authorizedQuantity: "999" } });
      }
      if (req.url!.endsWith("/obterEstado")) {
        return send(200, { statusResult: { requestID: body.requestID, resultCode: "0", documentStatusList: [{ documentNo: "FT A2026/1", documentStatus: "V" }] } });
      }
      return send(404, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const client = () => new AgtClient({
  baseUrl, taxpayerNif: NIF, taxpayerPrivateKey: keys.taxpayer.privateKey, producerPrivateKey: keys.producer.privateKey,
  software: { productId: "InvoiceFlow", productVersion: "0.1.0", validationNumber: "TESTE-0001" }, credentials: { username: "u", password: "p" },
});
const doc = () => buildDocument(
  { documentType: "FT", customer: { taxId: "5000123456" }, lines: [{ operationType: "SG", productCode: "P", productDescription: "x", quantity: 1, unitPrice: "100", unitOfMeasure: "UN", tax: { taxType: "IVA", taxCode: "NOR" } }] },
  { nif: NIF, companyName: "Empresa", signingKey: keys.taxpayer.privateKey, documentNo: "FT A2026/1" },
);

describe("AgtClient", () => {
  it("regista facturas com Basic Auth, assinatura do software e envelope 2.0", async () => {
    mode = "ok";
    const r = await client().registarFactura([doc()]);
    expect(r).toMatchObject({ kind: "accepted", requestID: "REQ000000000001" });
    const last = reqs[reqs.length - 1]!;
    expect(last.auth).toBe(`Basic ${Buffer.from("u:p").toString("base64")}`);
    expect(last.body.schemaVersion).toBe("2.0");
    expect(last.body.numberOfEntries).toBe(1);
  });

  it("limita a 30 documentos e recusa lote vazio", async () => {
    await expect(client().registarFactura([])).rejects.toThrow(/Nenhum/);
    await expect(client().registarFactura(Array(31).fill(doc()))).rejects.toThrow(/Máximo/);
  });

  it("solicitarSerie assinada devolve o código gerado pela AGT", async () => {
    mode = "ok";
    expect(await client().solicitarSerie({ seriesYear: 2026, documentType: "FT" })).toMatchObject({ kind: "created", seriesCode: "FT26S1N", lastDocumentNo: 999 });
  });

  it("obterEstado devolve o estado por documento", async () => {
    mode = "ok";
    const r = await client().obterEstado("REQ000000000001");
    expect(r.kind).toBe("status");
    expect(r.documents[0]).toMatchObject({ documentNo: "FT A2026/1", status: "V" });
  });

  it("classifica E98, E94 e rejeição por documento", async () => {
    mode = "rate"; expect((await client().registarFactura([doc()])).kind).toBe("rate_limited");
    mode = "nif"; expect((await client().registarFactura([doc()])).kind).toBe("fatal");
    mode = "reject";
    const r = await client().registarFactura([doc()]);
    expect(r.kind).toBe("rejected");
    expect(r.errors[0].documentNo).toBe("FT A2026/1");
  });

  it("erro de rede vira NetworkError", async () => {
    const c = new AgtClient({
      baseUrl: "http://127.0.0.1:1", taxpayerNif: NIF, taxpayerPrivateKey: keys.taxpayer.privateKey, producerPrivateKey: keys.producer.privateKey,
      software: { productId: "a", productVersion: "1", validationNumber: "x" },
    });
    await expect(c.registarFactura([doc()])).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("cifra da chave do contribuinte", () => {
  it("AES-256-GCM: ida e volta, falha com chave errada ou dados adulterados", () => {
    process.env.FISCAL_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const blob = encryptSecret("-----BEGIN PRIVATE KEY-----abc");
    expect(blob.startsWith("v1:")).toBe(true);
    expect(blob.includes("BEGIN")).toBe(false);
    expect(decryptSecret(blob)).toBe("-----BEGIN PRIVATE KEY-----abc");
    expect(() => decryptSecret(blob.slice(0, -4) + "AAAA")).toThrow();
    process.env.FISCAL_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => decryptSecret(blob)).toThrow();
  });
});
