import type { NextConfig } from "next";

// O cliente Prisma (engine "client") lê query_compiler_bg.wasm do disco em tempo de execução.
// O Next não o consegue detetar sozinho, por isso incluímo-lo explicitamente nas funções serverless.
// Os caminhos são relativos a apps/web; ambos os formatos cobrem instalações na raiz do repositório.
const prismaFiles = [
  "../../node_modules/.prisma/client/**/*",
  "../../node_modules/@prisma/client/runtime/**/*",
  "./node_modules/.prisma/client/**/*",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/*": prismaFiles,
    "/api/**/*": prismaFiles,
    "/**/*": prismaFiles,
  },
};

export default nextConfig;
