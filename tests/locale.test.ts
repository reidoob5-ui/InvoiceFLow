import { describe, expect, it } from "vitest";
import { organizationFormatting, resolveInterfaceLocale } from "@/lib/locale";

describe("interface locale resolution", () => {
  it("uses an explicit user preference first", () => {
    expect(resolveInterfaceLocale({ userPreference: "fr-CA", organizationPreference: "pt", acceptLanguage: "es" })).toBe("fr");
  });

  it("uses the organization default before browser language", () => {
    expect(resolveInterfaceLocale({ organizationPreference: "en-GB", acceptLanguage: "fr-FR" })).toBe("en");
  });

  it("respects Accept-Language quality weights", () => {
    expect(resolveInterfaceLocale({ acceptLanguage: "fr-FR;q=0.7, es-ES;q=0.9, pt-AO;q=1" })).toBe("pt");
  });

  it("ignores unsupported and zero-quality languages", () => {
    expect(resolveInterfaceLocale({ acceptLanguage: "de-DE, it-IT;q=0, fr-FR;q=0.5" })).toBe("fr");
  });

  it("falls back to Portuguese when no supported preference exists", () => {
    expect(resolveInterfaceLocale({ acceptLanguage: "de-DE, it-IT" })).toBe("pt");
  });
});

describe("organization formatting", () => {
  it("keeps legal currency and timezone independent of visitor locale", () => {
    expect(organizationFormatting({ locale: "en", currency: "AOA", timezone: "Africa/Luanda" })).toEqual({
      locale: "en",
      currency: "AOA",
      timezone: "Africa/Luanda",
    });
  });

  it("validates and safely defaults formatting settings", () => {
    expect(organizationFormatting({ locale: "xx", currency: "INVALID", timezone: " " })).toEqual({
      locale: "pt",
      currency: "USD",
      timezone: "UTC",
    });
  });
});
