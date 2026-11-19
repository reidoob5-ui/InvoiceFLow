import { ImageResponse } from "next/og";

export const alt = "InvoiceFlow — Facturação e finanças com IA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg,#0b1220 0%,#312e81 60%,#0e7490 100%)", color: "white" }}>
      <div style={{ fontSize: 40, fontWeight: 700, opacity: 0.85 }}>InvoiceFlow</div>
      <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, marginTop: 24 }}>Facturação e finanças, com IA</div>
      <div style={{ fontSize: 32, marginTop: 28, opacity: 0.8 }}>Factura, cobra e acompanha o teu negócio num só lugar.</div>
    </div>,
    size,
  );
}
