/**
 * Eval runner.
 *
 *   npm run eval                       uses bot.config.ts's model (needs an API key)
 *   npm run eval -- --mock             runs the pipeline with the mock model (no key; checks the harness, not quality)
 *   npm run eval -- --model openai:gpt-6-luna
 *   npm run eval -- --only salary,injection
 *
 * Writes generated/eval-results.json (shown on the standalone site) and exits
 * non-zero if any score is below the threshold, so CI can block a bad change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProviderFactory, runAgent, SectionIndex, type BotConfig, type KbBundle, type ModelChoice, type ProviderName } from '@ask-paul/agent-core';
import type { StreamEvent } from '@ask-paul/protocol';
import baseConfig from '../bot.config.js';

const THRESHOLD = 0.9;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Case {
  id: string;
  question: string;
  jobDescription?: string;
  expect: 'answer' | 'handoff' | 'refuse' | 'card';
  cite?: string[];
  include?: string[];
  exclude?: string[];
  card?: 'project' | 'resume' | 'contact' | 'booking';
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.split('=')[1];
  const next = args[args.indexOf(hit) + 1];
  return next && !next.startsWith('--') ? next : 'true';
};

const useMock = flag('mock') !== undefined;
const modelFlag = flag('model');
const only = flag('only')?.split(',');

const model: ModelChoice = useMock
  ? { provider: 'mock', id: 'mock' }
  : modelFlag
    ? { provider: modelFlag.split(':')[0] as ProviderName, id: modelFlag.split(':').slice(1).join(':') }
    : baseConfig.model;
const config: BotConfig = { ...baseConfig, model, fallback: undefined };

const kb = JSON.parse(readFileSync(join(root, 'generated', 'kb.bundle.json'), 'utf8')) as KbBundle;
const suite = JSON.parse(readFileSync(join(root, 'evals', 'cases.json'), 'utf8')) as { cases: Case[] };
const cases = suite.cases.filter((c) => !only || only.includes(c.id));
const providerFor = createProviderFactory(process.env);
const index = new SectionIndex(kb.sections);

interface Outcome {
  c: Case;
  ok: boolean;
  cited: boolean | null;
  clean: boolean;
  handled: boolean | null;
  firstTextMs: number | null;
  notes: string[];
  costUsd: number;
}

const has = (text: string, phrase: string) => text.toLowerCase().includes(phrase.toLowerCase());

async function runCase(c: Case): Promise<Outcome> {
  const events: StreamEvent[] = [];
  const notes: string[] = [];
  let result;
  try {
    result = await runAgent(
      { config, kb, providerFor, index },
      { request: { question: c.question, history: [], ...(c.jobDescription ? { jobDescription: c.jobDescription } : {}) }, emit: (e) => events.push(e), conversationId: `eval-${c.id}` },
    );
  } catch (err) {
    return { c, ok: false, cited: c.expect === 'answer' ? false : null, clean: false, handled: null, firstTextMs: null, notes: [`error: ${(err as Error).message}`], costUsd: 0 };
  }
  const text = result.text;
  const cards = events.flatMap((e) => (e.type === 'card' ? [e.card.kind] : []));
  const sourceFiles = result.sources.map((s) => s.id.split('#')[0] ?? '');

  // Citations: answers must cite at least one expected file.
  let cited: boolean | null = null;
  if (c.expect === 'answer') {
    cited = (c.cite ?? []).some((f) => sourceFiles.includes(f));
    if (!cited) notes.push(`expected a citation from ${c.cite?.join(' | ')}, got ${sourceFiles.join(', ') || 'none'}`);
    if (c.include?.length && !c.include.some((p) => has(text, p))) notes.push(`missing any of: ${c.include.join(' | ')}`);
  }

  // Invented claims: forbidden phrases or citations to sections that don't exist.
  const badPhrase = (c.exclude ?? []).find((p) => has(text, p));
  if (badPhrase) notes.push(`contains forbidden "${badPhrase}"`);
  if (result.unknownCitations.length) notes.push(`cited unknown ids: ${result.unknownCitations.join(', ')}`);
  const clean = !badPhrase && result.unknownCitations.length === 0;

  // Hand-offs and refusals: no sourced claims; hand-offs must offer the contact card.
  let handled: boolean | null = null;
  if (c.expect === 'handoff') {
    handled = cards.includes('contact');
    if (!handled) notes.push('expected a contact card');
  } else if (c.expect === 'refuse') {
    handled = result.sources.length === 0;
    if (!handled) notes.push(`should not cite sources, cited ${sourceFiles.join(', ')}`);
  } else if (c.expect === 'card') {
    handled = !!c.card && cards.includes(c.card);
    if (!handled) notes.push(`expected a ${c.card} card, got ${cards.join(', ') || 'none'}`);
  }

  const includeOk = c.expect !== 'answer' || !c.include?.length || c.include.some((p) => has(text, p));
  const ok = (cited ?? true) && includeOk && clean && (handled ?? true);
  return { c, ok, cited, clean, handled, firstTextMs: result.firstTextMs, notes, costUsd: result.usage.costUsd };
}

const outcomes: Outcome[] = [];
for (const c of cases) {
  const o = await runCase(c);
  outcomes.push(o);
  console.log(`${o.ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(16)} ${o.notes.join('; ')}`);
}

const ratio = (xs: (boolean | null)[]) => {
  const v = xs.filter((x): x is boolean => x !== null);
  return v.length ? v.filter(Boolean).length / v.length : null;
};
const times = outcomes.map((o) => o.firstTextMs).filter((t): t is number => t !== null).sort((a, b) => a - b);
const median = times.length ? (times[Math.floor((times.length - 1) / 2)]! + times[Math.ceil((times.length - 1) / 2)]!) / 2 : null;
const scores = {
  cites: ratio(outcomes.map((o) => o.cited)),
  noInvented: ratio(outcomes.map((o) => o.clean)),
  handoff: ratio(outcomes.filter((o) => o.c.expect === 'handoff' || o.c.expect === 'refuse').map((o) => o.handled)),
  medianFirstWordMs: median === null ? null : Math.round(median),
};
const passed = outcomes.filter((o) => o.ok).length;
const cost = outcomes.reduce((n, o) => n + o.costUsd, 0);
const label = `${model.provider}:${model.id}`;

console.log(`\n${passed}/${outcomes.length} passed on ${label}`);
console.log(
  `cites ${fmt(scores.cites)} · no invented claims ${fmt(scores.noInvented)} · hand-offs ${fmt(scores.handoff)} · median first word ${scores.medianFirstWordMs ?? '-'} ms · cost $${cost.toFixed(4)}`,
);

if (!only) {
  // Mock runs check the harness only, so they never overwrite real scores shown on the site.
  if (!useMock) {
    writeFileSync(join(root, 'generated', 'eval-results.json'), JSON.stringify({ ranAt: new Date().toISOString(), model: label, cases: outcomes.length, passed, scores }, null, 2));
  }
}

const below = (['cites', 'noInvented', 'handoff'] as const).filter((k) => scores[k] !== null && scores[k]! < THRESHOLD);
if (below.length) {
  console.error(`Below ${THRESHOLD * 100}%: ${below.join(', ')}`);
  process.exit(1);
}

function fmt(v: number | null) {
  return v === null ? '-' : `${Math.round(v * 100)}%`;
}
