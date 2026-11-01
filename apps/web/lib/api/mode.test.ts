import { describe, expect, it } from "vitest";
import { parseApiMode } from "./mode";

describe("parseApiMode", () => {
  it("defaults to mock when the variable is unset or empty", () => {
    expect(parseApiMode(undefined)).toBe("mock");
    expect(parseApiMode("")).toBe("mock");
  });

  it.each(["mock", "local", "staging"] as const)("accepts %s", (mode) => {
    expect(parseApiMode(mode)).toBe(mode);
  });

  it("rejects unknown values instead of silently falling back", () => {
    expect(() => parseApiMode("production")).toThrow(/NEXT_PUBLIC_API_MODE/);
  });
});
