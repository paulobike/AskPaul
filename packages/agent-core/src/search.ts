/**
 * Small BM25 search over knowledge-base sections.
 *
 * The whole knowledge base already sits in the (cached) prompt, so this is not
 * about recall. It gives the agent an honest, visible "search" step and pins
 * each citation to an exact section.
 */
import type { KbSection } from './kb.js';

const STOP = new Set(
  'a an and are as at be but by did do does for from has have he his how i in is it its of on or paul pauls s she so that the their them they this to was were what when where which who why will with you your about can did me my tell best good great top most really know any some like'.split(
    ' ',
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

/** Deliberately tiny stemmer: enough for "integrations" ~ "integration". */
const IRREGULAR: Record<string, string> = { built: 'build', led: 'lead', wrote: 'write', made: 'make', ran: 'run', shipped: 'ship', building: 'build' };

function stem(t: string): string {
  const irregular = IRREGULAR[t];
  if (irregular) return irregular;
  if (t.length > 5 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith('es') && !t.endsWith('ses')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

export interface SearchHit {
  section: KbSection;
  score: number;
}

export class SectionIndex {
  private docs: { section: KbSection; tf: Map<string, number>; len: number }[];
  private df = new Map<string, number>();
  private avgLen: number;

  constructor(sections: KbSection[]) {
    this.docs = sections
      .filter((s) => s.kind !== 'offlimits')
      .map((section) => {
        // Title terms count twice: a heading is a strong signal.
        const tokens = [...tokenize(section.title), ...tokenize(section.title), ...tokenize(section.body)];
        const tf = new Map<string, number>();
        for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
        return { section, tf, len: tokens.length };
      });
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.avgLen = this.docs.reduce((n, d) => n + d.len, 0) / Math.max(1, this.docs.length);
  }

  search(query: string, limit = 4, minScore = 0.5): SearchHit[] {
    const terms = [...new Set(tokenize(query))];
    if (!terms.length) return [];
    const N = this.docs.length;
    const asksAboutTools = /\b(stack|tech|technolog|tool|language|framework|use[ds]?)\b/i.test(query);
    const k1 = 1.4;
    const b = 0.4; // light length normalisation: long "what he built" sections should not lose to one-liners
    return this.docs
      .map(({ section, tf, len }) => {
        let score = 0;
        for (const t of terms) {
          const f = tf.get(t);
          if (!f) continue;
          const df = this.df.get(t) ?? 0;
          const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
          score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * len) / this.avgLen)));
        }
        // Bare stack lists are short, so BM25 over-rewards them; prefer them only when the question is about tools.
        if (/^stack$/i.test(section.heading) && !asksAboutTools) score *= 0.5;
        return { section, score, hits: terms.filter((t) => tf.has(t)).length };
      })
      // A strong answer matches a fair share of the question, not one stray word.
      .filter((h) => h.score >= minScore && (terms.length < 3 || h.hits / terms.length >= 1 / 3))
      .map(({ section, score }) => ({ section, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
