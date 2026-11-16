import type { Card, StreamEvent } from '@ask-paul/protocol';
import type { BotConfig } from '../config.js';
import type { KbBundle, KbSection } from '../kb.js';
import type { SectionIndex } from '../search.js';
import type { ToolDef } from '../providers/types.js';
import { tailorResume } from './resume.js';

export interface ToolContext {
  kb: KbBundle;
  index: SectionIndex;
  config: BotConfig;
  /** Sections the agent has read this turn; citations are only accepted for these + the prompt's KB. */
  retrieved: Map<string, KbSection>;
  /** The visitor's pasted job description, passed separately from the model's tool input. */
  jobDescription?: string;
}

export interface ToolOutcome {
  /** What the model sees. */
  content: string;
  isError?: boolean;
  /** Cards to show the visitor. */
  cards?: Card[];
  /** Short line under the step, e.g. "3 matches across 2 sources". */
  detail: string;
}

export interface Tool {
  def: ToolDef;
  /** Label of the step shown while this tool runs. */
  stepLabel: string;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> | ToolOutcome;
}

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');

export const searchWork: Tool = {
  stepLabel: 'Searched work history',
  def: {
    name: 'search_work',
    description:
      "Search the owner's résumé, case studies, projects, skills and FAQ. Returns matching sections with their ids. Call this before answering any factual question, and cite the ids you use.",
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What to look for, in a few words.' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  run(input, ctx) {
    const query = str(input.query, 200);
    const hits = ctx.index.search(query, 4);
    if (!hits.length) return { content: 'NO_RESULTS: nothing in the knowledge base matches. Do not answer from memory.', detail: 'No matches' };
    for (const h of hits) ctx.retrieved.set(h.section.id, h.section);
    const files = new Set(hits.map((h) => h.section.fileId));
    return {
      content: hits.map((h) => `<result id="${h.section.id}" title="${h.section.title.replace(/"/g, "'")}">\n${h.section.body}\n</result>`).join('\n'),
      detail: `${hits.length} ${hits.length === 1 ? 'match' : 'matches'} across ${files.size} ${files.size === 1 ? 'source' : 'sources'}`,
    };
  },
};

export const showProject: Tool = {
  stepLabel: 'Opened project card',
  def: {
    name: 'show_project',
    description: 'Show a project as a card with its links. Use when the visitor asks to see, try or play a project.',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'Project id, e.g. "framex".' } },
      required: ['project_id'],
      additionalProperties: false,
    },
  },
  run(input, ctx) {
    const wanted = str(input.project_id, 80).toLowerCase();
    const p = ctx.kb.projects.find((x) => x.id === wanted || x.name.toLowerCase() === wanted);
    if (!p) {
      return {
        content: `Unknown project "${wanted}". Known ids: ${ctx.kb.projects.map((x) => x.id).join(', ')}`,
        isError: true,
        detail: 'Project not found',
      };
    }
    const overview = ctx.kb.sections.find((s) => s.fileId === `projects/${p.id}`);
    if (overview) ctx.retrieved.set(overview.id, overview);
    const card: Card = {
      kind: 'project',
      id: p.id,
      name: p.name,
      status: p.status,
      summary: p.summary,
      stack: p.stack,
      ...(p.liveUrl ? { liveUrl: p.liveUrl } : {}),
      ...(p.liveLabel ? { liveLabel: p.liveLabel } : {}),
      ...(p.codeUrl ? { codeUrl: p.codeUrl } : {}),
      ...(p.image ? { image: p.image } : {}),
    };
    return {
      content: `CARD_SHOWN: project card for ${p.name} is now visible to the visitor.${overview ? ` Its overview section id is ${overview.id}.` : ''}\nNOTE: Here's ${p.name}. ${p.summary}`,
      cards: [card],
      detail: p.name,
    };
  },
};

export const tailorResumeTool: Tool = {
  stepLabel: 'Drafted a one-page résumé',
  def: {
    name: 'tailor_resume',
    description:
      'Build a one-page résumé for a job description. Every line comes from the knowledge base. Use when the visitor pastes a job description or asks for a tailored résumé.',
    inputSchema: {
      type: 'object',
      properties: { job_description: { type: 'string', description: 'The job description text, or a short summary of the role.' } },
      required: ['job_description'],
      additionalProperties: false,
    },
  },
  run(input, ctx) {
    const jd = ctx.jobDescription || str(input.job_description, 8000);
    if (jd.trim().length < 40) {
      return { content: 'NEED_JOB_DESCRIPTION: ask the visitor to paste the job description.', detail: 'Waiting for a job description' };
    }
    const card = tailorResume(jd, ctx.kb, ctx.config);
    for (const id of card.sourceIds) {
      const s = ctx.kb.sections.find((x) => x.id === id);
      if (s) ctx.retrieved.set(id, s);
    }
    return {
      content: `CARD_SHOWN: tailored résumé card is visible.\nMatched ${card.matched} of ${card.total} requirements. Leads with: ${card.leadsWith.join('; ')}. Not covered: ${card.notCovered.join(', ') || 'none'}.\nNOTE: Here's a one-page version for this role, built only from Paul's material. It matches ${card.matched} of ${card.total} requirements I could identify.`,
      cards: [card],
      detail: `${card.matched} of ${card.total} requirements matched`,
    };
  },
};

export const bookCall: Tool = {
  stepLabel: 'Found a booking link',
  def: {
    name: 'book_call',
    description: "Share the owner's booking link for a short call.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  run(_input, ctx) {
    const url = ctx.config.owner.bookingUrl;
    if (!url) return { content: 'NO_BOOKING_LINK: offer contact_paul instead.', detail: 'No booking link set' };
    return {
      content: `CARD_SHOWN: booking card is visible.\nNOTE: You can book a call with ${ctx.config.owner.name} here.`,
      cards: [{ kind: 'booking', url, label: `Book a call with ${ctx.config.owner.name.split(' ')[0]}`, durationMinutes: 20 }],
      detail: 'Booking card',
    };
  },
};

export const contactPaul: Tool = {
  stepLabel: 'Prepared a message',
  def: {
    name: 'contact_paul',
    description:
      'Hand the visitor off to the owner with a prefilled email. Use for off-limits topics, anything not in the knowledge base, or when the visitor wants to get in touch.',
    inputSchema: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'What the visitor wants to discuss, in a few words.' } },
      required: ['reason'],
      additionalProperties: false,
    },
  },
  run(input, ctx) {
    // Never let tagged context (page context, pasted job descriptions) leak into an email draft.
    const reason =
      str(input.reason, 300)
        .replace(/<(\w+)[^>]*>[\s\S]*?<\/\1>/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[?.!\s]+$/, '')
        .trim()
        .slice(0, 120) || 'a role';
    const first = ctx.config.owner.name.split(' ')[0];
    const card: Card = {
      kind: 'contact',
      email: ctx.config.owner.email,
      subject: `Question about ${reason}`.slice(0, 90),
      draft: `Hi ${first}, I came across your portfolio and would like to talk about ${reason}. [Your name, company]`,
      ...(ctx.config.owner.bookingUrl ? { bookingUrl: ctx.config.owner.bookingUrl } : {}),
    };
    return {
      content: `CARD_SHOWN: contact card with a prefilled email is visible.\nNOTE: That isn't in ${first}'s material, so I won't guess. It's a question ${ctx.config.owner.pronoun.subject}'s happy to answer directly.`,
      cards: [card],
      detail: 'Contact card',
    };
  },
};

export const ALL_TOOLS: Record<keyof BotConfig['tools'], Tool> = {
  search_work: searchWork,
  show_project: showProject,
  tailor_resume: tailorResumeTool,
  book_call: bookCall,
  contact_paul: contactPaul,
};

export function enabledTools(config: BotConfig): Tool[] {
  return (Object.keys(ALL_TOOLS) as (keyof BotConfig['tools'])[]).filter((k) => config.tools[k]).map((k) => ALL_TOOLS[k]);
}

export type { StreamEvent };
