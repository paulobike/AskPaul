import Anthropic from '@anthropic-ai/sdk';
import { errorFromStatus, type Message, type ModelEvent, type ModelProvider, type ModelRequest } from './types.js';

type AnthropicMessage = Anthropic.Messages.MessageParam;
type AnthropicBlock = Anthropic.Messages.ContentBlockParam;

/**
 * Anthropic adapter. Caching is explicit here: the last system block marked
 * `cache` gets a cache breakpoint, so the instructions + knowledge base are
 * read from cache on every request after the first.
 */
export class AnthropicProvider implements ModelProvider {
  readonly label: string;
  private client: Anthropic;

  constructor(
    readonly modelId: string,
    opts: { apiKey: string; baseURL?: string; fetch?: typeof fetch },
  ) {
    this.label = `anthropic:${modelId}`;
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      maxRetries: 1,
    });
  }

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    const lastCached = req.system.map((b) => !!b.cache).lastIndexOf(true);
    const system: Anthropic.Messages.TextBlockParam[] = req.system.map((b, i) => ({
      type: 'text',
      text: b.text,
      ...(i === lastCached ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }));

    let events: AsyncIterable<Anthropic.Messages.RawMessageStreamEvent>;
    try {
      events = await this.client.messages.create(
        {
          model: this.modelId,
          max_tokens: req.maxTokens,
          // req.temperature is deliberately not sent: current Claude models (e.g. Haiku 5.5)
          // reject non-default sampling params with a 400, as does API version 2026-10-21.
          system,
          messages: toAnthropicMessages(req.messages),
          tools: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Messages.Tool.InputSchema,
          })),
          stream: true,
        },
        { ...(req.signal ? { signal: req.signal } : {}) },
      );
    } catch (err) {
      throw normalise(err);
    }

    // Tool-use input arrives as JSON fragments per content block.
    const toolBlocks = new Map<number, { id: string; name: string; json: string }>();
    let inputTokens = 0;
    let cachedInputTokens = 0;
    let cacheWriteTokens = 0;
    let outputTokens = 0;
    let stopReason: ModelEvent & { type: 'done' } = { type: 'done', stopReason: 'end' };

    try {
      for await (const ev of events) {
        switch (ev.type) {
          case 'message_start': {
            const u = ev.message.usage;
            inputTokens = u.input_tokens ?? 0;
            cachedInputTokens = u.cache_read_input_tokens ?? 0;
            cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
            outputTokens = u.output_tokens ?? 0;
            break;
          }
          case 'content_block_start':
            if (ev.content_block.type === 'tool_use') {
              toolBlocks.set(ev.index, { id: ev.content_block.id, name: ev.content_block.name, json: '' });
            }
            break;
          case 'content_block_delta':
            if (ev.delta.type === 'text_delta') yield { type: 'text', delta: ev.delta.text };
            else if (ev.delta.type === 'input_json_delta') {
              const tb = toolBlocks.get(ev.index);
              if (tb) tb.json += ev.delta.partial_json;
            }
            break;
          case 'content_block_stop': {
            const tb = toolBlocks.get(ev.index);
            if (tb) {
              yield { type: 'tool_call', id: tb.id, name: tb.name, input: safeJson(tb.json) };
              toolBlocks.delete(ev.index);
            }
            break;
          }
          case 'message_delta':
            if (ev.usage?.output_tokens != null) outputTokens = ev.usage.output_tokens;
            stopReason = {
              type: 'done',
              stopReason:
                ev.delta.stop_reason === 'tool_use'
                  ? 'tool_use'
                  : ev.delta.stop_reason === 'max_tokens'
                    ? 'max_tokens'
                    : ev.delta.stop_reason === 'end_turn' || ev.delta.stop_reason === 'stop_sequence'
                      ? 'end'
                      : 'other',
            };
            break;
          default:
            break;
        }
      }
    } catch (err) {
      throw normalise(err);
    }
    yield { type: 'usage', usage: { inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens } };
    yield stopReason;
  }
}

function toAnthropicMessages(messages: Message[]): AnthropicMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.parts.map((p): AnthropicBlock => {
      if (p.type === 'text') return { type: 'text', text: p.text };
      if (p.type === 'tool_call') return { type: 'tool_use', id: p.id, name: p.name, input: (p.input ?? {}) as Record<string, unknown> };
      return { type: 'tool_result', tool_use_id: p.callId, content: p.content, ...(p.isError ? { is_error: true } : {}) };
    }),
  }));
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
  if (err instanceof Anthropic.APIError) return errorFromStatus(err.status, err.message);
  if (err instanceof Error && err.name === 'AbortError') return err;
  return errorFromStatus(undefined, err instanceof Error ? err.message : String(err));
}
