// Tabelas oficiais do Decreto Executivo n.º 683/25 (Anexo I e tabelas 4 a 6).

export const DOCUMENT_TYPES: Record<string, string> = {
  FA: "Factura de Adiantamento",
  FT: "Factura",
  FR: "Factura/Recibo",
  FG: "Factura Global",
  GF: "Factura Genérica",
  AC: "Aviso de Cobrança",
  AR: "Aviso de Cobrança/Recibo",
  TV: "Talão de Venda",
  RC: "Recibo em numerário (cash)",
  RG: "Recibo Geral",
  RE: "Estorno ou Recibo de Estorno",
  ND: "Nota de Débito",
  NC: "Nota de Crédito",
  AF: "Factura/Recibo de Autofacturação",
  RP: "Prémio ou Recibo de Prémio",
  RA: "Resseguro Aceite",
  CS: "Imputação a Co-seguradoras",
  LD: "Imputação a Co-seguradora Líder",
};

/** Tipos sem "lines" e com "paymentReceipt" obrigatório. */
export const RECEIPT_TYPES = new Set(["AR", "RC", "RG"]);

/**
 * Tipos cujas linhas usam debitAmount (rectificativos); os restantes usam creditAmount.
 * PRESSUPOSTO (convenção SAF-T): o decreto só diz "um e só um dos dois". Confirmar com a AGT.
 */
export const DEBIT_LINE_TYPES = new Set(["NC", "RE"]);

export const DOCUMENT_STATUS: Record<string, string> = {
  N: "Normal",
  S: "Autofacturação",
  A: "Anulado",
  R: "Resumo de outros documentos criados noutras aplicações",
  C: "Correcção de documento rejeitado pela AGT",
};

export const CANCEL_REASONS: Record<string, string> = {
  I: "Incorrecta identificação do adquirente",
  N: "Documento não enviado ao adquirente",
};

export const OPERATION_TYPES = new Set(["SE", "SS", "STP", "SR", "SIF", "SHS", "ST", "SG", "TB", "AS", "QT", "RD"]);
export const TAX_TYPES = new Set(["IVA", "IS", "IEC", "CEOC", "NS"]);
export const IVA_CODES = new Set(["NOR", "INT", "RED", "ISE", "OUT"]);
export const WITHHOLDING_TYPES = new Set(["IRT", "II", "IS", "IVA", "IP", "IAC", "OU", "IRPC", "IRPS"]);

/**
 * Só a taxa geral (14%) tem valor por defeito; INT, RED e OUT têm de vir EXPLÍCITAS em cada linha
 * para nunca facturarmos com uma taxa adivinhada.
 */
export const DEFAULT_IVA_RATES: Record<string, string> = { NOR: "14" };

const letters = "abcdefghijklmnopqrstuvwxyz";
const list = (codes: string[], art: string, n1: boolean): Record<string, string> =>
  Object.fromEntries(
    codes.map((code, i) => [code, `Isento nos termos da alínea ${letters[i]}) ${n1 ? "do n.º 1 " : ""}do artigo ${art}.º do CIVA`]),
  );

// Tabela 4 - Isenções de IVA (menção a constar no documento)
export const IVA_EXEMPTIONS: Record<string, string> = {
  ...list(["M10", "M11", "M12", "M13", "M14", "M15", "M16", "M17", "M18", "M19", "M20", "M21"], "12", true),
  M22: "Isento nos termos da alínea m) do artigo 12.º do CIVA",
  M23: "Isento nos termos da alínea n) do artigo 12.º do CIVA",
  M24: "Isento nos termos da alínea o) do artigo 12.º do CIVA",
  ...list(["M80", "M81", "M82", "M83", "M84"], "14", true),
  M85: "Isento nos termos da alínea a) do n.º 2 do artigo 14.º do CIVA",
  M86: "Isento nos termos da alínea b) do n.º 2 do artigo 14.º do CIVA",
  ...Object.fromEntries(
    ["M30", "M31", "M32", "M33", "M34", "M35", "M36", "M37", "M38"].map((c, i) => [
      c,
      `Isento nos termos da alínea ${letters[i]}) do artigo 15.º do CIVA`,
    ]),
  ),
  ...Object.fromEntries(
    ["M90", "M91", "M92", "M93"].map((c, i) => [c, `Isento nos termos da alínea ${letters[i]}) do n.º 1 do artigo 16.º do CIVA`]),
  ),
  M00: "IVA – Regime Simplificado",
  M02: "Transmissão de bens e serviço não sujeita",
  M04: "IVA – Regime de Exclusão",
};

// Tabela 5 - Isenções de Imposto de Selo
export const IS_EXEMPTIONS = new Set(["S01", "S02", "S03"]);
// Tabela 6 - Isenções de Imposto Especial de Consumo
export const IEC_EXEMPTIONS = new Set(Array.from({ length: 16 }, (_, i) => `I${String(i + 1).padStart(2, "0")}`));

export const API_ERRORS: Record<string, string> = {
  E94: "NIF diferente",
  E95: "NIF emissor diferente",
  E96: "Solicitação mal efectuada (erro de estrutura) / ainda em processamento",
  E97: "Solicitação prematura",
  E98: "Demasiadas solicitações repetidas",
};

export const RESULT_CODES: Record<number, string> = {
  0: "Concluído, sem facturas inválidas",
  1: "Concluído, com facturas válidas (com ou sem penalização) e inválidas",
  2: "Concluído, sem facturas válidas",
  7: "Não respondida: prematura ou repetitiva",
  8: "Processamento em curso",
  9: "Processamento cancelado",
};

export const MAX_DOCUMENTS_PER_REQUEST = 30;
export const SUBMISSION_DEADLINE_HOURS = 24;
