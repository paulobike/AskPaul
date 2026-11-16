import { describe, expect, it } from 'vitest';
import { buildKb, parseKbFile, SectionIndex, tailorResume } from '@ask-paul/agent-core';
import { realKb, testConfig } from './helpers.js';

describe('knowledge base parsing', () => {
  it('turns ## headings into stable section ids', () => {
    const { sections } = parseKbFile({ fileId: 'experience/acme', markdown: '---\ntitle: Acme\n---\n# Acme\n\n## What he built\n- A thing\n\n## Results\n- 2x faster\n' });
    expect(sections.map((s) => s.id)).toEqual(['experience/acme#what-he-built', 'experience/acme#results']);
    expect(sections[0]?.title).toBe('Acme · What he built');
  });

  it('keeps [TODO] placeholders out of sections and metadata but reports them', () => {
    const out = parseKbFile({ fileId: 'projects/x', markdown: '---\ntitle: X\nlive: [TODO: url]\n---\n## Overview\n- Real line\n- [TODO: fill me]\n\n## Empty\n- [TODO: later]\n' });
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0]?.body).toBe('- Real line');
    expect(out.project?.liveUrl).toBeUndefined();
    expect(out.todos).toHaveLength(3);
  });

  it('rejects duplicate ids across files', () => {
    expect(() => buildKb([{ fileId: 'a', markdown: '## X\n- one' }, { fileId: 'a', markdown: '## X\n- two' }])).toThrow(/Duplicate/);
  });

  it('builds the real kb/ folder with projects and off-limits topics', () => {
    const kb = realKb();
    expect(kb.sections.length).toBeGreaterThan(20);
    expect(kb.projects.map((p) => p.id).sort()).toEqual(['ask-paul', 'framex', 'last-card']);
    expect(kb.offlimits.some((t) => /salary/i.test(t))).toBe(true);
    expect(kb.sections.every((s) => !s.body.includes('[TODO'))).toBe(true);
  });
});

describe('search', () => {
  const kb = realKb();
  const index = new SectionIndex(kb.sections);
  it('finds the right role', () => {
    expect(index.search('What did Paul build at Vennote?')[0]?.section.fileId).toBe('experience/vennote');
    expect(index.search('payroll integrations')[0]?.section.fileId).toBe('experience/pinnacle');
    expect(index.search('microservices RabbitMQ Kubernetes')[0]?.section.fileId).toBe('experience/mezovest');
  });
  it('returns nothing for unrelated queries', () => {
    expect(index.search('best pizza in Naples')).toEqual([]);
  });
  it('never returns off-limits sections', () => {
    expect(index.search('salary compensation').every((h) => h.section.kind !== 'offlimits')).toBe(true);
  });
});

describe('tailor_resume', () => {
  const kb = realKb();
  const jd = `Senior Software Developer. You will build TypeScript and Python microservices, work with RabbitMQ and Kubernetes,
    write React frontends, and own CI/CD with GitHub Actions. Experience with GraphQL and Azure is a plus.`;
  const card = tailorResume(jd, kb, testConfig());

  it('separates matched requirements from gaps', () => {
    expect(card.total).toBeGreaterThan(5);
    expect(card.notCovered).toEqual(expect.arrayContaining(['GraphQL', 'Azure']));
    expect(card.notCovered).not.toContain('TypeScript');
    expect(card.matched + card.notCovered.length).toBe(card.total);
  });

  it('uses only lines that exist in the knowledge base', () => {
    const kbLines = new Set(kb.sections.flatMap((s) => s.body.split('\n').map((l) => l.replace(/^[-*]\s+/, '').trim())));
    const bullets = card.markdown
      .split('\n')
      .filter((l) => l.startsWith('- '))
      .map((l) => l.replace(/^- (\*\*[^*]+\*\*: )?/, '').trim());
    expect(bullets.length).toBeGreaterThan(3);
    for (const b of bullets) expect(kbLines.has(b), b).toBe(true);
  });

  it('cites its sources', () => {
    expect(card.sourceIds.length).toBeGreaterThan(2);
    for (const id of card.sourceIds) expect(kb.sections.some((s) => s.id === id)).toBe(true);
  });
});
