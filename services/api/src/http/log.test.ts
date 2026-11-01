import { describe, expect, it, vi } from "vitest";
import { redact, safeLog } from "./log";

describe("redact", () => {
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
});
