/**
 * The one interface the agent loop talks to. Each provider adapter translates
 * this neutral shape to and from its own API, so swapping models is a config
 * change and nothing above this file knows which provider answered.
 */

export interface SystemBlock {
  text: string;
  /** Mark the end of a stable prefix so providers that need explicit cache breakpoints can cache it. */
  cache?: boolean;
}

export type Part =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; callId: string; content: string; isError?: boolean };

export interface Message {
  role: 'user' | 'assistant';
  parts: Part[];
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for the tool's input object. */
  inputSchema: Record<string, unknown>;
}

export interface ModelRequest {
  system: SystemBlock[];
  messages: Message[];
  tools: ToolDef[];
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface ModelUsage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

export type ModelEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'usage'; usage: ModelUsage }
  | { type: 'done'; stopReason: 'end' | 'tool_use' | 'max_tokens' | 'other' };

export type ProviderErrorCode = 'rate_limited' | 'overloaded' | 'bad_request' | 'auth' | 'network' | 'unknown';

/** Normalised provider failure. `retryable` decides whether the fallback model is tried. */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface ModelProvider {
  /** "anthropic:claude-haiku-5-5" — used in logs and the meta event. */
  readonly label: string;
  /** Model id, used to look up prices. */
  readonly modelId: string;
  stream(req: ModelRequest): AsyncIterable<ModelEvent>;
}

export function errorFromStatus(status: number | undefined, message: string): ProviderError {
  if (status === 429) return new ProviderError('rate_limited', message, true, status);
  if (status === 529 || status === 503 || status === 502 || status === 500) return new ProviderError('overloaded', message, true, status);
  if (status === 401 || status === 403) return new ProviderError('auth', message, false, status);
  if (status && status >= 400 && status < 500) return new ProviderError('bad_request', message, false, status);
  if (status === undefined) return new ProviderError('network', message, true);
  return new ProviderError('unknown', message, true, status);
}
