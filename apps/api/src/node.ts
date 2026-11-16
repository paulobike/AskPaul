/**
 * Node entry point: `npm run dev:api` (watch) or `npm start` after `npm run build`.
 * Works on any Node host (a VPS, Render, Railway, Fly.io, a container...).
 */
import { serve } from '@hono/node-server';
import { createProviderFactory, type KbBundle } from '@ask-paul/agent-core';
import config from '../../../bot.config.js';
import kbBundle from '../../../generated/kb.bundle.json' with { type: 'json' };
import { createApp } from './app.js';
import { createConsoleLogger, type LogFormat } from './logger.js';
import { MemoryStore } from './ratelimit.js';

// Load the repo-root .env (src/node.ts and dist/node.js are both 3 levels deep).
// Missing file is fine: in production, vars come from the host environment.
// Existing env vars win over .env values.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}

const env = process.env;
const port = Number(env.PORT ?? 8787);

// Pretty, coloured lines in a terminal; JSON lines otherwise. Override with LOG_FORMAT=pretty|json.
const logFormat: LogFormat =
  env.LOG_FORMAT === 'json' || env.LOG_FORMAT === 'pretty' ? env.LOG_FORMAT : process.stdout.isTTY ? 'pretty' : 'json';
const log = createConsoleLogger(logFormat, { color: process.stdout.isTTY && !env.NO_COLOR });

if (!env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY && env.USE_MOCK_MODEL !== '1') {
  log({ event: 'startup', level: 'warn', message: 'No model API key set: using the mock model. Set ANTHROPIC_API_KEY or OPENAI_API_KEY for real answers.' });
  env.USE_MOCK_MODEL = '1';
}

const app = createApp({
  config,
  kb: kbBundle as KbBundle,
  providerFor: createProviderFactory(env, { mockDelayMs: env.USE_MOCK_MODEL === '1' ? 25 : 0 }),
  store: new MemoryStore(),
  salt: env.RATE_LIMIT_SALT ?? 'dev-salt-change-me',
  ...(env.ALLOWED_ORIGINS ? { allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
  logQuestions: env.LOG_QUESTIONS !== '0',
  log,
});

serve({ fetch: app.fetch, port }, (info) => {
  const model = env.USE_MOCK_MODEL === '1' ? 'mock' : `${config.model.provider}:${config.model.id}`;
  log({ event: 'startup', message: `Ask Paul API on http://localhost:${info.port}`, model, logFormat });
});
