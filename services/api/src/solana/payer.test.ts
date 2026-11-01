import { describe, expect, it } from "vitest";
import { readPayerBytes } from "./payer";

const key = JSON.stringify(Array.from({ length: 64 }, (_, i) => i));

describe("readPayerBytes", () => {
  it("reads the key from PAYER_KEYPAIR without touching the disk", () => {
    const bytes = readPayerBytes({ PAYER_KEYPAIR: key }, () => {
      throw new Error("must not read a file");
    });
    expect(bytes).toHaveLength(64);
    expect(bytes[63]).toBe(63);
  });

  it("reads the key from the file when only the path is set", () => {
    const bytes = readPayerBytes({ PAYER_KEYPAIR_PATH: "/k.json" }, () => key);
    expect(bytes[1]).toBe(1);
  });

  it("prefers the variable over the file", () => {
    const other = JSON.stringify(Array.from({ length: 64 }, () => 7));
    expect(
      readPayerBytes({ PAYER_KEYPAIR: key, PAYER_KEYPAIR_PATH: "/k.json" }, () => other)[1],
    ).toBe(1);
  });

  it("fails without leaking the key when it is malformed", () => {
    for (const bad of ["not json SECRET", "[1,2,3]", JSON.stringify(Array(64).fill(300))]) {
      try {
        readPayerBytes({ PAYER_KEYPAIR: bad });
        expect.unreachable();
      } catch (error) {
        expect(String(error)).not.toContain("SECRET");
        expect(String(error)).not.toContain("300");
      }
    }
  });
});
