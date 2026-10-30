import type { BuildResponse } from "@xargos/shared";

export type StoredBuild = {
  response: BuildResponse;
  agent: string;
  position: string;
  /** PAYMENT-RESPONSE of the paid request: the free rebuild (D19) reuses it, nobody pays twice. */
  paymentResponse?: string | undefined;
  /**
   * sqrtPrice of the pool when the quote was made (lesson 10). The price shock aims below THIS
   * price, so it works whatever state the pool is in when the shock is requested.
   */
  quoteSqrtPrice?: bigint | undefined;
};

/**
 * What the backend promised in each build, by buildId (lesson 10: minDelta and expectedOut are
 * fixed when the build is made and kept here). Entries live until `rebuildUntil`.
 */
export class BuildStore {
  private readonly builds = new Map<string, StoredBuild>();

  constructor(private readonly now: () => number = Date.now) {}

  put(build: StoredBuild): void {
    this.purgeExpired();
    this.builds.set(build.response.buildId, build);
  }

  /** The build, or undefined when unknown or past its free rebuild window. */
  get(buildId: string): StoredBuild | undefined {
    const build = this.builds.get(buildId);
    if (!build) return undefined;
    if (this.now() >= Date.parse(build.response.rebuildUntil)) {
      this.builds.delete(buildId);
      return undefined;
    }
    return build;
  }

  /** Whether this agent holds a build that is still inside its window (a shock needs one). */
  hasLiveBuildFor(agent: string): boolean {
    for (const [id, build] of this.builds) {
      if (build.agent === agent && this.get(id)) return true;
    }
    return false;
  }

  /** The newest build of this agent that is still inside its window. */
  latestLiveBuildFor(agent: string): StoredBuild | undefined {
    let latest: StoredBuild | undefined;
    for (const [id, build] of this.builds) {
      if (build.agent !== agent || !this.get(id)) continue;
      if (
        !latest ||
        Date.parse(build.response.expiresAt) >= Date.parse(latest.response.expiresAt)
      ) {
        latest = build;
      }
    }
    return latest;
  }

  get size(): number {
    return this.builds.size;
  }

  private purgeExpired(): void {
    for (const [id, build] of this.builds) {
      if (this.now() >= Date.parse(build.response.rebuildUntil)) this.builds.delete(id);
    }
  }
}
