import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Card, ErrorCode, Source, StreamEvent } from '@ask-paul/protocol';
import { streamChat } from './api.js';

export interface Step {
  id: string;
  label: string;
  status: 'running' | 'done' | 'error';
  detail?: string;
}

export interface UserMessage {
  id: string;
  role: 'user';
  text: string;
  jobDescription?: { chars: number; preview: string };
}

export interface AssistantMessage {
  id: string;
  role: 'assistant';
  status: 'working' | 'streaming' | 'done' | 'error' | 'stopped';
  steps: Step[];
  text: string;
  cards: Card[];
  sources: Source[];
  followups: string[];
  error?: { code: ErrorCode; message: string; retryAfterSeconds?: number };
  /** Answer came from the saved (offline) set rather than the live agent. */
  saved?: boolean;
}

export type ChatMessage = UserMessage | AssistantMessage;

const STORAGE_KEY = 'ask-paul:conversation:v1';
const uid = () => Math.random().toString(36).slice(2, 10);

function load(): { id: string; messages: ChatMessage[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { id: string; messages: ChatMessage[]; savedAt: number };
    // Forget conversations older than a week.
    if (Date.now() - data.savedAt > 7 * 864e5) return null;
    return { id: data.id, messages: data.messages.filter((m) => m.role === 'user' || m.status === 'done' || m.status === 'stopped') };
  } catch {
    return null;
  }
}

function save(id: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, messages: messages.slice(-20), savedAt: Date.now() }));
  } catch {
    /* storage unavailable: the conversation simply isn't remembered */
  }
}

/** Strip citation markers so history sent back to the model stays clean. */
const plain = (text: string) => text.replace(/\[\d+\]/g, '').trim();

export function useChat(opts: { apiUrl: string; pageContext?: string; remember?: boolean }) {
  const restored = useRef(opts.remember === false ? null : load());
  const [conversationId] = useState(() => restored.current?.id ?? `c_${uid()}${uid()}`);
  const [messages, setMessages] = useState<ChatMessage[]>(() => restored.current?.messages ?? []);
  const [remaining, setRemaining] = useState<number | undefined>(undefined);
  const [offline, setOffline] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const busy = messages.some((m) => m.role === 'assistant' && (m.status === 'working' || m.status === 'streaming'));

  useEffect(() => {
    if (!busy && opts.remember !== false) save(conversationId, messages);
  }, [busy, messages, conversationId, opts.remember]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const update = (id: string, fn: (m: AssistantMessage) => AssistantMessage) =>
    setMessages((all) => all.map((m) => (m.id === id && m.role === 'assistant' ? fn(m) : m)));

  const send = useCallback(
    async (question: string, jobDescription?: string) => {
      const q = question.trim();
      if (!q || busy) return;
      const history = messagesRef.current
        .filter((m) => m.role === 'user' || (m.status === 'done' && !m.saved))
        .map((m) => ({ role: m.role, content: plain(m.text).slice(0, 4000) }))
        .filter((t) => t.content)
        .slice(-10);

      const user: UserMessage = {
        id: uid(),
        role: 'user',
        text: q,
        ...(jobDescription ? { jobDescription: { chars: jobDescription.length, preview: jobDescription.slice(0, 80) } } : {}),
      };
      const reply: AssistantMessage = { id: uid(), role: 'assistant', status: 'working', steps: [], text: '', cards: [], sources: [], followups: [] };
      setMessages((all) => [...all, user, reply]);

      const controller = new AbortController();
      abortRef.current = controller;
      await streamChat({
        apiUrl: opts.apiUrl,
        signal: controller.signal,
        body: {
          question: q,
          history,
          conversationId,
          ...(jobDescription ? { jobDescription } : {}),
          ...(opts.pageContext ? { pageContext: opts.pageContext } : {}),
        },
        onEvent: (ev: StreamEvent) => {
          switch (ev.type) {
            case 'meta':
              setOffline(false);
              if (ev.remainingToday !== undefined) setRemaining(ev.remainingToday);
              break;
            case 'step':
              update(reply.id, (m) => {
                const i = m.steps.findIndex((s) => s.id === ev.id);
                const step: Step = { id: ev.id, label: ev.label, status: ev.status, ...(ev.detail ? { detail: ev.detail } : {}) };
                const steps = i === -1 ? [...m.steps, step] : m.steps.map((s, j) => (j === i ? step : s));
                return { ...m, steps };
              });
              break;
            case 'text':
              update(reply.id, (m) => ({ ...m, status: 'streaming', text: m.text + ev.delta }));
              break;
            case 'card':
              update(reply.id, (m) => ({ ...m, cards: [...m.cards, ev.card] }));
              break;
            case 'sources':
              update(reply.id, (m) => ({ ...m, sources: ev.sources }));
              break;
            case 'followups':
              update(reply.id, (m) => ({ ...m, followups: ev.questions }));
              break;
            case 'error':
              if (ev.code === 'offline') setOffline(true);
              if (ev.code === 'rate_limited') setRemaining(0);
              update(reply.id, (m) => ({
                ...m,
                status: 'error',
                error: { code: ev.code, message: ev.message, ...(ev.retryAfterSeconds !== undefined ? { retryAfterSeconds: ev.retryAfterSeconds } : {}) },
              }));
              break;
            case 'done':
              update(reply.id, (m) => (m.status === 'error' ? m : { ...m, status: 'done' }));
              break;
          }
        },
      });
      if (controller.signal.aborted) update(reply.id, (m) => ({ ...m, status: m.text ? 'stopped' : 'error', ...(m.text ? {} : { error: { code: 'internal', message: 'Stopped.' } }) }));
      abortRef.current = null;
    },
    [busy, conversationId, opts.apiUrl, opts.pageContext],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  /** Show a saved answer locally (used when the live agent is offline or the limit is hit). */
  const showSaved = useCallback((question: string, answer: string) => {
    setMessages((all) => [
      ...all,
      { id: uid(), role: 'user', text: question },
      { id: uid(), role: 'assistant', status: 'done', steps: [], text: answer, cards: [], sources: [], followups: [], saved: true },
    ]);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { messages, send, stop, showSaved, reset, busy, remaining, offline };
}
