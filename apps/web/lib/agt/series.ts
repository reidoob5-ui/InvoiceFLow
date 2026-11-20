import { DOCUMENT_TYPES } from "./codes";

/** Código de série: gerado pela AGT (ex. "LD6325S2042N"); aqui só validamos o formato (3-60 alfanuméricos). */
export function validateSeriesCode(code: unknown, year: unknown): string[] {
  const errs: string[] = [];
  if (typeof code !== "string" || !/^[A-Za-z0-9]{3,60}$/.test(code)) {
    errs.push("seriesCode: 3 a 60 caracteres alfanuméricos");
  }
  if (!Number.isInteger(year)) errs.push("seriesYear: inteiro obrigatório");
  return errs;
}

/** Até 15 de Dezembro só se criam séries para o ano do sistema; depois disso também para o seguinte. */
export function allowedSeriesYears(date: string | Date): number[] {
  const [y, m, d] =
    typeof date === "string"
      ? (date.split("-").map(Number) as [number, number, number])
      : ([date.getFullYear(), date.getMonth() + 1, date.getDate()] as [number, number, number]);
  return m === 12 && d > 15 ? [y, y + 1] : [y];
}

/** "<tipo> <série>/<sequencial>", ex.: "FT A2026/1". Comprimento 8-60 conforme o Anexo I. */
export function formatDocumentNo(type: string, seriesCode: string, seq: number): string {
  if (!(type in DOCUMENT_TYPES)) throw new RangeError(`documentType inválido: ${type}`);
  if (!Number.isInteger(seq) || seq < 1) throw new RangeError("sequencial tem de ser inteiro >= 1");
  const no = `${type} ${seriesCode}/${seq}`;
  if (no.length < 8 || no.length > 60) throw new RangeError(`documentNo fora de 8-60 caracteres: ${no}`);
  return no;
}

/** Data e hora "Africa/Luanda" (UTC+1, sem DST). */
export function luandaParts(now: Date = new Date()): { date: string; dateTime: string } {
  const iso = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  return { date: iso.slice(0, 10), dateTime: iso.slice(0, 19) };
}
