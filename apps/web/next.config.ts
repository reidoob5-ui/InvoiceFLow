import type { NextConfig } from "next";

// O cliente Prisma (engine "client") lê query_compiler_bg.wasm do disco em tempo de execução.
// O Next não o consegue detetar sozinho, por isso incluímo-lo explicitamente nas funções serverless.
// Os caminhos são relativos a apps/web; ambos os formatos cobrem instalações na raiz do repositório.
const prismaFiles = [
  "../../node_modules/.prisma/client/**/*",
  "../../node_modules/@prisma/client/runtime/**/*",
  "./node_modules/.prisma/client/**/*",
];

const isProd = process.env.NODE_ENV === "production";

// Security headers for every response. The CSP is applied to pages only: API responses are JSON/PDF,
// and a strict `object-src` on a PDF response blanks the browser's built-in PDF viewer.
// Next.js bootstraps with inline scripts, hence 'unsafe-inline' (a nonce-based CSP needs middleware);
// framing, plugins, base-URI and form targets are locked down regardless.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: baseSecurityHeaders },
      { source: "/((?!api/).*)", headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] },
    ];
  },
  outputFileTracingIncludes: {
    "/*": prismaFiles,
    "/api/**/*": prismaFiles,
    "/**/*": prismaFiles,
  },
};

export default nextConfig;
