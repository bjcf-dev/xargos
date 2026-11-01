import { getAddressFromPublicKey } from "@solana/kit";
import { fixtureSetupReady } from "@xargos/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FetchLike } from "@/lib/api/client";
import { type ApiMode, apiMode } from "@/lib/api/mode";
import { type AgentKeyStore, openAgentKeyStore } from "@/lib/solana/agent-key-store";
import { isEd25519Supported } from "@/lib/solana/ed25519";
import { browserRpc, browserRpcUrl } from "@/lib/solana/rpc";
import type { SendRpc } from "@/lib/solana/send";
import { createPayingFetch, type PaymentLimit } from "@/lib/x402/payer";
import { createRealSigner } from "./real-signer";
import type { DemoSigner } from "./signer";

export type AgentState =
  | { status: "loading" }
  | { status: "unsupported" }
  /** No se pudo crear o leer la clave (p. ej. el navegador rechazó generarla). */
  | { status: "failed"; message: string }
  | {
      status: "ready";
      address: string;
      /** undefined: el signer de mock (en useDemo, null sería "ninguno"). */
      signer: DemoSigner | undefined;
      /** El fetch que paga x402 con esta clave, hasta `limit` (F8). undefined en mock: no se paga. */
      payer: ((limit: PaymentLimit) => FetchLike) | undefined;
      /** false: el agente vive solo en memoria y se pierde al recargar. */
      persistent: boolean;
      newAgent(): Promise<void>;
    };

export type UseAgentOptions = {
  mode?: ApiMode;
  openStore?: () => Promise<AgentKeyStore>;
  ed25519?: () => Promise<boolean>;
  rpc?: () => SendRpc;
  /** URL del RPC con el que el pago x402 lee su mint: la ruta del front (la CSP bloquea otras). */
  rpcUrl?: () => string;
};

/** Un fallo al crear o leer la clave: sin esto la demo se quedaría cargando para siempre. */
const failed = (error: unknown): AgentState => ({
  status: "failed",
  message: error instanceof Error ? error.message : String(error),
});

const MOCK_AGENT: AgentState = {
  status: "ready",
  address: fixtureSetupReady.agent,
  signer: undefined,
  payer: undefined,
  persistent: true,
  newAgent: async () => {},
};

/**
 * El agente de la demo. En mock, el de las fixtures. Fuera de mock, la clave de este
 * navegador (D13, D30): la misma tras recargar, hasta 24 h o hasta pedir uno nuevo.
 */
export function useAgent({
  mode = apiMode,
  openStore = openAgentKeyStore,
  ed25519 = isEd25519Supported,
  rpc = browserRpc,
  rpcUrl = browserRpcUrl,
}: UseAgentOptions = {}): AgentState {
  const [agent, setAgent] = useState<AgentState>(
    mode === "mock" ? MOCK_AGENT : { status: "loading" },
  );
  const store = useRef<AgentKeyStore | null>(null);
  // Las dependencias se leen al montar: cambiarlas no debe crear otro agente.
  const deps = useRef({ openStore, ed25519, rpc, rpcUrl });

  const load = useCallback(async (fresh: boolean) => {
    const current = store.current;
    if (!current) return;
    if (fresh) await current.clear();
    const { keyPair } = (await current.get()) ?? (await current.create());
    setAgent({
      status: "ready",
      address: await getAddressFromPublicKey(keyPair.publicKey),
      signer: createRealSigner({ rpc: deps.current.rpc(), keyPair }),
      payer: (limit) => createPayingFetch({ keyPair, rpcUrl: deps.current.rpcUrl(), limit }),
      persistent: current.persistent,
      newAgent: () => load(true).catch((error: unknown) => setAgent(failed(error))),
    });
  }, []);

  useEffect(() => {
    if (mode === "mock") return;
    let cancelled = false;
    void (async () => {
      if (!(await deps.current.ed25519())) {
        if (!cancelled) setAgent({ status: "unsupported" });
        return;
      }
      const opened = await deps.current.openStore();
      if (cancelled) return;
      store.current = opened;
      await load(false);
    })().catch((error: unknown) => {
      if (!cancelled) setAgent(failed(error));
    });
    return () => {
      cancelled = true;
    };
  }, [mode, load]);

  return agent;
}
