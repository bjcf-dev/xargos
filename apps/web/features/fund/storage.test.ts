import { describe, expect, it } from "vitest";
import { createDepositStore, FUND_STORAGE_KEY } from "./storage";
import type { Deposit } from "./types";

const DEPOSIT: Deposit = {
  depositAddress: "0xdeposit",
  depositMemo: "m1",
  deadline: "2026-11-06T12:25:00.000Z",
  timeWhenInactive: "2026-11-06T12:30:00.000Z",
  quote: {
    dry: false,
    originAsset: "nep141:base-usdc",
    destinationAsset: "nep141:sol-usdc",
    recipient: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
    refundTo: "0x1111111111111111111111111111111111111111",
    amountIn: "2000000",
    amountInFormatted: "2",
    amountInUsd: "2.00",
    amountOut: "1751299",
    amountOutFormatted: "1.751299",
    amountOutUsd: "1.75",
    minAmountOut: "1733786",
    timeEstimateSeconds: 40,
    depositAddress: "0xdeposit",
  },
};

/** localStorage en memoria, como el del navegador. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
}

/** Lo que pasa en una ventana privada o con los datos del sitio bloqueados. */
const blocked = () => {
  throw new DOMException("The operation is insecure.", "SecurityError");
};

describe("createDepositStore", () => {
  it("brings back the saved deposit after a reload", () => {
    const storage = memoryStorage();
    createDepositStore(() => storage).save(DEPOSIT);

    expect(createDepositStore(() => storage).load()).toEqual(DEPOSIT);
  });

  it("has nothing when nothing was saved", () => {
    expect(createDepositStore(() => memoryStorage()).load()).toBeUndefined();
  });

  it("forgets the deposit on clear", () => {
    const storage = memoryStorage();
    const store = createDepositStore(() => storage);
    store.save(DEPOSIT);

    store.clear();

    expect(store.load()).toBeUndefined();
    expect(storage.getItem(FUND_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ["broken JSON", "{not json"],
    ["no deposit address", JSON.stringify({ quote: DEPOSIT.quote })],
    ["no quote", JSON.stringify({ depositAddress: "0xdeposit" })],
    ["a number", "42"],
  ])("ignores %s instead of throwing", (_name, raw) => {
    const storage = memoryStorage();
    storage.setItem(FUND_STORAGE_KEY, raw);

    expect(createDepositStore(() => storage).load()).toBeUndefined();
  });

  it("never throws when the browser blocks storage", () => {
    const store = createDepositStore(blocked);

    expect(() => store.save(DEPOSIT)).not.toThrow();
    expect(() => store.clear()).not.toThrow();
    expect(store.load()).toBeUndefined();
  });

  it("never throws when there is no storage at all (server render)", () => {
    const store = createDepositStore(() => undefined);

    expect(() => store.save(DEPOSIT)).not.toThrow();
    expect(store.load()).toBeUndefined();
  });
});
