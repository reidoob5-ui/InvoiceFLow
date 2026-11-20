// QR Code dos documentos impressos (Anexo III do decreto 683/25).
// Especificação: QR Model 2, versão 4 (33x33), correcção M, modo byte, UTF-8, espaços do documentNo -> %20.
// Este módulo gera e VERIFICA o conteúdo (URL); a imagem é desenhada por quem imprime (ver README).

export const QR_BASE_URL = "https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe";

/** Capacidade em bytes (modo byte, nível M) das versões 1 a 10 da ISO/IEC 18004. */
export const BYTE_CAPACITY_M = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];

export function qrUrl(documentNo: string, nifEmissor: string, { base = QR_BASE_URL }: { base?: string } = {}): string {
  if (!nifEmissor) throw new TypeError("qrUrl: nifEmissor obrigatório");
  return `${base}?emissor=${encodeURIComponent(nifEmissor)}&document=${String(documentNo).replace(/ /g, "%20")}`;
}

export function minQrVersionM(payload: string): number | null {
  const n = new TextEncoder().encode(payload).length;
  const i = BYTE_CAPACITY_M.findIndex((cap) => n <= cap);
  return i === -1 ? null : i + 1;
}

export function checkQrFitsVersion4(documentNo: string, nifEmissor: string, opts?: { base?: string }) {
  const url = qrUrl(documentNo, nifEmissor, opts);
  const bytes = new TextEncoder().encode(url).length;
  return { url, bytes, capacityV4M: BYTE_CAPACITY_M[3]!, fits: bytes <= BYTE_CAPACITY_M[3]!, minVersion: minQrVersionM(url) };
}
