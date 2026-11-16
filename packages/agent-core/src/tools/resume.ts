/**
 * Tailored résumé, built deterministically from the knowledge base.
 *
 * No model writes résumé lines: requirements are matched against a skills
 * vocabulary, and only existing knowledge-base bullets are selected and
 * ordered. That makes "every line is sourced" a guarantee instead of a hope,
 * and makes the tool free, instant and testable.
 */
import type { ResumeCard } from '@ask-paul/protocol';
import type { BotConfig } from '../config.js';
import type { KbBundle, KbSection } from '../kb.js';
import { tokenize } from '../search.js';

/** Common requirement terms. The knowledge base's own skills list is added to this at run time. */
const BASE_VOCAB = [
  'TypeScript', 'JavaScript', 'Python', 'Go', 'Golang', 'Java', 'Kotlin', 'Swift', 'Dart', 'C#', '.NET', 'Rust', 'Ruby', 'PHP', 'SQL',
  'React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Flutter', 'React Native', 'HTML', 'CSS',
  'Node.js', 'Express', 'NestJS', 'FastAPI', 'Django', 'Flask', 'Spring', 'Rails', 'Laravel', 'Gin',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'BigQuery', 'Elasticsearch', 'DynamoDB',
  'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Terraform', 'GitHub Actions', 'CI/CD',
  'RabbitMQ', 'Kafka', 'microservices', 'event-driven', 'REST', 'GraphQL', 'gRPC', 'OAuth', 'WebSockets', 'Socket.IO',
  'TDD', 'unit testing', 'integration testing', 'Pytest', 'Jest', 'OpenTelemetry', 'Grafana', 'CloudWatch', 'observability',
  'LLM', 'RAG', 'generative AI', 'machine learning', 'fintech', 'payments', 'payroll', 'telecom',
  'code review', 'mentoring', 'leadership', 'Agile', 'Scrum', 'accessibility', 'system design', 'documentation',
];

const ALIASES: Record<string, string[]> = {
  Go: ['golang'],
  'Node.js': ['node', 'nodejs'],
  'CI/CD': ['ci/cd', 'continuous integration', 'continuous delivery', 'continuous deployment'],
  microservices: ['microservice', 'micro-services', 'service-oriented'],
  PostgreSQL: ['postgres'],
  Kubernetes: ['k8s'],
  'generative AI': ['genai', 'gen ai', 'ai-enabled', 'ai enabled'],
  LLM: ['large language model', 'llms'],
  'unit testing': ['unit tests', 'automated testing', 'automated tests', 'test coverage'],
};

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function termRegex(term: string): RegExp {
  const forms = [term, ...(ALIASES[term] ?? [])].map(escapeRe);
  return new RegExp(`(^|[^a-z0-9+#])(${forms.join('|')})(?![a-z0-9+#])`, 'i');
}

function vocabulary(kb: KbBundle): string[] {
  const fromSkills = kb.sections
    .filter((s) => s.kind === 'skills')
    .flatMap((s) => s.body.split(/[\n,]/))
    .map((t) => t.replace(/^[-*]\s+/, '').replace(/^[^:]+:\s*/, '').replace(/\(.*?\)/g, '').trim())
    .filter((t) => t.length > 1 && t.length < 30 && !t.startsWith('[TODO'));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...BASE_VOCAB, ...fromSkills]) {
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  // "Golang" and "Go" are one requirement.
  return out.filter((t) => t !== 'Golang');
}

interface Bullet {
  text: string;
  section: KbSection;
  score: number;
}

export function tailorResume(jobDescription: string, kb: KbBundle, config: BotConfig): ResumeCard {
  const jd = jobDescription.slice(0, 8000);
  const corpus = kb.sections.filter((s) => s.kind !== 'offlimits' && s.kind !== 'faq');
  const kbText = corpus.map((s) => `${s.title}\n${s.body}`).join('\n');

  const requirements = vocabulary(kb).filter((t) => termRegex(t).test(jd)).slice(0, 14);
  const matched = requirements.filter((t) => termRegex(t).test(kbText));
  const notCovered = requirements.filter((t) => !matched.includes(t));
  const jdTokens = new Set(tokenize(jd));

  const bullets: Bullet[] = corpus
    // Accomplishment sections only: stack lists and company blurbs aren't résumé bullets.
    .filter((s) => (s.kind === 'experience' || s.kind === 'project') && !/^(stack|about the company|about)$/i.test(s.heading))
    .flatMap((section) =>
      section.body
        .split('\n')
        .filter((l) => /^[-*]\s+/.test(l))
        .map((l) => l.replace(/^[-*]\s+/, '').trim())
        .filter((l) => l.length > 15 && !l.includes('[TODO'))
        .map((text) => {
          const termHits = matched.filter((t) => termRegex(t).test(text)).length;
          const overlap = tokenize(text).filter((t) => jdTokens.has(t)).length;
          return { text, section, score: termHits * 3 + overlap };
        }),
    );

  const lines: string[] = [];
  const sourceIds = new Set<string>();
  const profile = kb.sections.find((s) => s.kind === 'profile' && /headline|summary|overview/i.test(s.heading));
  lines.push(`# ${config.owner.name}`);
  if (profile) {
    const headline = profile.body.split('\n').map((l) => l.replace(/^[-*]\s+/, '').trim()).find((l) => l && !l.includes('[TODO'));
    if (headline) {
      lines.push(headline);
      sourceIds.add(profile.id);
    }
  }
  lines.push('', '## Relevant experience');

  const leadsWith: string[] = [];
  const roleFiles = [...new Set(bullets.filter((b) => b.section.kind === 'experience').map((b) => b.section.fileId))];
  const roleOrder = roleFiles
    .map((fileId) => ({ fileId, best: Math.max(...bullets.filter((b) => b.section.fileId === fileId).map((b) => b.score)) }))
    .sort((a, b) => {
      const da = kb.meta[a.fileId]?.start ?? '';
      const db = kb.meta[b.fileId]?.start ?? '';
      return db.localeCompare(da) || b.best - a.best; // newest first
    });

  for (const { fileId } of roleOrder) {
    const meta = kb.meta[fileId] ?? {};
    const picks = bullets
      .filter((b) => b.section.fileId === fileId)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .filter((b, i) => i === 0 || b.score > 0);
    if (!picks.length) continue;
    const header = [meta.role, meta.company].filter(Boolean).join(', ') || fileId;
    lines.push('', `**${header}**${meta.dates ? ` · ${meta.dates}` : ''}`);
    for (const p of picks) {
      lines.push(`- ${p.text}`);
      sourceIds.add(p.section.id);
    }
    const top = picks[0];
    if (top && top.score > 0 && leadsWith.length < 3) leadsWith.push(`${meta.company ?? header}: ${shorten(top.text)}`);
  }

  const projectPicks = bullets
    .filter((b) => b.section.kind === 'project' && b.score > 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  if (projectPicks.length) {
    lines.push('', '## Selected projects');
    for (const p of projectPicks) {
      lines.push(`- **${kb.meta[p.section.fileId]?.name ?? p.section.title.split(' · ')[0]}**: ${p.text}`);
      sourceIds.add(p.section.id);
    }
  }

  if (matched.length) lines.push('', '## Skills for this role', matched.join(' · '));
  const skills = kb.sections.find((s) => s.kind === 'skills');
  if (skills && matched.length) sourceIds.add(skills.id);

  return {
    kind: 'resume',
    title: 'Tailored résumé',
    matched: matched.length,
    total: requirements.length,
    leadsWith,
    notCovered,
    markdown: lines.join('\n'),
    sourceIds: [...sourceIds],
  };
}

function shorten(text: string, max = 70) {
  return text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}
