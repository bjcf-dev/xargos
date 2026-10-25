import { describe, expect, it } from "vitest";
import { DemoSetupStatus, PriceShockStatus } from "./contract";
import { ErrorResponse } from "./errors";
import * as fixtures from "./fixtures";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Number of bytes a base58 string decodes to (leading "1"s are zero bytes). */
function base58ByteLength(text: string): number {
  let value = 0n;
  for (const char of text) value = value * 58n + BigInt(ALPHABET.indexOf(char));
  const leadingZeros = text.length - text.replace(/^1+/, "").length;
  return leadingZeros + (value === 0n ? 0 : Math.ceil(value.toString(16).length / 2));
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

describe("fixtures", () => {
  // Addresses look like base58 text of 32-44 chars. A real Solana address decodes to 32 bytes,
  // and kit's address() throws otherwise, so mock data must respect it.
  it("every address-like string in the fixtures decodes to 32 bytes", () => {
    const candidates = collectStrings(Object.values(fixtures)).filter((text) =>
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text),
    );
    expect(candidates.length).toBeGreaterThan(5);
    const invalid = candidates.filter((text) => base58ByteLength(text) !== 32);
    expect(invalid).toEqual([]);
  });
});

describe("fixtures of intermediate states and errors", () => {
  it.each([
    ["fixtureSetupQueued", fixtures.fixtureSetupQueued],
    ["fixtureSetupFundingSol", fixtures.fixtureSetupFundingSol],
    ["fixtureSetupFundingUsdc", fixtures.fixtureSetupFundingUsdc],
    ["fixtureSetupFailed", fixtures.fixtureSetupFailed],
  ])("%s is a valid DemoSetupStatus", (_name, fixture) => {
    // parse() (not safeParse) so a failure says which field breaks the contract
    expect(() => DemoSetupStatus.parse(fixture)).not.toThrow();
  });

  it.each([
    ["fixtureShockPending", fixtures.fixtureShockPending],
    ["fixtureShockFailed", fixtures.fixtureShockFailed],
  ])("%s is a valid PriceShockStatus", (_name, fixture) => {
    expect(() => PriceShockStatus.parse(fixture)).not.toThrow();
  });

  it.each([
    ["fixtureErrorRateLimited", fixtures.fixtureErrorRateLimited, "RATE_LIMITED"],
    ["fixtureErrorAccessDenied", fixtures.fixtureErrorAccessDenied, "ACCESS_DENIED"],
    ["fixtureErrorBuildExpired", fixtures.fixtureErrorBuildExpired, "BUILD_EXPIRED"],
    [
      "fixtureErrorRebuildWindowClosed",
      fixtures.fixtureErrorRebuildWindowClosed,
      "REBUILD_WINDOW_CLOSED",
    ],
  ])("%s is a valid ErrorResponse with code %s", (_name, fixture, code) => {
    expect(ErrorResponse.parse(fixture).error.code).toBe(code);
  });
});
