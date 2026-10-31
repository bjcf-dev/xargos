// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import { buildCsp } from "./csp";

/** La CSP en un mapa directiva → valores, para comprobar cada una sin depender del orden. */
function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name = "", ...values] = part.split(/\s+/);
        return [name, values];
      }),
  );
}

describe("buildCsp", () => {
  it("allows only scripts with the nonce, never inline or eval in production", () => {
    const csp = directives(buildCsp({ nonce: "abc", dev: false }));
    expect(csp.get("script-src")).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
  });

  it("adds 'unsafe-eval' only in development, for React's debug stacks", () => {
    expect(directives(buildCsp({ nonce: "abc", dev: true })).get("script-src")).toContain(
      "'unsafe-eval'",
    );
  });

  it("keeps the browser talking only to its own origin (D30)", () => {
    const csp = directives(buildCsp({ nonce: "abc", dev: false }));
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("connect-src")).toEqual(["'self'"]);
    expect(csp.get("worker-src")).toEqual(["'self'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("upgrades insecure requests only outside development (localhost runs on http)", () => {
    expect(
      directives(buildCsp({ nonce: "abc", dev: false })).has("upgrade-insecure-requests"),
    ).toBe(true);
    expect(directives(buildCsp({ nonce: "abc", dev: true })).has("upgrade-insecure-requests")).toBe(
      false,
    );
  });
});

describe("proxy", () => {
  const request = () => new NextRequest("http://localhost:3000/demo");

  it("sends the CSP with a fresh nonce on every request", () => {
    const first = proxy(request()).headers.get("content-security-policy") ?? "";
    const second = proxy(request()).headers.get("content-security-policy") ?? "";
    const nonce = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];

    expect(nonce(first)).toMatch(/^[A-Za-z0-9+/=]{16,}$/);
    expect(nonce(second)).not.toBe(nonce(first));
  });

  it("hands the nonce to the render through the request headers", () => {
    const response = proxy(request());
    const csp = response.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    // NextResponse.next({ request: { headers } }) los pasa como x-middleware-request-*.
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  });
});
