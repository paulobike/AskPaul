import type { Message, ModelEvent, ModelProvider, ModelRequest } from './types.js';

/**
 * A deterministic stand-in model for local development, demos and tests: no
 * API key, no network, no cost. It follows the same tool protocol as a real
 * model (decide → call a tool → answer from the result with citations), so
 * the widget, the API and the eval runner can all be exercised end to end.
 * Its answers are simple extracts, not real reasoning.
 */
export class MockProvider implements ModelProvider {
  readonly label = 'mock:scripted';
  readonly modelId = 'mock';

  constructor(private readonly opts: { delayMs?: number; offlimits?: RegExp } = {}) {}

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    const last = req.messages.at(-1);
    const toolResults = last?.parts.filter((p) => p.type === 'tool_result') ?? [];
    const delay = this.opts.delayMs ?? 0;

    if (!toolResults.length) {
      const question = lastUserText(req.messages);
      const call = this.chooseTool(question, req);
      if (call) {
        yield { type: 'tool_call', id: `call_${Math.abs(hash(question)) % 1e8}`, name: call.name, input: call.input };
        yield usage(question.length);
        yield { type: 'done', stopReason: 'tool_use' };
        return;
      }
    }

    const answer = composeAnswer(toolResults.map((p) => (p.type === 'tool_result' ? p.content : '')).join('\n'));
    // Stream word by word, keeping the whitespace (including newlines) between words.
    for (const piece of answer.match(/\S+\s*|\s+/g) ?? [answer]) {
      if (req.signal?.aborted) break;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      yield { type: 'text', delta: piece };
    }
    yield usage(answer.length);
    yield { type: 'done', stopReason: 'end' };
  }

  private chooseTool(question: string, req: ModelRequest): { name: string; input: unknown } | null {
    const q = question.toLowerCase();
    const has = (name: string) => req.tools.some((t) => t.name === name);
    const offlimits = this.opts.offlimits ?? /salary|compensation|pay range|expected pay|how much (does|would) he (make|earn|charge)|religio|politic|married|age\b|address/;
    if (offlimits.test(q) && has('contact_paul')) {
      const topic = /salary|compensation|pay|charge|earn/.test(q) ? 'compensation' : 'a personal question';
      return { name: 'contact_paul', input: { reason: topic } };
    }
    if (/<job_description>|tailor|job description|my (role|job)\b/.test(q) && has('tailor_resume')) {
      const jd = /<job_description>([\s\S]*?)<\/job_description>/.exec(question)?.[1] ?? question;
      return { name: 'tailor_resume', input: { job_description: jd.trim() } };
    }
    if (/\b(book|schedule|call|meeting|meet)\b/.test(q) && has('book_call')) return { name: 'book_call', input: {} };
    if (/get in touch|contact (him|paul)|reach (him|paul)|email (him|paul)/.test(q) && has('contact_paul')) return { name: 'contact_paul', input: { reason: 'a role' } };
    const project = /\b(whot|last ?card|framex|ask paul)\b/.exec(q)?.[1];
    if (project && /\bshow\b|\bcard\b|\bplay\b|\bdemo\b/.test(q) && has('show_project')) {
      return { name: 'show_project', input: { project_id: project === 'ask paul' ? 'ask-paul' : project === 'framex' ? 'framex' : 'last-card' } };
    }
    if (has('search_work')) return { name: 'search_work', input: { query: question.replace(/<[^>]+>/g, ' ').slice(0, 200) } };
    return null;
  }
}

function lastUserText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== 'user') continue;
    const text = m.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n');
    if (text) return text;
  }
  return '';
}

/** Builds an answer from search results: one supporting line per source, each cited. */
function composeAnswer(toolText: string): string {
  if (/^NO_RESULTS/m.test(toolText) || !toolText.trim()) {
    return "That isn't in Paul's material, so I won't guess. He's happy to answer it directly.\n<<followups>>\n- What has Paul built recently?\n- Is he more frontend or backend?";
  }
  if (/^CARD_SHOWN/m.test(toolText)) {
    const note = /^NOTE: (.+)$/m.exec(toolText)?.[1] ?? 'Here it is.';
    return `${note}\n<<followups>>\n- What else has Paul built?\n- How does he approach testing?`;
  }
  const results = [...toolText.matchAll(/<result id="([^"]+)" title="([^"]*)">\n?([\s\S]*?)<\/result>/g)].slice(0, 3);
  if (!results.length) return 'Done.';
  const lines = results.map(([, id, title, body]) => {
    const fact = (body ?? '')
      .split('\n')
      .map((l) => l.replace(/^[-*]\s+/, '').trim())
      .find((l) => l.length > 20 && !l.startsWith('[TODO'));
    return `${fact ? ensurePeriod(fact) : `See ${title}.`} [[${id}]]`;
  });
  return `From Paul's material:\n\n${lines.map((l) => `- ${l}`).join('\n')}\n<<followups>>\n- What was the hardest part of that work?\n- What has he built on his own?`;
}

const ensurePeriod = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

function usage(chars: number): ModelEvent {
  return { type: 'usage', usage: { inputTokens: 200, cachedInputTokens: 4000, cacheWriteTokens: 0, outputTokens: Math.ceil(chars / 4) } };
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
