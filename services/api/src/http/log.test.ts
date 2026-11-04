import { describe, expect, it, vi } from "vitest";
import { redact, safeLog } from "./log";

/** Built here, not written out, so the secret scanner does not take it for a real key. */
const FAKE_AURORA_KEY = "k".repeat(32);

describe("redact", () => {
  it("hides the Aurora API key that travels in the URL path", () => {
    const key = FAKE_AURORA_KEY;
    for (const path of ["tokens", "quote", "status", "deposit/submit"]) {
      const text = `fetch failed: https://intents-api.aurora.dev/api/${path}/${key}?depositAddress=0xabc`;
      expect(redact(text)).toBe(`fetch failed: https://intents-api.aurora.dev/api/${path}/***`);
    }
    expect(redact(`/api/quote/${key} timed out`)).toBe("/api/quote/*** timed out");
  });

  it("leaves paths that carry no Aurora key alone", () => {
    expect(redact("POST /fund/quote failed")).toBe("POST /fund/quote failed");
  });

  it("drops the query of a URL, where the api-key lives", () => {
    expect(redact("429 from https://rpc.example/?api-key=SECRET now")).toBe(
      "429 from https://rpc.example/ now",
    );
    expect(redact("wss://rpc.example/path?api-key=SECRET")).toBe("wss://rpc.example/path");
  });

  it("hides a loose key outside a URL", () => {
    expect(redact("failed api-key=SECRET&x=1")).toBe("failed api-key=***&x=1");
    expect(redact("token=abc")).toBe("token=***");
  });

  it("leaves ordinary text alone", () => {
    expect(redact("Transaction simulation failed")).toBe("Transaction simulation failed");
  });
});

describe("safeLog", () => {
  it("redacts every string it logs and keeps the other values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    safeLog.error({ error: "down https://rpc.example/?api-key=SECRET", attempt: 2 }, "failed");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("SECRET");
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ attempt: 2 });
    spy.mockRestore();
  });

  it("also redacts Errors and nested objects logged by mistake", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const url = "https://rpc.example/?api-key=SECRET";
    safeLog.error({ error: new Error(`down ${url}`), nested: { list: [url] } }, "failed");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("SECRET");
    spy.mockRestore();
  });

  it("leaves no trace of an Aurora key, in the message or nested errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const url = `https://intents-api.aurora.dev/api/status/${FAKE_AURORA_KEY}?depositAddress=0x1`;
    safeLog.error({ error: new Error(`down ${url}`), nested: { list: [url] } }, `failed ${url}`);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(FAKE_AURORA_KEY);
    spy.mockRestore();
  });
});
