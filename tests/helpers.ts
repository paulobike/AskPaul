import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildKb, type BotConfig, type KbBundle } from '@ask-paul/agent-core';
import config from '../bot.config.js';

const kbDir = join(import.meta.dirname, '..', 'kb');
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
  });

/** The real knowledge base, built fresh from kb/. */
export function realKb(): KbBundle {
  return buildKb(walk(kbDir).map((p) => ({ fileId: relative(kbDir, p).replace(/\\/g, '/').replace(/\.md$/, ''), markdown: readFileSync(p, 'utf8') })));
}

export function testConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  return { ...config, model: { provider: 'mock', id: 'mock' }, fallback: undefined, ...overrides } as BotConfig;
}
