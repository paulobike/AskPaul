/**
 * Ask Paul — bot settings.
 *
 * To clone this project for another bot, replace kb/ and edit this file.
 * Swapping models = changing `model` / `fallback` (then run `npm run eval`).
 */
import { defineBot } from '@ask-paul/agent-core';

export default defineBot({
  name: 'Ask Paul',
  owner: {
    name: 'Paul Obike',
    pronoun: { subject: 'he', object: 'him', possessive: 'his' },
    email: 'paulobike98@gmail.com',
    // bookingUrl: 'https://cal.com/your-handle/20min',   // [TODO] enables the book_call tool's card
    portfolioUrl: undefined,
  },
  persona: 'You are warm, direct and precise, like a well-prepared colleague who knows his work.',

  model: { provider: 'anthropic', id: 'claude-haiku-5-5' },
  fallback: { provider: 'openai', id: 'gpt-6-luna' },

  // USD per million tokens (prompts under 100K tokens). Used for cost logging only.
  prices: {
    'claude-haiku-5-5': { input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5 },
    'gpt-6-luna': { input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5 },
    mock: { input: 0, cachedInput: 0, output: 0 },
  },

  tools: {
    search_work: true,
    show_project: true,
    tailor_resume: true,
    book_call: true,
    contact_paul: true,
  },

  limits: {
    questionsPerDay: 20,
    maxOutputTokens: 700,
    maxModelTurns: 4,
  },

  // Exact origins of the sites that embed the widget. Add your real domains before deploying.
  allowedOrigins: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173', 'http://localhost:4174'],

  starters: [
    'What did Paul build at Vennote?',
    'Is he more frontend or backend?',
    'Show me his side projects',
    'Tailor his résumé to my job',
  ],

  savedAnswers: [
    {
      question: 'What did Paul build at Vennote?',
      answer:
        "Backend services for MTN's Zigi digital assistant, integrated with MTN's MADAPI platform, plus an internal AI playground for knowledge-base curation and response testing that made the team's workflow about 40% more efficient.",
    },
    {
      question: 'Is he more frontend or backend?',
      answer:
        'Both. Recent roles lean backend (Python, TypeScript, Go, RabbitMQ, Kubernetes), and he has shipped React and Vue frontends and Flutter apps.',
    },
  ],
});
