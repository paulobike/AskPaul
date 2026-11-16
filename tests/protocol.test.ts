import { describe, expect, it } from 'vitest';
import { ChatRequestSchema, createSseParser, encodeSse, type StreamEvent } from '@ask-paul/protocol';
import { createSseParser as liteParser } from '@ask-paul/protocol/lite';

describe('SSE encoding', () => {
  const events: StreamEvent[] = [
    { type: 'step', id: 's1', label: 'Searched work history', status: 'done', detail: '2 matches' },
    { type: 'text', delta: 'Hello\nworld' },
    { type: 'done' },
  ];

  it('round-trips events through the full and lite parsers', () => {
    const wire = events.map(encodeSse).join('');
    expect(createSseParser()(wire)).toEqual(events);
    expect(liteParser()(wire)).toEqual(events);
  });

  it('reassembles frames split across chunks at any point', () => {
    const wire = events.map(encodeSse).join('');
    for (let cut = 1; cut < wire.length; cut += 7) {
      const parse = createSseParser();
      expect([...parse(wire.slice(0, cut)), ...parse(wire.slice(cut))]).toEqual(events);
    }
  });

  it('skips comments, malformed and unknown frames', () => {
    const parse = createSseParser();
    const out = parse(': ping\n\ndata: {not json}\n\ndata: {"type":"mystery"}\n\n' + encodeSse({ type: 'done' }));
    expect(out).toEqual([{ type: 'done' }]);
  });
});

describe('ChatRequest validation', () => {
  it('accepts a minimal question and fills defaults', () => {
    expect(ChatRequestSchema.parse({ question: 'Hi' })).toEqual({ question: 'Hi', history: [] });
  });
  it('rejects empty and oversized input', () => {
    expect(ChatRequestSchema.safeParse({ question: '   ' }).success).toBe(false);
    expect(ChatRequestSchema.safeParse({ question: 'x'.repeat(1001) }).success).toBe(false);
    expect(ChatRequestSchema.safeParse({ question: 'ok', jobDescription: 'x'.repeat(8001) }).success).toBe(false);
  });
});
