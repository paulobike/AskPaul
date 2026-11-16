import { useState } from 'preact/hooks';
import type { BookingCard, Card, ContactCard, ProjectCard, ResumeCard } from '@ask-paul/protocol';
import { ArrowOut, Calendar, Code, Copy, Download, Mail } from './icons.js';

export function CardView({ card }: { card: Card }) {
  switch (card.kind) {
    case 'project':
      return <ProjectCardView card={card} />;
    case 'resume':
      return <ResumeCardView card={card} />;
    case 'contact':
      return <ContactCardView card={card} />;
    case 'booking':
      return <BookingCardView card={card} />;
  }
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return { copied, copy };
}

function ProjectCardView({ card }: { card: ProjectCard }) {
  return (
    <article class="ap-card ap-card--project" aria-label={`Project: ${card.name}`}>
      <div class="ap-card__band">
        <span class="ap-badge">{card.status}</span>
      </div>
      <div class="ap-card__body">
        <h4 class="ap-card__title">{card.name}</h4>
        <p class="ap-card__text">{card.summary}</p>
        {card.stack.length > 0 && (
          <div class="ap-chips">
            {card.stack.slice(0, 4).map((s) => (
              <span class="ap-chip" key={s}>
                {s}
              </span>
            ))}
          </div>
        )}
        <div class="ap-card__actions">
          {card.liveUrl && (
            <a class="ap-btn ap-btn--solid" href={card.liveUrl} target="_blank" rel="noopener noreferrer">
              {card.liveLabel ?? 'Open'} <ArrowOut />
            </a>
          )}
          {card.codeUrl && (
            <a class="ap-btn ap-btn--ghost" href={card.codeUrl} target="_blank" rel="noopener noreferrer">
              <Code /> Code
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function ResumeCardView({ card }: { card: ResumeCard }) {
  const { copied, copy } = useCopy();
  const download = () => {
    const blob = new Blob([card.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tailored-resume.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <article class="ap-card" aria-label="Tailored résumé">
      <div class="ap-card__head">
        <span class="ap-card__head-title">{card.title}</span>
        {card.total > 0 && (
          <span class="ap-badge ap-badge--ok">
            {card.matched} of {card.total} matched
          </span>
        )}
      </div>
      <div class="ap-resume">
        <div class="ap-resume__paper" aria-hidden="true">
          <span class="ap-resume__name">{card.markdown.split('\n')[0]?.replace(/^#\s*/, '')}</span>
          <span class="ap-resume__rule" />
          {Array.from({ length: 9 }, (_, i) => (
            <span class="ap-resume__line" key={i} style={{ width: `${[100, 92, 84, 96, 70, 88, 100, 76, 90][i]}%` }} />
          ))}
        </div>
        <div class="ap-resume__info">
          {card.leadsWith.length > 0 && (
            <>
              <span class="ap-resume__label">Leads with</span>
              <ul class="ap-resume__list">
                {card.leadsWith.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </>
          )}
          {card.notCovered.length > 0 && (
            <>
              <span class="ap-resume__label">Not covered</span>
              <span class="ap-resume__muted">{card.notCovered.join(', ')}</span>
            </>
          )}
        </div>
      </div>
      <details class="ap-resume__full">
        <summary>Preview the full text</summary>
        <pre>{card.markdown}</pre>
      </details>
      <div class="ap-card__actions ap-card__actions--split">
        <button type="button" class="ap-btn ap-btn--solid" onClick={download}>
          <Download /> Download
        </button>
        <button type="button" class="ap-btn ap-btn--ghost" onClick={() => copy(card.markdown)}>
          <Copy /> {copied ? 'Copied' : 'Copy text'}
        </button>
      </div>
    </article>
  );
}

function ContactCardView({ card }: { card: ContactCard }) {
  const { copied, copy } = useCopy();
  const mailto = `mailto:${card.email}?subject=${encodeURIComponent(card.subject)}&body=${encodeURIComponent(card.draft)}`;
  const first = card.draft.match(/^Hi (\w+)/)?.[1] ?? 'Paul';
  return (
    <article class="ap-card ap-card--pad" aria-label={`Contact ${first}`}>
      <span class="ap-card__head-title">Talk to {first} directly</span>
      <div class="ap-draft">
        <span class="ap-draft__label">Draft</span>
        {card.draft}
      </div>
      <div class="ap-card__actions ap-card__actions--split">
        <a class="ap-btn ap-btn--solid" href={mailto}>
          <Mail /> Email {first}
        </a>
        {card.bookingUrl ? (
          <a class="ap-btn ap-btn--ghost" href={card.bookingUrl} target="_blank" rel="noopener noreferrer">
            <Calendar /> Book a call
          </a>
        ) : (
          <button type="button" class="ap-btn ap-btn--ghost" onClick={() => copy(card.email)}>
            <Copy /> {copied ? 'Copied' : 'Copy email'}
          </button>
        )}
      </div>
      <span class="ap-card__foot">{card.email}</span>
    </article>
  );
}

function BookingCardView({ card }: { card: BookingCard }) {
  return (
    <article class="ap-card ap-card--pad" aria-label={card.label}>
      <div class="ap-card__row">
        <span class="ap-card__icon">
          <Calendar size={18} />
        </span>
        <span class="ap-card__head-title">{card.label}</span>
      </div>
      {card.durationMinutes && <span class="ap-card__text">{card.durationMinutes} minutes, at a time that suits you.</span>}
      <a class="ap-btn ap-btn--solid" href={card.url} target="_blank" rel="noopener noreferrer">
        Pick a time <ArrowOut />
      </a>
    </article>
  );
}
