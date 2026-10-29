import { describe, expect, it, vi } from "vitest";

vi.mock("@solana/kit", () => ({
  generateKeyPair: vi.fn(async () => ({ publicKey: {}, privateKey: {} }) as CryptoKeyPair),
}));

import { generateKeyPair } from "@solana/kit";
import { AGENT_TTL_MS, createAgentKeyStore, createMemoryBackend } from "./agent-key-store";

const MINUTE = 60 * 1000;
const fakePair = () => ({ publicKey: {}, privateKey: {} }) as CryptoKeyPair;

function setup(start = 1_000_000) {
  let now = start;
  const backend = createMemoryBackend();
  const store = createAgentKeyStore(backend, {
    persistent: true,
    now: () => now,
    generate: async () => fakePair(),
  });
  return { store, backend, advance: (ms: number) => (now += ms), start };
}

describe("createAgentKeyStore", () => {
  it("get() returns null when nothing is stored", async () => {
    const { store } = setup();
    expect(await store.get()).toBeNull();
  });

  it("create() stores a pair with createdAt = now()", async () => {
    const { store, start } = setup();
    const created = await store.create();
    expect(created.createdAt).toBe(start);
    expect((await store.get())?.keyPair).toBe(created.keyPair);
  });

  it("keeps the agent at 24 h minus one minute", async () => {
    const { store, advance } = setup();
    const created = await store.create();
    advance(AGENT_TTL_MS - MINUTE);
    expect((await store.get())?.keyPair).toBe(created.keyPair);
  });

  it("drops the agent at exactly 24 h", async () => {
    const { store, backend, advance } = setup();
    await store.create();
    advance(AGENT_TTL_MS);
    expect(await store.get()).toBeNull();
    expect(await backend.read()).toBeNull();
  });

  it("clear() removes the agent", async () => {
    const { store } = setup();
    await store.create();
    await store.clear();
    expect(await store.get()).toBeNull();
  });

  it("create() asks for a non-extractable pair", async () => {
    const store = createAgentKeyStore(createMemoryBackend(), { persistent: false });
    await store.create();
    expect(generateKeyPair).toHaveBeenCalledWith(false);
    expect(store.persistent).toBe(false);
  });
});
