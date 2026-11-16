/**
 * Zero-dependency part of the protocol for the browser widget: limits, the
 * SSE parser and a cheap shape check. Types come from ./index.ts as
 * type-only imports, so Zod never reaches the client bundle.
 */
import type { StreamEvent } from './index.js';

export const LIMITS = {
  questionChars: 1_000,
  jobDescriptionChars: 8_000,
  historyTurns: 10,
  historyTurnChars: 4_000,
  pageContextChars: 200,
} as const;

const KNOWN = new Set(['meta', 'step', 'text', 'card', 'sources', 'followups', 'error', 'done']);

/** Light structural check: right `type`, and the one field each renderer relies on. */
export function looksLikeEvent(x: unknown): x is StreamEvent {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  if (typeof e.type !== 'string' || !KNOWN.has(e.type)) return false;
  switch (e.type) {
    case 'text':
      return typeof e.delta === 'string';
    case 'step':
      return typeof e.id === 'string' && typeof e.label === 'string';
    case 'card':
      return !!e.card && typeof (e.card as { kind?: unknown }).kind === 'string';
    case 'sources':
      return Array.isArray(e.sources);
    case 'followups':
      return Array.isArray(e.questions);
    case 'error':
      return typeof e.code === 'string';
    default:
      return true;
  }
}

/** Serialise one event as a Server-Sent Events frame. */
export function encodeSse(event: StreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Incremental SSE parser. Feed it text chunks as they arrive; it returns the
 * complete events found so far and keeps any partial frame. Unknown or
 * malformed frames are skipped, so a newer server can add event types
 * without breaking older widgets.
 */
export function createSseParser(validate: (x: unknown) => StreamEvent | null = (x) => (looksLikeEvent(x) ? x : null)) {
  let buffer = '';
  return function push(chunk: string): StreamEvent[] {
    buffer += chunk.replace(/\r\n/g, '\n');
    const events: StreamEvent[] = [];
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try {
        const event = validate(JSON.parse(data));
        if (event) events.push(event);
      } catch {
        /* skip malformed frame */
      }
    }
    return events;
  };
}
