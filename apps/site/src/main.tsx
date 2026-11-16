import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Source } from '@ask-paul/protocol';
import { ChatPanel, SourcesPane, settings } from '@ask-paul/widget/app';
import '@ask-paul/widget/styles.css';
import evalResults from '../../../generated/eval-results.json';
import './site.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';
const PORTFOLIO_URL = import.meta.env.VITE_PORTFOLIO_URL ?? '#';
const SOURCE_URL = import.meta.env.VITE_SOURCE_URL ?? '#';
const first = settings.ownerName.split(' ')[0];

type View = { kind: 'landing' } | { kind: 'chat'; question?: string; jd?: string; jdMode?: boolean };

const Spark = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
  </svg>
);
const ArrowIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const DocIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="5" y="3" width="14" height="18" rx="2.5" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  </svg>
);

function TopBar({ onHome }: { onHome: () => void }) {
  return (
    <header class="s-top">
      <a
        class="s-brand"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onHome();
        }}
      >
        <span class="ap-avatar" aria-hidden="true">
          <Spark />
        </span>
        <span class="ap-display s-brand__name">{settings.name}</span>
      </a>
      <nav class="s-nav" aria-label="Primary">
        <a href="#how" onClick={onHome}>
          How it works
        </a>
        <a href={PORTFOLIO_URL}>{first}'s portfolio</a>
        <a href={SOURCE_URL}>Source code</a>
      </nav>
      <a class="ap-btn ap-btn--ghost s-contact" href={`mailto:${settings.ownerEmail}`}>
        Contact {first}
      </a>
    </header>
  );
}

function Landing({ onStart }: { onStart: (v: View) => void }) {
  const [text, setText] = useState('');
  const submit = () => {
    const q = text.trim();
    if (!q) return;
    // A long paste is a job description, not a question.
    if (q.length >= 400) onStart({ kind: 'chat', question: 'Tailor his résumé to this job description.', jd: q.slice(0, 8000) });
    else onStart({ kind: 'chat', question: q });
  };
  return (
    <section class="s-hero" aria-labelledby="hero-h">
      <span class="s-badge">
        <span class="s-badge__dot" />
        Answers from {first}'s résumé, case studies and projects
      </span>
      <h1 id="hero-h" class="ap-display s-hero__title">
        <b>Ask me anything professionally about</b>
        <br />
        <span class="ap-accent">{settings.ownerName}.</span>
      </h1>
      <p class="s-hero__lead">
        I'm an AI agent built by {settings.ownerName}, a software developer from frontend to backend. I show every step I take and where each answer comes
        from.
      </p>
      <form
        class="s-ask"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label class="ap-sr" for="hero-q">
          Ask a question
        </label>
        <textarea
          id="hero-q"
          rows={2}
          value={text}
          maxLength={8000}
          placeholder={`Ask anything about ${first}'s work, or paste a job description…`}
          onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div class="s-ask__row">
          <button type="button" class="s-ask__jd" onClick={() => onStart({ kind: 'chat', jdMode: true })}>
            <DocIcon /> Paste a job description
          </button>
          <button type="submit" class="ap-send" aria-label="Send" disabled={!text.trim()}>
            <ArrowIcon />
          </button>
        </div>
      </form>
      <div class="s-starters">
        {[...settings.starters.filter((s) => !/tailor/i.test(s)), 'How does this agent work?'].map((s) => (
          <button type="button" key={s} class="s-starter" onClick={() => onStart({ kind: 'chat', question: s })}>
            {s}
          </button>
        ))}
      </div>
      <a class="s-scroll" href="#how">
        How it works ↓
      </a>
    </section>
  );
}

function ChatView({ view }: { view: Extract<View, { kind: 'chat' }> }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [paneOpen, setPaneOpen] = useState(false);
  return (
    <div class="s-chat">
      <section class="s-chat__main" aria-label="Conversation">
        <ChatPanel
          apiUrl={API_URL}
          variant="page"
          remember={false}
          {...(view.question ? { initialQuestion: view.question } : {})}
          {...(view.jd ? { initialJobDescription: view.jd } : {})}
          startInJdMode={!!view.jdMode}
          onSources={(s, n) => {
            setSources(s);
            setActive(n);
            if (n !== null) setPaneOpen(true);
          }}
        />
      </section>
      <div class={`s-chat__side${paneOpen ? ' s-chat__side--open' : ''}`}>
        <button type="button" class="s-side-toggle" aria-expanded={paneOpen} onClick={() => setPaneOpen(!paneOpen)}>
          Sources{sources.length ? ` (${sources.length})` : ''}
        </button>
        <SourcesPane
          sources={sources}
          active={active}
          footer={
            <div class="s-hire">
              <strong>Hiring for a role?</strong>
              <span>Paste the job description in the chat and get a tailored one-page résumé.</span>
            </div>
          }
        />
      </div>
    </div>
  );
}

const pct = (v: number | null) => (v === null ? '[XX]%' : `${Math.round(v * 100)}%`);

function HowItWorks() {
  const r = evalResults as {
    ranAt: string | null;
    model: string | null;
    cases: number;
    passed: number;
    scores: { cites: number | null; noInvented: number | null; handoff: number | null; medianFirstWordMs: number | null };
  };
  const tools = [
    ['search_work()', `Finds passages in ${first}'s résumé and case studies, with source IDs`],
    ['show_project()', 'Returns a project card instead of a wall of text'],
    ['tailor_resume()', 'Builds a one-page résumé for a pasted job description'],
    ['book_call()', `Shares ${first}'s booking link`],
  ];
  return (
    <section id="how" class="s-how" aria-labelledby="how-h">
      <div class="s-how__intro">
        <span class="ap-eyebrow">How it works</span>
        <h2 id="how-h" class="ap-display s-how__title">
          An agent that only says what it can <span class="ap-accent">prove.</span>
        </h2>
        <p>Built by {first} as a small, honest example of an AI agent: streaming answers, visible tool calls, citations and automated evaluations.</p>
      </div>

      <ol class="s-flow" aria-label="Request flow">
        <li>
          <strong>Chat widget</strong>
          <span>Your question, streamed answers, cards</span>
        </li>
        <li>
          <strong>Edge function</strong>
          <span>Rate limits, origin check, holds the API key</span>
        </li>
        <li class="s-flow__key">
          <strong>Agent loop</strong>
          <span>Plans, calls tools, cites sources</span>
        </li>
        <li>
          <strong>{first}'s material</strong>
          <span>Résumé, case studies, projects</span>
        </li>
      </ol>

      <div class="s-tools">
        {tools.map(([name, desc]) => (
          <div class="s-tool" key={name}>
            <code>{name}</code>
            <span>{desc}</span>
          </div>
        ))}
      </div>

      <div class="s-principles">
        <article>
          <h3 class="ap-display">Sources or silence</h3>
          <p>Every claim links to where it came from. No source, no claim.</p>
        </article>
        <article>
          <h3 class="ap-display">Job descriptions are data</h3>
          <p>Pasted text is never followed as instructions.</p>
        </article>
        <article>
          <h3 class="ap-display">Small on purpose</h3>
          <p>{first}'s material fits in context, so retrieval is a tool, not a vector database.</p>
        </article>
      </div>

      <div class="s-evals">
        <div class="s-evals__head">
          <div>
            <h3 class="ap-display">Evaluations</h3>
            <span>
              {r.cases ? `${r.cases} test questions` : '[N] test questions'}, run automatically on every push
              {r.model ? ` · ${r.model}` : ''}
            </span>
          </div>
          <span class={`s-pill${r.ranAt ? '' : ' s-pill--idle'}`}>{r.ranAt ? `Last run: ${r.passed}/${r.cases} passing` : 'Not run yet'}</span>
        </div>
        <div class="s-scores">
          <div>
            <b class="ap-display">{pct(r.scores.cites)}</b>
            <span>Answers cite a source</span>
          </div>
          <div>
            <b class="ap-display">{pct(r.scores.noInvented)}</b>
            <span>No invented claims</span>
          </div>
          <div>
            <b class="ap-display">{pct(r.scores.handoff)}</b>
            <span>Hands off off-limits topics</span>
          </div>
          <div>
            <b class="ap-display">{r.scores.medianFirstWordMs === null ? '[X.X]s' : `${(r.scores.medianFirstWordMs / 1000).toFixed(1)}s`}</b>
            <span>Median first word</span>
          </div>
        </div>
      </div>

      <div class="s-links">
        <a class="ap-btn ap-btn--solid" href={SOURCE_URL}>
          Source code
        </a>
        <a class="ap-btn ap-btn--ghost" href={PORTFOLIO_URL}>
          {first}'s portfolio
        </a>
      </div>
    </section>
  );
}

function App() {
  const [view, setView] = useState<View>({ kind: 'landing' });
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    if (view.kind === 'chat') window.scrollTo({ top: 0 });
  }, [view.kind]);
  return (
    <div class={`ap-root s-app s-app--${view.kind}`}>
      <TopBar onHome={() => setView({ kind: 'landing' })} />
      <main ref={mainRef} tabIndex={-1} class="s-main">
        {view.kind === 'landing' ? (
          <>
            <Landing onStart={setView} />
            <HowItWorks />
          </>
        ) : (
          <ChatView view={view} />
        )}
      </main>
      {view.kind === 'landing' && (
        <footer class="s-foot">
          <span>
            Built by <a href={PORTFOLIO_URL}>{settings.ownerName}</a> · Winnipeg
          </span>
          <span>Answers come only from {first}'s published material. Questions are logged anonymously.</span>
        </footer>
      )}
    </div>
  );
}

render(<App />, document.getElementById('app')!);
