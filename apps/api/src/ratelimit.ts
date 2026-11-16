/**
 * Daily question limit per visitor.
 *
 * The store is an interface so the limiter works on any host: in-memory for a
 * single Node process, or a shared store (Cloudflare KV, Upstash Redis, Vercel
 * KV) when there are several instances. Visitors are identified by a salted
 * SHA-256 of their IP; the raw IP is never stored or logged.
 */

export interface CounterStore {
  /** Increment the counter for `key`, creating it with a TTL if needed. Returns the new value. */
  increment(key: string, ttlSeconds: number): Promise<number>;
}

export class MemoryStore implements CounterStore {
  private counts = new Map<string, { value: number; expiresAt: number }>();

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const hit = this.counts.get(key);
    if (!hit || hit.expiresAt <= now) {
      this.counts.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 });
      this.sweep(now);
      return 1;
    }
    hit.value += 1;
    return hit.value;
  }

  private sweep(now: number) {
    if (this.counts.size < 10_000) return;
    for (const [k, v] of this.counts) if (v.expiresAt <= now) this.counts.delete(k);
  }
}

/**
 * Minimal Cloudflare KV adapter. KV is eventually consistent, so the count can
 * run slightly over under bursts — fine for a daily budget guard.
 */
export class KvStore implements CounterStore {
  constructor(private kv: { get(key: string): Promise<string | null>; put(key: string, value: string, opts: { expirationTtl: number }): Promise<void> }) {}

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const current = Number((await this.kv.get(key)) ?? '0') + 1;
    await this.kv.put(key, String(current), { expirationTtl: Math.max(60, ttlSeconds) });
    return current;
  }
}

export async function hashVisitor(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Seconds until the next UTC midnight, when the daily limit resets. */
export function secondsUntilUtcMidnight(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
