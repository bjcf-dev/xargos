import { describe, expect, it } from "vitest";
import { ApiClientError } from "./errors";
import { pollUntil } from "./poll";

/** Devuelve los valores en orden, repitiendo el último. */
function sequence<T>(...values: T[]) {
  let calls = 0;
  const fn = async () => values[Math.min(calls++, values.length - 1)] as T;
  return { fn, calls: () => calls };
}

describe("pollUntil", () => {
  it("resolves with the first value that is done", async () => {
    const { fn, calls } = sequence("queued", "funding_sol", "ready");

    await expect(pollUntil(fn, (v) => v === "ready", { intervalMs: 1 })).resolves.toBe("ready");
    expect(calls()).toBe(3);
  });

  it("does not wait before the first attempt", async () => {
    const { fn } = sequence("ready");
    const started = Date.now();

    await pollUntil(fn, (v) => v === "ready", { intervalMs: 5_000 });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("fails with INTERNAL when it times out", async () => {
    const { fn } = sequence("pending");

    const promise = pollUntil(fn, (v) => v === "confirmed", { intervalMs: 5, timeoutMs: 30 });
    await expect(promise).rejects.toBeInstanceOf(ApiClientError);
    await expect(promise).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("propagates an error from the polled call without retrying", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new ApiClientError("SETUP_FAILED", "Faucet empty", { status: 500 });
    };

    await expect(pollUntil(fn, () => false, { intervalMs: 1 })).rejects.toMatchObject({
      code: "SETUP_FAILED",
    });
    expect(calls).toBe(1);
  });

  it("stops polling when the signal is aborted", async () => {
    const { fn, calls } = sequence("pending");
    const controller = new AbortController();

    const promise = pollUntil(fn, () => false, { intervalMs: 5, signal: controller.signal });
    setTimeout(() => controller.abort(), 20);

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    const callsAtAbort = calls();
    await new Promise((r) => setTimeout(r, 30));
    expect(calls()).toBe(callsAtAbort);
  });
});
