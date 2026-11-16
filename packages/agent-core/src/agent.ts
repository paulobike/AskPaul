import { LIMITS, type ChatRequest, type Source, type StreamEvent, type Usage } from '@ask-paul/protocol';
import { CitationRewriter } from './citations.js';
import type { BotConfig, ModelChoice } from './config.js';
import type { KbBundle, KbSection } from './kb.js';
import { buildSystem, buildUserText } from './prompt.js';
import { ProviderError, type Message, type ModelProvider, type ModelUsage, type Part } from './providers/types.js';
import { SectionIndex } from './search.js';
import { enabledTools, type Tool, type ToolContext } from './tools/index.js';

export interface AgentDeps {
  config: BotConfig;
  kb: KbBundle;
  /** Build a provider for a model choice. Injected so tests and the mock can swap it. */
  providerFor: (choice: ModelChoice) => ModelProvider;
  index?: SectionIndex;
}

export interface RunOptions {
  request: ChatRequest;
  emit: (event: StreamEvent) => void;
  signal?: AbortSignal;
  conversationId: string;
  remainingToday?: number;
}

export interface RunResult {
  model: string;
  text: string;
  sources: Source[];
  cards: number;
  usage: Usage;
  unknownCitations: string[];
  firstTextMs: number | null;
  steps: string[];
}

const EMPTY_USAGE: ModelUsage = { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };

/**
 * The agent loop. Streams protocol events through `emit` and resolves with a
 * summary for logging and evals.
 *
 * Fallback: if the primary model fails with a retryable error before any
 * answer text has been shown, the whole turn restarts on the fallback model.
 * Once text is visible we don't switch, to avoid a half-and-half answer.
 */
export async function runAgent(deps: AgentDeps, opts: RunOptions): Promise<RunResult> {
  const index = deps.index ?? new SectionIndex(deps.kb.sections);
  const choices = [deps.config.model, ...(deps.config.fallback ? [deps.config.fallback] : [])];
  let lastError: unknown;
  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i]!;
    let provider: ModelProvider;
    try {
      provider = deps.providerFor(choice);
    } catch (err) {
      // Misconfigured model (e.g. missing key): try the next one rather than failing outright.
      lastError = err;
      continue;
    }
    const state = { textShown: false };
    try {
      return await runOnce(deps, index, choice, provider, opts, state, i === 0);
    } catch (err) {
      lastError = err;
      const retryable = err instanceof ProviderError && err.retryable;
      if (!retryable || state.textShown || i === choices.length - 1) break;
      opts.emit({ type: 'step', id: `fallback-${i}`, label: 'Switched to backup model', status: 'done', detail: provider.label });
    }
  }
  throw lastError;
}

async function runOnce(
  deps: AgentDeps,
  index: SectionIndex,
  choice: ModelChoice,
  provider: ModelProvider,
  opts: RunOptions,
  state: { textShown: boolean },
  isPrimary: boolean,
): Promise<RunResult> {
  const { config, kb } = deps;
  const started = Date.now();
  const tools = enabledTools(config);
  const toolByName = new Map(tools.map((t) => [t.def.name, t] as const));
  const sectionsById = new Map(kb.sections.map((s) => [s.id, s] as const));
  const retrieved = new Map<string, KbSection>();
  const ctx: ToolContext = {
    kb,
    index,
    config,
    retrieved,
    ...(opts.request.jobDescription ? { jobDescription: opts.request.jobDescription } : {}),
  };

  if (isPrimary) {
    opts.emit({
      type: 'meta',
      conversationId: opts.conversationId,
      model: provider.label,
      ...(opts.remainingToday !== undefined ? { remainingToday: opts.remainingToday } : {}),
    });
  }

  const system = buildSystem(config, kb, choice);
  const messages: Message[] = [
    ...opts.request.history.slice(-LIMITS.historyTurns).map((t) => ({ role: t.role, parts: [{ type: 'text' as const, text: t.content }] })),
    {
      role: 'user',
      parts: [{ type: 'text', text: buildUserText(opts.request.question, opts.request.jobDescription, opts.request.pageContext) }],
    },
  ];

  const rewriter = new CitationRewriter((id) => sectionsById.has(id));
  const usage: ModelUsage = { ...EMPTY_USAGE };
  let text = '';
  let cards = 0;
  let firstTextMs: number | null = null;
  const steps: string[] = [];
  let writingStep = false;

  const showText = (delta: string) => {
    if (!delta) return;
    if (!writingStep) {
      writingStep = true;
      opts.emit({ type: 'step', id: 'write', label: 'Writing answer', status: 'running' });
    }
    if (firstTextMs === null) firstTextMs = Date.now() - started;
    state.textShown = true;
    text += delta;
    opts.emit({ type: 'text', delta });
  };

  for (let turn = 0; turn < config.limits.maxModelTurns; turn++) {
    const lastTurn = turn === config.limits.maxModelTurns - 1;
    const calls: { id: string; name: string; input: unknown }[] = [];
    const assistantParts: Part[] = [];
    let turnText = '';

    for await (const ev of provider.stream({
      system,
      messages,
      // On the last allowed turn, offer no tools so the model must answer.
      tools: lastTurn ? [] : tools.map((t) => t.def),
      maxTokens: config.limits.maxOutputTokens,
      temperature: 0.2,
      ...(opts.signal ? { signal: opts.signal } : {}),
    })) {
      if (opts.signal?.aborted) break;
      if (ev.type === 'text') {
        turnText += ev.delta;
        showText(rewriter.push(ev.delta));
      } else if (ev.type === 'tool_call') {
        calls.push(ev);
      } else if (ev.type === 'usage') {
        usage.inputTokens += ev.usage.inputTokens;
        usage.cachedInputTokens += ev.usage.cachedInputTokens;
        usage.cacheWriteTokens += ev.usage.cacheWriteTokens;
        usage.outputTokens += ev.usage.outputTokens;
      }
    }

    if (turnText) assistantParts.push({ type: 'text', text: turnText });
    if (!calls.length || opts.signal?.aborted) break;

    for (const c of calls) assistantParts.push({ type: 'tool_call', id: c.id, name: c.name, input: c.input });
    messages.push({ role: 'assistant', parts: assistantParts });

    const results: Part[] = [];
    for (const call of calls) {
      const tool: Tool | undefined = toolByName.get(call.name);
      const stepId = `${call.name}-${turn}-${results.length}`;
      if (!tool) {
        results.push({ type: 'tool_result', callId: call.id, content: `Unknown tool ${call.name}`, isError: true });
        continue;
      }
      opts.emit({ type: 'step', id: stepId, label: tool.stepLabel, status: 'running' });
      try {
        const input = (call.input && typeof call.input === 'object' ? call.input : {}) as Record<string, unknown>;
        const out = await tool.run(input, ctx);
        for (const card of out.cards ?? []) {
          opts.emit({ type: 'card', card });
          cards++;
        }
        opts.emit({ type: 'step', id: stepId, label: tool.stepLabel, status: out.isError ? 'error' : 'done', detail: out.detail });
        steps.push(`${call.name}: ${out.detail}`);
        results.push({ type: 'tool_result', callId: call.id, content: out.content, ...(out.isError ? { isError: true } : {}) });
      } catch (err) {
        opts.emit({ type: 'step', id: stepId, label: tool.stepLabel, status: 'error', detail: 'Tool failed' });
        results.push({ type: 'tool_result', callId: call.id, content: `Tool error: ${(err as Error).message}`, isError: true });
      }
    }
    messages.push({ role: 'user', parts: results });
  }

  showText(rewriter.end());
  const { cited, unknown, followups } = rewriter.result();
  if (writingStep) opts.emit({ type: 'step', id: 'write', label: 'Writing answer', status: 'done' });

  const sources: Source[] = cited.flatMap((id, i) => {
    const s = sectionsById.get(id);
    return s ? [{ n: i + 1, id, title: s.title, quote: quoteFrom(s.body), ...(s.url ? { url: s.url } : {}) }] : [];
  });
  if (sources.length) opts.emit({ type: 'sources', sources });
  if (followups.length) opts.emit({ type: 'followups', questions: followups });

  const finalUsage: Usage = {
    inputTokens: usage.inputTokens + usage.cacheWriteTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    costUsd: costOf(config, provider.modelId, usage),
  };
  opts.emit({ type: 'done', usage: finalUsage });

  return {
    model: provider.label,
    text,
    sources,
    cards,
    usage: finalUsage,
    unknownCitations: unknown,
    firstTextMs,
    steps,
  };
}

function quoteFrom(body: string, max = 240): string {
  const clean = body
    .split('\n')
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter((l) => l && !l.includes('[TODO'))
    .join(' ');
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

export function costOf(config: BotConfig, modelId: string, u: ModelUsage): number {
  const p = config.prices[modelId];
  if (!p) return 0;
  const usd =
    (u.inputTokens * p.input + u.cachedInputTokens * p.cachedInput + u.cacheWriteTokens * (p.cacheWrite ?? p.input) + u.outputTokens * p.output) /
    1_000_000;
  return Math.round(usd * 1e7) / 1e7;
}
