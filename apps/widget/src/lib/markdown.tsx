import type { ComponentChildren } from 'preact';

/**
 * A deliberately small Markdown renderer for answers: paragraphs, bullet and
 * numbered lists, **bold**, links and [n] citation markers. It builds vnodes
 * directly (never innerHTML), so model output can't inject markup.
 */
export function renderAnswer(text: string, onCite?: (n: number) => void): ComponentChildren {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks.map((block, bi) => {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length) return null;
    const bullet = lines.every((l) => /^\s*[-*]\s+/.test(l));
    const numbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
    if (bullet || numbered) {
      const items = lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*(?:[-*]|\d+[.)])\s+/, ''), onCite)}</li>);
      return numbered ? <ol key={bi}>{items}</ol> : <ul key={bi}>{items}</ul>;
    }
    // Mixed block: a lead line followed by list items.
    const firstList = lines.findIndex((l) => /^\s*[-*]\s+/.test(l));
    if (firstList > 0 && lines.slice(firstList).every((l) => /^\s*[-*]\s+/.test(l))) {
      return (
        <div key={bi}>
          <p>{inline(lines.slice(0, firstList).join(' '), onCite)}</p>
          <ul>
            {lines.slice(firstList).map((l, li) => (
              <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ''), onCite)}</li>
            ))}
          </ul>
        </div>
      );
    }
    return <p key={bi}>{inline(lines.join(' '), onCite)}</p>;
  });
}

const TOKEN = /(\*\*[^*]+\*\*|\[\d+\]|https?:\/\/[^\s)]+)/g;

function inline(text: string, onCite?: (n: number) => void): ComponentChildren {
  const out: ComponentChildren[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(TOKEN)) {
    const tok = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (tok.startsWith('**')) out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('[')) {
      const n = Number(tok.slice(1, -1));
      out.push(
        <button key={key++} type="button" class="ap-cite" onClick={() => onCite?.(n)} aria-label={`Source ${n}`}>
          {n}
        </button>,
      );
    } else {
      const url = tok.replace(/[.,;:]+$/, '');
      out.push(
        <a key={key++} href={url} target="_blank" rel="noopener noreferrer">
          {url.replace(/^https?:\/\//, '')}
        </a>,
      );
      if (url.length < tok.length) out.push(tok.slice(url.length));
    }
    last = at + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Text up to the last finished sentence: used for reduced-motion streaming. */
export function upToLastSentence(text: string): string {
  const m = /^[\s\S]*[.!?:](\s|$)/.exec(text);
  return m ? m[0] : '';
}
