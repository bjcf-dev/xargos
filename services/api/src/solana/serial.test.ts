import { describe, expect, it } from "vitest";
import { createSerial } from "./serial";

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe("createSerial", () => {
  it("never runs two tasks at once and keeps the order", async () => {
    const serial = createSerial();
    let running = 0;
    let peak = 0;
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        serial(async () => {
          running += 1;
          peak = Math.max(peak, running);
          await tick();
          order.push(n);
          running -= 1;
        }),
      ),
    );
    expect(peak).toBe(1);
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps going after a task fails, and the caller still sees the failure", async () => {
    const serial = createSerial();
    await expect(serial(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(serial(async () => "ok")).resolves.toBe("ok");
  });
});
