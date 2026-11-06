import { getAddressFromPublicKey } from "@solana/kit";
import { fixtureSetupReady } from "@xargos/shared";
import { useEffect, useState } from "react";
import { type ApiMode, apiMode } from "@/lib/api/mode";
import { createAgentKeyStore } from "@/lib/solana/agent-key-store";
import { openIndexedDbBackend } from "@/lib/solana/indexed-db-backend";

/**
 * La pública del agente guardado en este navegador, o null. Solo lee: no crea agente ni prueba
 * IndexedDB como `openAgentKeyStore`, que con la demo abierta en otra pestaña podría pisarlo.
 * Un agente caducado (24 h) no cuenta, igual que en la demo.
 */
export async function readAgentAddress(): Promise<string | null> {
  const store = createAgentKeyStore(await openIndexedDbBackend(), { persistent: true });
  const agent = await store.get();
  return agent ? getAddressFromPublicKey(agent.keyPair.publicKey) : null;
}

/**
 * Para que /fund no acepte la clave del agente de la demo como destinatario (F15). En mock, el de
 * las fixtures. undefined si no hay agente o no se puede leer: entonces solo queda el aviso.
 * Un agente que solo vive en memoria (sin IndexedDB) no se ve desde aquí.
 */
export function useAgentAddress({
  mode = apiMode,
  read = readAgentAddress,
}: {
  mode?: ApiMode;
  read?: () => Promise<string | null>;
} = {}): string | undefined {
  const [address, setAddress] = useState<string | undefined>(
    mode === "mock" ? fixtureSetupReady.agent : undefined,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: se lee una vez al montar.
  useEffect(() => {
    if (mode === "mock") return;
    let cancelled = false;
    read()
      .then((found) => {
        if (!cancelled) setAddress(found ?? undefined);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode]);
  return address;
}
