// Starting points for the tax configuration screen. These are general standard rates only and are
// NOT a substitute for local tax advice: each jurisdiction's rules (exemptions, withholding, e-invoicing,
// certified software requirements) must be validated before issuing legal documents there.
export type TaxPreset = { country: string; name: string; rate: number; kind: "VAT" | "SALES_TAX" };

export const TAX_PRESETS: TaxPreset[] = [
  { country: "AO", name: "IVA (taxa geral)", rate: 14, kind: "VAT" },
  { country: "PT", name: "IVA (continente)", rate: 23, kind: "VAT" },
  { country: "MZ", name: "IVA", rate: 16, kind: "VAT" },
  { country: "ES", name: "IVA", rate: 21, kind: "VAT" },
  { country: "FR", name: "TVA", rate: 20, kind: "VAT" },
  { country: "DE", name: "MwSt.", rate: 19, kind: "VAT" },
  { country: "GB", name: "VAT", rate: 20, kind: "VAT" },
  { country: "ZA", name: "VAT", rate: 15, kind: "VAT" },
];

export function presetsFor(country: string): TaxPreset[] {
  return TAX_PRESETS.filter((p) => p.country === country.toUpperCase());
}

export const COUNTRIES: { code: string; name: string }[] = [
  { code: "AO", name: "Angola" }, { code: "PT", name: "Portugal" }, { code: "BR", name: "Brasil" },
  { code: "MZ", name: "Moçambique" }, { code: "CV", name: "Cabo Verde" }, { code: "ZA", name: "África do Sul" },
  { code: "ES", name: "Espanha" }, { code: "FR", name: "França" }, { code: "DE", name: "Alemanha" },
  { code: "GB", name: "Reino Unido" }, { code: "US", name: "Estados Unidos" }, { code: "CA", name: "Canadá" },
];

export function defaultCurrencyFor(country: string): string {
  const map: Record<string, string> = {
    AO: "AOA", PT: "EUR", ES: "EUR", FR: "EUR", DE: "EUR", BR: "BRL", MZ: "MZN", CV: "CVE", ZA: "ZAR",
    GB: "GBP", US: "USD", CA: "CAD",
  };
  return map[country.toUpperCase()] ?? "USD";
}
