import { describe, expect, it } from "vitest";
import { parseFeatureFlag } from "./features";

describe("parseFeatureFlag", () => {
  it("is on only with the exact value true", () => {
    expect(parseFeatureFlag("true")).toBe(true);
  });

  it.each([undefined, "", "1", "TRUE", "true ", "yes", "false"])("is off with %j", (value) => {
    expect(parseFeatureFlag(value)).toBe(false);
  });
});
