import { useState } from 'preact/hooks';
import type { Step } from '../lib/useChat.js';
import { Check, Chevron } from './icons.js';

/**
 * The agent's visible steps. Expanded while it works so the wait never feels
 * dead; collapsed into one chip once the answer is in (tap to expand).
 */
export function Steps({ steps, working, sourceCount }: { steps: Step[]; working: boolean; sourceCount: number }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  const visible = steps.filter((s) => s.id !== 'write' || working);

  if (!working && !open) {
    const tools = steps.filter((s) => s.id !== 'write').length;
    const summary = [`${tools} ${tools === 1 ? 'step' : 'steps'}`, sourceCount ? `${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}` : null]
      .filter(Boolean)
      .join(' · ');
    if (!tools) return null;
    return (
      <button type="button" class="ap-steps-chip" aria-expanded="false" onClick={() => setOpen(true)}>
        <span class="ap-steps-chip__ok">
          <Check />
        </span>
        {summary}
        <Chevron />
      </button>
    );
  }

  return (
    <div class="ap-steps" role="status" aria-label="Steps">
      <div class="ap-steps__head">
        <span>Steps</span>
        {!working && (
          <button type="button" class="ap-icon-btn ap-icon-btn--sm" aria-label="Collapse steps" aria-expanded="true" onClick={() => setOpen(false)}>
            <Chevron up />
          </button>
        )}
      </div>
      {visible.map((s) => (
        <div class="ap-step" key={s.id}>
          <span class={`ap-step__mark ap-step__mark--${s.status}`} aria-hidden="true">
            {s.status === 'done' ? <Check /> : s.status === 'running' ? <span class="ap-step__dot" /> : '!'}
          </span>
          <span class="ap-step__text">
            <span class="ap-step__label">{s.label}</span>
            {s.detail && <span class="ap-step__detail">{s.detail}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
