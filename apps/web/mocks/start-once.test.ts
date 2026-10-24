import { describe, expect, it } from "vitest";
import { startOnce } from "./start-once";

describe("startOnce", () => {
  it("starts only once when called twice, as React Strict Mode does with effects", async () => {
    let starts = 0;
    const start = startOnce(async () => {
      starts++;
    });

    await Promise.all([start(), start()]);
    await start();

    expect(starts).toBe(1);
  });

  it("lets a later call retry after a failed start", async () => {
    let starts = 0;
    const start = startOnce(async () => {
      starts++;
      if (starts === 1) throw new Error("worker registration failed");
    });

    await expect(start()).rejects.toThrow("worker registration failed");
    await expect(start()).resolves.toBeUndefined();
    expect(starts).toBe(2);
  });
});
