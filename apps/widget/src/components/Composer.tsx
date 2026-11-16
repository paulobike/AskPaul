import { useEffect, useRef, useState } from 'preact/hooks';
import { LIMITS } from '@ask-paul/protocol/lite';
import { Arrow, Close, Doc, Stop } from './icons.js';

/** Pasted text this long is almost certainly a job description, not a question. */
const JD_THRESHOLD = 400;
const JD_MIN = 40;

export function Composer(props: {
  busy: boolean;
  disabled?: boolean;
  placeholder: string;
  autoFocus?: boolean;
  startInJdMode?: boolean;
  onSend: (question: string, jobDescription?: string) => void;
  onStop: () => void;
}) {
  const [mode, setMode] = useState<'question' | 'jd'>(props.startInJdMode ? 'jd' : 'question');
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const isJd = mode === 'jd';

  useEffect(() => {
    if (props.autoFocus || props.startInJdMode) ref.current?.focus({ preventScroll: true });
  }, [props.autoFocus, props.startInJdMode]);

  // Grow with the text: up to five lines for a question, more for a job description.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const max = isJd ? 180 : 132;
    el.style.height = 'auto';
    // scrollHeight excludes borders; the textarea is border-box, so add them back or it
    // ends up a couple of pixels short and shows a scrollbar. Only scroll once capped.
    const needed = el.scrollHeight + el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(needed, max)}px`;
    el.style.overflowY = needed > max ? 'auto' : 'hidden';
  }, [text, isJd]);

  const submit = () => {
    if (props.busy || props.disabled) return;
    const value = text.trim();
    if (isJd) {
      if (value.length < JD_MIN) return;
      props.onSend('Tailor his résumé to this job description.', value.slice(0, LIMITS.jobDescriptionChars));
      setMode('question');
    } else {
      if (!value) return;
      props.onSend(value.slice(0, LIMITS.questionChars));
    }
    setText('');
  };

  const onPaste = (e: ClipboardEvent) => {
    const pasted = e.clipboardData?.getData('text') ?? '';
    if (!isJd && pasted.length >= JD_THRESHOLD) {
      e.preventDefault();
      setMode('jd');
      setText(pasted.slice(0, LIMITS.jobDescriptionChars));
    }
  };

  const tooShort = isJd && text.trim().length < JD_MIN;

  return (
    <form
      class="ap-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {isJd && (
        <div class="ap-jd">
          <span class="ap-user__file-icon">
            <Doc size={16} />
          </span>
          <span class="ap-jd__text">
            <strong>Job description</strong>
            <span>{text ? `${text.length.toLocaleString()} characters${tooShort ? '' : ' · ready to send'}` : 'Paste it below; it is treated as data, never as instructions'}</span>
          </span>
          <button
            type="button"
            class="ap-icon-btn ap-icon-btn--sm"
            aria-label="Back to a normal question"
            onClick={() => {
              setMode('question');
              setText('');
            }}
          >
            <Close />
          </button>
        </div>
      )}
      <div class="ap-composer__row">
        <label class="ap-composer__field">
          <span class="ap-sr">{isJd ? 'Job description' : 'Ask a question'}</span>
          <textarea
            ref={ref}
            rows={1}
            value={text}
            maxLength={isJd ? LIMITS.jobDescriptionChars : LIMITS.questionChars}
            placeholder={isJd ? 'Paste the job description here' : props.placeholder}
            disabled={props.disabled}
            onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isJd) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </label>
        {props.busy ? (
          <button type="button" class="ap-send ap-send--stop" aria-label="Stop answering" onClick={props.onStop}>
            <Stop />
          </button>
        ) : (
          <button type="submit" class="ap-send" aria-label={isJd ? 'Tailor résumé' : 'Send'} disabled={props.disabled || tooShort}>
            <Arrow />
          </button>
        )}
      </div>
      {!isJd && !props.busy && !props.disabled && (
        <button type="button" class="ap-link-btn" onClick={() => setMode('jd')}>
          <Doc size={13} /> Paste a job description
        </button>
      )}
    </form>
  );
}
