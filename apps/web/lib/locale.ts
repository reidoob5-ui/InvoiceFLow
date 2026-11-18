import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n";

type LocaleSources = {
  /** Explicit preference selected by the signed-in user. */
  userPreference?: string | null;
  /** Organization default, used when the user has not chosen a preference. */
  organizationPreference?: string | null;
  /** Raw Accept-Language header from the browser. */
  acceptLanguage?: string | null;
};

function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const normalized = value.trim().replace(/_/g, "-").toLowerCase();
  const language = normalized.split("-")[0];
  return isLocale(language) ? language : null;
}

/**
 * Resolve the interface language without guessing from IP or changing legal
 * organization settings. A saved user choice wins, then the organization
 * default, then the browser's Accept-Language preferences.
 */
export function resolveInterfaceLocale(sources: LocaleSources): Locale {
  const user = normalizeLocale(sources.userPreference);
  if (user) return user;

  const organization = normalizeLocale(sources.organizationPreference);
  if (organization) return organization;

  const candidates = (sources.acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...parameters] = part.trim().split(";");
      const quality = parameters
        .map((parameter) => parameter.trim().match(/^q=(0(?:\.\d+)?|1(?:\.0+)?)$/i))
        .find(Boolean);
      return { locale: normalizeLocale(tag), quality: quality ? Number(quality[1]) : 1, index };
    })
    .filter((item): item is { locale: Locale; quality: number; index: number } => !!item.locale && item.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  return candidates[0]?.locale ?? DEFAULT_LOCALE;
}

/** Formatting context is organization-owned, not inferred from visitor IP. */
export function organizationFormatting(input: {
  locale?: string | null;
  currency?: string | null;
  timezone?: string | null;
}) {
  const locale = normalizeLocale(input.locale) ?? DEFAULT_LOCALE;
  const currency = input.currency?.trim().toUpperCase() ?? "";
  const timezone = input.timezone?.trim() ?? "";

  return {
    locale,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD",
    timezone: timezone || "UTC",
  };
}
