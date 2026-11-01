import type { KeyPairBackend, StoredAgent } from "./agent-key-store";

const STORE = "agent";
const KEY = "current";

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * IndexedDB guarda la CryptoKey tal cual (es serializable), también si no es extraíble.
 * Sin lógica propia: jsdom no trae IndexedDB, así que se comprueba en el navegador.
 */
export async function openIndexedDbBackend(dbName = "xargos-agent"): Promise<KeyPairBackend> {
  const open = indexedDB.open(dbName, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  const db = await done(open);

  const store = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);
  return {
    read: async () => ((await done(store("readonly").get(KEY))) as StoredAgent | undefined) ?? null,
    write: async (agent) => {
      await done(store("readwrite").put(agent, KEY));
    },
    remove: async () => {
      await done(store("readwrite").delete(KEY));
    },
  };
}
