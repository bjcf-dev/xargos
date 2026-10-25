import { describe, expect, it } from "vitest";
import {
  BuildResponse,
  DemoSetupStatus,
  PriceShockStatus,
  parseGuardFail,
  Recipe,
  routes,
} from "./contract";
import {
  fixtureBuildResponse,
  fixtureGuardFailLogs,
  fixtureRecipe,
  fixtureSetupReady,
  fixtureShockConfirmed,
} from "./fixtures";

describe("fixtures cumplen el contrato", () => {
  it("Recipe", () => expect(Recipe.parse(fixtureRecipe)).toEqual(fixtureRecipe));
  it("BuildResponse", () =>
    expect(BuildResponse.parse(fixtureBuildResponse).buildId).toBe("bld_demo_0001"));
  it("DemoSetupStatus", () => expect(DemoSetupStatus.parse(fixtureSetupReady).phase).toBe("ready"));
  it("PriceShockStatus", () =>
    expect(PriceShockStatus.parse(fixtureShockConfirmed).status).toBe("confirmed"));
});

describe("BuildResponse", () => {
  it("rechaza importes con decimales", () => {
    const bad = {
      ...fixtureBuildResponse,
      quote: { ...fixtureBuildResponse.quote, expectedOut: "10.5" },
    };
    expect(BuildResponse.safeParse(bad).success).toBe(false);
  });

  it("rechaza un assert que va antes del snapshot", () => {
    const bad = {
      ...fixtureBuildResponse,
      guard: { ...fixtureBuildResponse.guard, snapshotIndex: 7, assertIndex: 2 },
    };
    expect(BuildResponse.safeParse(bad).success).toBe(false);
  });
});

describe("parseGuardFail", () => {
  it("extrae received y min del log", () => {
    expect(parseGuardFail(fixtureGuardFailLogs)).toEqual({ received: 9100000n, min: 9950000n });
  });

  it("devuelve null si el guard no falló", () => {
    expect(parseGuardFail(["Program log: Instruction: Swap"])).toBeNull();
    expect(parseGuardFail(null)).toBeNull();
  });
});

describe("routes", () => {
  it("codifica los parámetros", () => {
    expect(routes.build("exit-orca-lp-to-usdc")).toBe("/recipes/exit-orca-lp-to-usdc/build");
  });
});
