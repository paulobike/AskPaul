/**
 * Knowledge base: Markdown files → citable sections.
 *
 * Each file may start with simple front matter (`key: value` lines between
 * `---` fences). Every `## Heading` starts a section whose id is
 * `<file-id>#<heading-slug>`, e.g. `experience/vennote#results`. Ids are the
 * citation targets, so they must stay stable once published.
 */

export type KbKind = 'profile' | 'experience' | 'project' | 'skills' | 'education' | 'faq' | 'offlimits' | 'other';

export interface KbSection {
  /** Stable citation id, e.g. "experience/vennote#what-he-built". */
  id: string;
  /** File id, e.g. "experience/vennote". */
  fileId: string;
  kind: KbKind;
  /** Display title, e.g. "Vennote Technologies · What he built". */
  title: string;
  heading: string;
  body: string;
  /** Link shown next to the citation (company site, case study, repo...). */
  url?: string;
}

export interface KbProject {
  id: string;
  name: string;
  status: string;
  summary: string;
  stack: string[];
  liveUrl?: string;
  liveLabel?: string;
  codeUrl?: string;
  image?: string;
}

export interface KbBundle {
  generatedAt: string;
  sections: KbSection[];
  projects: KbProject[];
  /** Topics that always hand off to the owner. */
  offlimits: string[];
  /** Unfilled `[TODO]` markers, reported by the build so nothing ships half-written. */
  todos: { fileId: string; line: number; text: string }[];
  /** Front matter of every file, by file id (role, company, dates, links...). */
  meta: Record<string, Record<string, string>>;
}

export interface KbFile {
  /** Path relative to kb/ without extension, e.g. "projects/framex". */
  fileId: string;
  markdown: string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function parseFrontMatter(markdown: string): { meta: Record<string, string>; body: string } {
  const text = markdown.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return { meta: {}, body: text };
  const end = text.indexOf('\n---', 4);
  if (end === -1) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of text.slice(4, end).split('\n')) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim());
    // Unfilled placeholders are reported as todos but never used as values.
    if (m && m[1] && !(m[2] ?? '').trim().startsWith('[TODO')) meta[m[1]] = (m[2] ?? '').trim();
  }
  return { meta, body: text.slice(end + 4).replace(/^\n+/, '') };
}

function kindOf(fileId: string, meta: Record<string, string>): KbKind {
  const explicit = meta.kind as KbKind | undefined;
  if (explicit) return explicit;
  if (fileId.startsWith('experience/')) return 'experience';
  if (fileId.startsWith('projects/')) return 'project';
  const base = fileId.split('/').pop() ?? '';
  if (['profile', 'skills', 'education', 'faq', 'offlimits'].includes(base)) return base as KbKind;
  return 'other';
}

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function parseKbFile(file: KbFile): { sections: KbSection[]; project?: KbProject; offlimits: string[]; todos: KbBundle['todos']; meta: Record<string, string> } {
  const { meta, body } = parseFrontMatter(file.markdown);
  const kind = kindOf(file.fileId, meta);
  const docTitle = meta.title ?? (/^#\s+(.+)$/m.exec(body)?.[1] ?? file.fileId).trim();
  const url = meta.url || undefined;

  const todos: KbBundle['todos'] = [];
  file.markdown.split('\n').forEach((line, i) => {
    if (line.includes('[TODO')) todos.push({ fileId: file.fileId, line: i + 1, text: line.trim() });
  });

  const sections: KbSection[] = [];
  const seen = new Set<string>();
  let heading: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    // Placeholder lines never reach the prompt or citations.
    const text = buf.filter((l) => !l.includes('[TODO')).join('\n').trim();
    if (heading !== null && text) {
      let slug = slugify(heading) || 'section';
      while (seen.has(slug)) slug += '-2';
      seen.add(slug);
      sections.push({
        id: `${file.fileId}#${slug}`,
        fileId: file.fileId,
        kind,
        title: `${docTitle} · ${heading}`,
        heading,
        body: text,
        ...(url ? { url } : {}),
      });
    }
    buf = [];
  };
  for (const line of body.split('\n')) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      flush();
      heading = h2[1] ?? '';
      continue;
    }
    if (/^#\s+/.test(line)) continue; // document title
    if (heading === null) {
      // Text before the first ## becomes an "Overview" section.
      if (line.trim()) heading = 'Overview';
      else continue;
    }
    buf.push(line);
  }
  flush();

  let project: KbProject | undefined;
  if (kind === 'project') {
    const overview = sections.find((s) => s.fileId === file.fileId)?.body ?? '';
    project = {
      id: file.fileId.replace(/^projects\//, ''),
      name: meta.name ?? docTitle,
      status: meta.status ?? 'In progress',
      summary: meta.summary ?? firstSentence(overview),
      stack: list(meta.stack),
      ...(meta.live ? { liveUrl: meta.live } : {}),
      ...(meta.liveLabel ? { liveLabel: meta.liveLabel } : {}),
      ...(meta.code ? { codeUrl: meta.code } : {}),
      ...(meta.image ? { image: meta.image } : {}),
    };
  }

  const offlimits =
    kind === 'offlimits'
      ? sections.flatMap((s) =>
          s.body
            .split('\n')
            .map((l) => l.replace(/^[-*]\s+/, '').trim())
            .filter((l) => l && !l.startsWith('[TODO')),
        )
      : [];

  return { sections, ...(project ? { project } : {}), offlimits, todos, meta };
}

function firstSentence(text: string): string {
  const clean = text.replace(/^[-*]\s+/gm, '').replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(clean);
  return (m?.[1] ?? clean).slice(0, 200);
}

export function buildKb(files: KbFile[], now = new Date()): KbBundle {
  const bundle: KbBundle = { generatedAt: now.toISOString(), sections: [], projects: [], offlimits: [], todos: [], meta: {} };
  for (const file of [...files].sort((a, b) => a.fileId.localeCompare(b.fileId))) {
    const parsed = parseKbFile(file);
    bundle.sections.push(...parsed.sections);
    if (parsed.project) bundle.projects.push(parsed.project);
    bundle.offlimits.push(...parsed.offlimits);
    bundle.todos.push(...parsed.todos);
    bundle.meta[file.fileId] = parsed.meta;
  }
  const ids = new Set<string>();
  for (const s of bundle.sections) {
    if (ids.has(s.id)) throw new Error(`Duplicate knowledge-base section id: ${s.id}`);
    ids.add(s.id);
  }
  return bundle;
}

/** The knowledge base as one block of text for the system prompt (cached). */
export function renderKbForPrompt(kb: KbBundle): string {
  return kb.sections
    .filter((s) => s.kind !== 'offlimits')
    .map((s) => `<section id="${s.id}" title="${s.title.replace(/"/g, "'")}"${s.url ? ` url="${s.url}"` : ''}>\n${s.body}\n</section>`)
    .join('\n\n');
}
