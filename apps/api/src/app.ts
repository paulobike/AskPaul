import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ChatRequestSchema, encodeSse, type StreamEvent } from '@ask-paul/protocol';
import { ProviderError, SectionIndex, runAgent, type BotConfig, type KbBundle, type ModelChoice, type ModelProvider } from '@ask-paul/agent-core';
import { createConsoleLogger, type Logger } from './logger.js';
import { dayKey, hashVisitor, secondsUntilUtcMidnight, type CounterStore } from './ratelimit.js';

export interface AppDeps {
  config: BotConfig;
  kb: KbBundle;
  providerFor: (choice: ModelChoice) => ModelProvider;
  store: CounterStore;
  /** Salt for visitor hashes. Set a random value per deployment. */
  salt: string;
  /** Overrides config.allowedOrigins (comma-separated env var on most hosts). */
  allowedOrigins?: string[];
  /** Log question text (default true). Set false to log only metrics. */
  logQuestions?: boolean;
  log?: Logger;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();
  const index = new SectionIndex(deps.kb.sections);
  const origins = deps.allowedOrigins?.length ? deps.allowedOrigins : deps.config.allowedOrigins;
  const anyOrigin = origins.includes('*');
  const log = deps.log ?? createConsoleLogger('json');
  const isAllowed = (origin: string | undefined) => !origin || anyOrigin || origins.includes(origin);

  // One line per HTTP request. /api/chat is logged when its response starts streaming;
  // the 'answer' / 'error' events cover the rest.
  app.use('*', async (c, next) => {
    const started = Date.now();
    await next();
    if (c.req.method === 'OPTIONS') return;
    const status = c.res.status;
    log({
      event: 'request',
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs: Date.now() - started,
    });
  });

  app.use(
    '/api/*',
    cors({
      origin: (origin) => (anyOrigin ? origin || '*' : origins.includes(origin) ? origin : null) as string,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      maxAge: 86400,
    }),
  );

  // Requests from browsers on other sites are refused before any work is done.
  // Requests with no Origin (curl, server-to-server) pass, but are still rate limited.
  app.use('/api/*', async (c, next) => {
    if (c.req.method !== 'OPTIONS' && !isAllowed(c.req.header('Origin'))) {
      log({ event: 'forbidden_origin', level: 'warn', origin: c.req.header('Origin') });
      return c.json({ code: 'forbidden_origin', message: 'This site is not allowed to use the agent.' }, 403);
    }
    await next();
  });

  app.get('/api/health', (c) => c.json({ ok: true, sections: deps.kb.sections.length, model: `${deps.config.model.provider}:${deps.config.model.id}` }));

  app.get('/api/config', (c) =>
    c.json({
      name: deps.config.name,
      ownerName: deps.config.owner.name,
      ownerEmail: deps.config.owner.email,
      starters: deps.config.starters,
      savedAnswers: deps.config.savedAnswers,
      dailyLimit: deps.config.limits.questionsPerDay,
      projects: deps.kb.projects,
    }),
  );

  app.post('/api/chat', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ code: 'bad_request', message: 'Body must be JSON.' }, 400);
    }
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ code: 'bad_request', message: parsed.error.issues[0]?.message ?? 'Invalid request.' }, 400);
    }
    const request = parsed.data;

    const ip =
      c.req.header('cf-connecting-ip') ?? c.req.header('x-real-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const visitor = await hashVisitor(ip, deps.salt);
    const ttl = secondsUntilUtcMidnight();
    const used = await deps.store.increment(`q:${dayKey()}:${visitor}`, ttl);
    const limit = deps.config.limits.questionsPerDay;
    if (used > limit) {
      log({ event: 'rate_limited', level: 'warn', visitor, used, limit });
      return c.json(
        { code: 'rate_limited', message: `You've reached today's limit of ${limit} questions.`, retryAfterSeconds: ttl },
        429,
        { 'Retry-After': String(ttl) },
      );
    }

    const conversationId = request.conversationId ?? crypto.randomUUID();
    const signal = c.req.raw.signal;
    const started = Date.now();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        const emit = (event: StreamEvent) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(encodeSse(event)));
          } catch {
            closed = true;
          }
        };
        // Keep proxies from closing a quiet connection while a tool runs.
        const ping = setInterval(() => {
          if (!closed) {
            try {
              controller.enqueue(encoder.encode(': ping\n\n'));
            } catch {
              closed = true;
            }
          }
        }, 15_000);

        try {
          const result = await runAgent(
            { config: deps.config, kb: deps.kb, providerFor: deps.providerFor, index },
            { request, emit, signal, conversationId, remainingToday: Math.max(0, limit - used) },
          );
          log({
            event: 'answer',
            conversationId,
            visitor,
            model: result.model,
            ...(deps.logQuestions === false ? {} : { question: request.question.slice(0, 300) }),
            hasJobDescription: !!request.jobDescription,
            steps: result.steps,
            sources: result.sources.map((s) => s.id),
            cards: result.cards,
            unknownCitations: result.unknownCitations,
            firstTextMs: result.firstTextMs,
            durationMs: Date.now() - started,
            usage: result.usage,
          });
        } catch (err) {
          const code = err instanceof ProviderError ? (err.code === 'rate_limited' || err.code === 'overloaded' ? 'overloaded' : 'internal') : 'internal';
          emit({
            type: 'error',
            code,
            message:
              code === 'overloaded'
                ? 'The agent is busy right now. Try again in a minute, or use the saved answers.'
                : 'Something went wrong on our side. Try again, or contact Paul directly.',
          });
          emit({ type: 'done' });
          const e = err as Error;
          log({
            event: 'error',
            level: 'error',
            conversationId,
            visitor,
            error: e.message,
            ...(err instanceof ProviderError ? { code: err.code, status: err.status, retryable: err.retryable } : {}),
            ...(err instanceof ProviderError ? {} : { stack: e.stack }),
            durationMs: Date.now() - started,
          });
        } finally {
          clearInterval(ping);
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  });

  return app;
}
