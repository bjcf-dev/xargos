// @vitest-environment node
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiClient } from "@/lib/api/client";
import { ApiClientError } from "@/lib/api/errors";
import { isApiRequest, onUnhandledFrame } from "./unhandled";

describe("isApiRequest", () => {
  it.each([
    "http://localhost:3000/api/xargos/executions/bld_1",
    "/api/xargos/recipes",
    "/api/xargos",
  ])("treats %s as our API", (url) => {
    expect(isApiRequest(url)).toBe(true);
  });

  it.each([
    "http://localhost:3000/_next/static/chunks/a.js",
    "/favicon.ico",
    "/api/xargos-other/x",
  ])("leaves %s alone", (url) => {
    expect(isApiRequest(url)).toBe(false);
  });
});

describe("onUnhandledFrame", () => {
  // Sin handlers: así se comporta un endpoint del contrato que aún no tiene mock.
  const server = setupServer();
  const api = createApiClient({ baseUrl: "http://localhost/api/xargos" });

  beforeAll(() => server.listen({ onUnhandledFrame }));
  afterAll(() => server.close());

  it("answers an unmocked /api/xargos/* call itself instead of letting it out", async () => {
    const error = await api.listRecipes().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ code: "INTERNAL", status: 501 });
    expect((error as ApiClientError).message).toContain("GET /api/xargos/recipes");
  });
});
