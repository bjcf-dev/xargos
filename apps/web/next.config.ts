import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sin AGENTS.md autogenerado: el contexto para agentes vive en CLAUDE.md.
  agentRules: false,
  // @xargos/shared se publica como TypeScript sin compilar (exports → src/index.ts).
  transpilePackages: ["@xargos/shared"],
  turbopack: {
    resolveAlias: {
      // msw/browser no exporta nada para Node ("node": null). El SSR compila el
      // MswProvider aunque el import() solo corra en el navegador: fuera del
      // navegador se sustituye por un módulo vacío.
      "msw/browser": { browser: "msw/browser", default: false },
    },
  },
};

export default nextConfig;
