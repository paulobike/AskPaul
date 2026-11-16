/**
 * Cloudflare Workers entry point (also fine for other fetch-style runtimes).
 *
 * wrangler.toml:
 *   main = "apps/api/src/worker.ts"
 *   compatibility_flags = ["nodejs_compat"]
 *   [[kv_namespaces]]
 *   binding = "RATE_LIMIT"
 *   id = "<your namespace id>"
 *
 * Secrets: ANTHROPIC_API_KEY, OPENAI_API_KEY, RATE_LIMIT_SALT. Vars: ALLOWED_ORIGINS.
 */
import { createProviderFactory, type KbBundle } from '@ask-paul/agent-core';
import config from '../../../bot.config.js';
import kbBundle from '../../../generated/kb.bundle.json' with { type: 'json' };
import { createApp } from './app.js';
import { KvStore, MemoryStore, type CounterStore } from './ratelimit.js';

interface Env {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  USE_MOCK_MODEL?: string;
  RATE_LIMIT_SALT?: string;
  ALLOWED_ORIGINS?: string;
  LOG_QUESTIONS?: string;
  RATE_LIMIT?: ConstructorParameters<typeof KvStore>[0];
}

let cached: { app: ReturnType<typeof createApp>; key: string } | undefined;
const fallbackStore = new MemoryStore();

export default {
  fetch(request: Request, env: Env, ctx: unknown) {
    const key = `${env.ALLOWED_ORIGINS ?? ''}|${env.USE_MOCK_MODEL ?? ''}`;
    if (!cached || cached.key !== key) {
      const store: CounterStore = env.RATE_LIMIT ? new KvStore(env.RATE_LIMIT) : fallbackStore;
      cached = {
        key,
        app: createApp({
          config,
          kb: kbBundle as KbBundle,
          providerFor: createProviderFactory(env),
          store,
          salt: env.RATE_LIMIT_SALT ?? 'change-me',
          ...(env.ALLOWED_ORIGINS ? { allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
          logQuestions: env.LOG_QUESTIONS !== '0',
        }),
      };
    }
    return cached.app.fetch(request, env, ctx as never);
  },
};
