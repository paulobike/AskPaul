/**
 * The widget's interactive part. Loaded on demand by the <ask-paul> element
 * (see index.ts), and imported directly by the standalone site.
 */
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ChatPanel } from './components/ChatPanel.js';
import styles from './styles.css?inline';

export { ChatPanel } from './components/ChatPanel.js';
export { SourcesPane } from './components/SourcesPane.js';
export { settings } from './lib/settings.js';
export { styles };

export interface MountOptions {
  apiUrl: string;
  mode: 'launcher' | 'inline';
  pageContext?: string;
  /** Launcher only: called when the panel closes, so focus can return to the launcher. */
  onClose?: () => void;
}

/** Overlay panel: side panel on wide screens, bottom sheet on phones. */
function Overlay({ apiUrl, pageContext, onClose }: { apiUrl: string; pageContext?: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    setLeaving(true);
    setTimeout(onClose, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
  };

  // Escape closes; Tab stays inside the panel while it is open.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter(
        (el) => el.offsetParent !== null,
      );
      if (!focusables.length) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = (root.getRootNode() as Document | ShadowRoot).activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div class={`ap-overlay${leaving ? ' ap-overlay--leaving' : ''}`} ref={ref}>
      <div class="ap-scrim" onClick={close} aria-hidden="true" />
      <div class="ap-sheet" role="dialog" aria-modal="true" aria-label="Ask Paul">
        <div class="ap-sheet__handle" aria-hidden="true">
          <span />
        </div>
        <ChatPanel apiUrl={apiUrl} {...(pageContext ? { pageContext } : {})} onClose={close} />
      </div>
    </div>
  );
}

/** Mount into a container (inside the element's shadow root). Returns an unmount function. */
export function mount(container: Element, opts: MountOptions): () => void {
  if (opts.mode === 'inline') {
    render(<ChatPanel apiUrl={opts.apiUrl} {...(opts.pageContext ? { pageContext: opts.pageContext } : {})} variant="panel" />, container);
  } else {
    render(
      <Overlay
        apiUrl={opts.apiUrl}
        {...(opts.pageContext ? { pageContext: opts.pageContext } : {})}
        onClose={() => {
          render(null, container);
          opts.onClose?.();
        }}
      />,
      container,
    );
  }
  return () => render(null, container);
}
