import crypto from "node:crypto";

/**
 * Assinaturas RS256 (RSA-SHA256, PKCS#1 v1.5).
 *
 * Confirmado (doc AGT "Gestão de Certificados e Chaves" + Anexo I): RSA >= 2048 bits, PEM, RS256 e a lista
 * de campos assinados por assinatura.
 * PRESSUPOSTO: serialização JWS compacta (header.payload.assinatura em base64url) sobre JSON com os campos
 * pela ordem do Anexo I. O Anexo I fixa 256 caracteres para as assinaturas, o que não bate com uma JWS
 * compacta de RSA-2048: TEM de ser esclarecido com a AGT. Só este ficheiro muda.
 */
export const SIGNATURE_PROFILE = "jws-compact-rs256-agt-doc-2025";

const b64u = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

export function generateKeyPair(bits = 2048): { publicKey: string; privateKey: string } {
  if (bits < 2048) throw new RangeError("A AGT exige RSA de pelo menos 2048 bits");
  return crypto.generateKeyPairSync("rsa", {
    modulusLength: bits,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

export function assertValidRsaKey(pem: string, kind: "private" | "public" = "private") {
  const key = kind === "private" ? crypto.createPrivateKey(pem) : crypto.createPublicKey(pem);
  if (key.asymmetricKeyType !== "rsa") throw new TypeError("A chave tem de ser RSA");
  if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new RangeError("RSA mínimo: 2048 bits");
  return key;
}

export function signJws(payload: unknown, privateKeyPem: string): string {
  assertValidRsaKey(privateKeyPem, "private");
  const header = { alg: "RS256", typ: "JWT" };
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(input), privateKeyPem);
  return `${input}.${b64u(sig)}`;
}

export function verifyJws(
  token: unknown,
  publicKeyPem: string,
): { valid: true; payload: unknown } | { valid: false; reason: string } {
  const parts = String(token).split(".");
  if (parts.length !== 3) return { valid: false, reason: "formato" };
  const [h, p, s] = parts as [string, string, string];
  let ok = false;
  try {
    ok = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), publicKeyPem, Buffer.from(s, "base64url"));
  } catch {
    return { valid: false, reason: "chave" };
  }
  if (!ok) return { valid: false, reason: "assinatura" };
  try {
    return { valid: true, payload: JSON.parse(Buffer.from(p, "base64url").toString("utf8")) };
  } catch {
    return { valid: false, reason: "payload" };
  }
}

/** jwsDocumentSignature: documentNo, taxRegistrationNumber, documentType, documentDate, customerTaxID,
 *  customerCountry, companyName, documentTotals (pela ordem do Anexo I). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function documentSignaturePayload(doc: Record<string, any>, taxRegistrationNumber: string) {
  return {
    documentNo: doc.documentNo,
    taxRegistrationNumber,
    documentType: doc.documentType,
    documentDate: doc.documentDate,
    customerTaxID: doc.customerTaxID,
    customerCountry: doc.customerCountry,
    companyName: doc.companyName,
    documentTotals: doc.documentTotals,
  };
}

export type SoftwareInfoDetail = { productId: string; productVersion: string; softwareValidationNumber: string };

export function softwareSignaturePayload(d: SoftwareInfoDetail): SoftwareInfoDetail {
  return { productId: d.productId, productVersion: d.productVersion, softwareValidationNumber: d.softwareValidationNumber };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const signDocument = (doc: Record<string, any>, nif: string, key: string) =>
  signJws(documentSignaturePayload(doc, nif), key);
export const signSoftware = (detail: SoftwareInfoDetail, key: string) => signJws(softwareSignaturePayload(detail), key);
