import { describe, expect, it } from 'vitest';
import { createSseParser } from '@ask-paul/protocol';
import { MockProvider } from '@ask-paul/agent-core';
import { createApp } from '../apps/api/src/app.js';
import { MemoryStore } from '../apps/api/src/ratelimit.js';
import { realKb, testConfig } from './helpers.js';

const make = (limit = 20) =>
  createApp({
    config: testConfig({ limits: { questionsPerDay: limit, maxOutputTokens: 700, maxModelTurns: 4 }, allowedOrigins: ['https://paul.dev'] }),
    kb: realKb(),
    providerFor: () => new MockProvider(),
    store: new MemoryStore(),
    salt: 'test',
    log: () => {},
  });

const post = (app: ReturnType<typeof make>, body: unknown, headers: Record<string, string> = {}) =>
  app.request('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://paul.dev', ...headers }, body: JSON.stringify(body) });

describe('API', () => {
  it('streams protocol events over SSE', async () => {
    const res = await post(make(), { question: 'What did Paul build at Zerotech?' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://paul.dev');
    const events = createSseParser()(await res.text());
    expect(events[0]).toMatchObject({ type: 'meta', remainingToday: 19 });
    expect(events.some((e) => e.type === 'sources')).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('refuses browsers on other sites', async () => {
    const res = await post(make(), { question: 'hi' }, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'forbidden_origin' });
  });

  it('validates input', async () => {
    const res = await post(make(), { question: '' });
    expect(res.status).toBe(400);
  });

  it('enforces the daily limit per visitor', async () => {
    const app = make(2);
    const ip = { 'x-forwarded-for': '203.0.113.9' };
    expect((await post(app, { question: 'one' }, ip)).status).toBe(200);
    expect((await post(app, { question: 'two' }, ip)).status).toBe(200);
    const third = await post(app, { question: 'three' }, ip);
    expect(third.status).toBe(429);
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0);
    // A different visitor is unaffected.
    expect((await post(app, { question: 'one' }, { 'x-forwarded-for': '198.51.100.4' })).status).toBe(200);
  });

  it('serves health and public config', async () => {
    const app = make();
    expect(await (await app.request('/api/health')).json()).toMatchObject({ ok: true });
    const cfg = await (await app.request('/api/config')).json();
    expect(cfg).toMatchObject({ name: 'Ask Paul' });
    expect(JSON.stringify(cfg)).not.toMatch(/API_KEY/);
  });
});
