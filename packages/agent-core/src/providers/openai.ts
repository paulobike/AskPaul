import OpenAI from 'openai';
import { errorFromStatus, type Message, type ModelEvent, type ModelProvider, type ModelRequest } from './types.js';

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/**
 * OpenAI adapter (Chat Completions). Caching is automatic for a repeated
 * prompt prefix, so the adapter only has to keep the system text first and
 * byte-identical between requests — which the agent already does.
 */
export class OpenAIProvider implements ModelProvider {
  readonly label: string;
  private client: OpenAI;

  constructor(
    readonly modelId: string,
    opts: { apiKey: string; baseURL?: string; fetch?: typeof fetch },
  ) {
    this.label = `openai:${modelId}`;
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      maxRetries: 1,
    });
  }

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    let chunks: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
    try {
      chunks = await this.client.chat.completions.create(
        {
          model: this.modelId,
          max_completion_tokens: req.maxTokens,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          messages: toOpenAIMessages(req.system.map((b) => b.text).join('\n\n'), req.messages),
          tools: req.tools.map((t) => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.inputSchema },
          })),
          stream: true,
          stream_options: { include_usage: true },
        },
        { ...(req.signal ? { signal: req.signal } : {}) },
      );
    } catch (err) {
      throw normalise(err);
    }

    const calls = new Map<number, { id: string; name: string; args: string }>();
    let finish: string | null = null;
    let usage: OpenAI.CompletionUsage | undefined;

    try {
      for await (const chunk of chunks) {
        if (chunk.usage) usage = chunk.usage;
        const choice = chunk.choices[0];
        if (!choice) continue;
        const delta = choice.delta;
        if (delta?.content) yield { type: 'text', delta: delta.content };
        for (const tc of delta?.tool_calls ?? []) {
          const existing = calls.get(tc.index) ?? { id: '', name: '', args: '' };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name += tc.function.name;
          if (tc.function?.arguments) existing.args += tc.function.arguments;
          calls.set(tc.index, existing);
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }
    } catch (err) {
      throw normalise(err);
    }

    for (const [, c] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
      yield { type: 'tool_call', id: c.id, name: c.name, input: safeJson(c.args) };
    }
    const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
    yield {
      type: 'usage',
      usage: {
        inputTokens: Math.max(0, (usage?.prompt_tokens ?? 0) - cached),
        cachedInputTokens: cached,
        cacheWriteTokens: 0,
        outputTokens: usage?.completion_tokens ?? 0,
      },
    };
    yield {
      type: 'done',
      stopReason: finish === 'tool_calls' ? 'tool_use' : finish === 'length' ? 'max_tokens' : finish === 'stop' ? 'end' : 'other',
    };
  }
}

function toOpenAIMessages(system: string, messages: Message[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'assistant') {
      const text = m.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('');
      const toolCalls = m.parts.flatMap((p) =>
        p.type === 'tool_call'
          ? [{ id: p.id, type: 'function' as const, function: { name: p.name, arguments: JSON.stringify(p.input ?? {}) } }]
          : [],
      );
      out.push({ role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
    } else {
      // Tool results are their own messages in this API; plain text stays a user message.
      for (const p of m.parts) if (p.type === 'tool_result') out.push({ role: 'tool', tool_call_id: p.callId, content: p.content });
      const text = m.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n\n');
      if (text) out.push({ role: 'user', content: text });
    }
  }
  return out;
}

function safeJson(text: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function normalise(err: unknown) {
  if (err instanceof OpenAI.APIError) return errorFromStatus(err.status, err.message);
  if (err instanceof Error && err.name === 'AbortError') return err;
  return errorFromStatus(undefined, err instanceof Error ? err.message : String(err));
}
