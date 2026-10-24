import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sin AGENTS.md autogenerado: el contexto para agentes vive en CLAUDE.md.
  agentRules: false,
  // @xargos/shared se publica como TypeScript sin compilar (exports → src/index.ts).
  transpilePackages: ["@xargos/shared"],
  experimental: {
    // shared importa "./contract.js" apuntando a contract.ts. Turbopack no soporta
    // extensionAlias, por eso dev y build usan --webpack.
    extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
  },
};

export default nextConfig;
