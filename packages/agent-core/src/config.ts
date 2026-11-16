/**
 * Everything that makes this bot *this* bot. Cloning the project for another
 * person or company means a new kb/ folder and a new bot.config.ts.
 */

export type ProviderName = 'anthropic' | 'openai' | 'mock';

export interface ModelChoice {
  provider: ProviderName;
  id: string;
  /** Optional wording added to the system prompt for this model only. */
  promptAddendum?: string;
}

export interface SavedAnswer {
  question: string;
  answer: string;
}

export interface BotConfig {
  /** Shown in the widget header, e.g. "Ask Paul". */
  name: string;
  /** Whose work the bot answers about. */
  owner: {
    name: string;
    /** He / she / they — used in the third-person voice. */
    pronoun: { subject: string; object: string; possessive: string };
    email: string;
    bookingUrl?: string;
    portfolioUrl?: string;
  };
  /** One or two sentences that set the tone. */
  persona: string;
  model: ModelChoice;
  fallback?: ModelChoice;
  /** USD per million tokens, for cost logging. Unknown models log zero cost. */
  prices: Record<string, { input: number; cachedInput: number; cacheWrite?: number; output: number }>;
  tools: {
    search_work: boolean;
    show_project: boolean;
    tailor_resume: boolean;
    book_call: boolean;
    contact_paul: boolean;
  };
  limits: {
    questionsPerDay: number;
    maxOutputTokens: number;
    maxModelTurns: number;
  };
  /** Exact origins allowed to call the API. "*" allows any (development only). */
  allowedOrigins: string[];
  /** Starter questions shown on first open. */
  starters: string[];
  /** Answers shown when the API can't be reached. Write them from the knowledge base. */
  savedAnswers: SavedAnswer[];
}

export function defineBot(config: BotConfig): BotConfig {
  return config;
}
