import { describe, expect, it } from "vitest";
import { isEd25519Supported } from "./ed25519";

const subtle = (generateKey: () => Promise<unknown>) =>
  ({ generateKey }) as unknown as SubtleCrypto;

describe("isEd25519Supported", () => {
  it("is false without crypto.subtle", async () => {
    expect(await isEd25519Supported(null)).toBe(false);
  });

  it("is false when generateKey rejects", async () => {
    expect(await isEd25519Supported(subtle(() => Promise.reject(new Error("no"))))).toBe(false);
  });

  it("is true when generateKey resolves", async () => {
    expect(await isEd25519Supported(subtle(async () => ({})))).toBe(true);
  });
});
