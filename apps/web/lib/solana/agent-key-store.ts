import { generateKeyPair } from "@solana/kit";

/** El agente caduca a las 24 h: IndexedDB sobrevive al cerrar la pestaña (D30). */
export const AGENT_TTL_MS = 24 * 60 * 60 * 1000;

export type StoredAgent = { keyPair: CryptoKeyPair; createdAt: number };

/** Dónde vive el par: IndexedDB o memoria. Sin lógica: la caducidad está en el store. */
export type KeyPairBackend = {
  read(): Promise<StoredAgent | null>;
  write(agent: StoredAgent): Promise<void>;
  remove(): Promise<void>;
};

export type AgentKeyStore = {
  get(): Promise<StoredAgent | null>;
  create(): Promise<StoredAgent>;
  clear(): Promise<void>;
  /** false: el agente vive solo en memoria y se pierde al recargar. */
  readonly persistent: boolean;
};

export function createMemoryBackend(): KeyPairBackend {
  let stored: StoredAgent | null = null;
  return {
    read: async () => stored,
    write: async (agent) => {
      stored = agent;
    },
    remove: async () => {
      stored = null;
    },
  };
}

/**
 * El agente de la demo. La clave privada nunca es extraíble: ni JS ni un XSS pueden
 * leer sus bytes, solo firmar con ella mientras la página está abierta (D13, D30).
 */
export function createAgentKeyStore(
  backend: KeyPairBackend,
  {
    persistent,
    now = Date.now,
    generate = () => generateKeyPair(false),
  }: { persistent: boolean; now?: () => number; generate?: () => Promise<CryptoKeyPair> },
): AgentKeyStore {
  return {
    persistent,
    async get() {
      const agent = await backend.read();
      if (!agent) return null;
      if (now() - agent.createdAt >= AGENT_TTL_MS) {
        await backend.remove();
        return null;
      }
      return agent;
    },
    async create() {
      const agent = { keyPair: await generate(), createdAt: now() };
      await backend.write(agent);
      return agent;
    },
    clear: () => backend.remove(),
  };
}
