import type { Metadata } from "next";
import "./globals.css";
import SiteFrame from "@/components/site-frame";
export const metadata: Metadata = {
  title: "InvoiceFlow — Business finance, in control",
  description: "Cria facturas, gere clientes e acompanha o fluxo financeiro do teu negócio.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt"><body><SiteFrame>{children}</SiteFrame></body></html>;
}