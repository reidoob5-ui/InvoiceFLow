import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 16, background: "linear-gradient(135deg,#818cf8,#8b5cf6,#22d3ee)", color: "white", fontSize: 42, fontWeight: 900 }}>I</div>,
    size,
  );
}
