import { fixtureBuildResponse } from "@xargos/shared";
import { describe, expect, it } from "vitest";
import { BuildStore } from "./build-store";

const REBUILD_UNTIL = Date.parse(fixtureBuildResponse.rebuildUntil);
const entry = (buildId = fixtureBuildResponse.buildId) => ({
  response: { ...fixtureBuildResponse, buildId },
  agent: "agent",
  position: "position",
});

describe("BuildStore", () => {
  it("keeps what the build promised, by buildId", () => {
    const store = new BuildStore(() => REBUILD_UNTIL - 1);
    store.put(entry());
    expect(store.get(fixtureBuildResponse.buildId)?.response.guard.minDelta).toBe(
      fixtureBuildResponse.guard.minDelta,
    );
  });

  it("forgets a build once its free rebuild window has closed", () => {
    let now = REBUILD_UNTIL - 1;
    const store = new BuildStore(() => now);
    store.put(entry());
    now = REBUILD_UNTIL;
    expect(store.get(fixtureBuildResponse.buildId)).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it("does not know an unknown buildId", () => {
    expect(new BuildStore().get("bld_nope")).toBeUndefined();
  });

  it("drops expired builds when a new one is stored", () => {
    let now = REBUILD_UNTIL - 1;
    const store = new BuildStore(() => now);
    store.put(entry("bld_old"));
    now = REBUILD_UNTIL + 1;
    store.put({
      ...entry("bld_new"),
      response: {
        ...entry("bld_new").response,
        rebuildUntil: new Date(now + 60_000).toISOString(),
      },
    });
    expect(store.size).toBe(1);
  });
});
