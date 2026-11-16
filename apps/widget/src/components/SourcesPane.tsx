import { useEffect, useRef } from 'preact/hooks';
import type { Source } from '@ask-paul/protocol';
import { ArrowOut, Doc } from './icons.js';

/** The standalone site's right-hand pane: the exact passage behind each numbered citation. */
export function SourcesPane({ sources, active, footer }: { sources: Source[]; active: number | null; footer?: preact.ComponentChildren }) {
  const refs = useRef<Record<number, HTMLElement | null>>({});
  useEffect(() => {
    if (active !== null) refs.current[active]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  return (
    <aside class="ap-sources-pane" aria-label="Sources">
      <div class="ap-sources-pane__head">
        <span class="ap-eyebrow">Sources</span>
        {sources.length > 0 && <span class="ap-muted">{sources.length} used</span>}
      </div>
      {sources.length === 0 ? (
        <p class="ap-muted ap-sources-pane__empty">The passages behind each answer appear here, numbered to match the citations.</p>
      ) : (
        sources.map((s) => (
          <article key={s.n} ref={(el) => {
            refs.current[s.n] = el;
          }} class={`ap-quote${active === s.n ? ' ap-quote--active' : ''}`}>
            <div class="ap-quote__head">
              <span class="ap-quote__title">
                <Doc size={14} />
                {s.n} · {s.title}
              </span>
              {s.url && (
                <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${s.title}`}>
                  <ArrowOut size={14} />
                </a>
              )}
            </div>
            <p>{s.quote}</p>
          </article>
        ))
      )}
      {footer}
    </aside>
  );
}
