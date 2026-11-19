import type { Metadata } from "next";
import "./globals.css";
import SiteFrame from "@/components/site-frame";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "InvoiceFlow — Facturação e finanças com IA", template: "%s · InvoiceFlow" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["facturação", "facturas online", "gestão financeira", "software de facturação Angola", "cobranças", "despesas", "orçamentos", "IA financeira"],
  openGraph: { type: "website", siteName: SITE_NAME, title: "InvoiceFlow — Facturação e finanças com IA", description: SITE_DESCRIPTION, locale: "pt_PT", url: SITE_URL },
  twitter: { card: "summary_large_image", title: "InvoiceFlow — Facturação e finanças com IA", description: SITE_DESCRIPTION },
  alternates: { canonical: "/" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt"><body><SiteFrame>{children}</SiteFrame></body></html>;
}
