import { useState } from 'preact/hooks';
import type { Source } from '@ask-paul/protocol';
import { renderAnswer, upToLastSentence } from '../lib/markdown.js';
import { ownerFirstName, settings } from '../lib/settings.js';
import type { AssistantMessage, UserMessage } from '../lib/useChat.js';
import { CardView } from './Cards.js';
import { Steps } from './Steps.js';
import { Arrow, Clock, Copy, Doc, Mail, Spark } from './icons.js';

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function UserBubble({ message }: { message: UserMessage }) {
  if (message.jobDescription) {
    return (
      <div class="ap-user ap-user--file">
        <span class="ap-user__file-icon">
          <Doc size={18} />
        </span>
        <span class="ap-user__file-text">
          <strong>Job description</strong>
          <span>{message.jobDescription.chars.toLocaleString()} characters</span>
        </span>
      </div>
    );
  }
  return <div class="ap-user">{message.text}</div>;
}

export function AssistantBlock(props: {
  message: AssistantMessage;
  isLast: boolean;
  onFollowup: (q: string) => void;
  onCite: (sources: Source[], n: number) => void;
  onSaved: (q: string, a: string) => void;
  onRetry: () => void;
}) {
  const { message: m, isLast } = props;
  const [copied, setCopied] = useState(false);
  const working = m.status === 'working' || m.status === 'streaming';
  const shown = m.status === 'streaming' && reducedMotion() ? upToLastSentence(m.text) : m.text;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.text.replace(/\[\d+\]/g, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div class="ap-assistant">
      <Steps steps={m.steps} working={working} sourceCount={m.sources.length} />

      {(shown || m.status === 'working') && (
        <div class="ap-answer">
          <span class="ap-avatar ap-avatar--sm" aria-hidden="true">
            <Spark size={14} />
          </span>
          <div class="ap-answer__text">
            {shown ? renderAnswer(shown, (n) => props.onCite(m.sources, n)) : <span class="ap-thinking">Thinking</span>}
            {m.status === 'streaming' && <span class="ap-cursor" aria-hidden="true" />}
            {m.status === 'stopped' && <span class="ap-muted"> (stopped)</span>}
            {m.saved && <span class="ap-saved-tag">Saved answer</span>}
          </div>
        </div>
      )}

      {m.cards.map((card, i) => (
        <div class="ap-card-wrap" key={i}>
          <CardView card={card} />
        </div>
      ))}

      {m.status === 'error' && m.error && <ErrorBlock error={m.error} onSaved={props.onSaved} onRetry={props.onRetry} />}

      {m.status === 'done' && m.text && !m.saved && (
        <div class="ap-actions">
          <button type="button" class="ap-icon-btn" aria-label={copied ? 'Copied' : 'Copy answer'} title={copied ? 'Copied' : 'Copy answer'} onClick={copy}>
            <Copy size={16} />
          </button>
        </div>
      )}

      {m.sources.length > 0 && m.status !== 'working' && (
        <div class="ap-sources" aria-label="Sources">
          {m.sources.map((s) => (
            <button type="button" class="ap-source" key={s.n} onClick={() => props.onCite(m.sources, s.n)} title={s.quote}>
              <span class="ap-source__n">{s.n}</span>
              <Doc size={13} />
              <span class="ap-source__title">{s.title}</span>
            </button>
          ))}
        </div>
      )}

      {isLast && m.status === 'done' && m.followups.length > 0 && (
        <div class="ap-followups">
          <span class="ap-eyebrow">Ask next</span>
          {m.followups.map((q) => (
            <button type="button" class="ap-followup" key={q} onClick={() => props.onFollowup(q)}>
              <span>{q}</span>
              <Arrow size={14} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorBlock({
  error,
  onSaved,
  onRetry,
}: {
  error: NonNullable<AssistantMessage['error']>;
  onSaved: (q: string, a: string) => void;
  onRetry: () => void;
}) {
  const mail = `mailto:${settings.ownerEmail}`;
  if (error.code === 'rate_limited') {
    const hours = error.retryAfterSeconds ? Math.max(1, Math.round(error.retryAfterSeconds / 3600)) : null;
    return (
      <div class="ap-card ap-card--pad" role="status">
        <div class="ap-card__row">
          <span class="ap-card__icon">
            <Clock />
          </span>
          <span class="ap-card__head-title">You've reached today's limit</span>
        </div>
        <p class="ap-card__text">
          {settings.dailyLimit} questions a day keeps the agent free for everyone. It resets {hours ? `in about ${hours} ${hours === 1 ? 'hour' : 'hours'}` : 'tomorrow'}, or ask{' '}
          {ownerFirstName} directly.
        </p>
        <div class="ap-card__actions ap-card__actions--split">
          <a class="ap-btn ap-btn--solid" href={mail}>
            <Mail /> Email {ownerFirstName}
          </a>
        </div>
        <span class="ap-card__foot">{settings.ownerEmail}</span>
        <SavedList onSaved={onSaved} />
      </div>
    );
  }
  if (error.code === 'offline') {
    return (
      <div class="ap-card ap-card--pad" role="status">
        <p class="ap-card__text">{error.message} You can still use the saved answers, or try again.</p>
        <div class="ap-card__actions">
          <button type="button" class="ap-btn ap-btn--ghost" onClick={onRetry}>
            Try again
          </button>
        </div>
        <SavedList onSaved={onSaved} />
      </div>
    );
  }
  return (
    <div class="ap-card ap-card--pad" role="alert">
      <p class="ap-card__text">{error.message}</p>
      <div class="ap-card__actions ap-card__actions--split">
        <button type="button" class="ap-btn ap-btn--ghost" onClick={onRetry}>
          Try again
        </button>
        <a class="ap-btn ap-btn--ghost" href={mail}>
          <Mail /> Email {ownerFirstName}
        </a>
      </div>
    </div>
  );
}

export function SavedList({ onSaved }: { onSaved: (q: string, a: string) => void }) {
  if (!settings.savedAnswers.length) return null;
  return (
    <div class="ap-followups ap-followups--flush">
      <span class="ap-eyebrow">Saved answers</span>
      {settings.savedAnswers.map((s) => (
        <button type="button" class="ap-followup" key={s.question} onClick={() => onSaved(s.question, s.answer)}>
          <span>{s.question}</span>
          <Arrow size={14} />
        </button>
      ))}
    </div>
  );
}
