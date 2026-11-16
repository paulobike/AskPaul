/**
 * Public bot settings baked in at build time by `npm run kb:build`
 * (generated/widget.json). Baked in, rather than fetched, so the saved
 * answers still work when the API can't be reached.
 */
import raw from '../../../../generated/widget.json';

export interface WidgetProject {
  id: string;
  name: string;
  status: string;
  summary: string;
  stack: string[];
  liveUrl?: string;
  liveLabel?: string;
  codeUrl?: string;
}

export interface WidgetSettings {
  name: string;
  ownerName: string;
  ownerEmail: string;
  starters: string[];
  savedAnswers: { question: string; answer: string }[];
  dailyLimit: number;
  projects: WidgetProject[];
}

export const settings = raw as WidgetSettings;
export const ownerFirstName = settings.ownerName.split(' ')[0] ?? settings.ownerName;
