/** Fixed-window limiter per key (an IP). In memory: fine for one demo process. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true when the request is allowed and counts it. */
  allow(key: string, now: number = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || now >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count += 1;
    return true;
  }

  /** Seconds until this key gets a fresh window: what a 429 tells the client to wait. */
  retryAfterSeconds(key: string, now: number = Date.now()): number {
    const entry = this.hits.get(key);
    return entry ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) : 1;
  }
}
