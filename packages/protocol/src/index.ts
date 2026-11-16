/**
 * The contract between the widget and the API.
 *
 * Everything that crosses the network is defined here once and validated with
 * Zod on both sides. Change a shape here and every consumer fails to compile.
 */
import { z } from 'zod';
import { createSseParser as createLiteParser, LIMITS } from './lite.js';

export { LIMITS, encodeSse, looksLikeEvent } from './lite.js';

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

export const ChatTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(LIMITS.historyTurnChars),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

export const ChatRequestSchema = z.object({
  /** The visitor's question. */
  question: z.string().trim().min(1).max(LIMITS.questionChars),
  /** Earlier turns, oldest first. Trimmed to the last N by the server. */
  history: z.array(ChatTurnSchema).max(40).default([]),
  /** A pasted job description, kept apart from the question so it is always treated as data. */
  jobDescription: z.string().max(LIMITS.jobDescriptionChars).optional(),
  /** Where the visitor is, e.g. "experience/vennote" when reading that case study. */
  pageContext: z.string().max(LIMITS.pageContextChars).optional(),
  /** Client-generated id that groups turns of one conversation in the logs. */
  conversationId: z.string().max(64).optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatRequestInput = z.input<typeof ChatRequestSchema>;

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

export const ProjectCardSchema = z.object({
  kind: z.literal('project'),
  id: z.string(),
  name: z.string(),
  status: z.string(),
  summary: z.string(),
  stack: z.array(z.string()),
  liveUrl: z.string().optional(),
  liveLabel: z.string().optional(),
  codeUrl: z.string().optional(),
  image: z.string().optional(),
});

export const ResumeCardSchema = z.object({
  kind: z.literal('resume'),
  title: z.string(),
  matched: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  leadsWith: z.array(z.string()),
  notCovered: z.array(z.string()),
  /** The one-page résumé as Markdown. Every line comes from the knowledge base. */
  markdown: z.string(),
  sourceIds: z.array(z.string()),
});

export const ContactCardSchema = z.object({
  kind: z.literal('contact'),
  email: z.string(),
  subject: z.string(),
  draft: z.string(),
  bookingUrl: z.string().optional(),
});

export const BookingCardSchema = z.object({
  kind: z.literal('booking'),
  url: z.string(),
  label: z.string(),
  durationMinutes: z.number().int().positive().optional(),
});

export const CardSchema = z.discriminatedUnion('kind', [
  ProjectCardSchema,
  ResumeCardSchema,
  ContactCardSchema,
  BookingCardSchema,
]);
export type Card = z.infer<typeof CardSchema>;
export type ProjectCard = z.infer<typeof ProjectCardSchema>;
export type ResumeCard = z.infer<typeof ResumeCardSchema>;
export type ContactCard = z.infer<typeof ContactCardSchema>;
export type BookingCard = z.infer<typeof BookingCardSchema>;

/* ------------------------------------------------------------------ */
/* Stream events                                                       */
/* ------------------------------------------------------------------ */

export const SourceSchema = z.object({
  /** 1-based citation number, matching the [n] markers in the answer text. */
  n: z.number().int().positive(),
  id: z.string(),
  title: z.string(),
  quote: z.string(),
  url: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const ErrorCodeSchema = z.enum([
  'rate_limited',
  'overloaded',
  'bad_request',
  'forbidden_origin',
  'offline',
  'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const StreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('meta'),
    conversationId: z.string(),
    model: z.string(),
    remainingToday: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('step'),
    id: z.string(),
    label: z.string(),
    status: z.enum(['running', 'done', 'error']),
    detail: z.string().optional(),
  }),
  z.object({ type: z.literal('text'), delta: z.string() }),
  z.object({ type: z.literal('card'), card: CardSchema }),
  z.object({ type: z.literal('sources'), sources: z.array(SourceSchema) }),
  z.object({ type: z.literal('followups'), questions: z.array(z.string()).max(2) }),
  z.object({
    type: z.literal('error'),
    code: ErrorCodeSchema,
    message: z.string(),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
  }),
  z.object({ type: z.literal('done'), usage: UsageSchema.optional() }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;
export type StreamEventOf<T extends StreamEvent['type']> = Extract<StreamEvent, { type: T }>;

/* ------------------------------------------------------------------ */
/* SSE parsing with full schema validation (server side, tests, evals)  */
/* ------------------------------------------------------------------ */

export function createSseParser() {
  return createLiteParser((x) => {
    const parsed = StreamEventSchema.safeParse(x);
    return parsed.success ? parsed.data : null;
  });
}
