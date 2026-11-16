import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Source } from '@ask-paul/protocol';
import { ownerFirstName, settings } from '../lib/settings.js';
import { useChat, type AssistantMessage } from '../lib/useChat.js';
import { Composer } from './Composer.js';
import { AssistantBlock, SavedList, UserBubble } from './Message.js';
import { Arrow, Close, Reset, Spark, WifiOff } from './icons.js';

export interface ChatPanelProps {
  apiUrl: string;
  pageContext?: string;
  /** "panel" = header with close button (widget); "page" = no header (standalone site). */
  variant?: 'panel' | 'page';
  onClose?: () => void;
  /** Called when a citation or source chip is clicked; the site shows them in its Sources pane. */
  onSources?: (sources: Source[], active: number | null) => void;
  /** Sent once on mount (the standalone landing hands its first question over). */
  initialQuestion?: string;
  initialJobDescription?: string;
  startInJdMode?: boolean;
  remember?: boolean;
}

export function ChatPanel(props: ChatPanelProps) {
  const chat = useChat({ apiUrl: props.apiUrl, ...(props.pageContext ? { pageContext: props.pageContext } : {}), remember: props.remember ?? true });
  const logRef = useRef<HTMLDivElement>(null);
  const [announce, setAnnounce] = useState('');
  const sentInitial = useRef(false);

  useEffect(() => {
    if (sentInitial.current || !props.initialQuestion) return;
    sentInitial.current = true;
    void chat.send(props.initialQuestion, props.initialJobDescription);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the stream unless the reader has scrolled up; always jump down when a new question is sent.
  // Only an upward scroll unpins: content growing under us (text, cards, steps) must not count as
  // "the reader scrolled away", which is what a plain distance-from-bottom check gets wrong.
  const last = chat.messages.at(-1);
  const count = useRef(chat.messages.length);
  const pinned = useRef(true);
  const lastTop = useRef(0);
  const toBottom = () => {
    const el = logRef.current;
    if (!el || !pinned.current) return;
    el.scrollTop = el.scrollHeight;
    lastTop.current = el.scrollTop;
  };
  useLayoutEffect(() => {
    const asked = chat.messages.length > count.current;
    count.current = chat.messages.length;
    if (asked) pinned.current = true;
    toBottom();
    // Also follow growth that happens without a message update (cards, images, expanding details).
    const el = logRef.current;
    if (el && resizeObs.current) for (const child of el.children) resizeObs.current.observe(child);
  }, [chat.messages]);
  const resizeObs = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    resizeObs.current = new ResizeObserver(() => toBottom());
    const el = logRef.current;
    if (el) for (const child of el.children) resizeObs.current.observe(child);
    return () => resizeObs.current?.disconnect();
  }, []);
  const onScroll = () => {
    const el = logRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) pinned.current = true;
    else if (el.scrollTop < lastTop.current - 4) pinned.current = false;
    lastTop.current = el.scrollTop;
  };

  // Announce finished answers once, not word by word.
  useEffect(() => {
    if (last?.role === 'assistant' && last.status === 'done' && last.text) setAnnounce(last.text.replace(/\[\d+\]/g, ''));
  }, [last?.role === 'assistant' ? last.status : null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the site's Sources pane in step with the latest answer.
  useEffect(() => {
    if (last?.role === 'assistant' && last.sources.length && last.status !== 'working') props.onSources?.(last.sources, null);
  }, [last?.role === 'assistant' ? last.sources : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = chat.messages.length === 0;
  const limited = chat.remaining === 0;
  const retry = () => {
    const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user');
    if (lastUser && lastUser.role === 'user') void chat.send(lastUser.text);
  };

  return (
    <section class={`ap-panel ap-panel--${props.variant ?? 'panel'}`} aria-label={settings.name}>
      {props.variant !== 'page' && (
        <header class="ap-header">
          <span class="ap-avatar" aria-hidden="true">
            <Spark size={18} />
          </span>
          <span class="ap-header__text">
            <span class="ap-header__name">{settings.name}</span>
            <span class="ap-header__sub">AI agent · answers from {ownerFirstName}'s work</span>
          </span>
          {!empty && (
            <button type="button" class="ap-icon-btn" aria-label="Start a new conversation" title="New conversation" onClick={chat.reset}>
              <Reset />
            </button>
          )}
          {props.onClose && (
            <button type="button" class="ap-icon-btn ap-icon-btn--filled" aria-label="Close" onClick={props.onClose} data-close>
              <Close />
            </button>
          )}
        </header>
      )}
      {props.pageContext && props.variant !== 'page' && (
        <div class="ap-context">Reading with you: {props.pageContext}</div>
      )}
      {chat.offline && (
        <div class="ap-banner" role="status">
          <WifiOff />
          <span>
            <strong>Live agent is offline</strong>
            <span>You can still use the saved answers.</span>
          </span>
        </div>
      )}

      <div class="ap-log" ref={logRef} onScroll={onScroll}>
        {empty ? (
          <div class="ap-welcome">
            <h2 class="ap-display">
              <b>Hi, I'm {ownerFirstName}'s</b> <span class="ap-accent">AI agent.</span>
            </h2>
            <p class="ap-welcome__text">
              I answer from {ownerFirstName}'s résumé, case studies and projects, and I show where every answer comes from.
            </p>
            <div class="ap-starters">
              {settings.starters.map((s) => (
                <button type="button" class="ap-starter" key={s} onClick={() => void chat.send(s)}>
                  <span>{s}</span>
                  <Arrow size={14} />
                </button>
              ))}
            </div>
            {chat.offline && <SavedList onSaved={chat.showSaved} />}
            <p class="ap-fineprint">Questions are logged anonymously to improve answers. Please don't share personal details.</p>
          </div>
        ) : (
          chat.messages.map((m, i) =>
            m.role === 'user' ? (
              <UserBubble key={m.id} message={m} />
            ) : (
              <AssistantBlock
                key={m.id}
                message={m as AssistantMessage}
                isLast={i === chat.messages.length - 1}
                onFollowup={(q) => void chat.send(q)}
                onCite={(sources, n) => props.onSources?.(sources, n)}
                onSaved={chat.showSaved}
                onRetry={retry}
              />
            ),
          )
        )}
      </div>

      <div class="ap-sr" aria-live="polite">
        {announce}
      </div>

      <Composer
        busy={chat.busy}
        disabled={limited}
        autoFocus={props.variant !== 'page' || !props.initialQuestion}
        startInJdMode={!!props.startInJdMode}
        placeholder={limited ? 'Daily limit reached' : `Ask about ${ownerFirstName}'s work`}
        onSend={(q, jd) => void chat.send(q, jd)}
        onStop={chat.stop}
      />
    </section>
  );
}
