export * from './agent.js';
export * from './citations.js';
export * from './config.js';
export * from './kb.js';
export * from './prompt.js';
export * from './search.js';
export * from './providers/types.js';
export { AnthropicProvider } from './providers/anthropic.js';
export { OpenAIProvider } from './providers/openai.js';
export { MockProvider } from './providers/mock.js';
export { enabledTools, ALL_TOOLS, type Tool, type ToolContext, type ToolOutcome } from './tools/index.js';
export { tailorResume } from './tools/resume.js';

import type { ModelChoice } from './config.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { MockProvider } from './providers/mock.js';
import { OpenAIProvider } from './providers/openai.js';
import type { ModelProvider } from './providers/types.js';

export interface ProviderEnv {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  /** Force the mock model everywhere (local dev, demos, CI without keys). */
  USE_MOCK_MODEL?: string;
}

/** The one place a model choice becomes a client. Swapping models = changing bot.config.ts. */
export function createProviderFactory(env: ProviderEnv, opts: { mockDelayMs?: number } = {}) {
  const forceMock = env.USE_MOCK_MODEL === '1' || env.USE_MOCK_MODEL === 'true';
  return (choice: ModelChoice): ModelProvider => {
    if (forceMock || choice.provider === 'mock') return new MockProvider({ delayMs: opts.mockDelayMs ?? 0 });
    if (choice.provider === 'anthropic') {
      if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
      return new AnthropicProvider(choice.id, { apiKey: env.ANTHROPIC_API_KEY });
    }
    if (choice.provider === 'openai') {
      if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
      return new OpenAIProvider(choice.id, { apiKey: env.OPENAI_API_KEY });
    }
    throw new Error(`Unknown provider: ${String(choice.provider)}`);
  };
}
