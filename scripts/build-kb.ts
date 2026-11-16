/**
 * Bundles kb/*.md into generated/kb.bundle.json (loaded by the API on any
 * runtime, including ones without a filesystem) and writes the widget's
 * public settings to generated/widget.json.
 *
 *   npm run kb:build             build, warn about [TODO] markers
 *   npm run kb:build -- --strict fail if any [TODO] markers remain (use before deploying)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildKb, type KbFile } from '@ask-paul/agent-core';
import config from '../bot.config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kbDir = join(root, 'kb');
const outDir = join(root, 'generated');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
  });
}

const files: KbFile[] = walk(kbDir).map((p) => ({
  fileId: relative(kbDir, p).replace(/\\/g, '/').replace(/\.md$/, ''),
  markdown: readFileSync(p, 'utf8'),
}));

const bundle = buildKb(files);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'kb.bundle.json'), JSON.stringify(bundle, null, 2));

// Only public, non-secret settings go to the browser.
const widget = {
  name: config.name,
  ownerName: config.owner.name,
  ownerEmail: config.owner.email,
  starters: config.starters,
  savedAnswers: config.savedAnswers,
  dailyLimit: config.limits.questionsPerDay,
  projects: bundle.projects,
};
writeFileSync(join(outDir, 'widget.json'), JSON.stringify(widget, null, 2));

// The standalone site shows the latest eval scores; until `npm run eval` runs, they are placeholders.
const evalPath = join(outDir, 'eval-results.json');
if (!existsSync(evalPath)) {
  writeFileSync(
    evalPath,
    JSON.stringify({ ranAt: null, model: null, cases: 0, passed: 0, scores: { cites: null, noInvented: null, handoff: null, medianFirstWordMs: null } }, null, 2),
  );
}

const tokens = Math.round(bundle.sections.reduce((n, s) => n + s.body.length + s.title.length, 0) / 4);
console.log(`kb: ${bundle.sections.length} sections, ${bundle.projects.length} projects, ~${tokens.toLocaleString()} tokens → generated/kb.bundle.json`);
if (bundle.todos.length) {
  console.warn(`kb: ${bundle.todos.length} [TODO] markers left to fill in:`);
  for (const t of bundle.todos) console.warn(`  kb/${t.fileId}.md:${t.line}  ${t.text}`);
  if (process.argv.includes('--strict')) process.exit(1);
}
