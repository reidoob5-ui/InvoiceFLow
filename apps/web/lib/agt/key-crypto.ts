import crypto from "node:crypto";

/**
 * Cifra a chave privada RSA do contribuinte em repouso (AES-256-GCM).
 * FISCAL_KEY_ENCRYPTION_KEY = 32 bytes em base64 (openssl rand -base64 32).
 * Para produção real recomenda-se KMS/HSM; isto evita guardar a chave em claro na base de dados.
 */
function masterKey(): Buffer {
  const raw = process.env.FISCAL_KEY_ENCRYPTION_KEY;
  if (!raw) throw new Error("FISCAL_KEY_ENCRYPTION_KEY não está configurada.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("FISCAL_KEY_ENCRYPTION_KEY tem de ter 32 bytes (base64).");
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, data] = blob.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Segredo cifrado inválido.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export const publicFingerprint = (publicKeyPem: string) =>
  crypto.createHash("sha256").update(publicKeyPem).digest("hex").slice(0, 32);
