import { createSseParser } from '@ask-paul/protocol/lite';
import type { ChatRequestInput, ErrorCode, StreamEvent } from '@ask-paul/protocol';

/**
 * POST a question and deliver each stream event as it arrives. HTTP errors
 * and network failures are turned into `error` events, so the UI has exactly
 * one path for every outcome.
 */
export async function streamChat(opts: {
  apiUrl: string;
  body: ChatRequestInput;
  signal: AbortSignal;
  onEvent: (event: StreamEvent) => void;
}): Promise<void> {
  const { apiUrl, body, signal, onEvent } = opts;
  const fail = (code: ErrorCode, message: string, retryAfterSeconds?: number) => {
    onEvent({ type: 'error', code, message, ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}) });
    onEvent({ type: 'done' });
  };

  let res: Response;
  try {
    res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    return fail('offline', 'The live agent is offline.');
  }

  if (!res.ok || !res.body) {
    let payload: { code?: ErrorCode; message?: string; retryAfterSeconds?: number } = {};
    try {
      payload = await res.json();
    } catch {
      /* not JSON */
    }
    const code: ErrorCode = payload.code ?? (res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'overloaded' : 'bad_request');
    return fail(code, payload.message ?? 'Something went wrong.', payload.retryAfterSeconds);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const parse = createSseParser();
  let sawDone = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const event of parse(value)) {
        if (event.type === 'done') sawDone = true;
        onEvent(event);
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    if (!sawDone) return fail('offline', 'The connection dropped before the answer finished.');
  }
  if (!sawDone) onEvent({ type: 'done' });
}
