import { describe, expect, it } from 'vitest';
import { CitationRewriter, FOLLOWUPS_DELIMITER } from '@ask-paul/agent-core';

const known = new Set(['a#one', 'b#two']);
const run = (chunks: string[]) => {
  const r = new CitationRewriter((id) => known.has(id));
  const out = chunks.map((c) => r.push(c)).join('') + r.end();
  return { out, ...r.result() };
};

describe('CitationRewriter', () => {
  it('numbers citations in order of first use and reuses numbers', () => {
    const { out, cited } = run(['He led it [[a#one]]. He also built [[b#two]] and [[a#one]].']);
    expect(out).toBe('He led it [1]. He also built [2] and [1].');
    expect(cited).toEqual(['a#one', 'b#two']);
  });

  it('handles markers split across chunks', () => {
    const { out } = run(['Fact [', '[a#o', 'ne]', '] done.']);
    expect(out).toBe('Fact [1] done.');
  });

  it('drops citations to sections that do not exist', () => {
    const { out, unknown, cited } = run(['Invented claim [[made/up#x]].']);
    expect(out).toBe('Invented claim.');
    expect(unknown).toEqual(['made/up#x']);
    expect(cited).toEqual([]);
  });

  it('accepts several ids in one marker', () => {
    expect(run(['Both [[a#one, b#two]].']).out).toBe('Both [1][2].');
  });

  it('cuts the follow-up block out of the visible text, even when split', () => {
    const half = FOLLOWUPS_DELIMITER.length / 2;
    const { out, followups } = run([
      'Answer [[a#one]].\n',
      FOLLOWUPS_DELIMITER.slice(0, half),
      FOLLOWUPS_DELIMITER.slice(half) + '\n- What else?\n- Show me a project',
    ]);
    expect(out).toBe('Answer [1].');
    expect(followups).toEqual(['What else?', 'Show me a project']);
  });

  it('never holds back ordinary text', () => {
    const r = new CitationRewriter(() => true);
    expect(r.push('Plain words stream right away')).toBe('Plain words stream right away');
  });
});
