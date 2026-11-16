/**
 * Streaming post-processor for the model's answer text.
 *
 * The model cites with section ids, `[[experience/vennote#results]]`, because
 * it can't know display numbers. This rewriter, applied to the stream as it
 * arrives, turns each id into a numbered marker `[1]`, drops ids that don't
 * exist (so a hallucinated source never reaches the visitor), and cuts off the
 * trailing follow-up block so it can be sent as its own event.
 *
 * It holds back only the few characters that could be the start of a marker,
 * so text still streams word by word.
 */

export const FOLLOWUPS_DELIMITER = '<<followups>>';

export interface CitationResult {
  /** Section ids in the order they were first cited; index + 1 is the marker number. */
  cited: string[];
  /** Ids the model cited that don't exist in the knowledge base. */
  unknown: string[];
  followups: string[];
}

export class CitationRewriter {
  private pending = '';
  private cited: string[] = [];
  private unknown: string[] = [];
  private inFollowups = false;
  private followupText = '';

  constructor(private readonly isKnown: (id: string) => boolean) {}

  /** Feed a chunk; returns the text that is safe to show now. */
  push(chunk: string): string {
    if (this.inFollowups) {
      this.followupText += chunk;
      return '';
    }
    this.pending += chunk;
    return this.drain(false);
  }

  /** Call once the model is done; returns any remaining text. */
  end(): string {
    return this.drain(true);
  }

  result(): CitationResult {
    return {
      cited: [...this.cited],
      unknown: [...this.unknown],
      followups: parseFollowups(this.followupText),
    };
  }

  private numberFor(id: string): number {
    let i = this.cited.indexOf(id);
    if (i === -1) {
      this.cited.push(id);
      i = this.cited.length - 1;
    }
    return i + 1;
  }

  private drain(final: boolean): string {
    let out = '';
    for (;;) {
      const fu = this.pending.indexOf(FOLLOWUPS_DELIMITER);
      const open = this.pending.indexOf('[[');
      // Follow-up block starts before any citation: emit up to it, then capture the rest.
      if (fu !== -1 && (open === -1 || fu < open)) {
        out += this.pending.slice(0, fu);
        this.followupText += this.pending.slice(fu + FOLLOWUPS_DELIMITER.length);
        this.pending = '';
        this.inFollowups = true;
        return out.replace(/\s+$/, '');
      }
      if (open === -1) break;
      const close = this.pending.indexOf(']]', open + 2);
      if (close === -1) {
        // Unclosed marker: wait for more, unless it is clearly not a citation.
        if (!final && this.pending.length - open < 160) {
          out += this.pending.slice(0, open);
          this.pending = this.pending.slice(open);
          return out;
        }
        out += this.pending.slice(0, open + 2);
        this.pending = this.pending.slice(open + 2);
        continue;
      }
      out += this.pending.slice(0, open);
      const inner = this.pending.slice(open + 2, close);
      this.pending = this.pending.slice(close + 2);
      const ids = inner
        .split(/[,;]\s*|\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const markers: string[] = [];
      for (const id of ids) {
        if (this.isKnown(id)) markers.push(`[${this.numberFor(id)}]`);
        else if (!this.unknown.includes(id)) this.unknown.push(id);
      }
      // Drop the space before a marker that resolved to nothing.
      if (!markers.length) out = out.replace(/[ \t]+$/, '');
      out += markers.join('');
    }
    if (final) {
      out += this.pending;
      this.pending = '';
      return out.replace(/\s+$/, '');
    }
    // Hold back a tail that could be the start of "[[" or the follow-up delimiter.
    const hold = holdBack(this.pending);
    out += this.pending.slice(0, this.pending.length - hold);
    this.pending = this.pending.slice(this.pending.length - hold);
    return out;
  }
}

function holdBack(text: string): number {
  const candidates = ['[[', FOLLOWUPS_DELIMITER];
  let keep = 0;
  for (const c of candidates) {
    for (let n = Math.min(c.length - 1, text.length); n > keep; n--) {
      if (c.startsWith(text.slice(text.length - n))) {
        keep = n;
        break;
      }
    }
  }
  // Also hold trailing whitespace, so a newline before the follow-up block never leaks out.
  while (keep < text.length && /\s/.test(text.charAt(text.length - keep - 1))) keep++;
  return keep;
}

export function parseFollowups(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.length > 3 && l.length < 120)
    .slice(0, 2);
}
