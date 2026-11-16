# Ask Paul

An AI agent that answers recruiters' questions about Paul Obike's work, and cites a source for every claim. It ships in two forms:

- **`<ask-paul>` widget:** one script tag on any site. On desktop it opens as a side panel; on phones, as a bottom sheet.
- **Standalone site:** a landing page, a conversation view with a Sources pane, and a "How it works" section with eval scores.

Everything is TypeScript. The code is provider-agnostic (Anthropic and OpenAI adapters, plus a mock), and nothing ties it to a particular host.

```
bot.config.ts          persona, models, tools, limits, starters, allowed origins
kb/                    the knowledge base (Markdown) — the only thing the agent knows
packages/
  protocol/            request + stream event types (Zod), SSE encoder/parser
  agent-core/          agent loop, tools, model adapters, KB loader, search, citations
apps/
  api/                 Hono server: POST /api/chat (SSE), GET /api/config, GET /api/health
  widget/              Preact web component, built to dist/ask-paul.js (+ a lazy chat chunk)
  site/                standalone site (Vite + the widget's components)
evals/                 cases.json (24 cases) + runner
tests/                 Vitest unit + integration tests
scripts/build-kb.ts    bundles kb/ into generated/ for the API, widget and site
```

## Quick start

Requires Node 20 or newer.

```bash
npm install
cp .env.example .env          # optional: add ANTHROPIC_API_KEY or OPENAI_API_KEY

npm run dev:api               # http://localhost:8787 (mock model if no key is set)
npm run dev:widget            # http://localhost:5173 — a host page with the launcher
npm run dev:site              # http://localhost:5174 — the standalone site
```

With no API key, the server uses the **mock model**. It's scripted: it calls the same tools and streams cited answers built from the knowledge base, so you can work on the whole stack for free. Its answers are simple extracts, not real reasoning.

| Command | What it does |
| --- | --- |
| `npm test` | 36 unit and integration tests (protocol, citations, KB, search, résumé, agent loop, API) |
| `npm run typecheck` | type-checks the whole repo |
| `npm run eval` | runs the 24 eval cases against the configured model (needs a key) |
| `npm run eval -- --mock` | checks the eval harness with the mock model (scores aren't meaningful) |
| `npm run kb:build` | rebuilds `generated/` from `kb/`, listing any `[TODO]` markers |
| `npm run kb:check` | the same, but fails while any `[TODO]` remains; use before deploying |
| `npm run build` | builds the widget, the site and both API bundles |

## How an answer works

1. The widget POSTs `{ question, history, jobDescription?, pageContext? }` to `/api/chat`.
2. The API checks the origin, validates the input, and applies the daily limit (per salted IP hash).
3. The agent sends the model the instructions plus the **whole knowledge base**, as a stable, cacheable prefix, along with the conversation.
4. The model calls tools (`search_work`, `show_project`, `tailor_resume`, `book_call`, `contact_paul`). Each call streams to the widget as a step.
5. The model cites sections as `[[experience/vennote#results]]`. A streaming rewriter turns those into `[1]`, `[2]`… and **drops any id that doesn't exist**, so an invented source never reaches the visitor. It also splits off the follow-up questions.
6. The API streams Server-Sent Events: `meta`, `step`, `text`, `card`, `sources`, `followups`, `error`, `done`. Event types are defined once in `packages/protocol`.

`tailor_resume` is deterministic: it matches the job description's requirements against a skills vocabulary, then picks existing knowledge-base bullets. No model writes résumé lines, and a test checks that every line exists in `kb/`.

## The knowledge base

Each `##` heading in a `kb/` Markdown file becomes a citable section, with an id like `experience/vennote#what-he-built`. Front matter holds per-file details: role, company, dates and links for experience; status, stack and live/code links for projects.

Rules:

- **One fact per bullet**, with numbers where they exist. Citations point at these lines.
- **Don't rename headings once you're live.** Section ids come from headings, and citations depend on them.
- **Company links:** store the URL and write a line describing the company yourself. The agent never fetches websites.
- **`kb/offlimits.md`** lists topics that always hand off to Paul.
- **`kb/faq.md`** holds recruiter questions, answered the way Paul wants them answered.
- **`[TODO …]` lines** never reach the model, but `npm run kb:build` lists them so nothing ships half-written.

The knowledge base is currently about 1,700 tokens, so it fits in the prompt comfortably. Retrieval is a tool for honest citations, not a vector database. Add pgvector only if `kb/` grows past roughly 50–80K tokens.

## Models

Set the model in `bot.config.ts`:

```ts
model:    { provider: 'anthropic', id: 'claude-haiku-5-5' },
fallback: { provider: 'openai',    id: 'gpt-6-luna' },
```

- Each provider has a ~150-line adapter in `packages/agent-core/src/providers/`. It translates tools, streaming, caching and errors to one neutral interface.
- **Fallback:** if the primary model fails with a retryable error *before any text is shown*, the turn reruns on the fallback model. The visitor sees a "Switched to backup model" step.
- **Prompt tweaks:** if one model needs extra wording, add `promptAddendum` to its choice.
- **To switch models:** change the setting, then run `npm run eval`. Ship only if every score is at least 90%. `npm run eval -- --model openai:gpt-6-luna` tests a model without editing the config.

Cost is logged per answer from the `prices` table in `bot.config.ts`. At roughly 2 model calls per question, with the knowledge base cached, expect about a tenth of a cent per question.

## Embedding the widget

Build with `npm run build -w @ask-paul/widget`, host `apps/widget/dist/` on any static host or CDN, then:

```html
<script type="module" src="https://YOUR-CDN/ask-paul.js"></script>
<ask-paul api-url="https://YOUR-API" page-context="Vennote case study"></ask-paul>
```

| Attribute | Meaning |
| --- | --- |
| `api-url` | where the API is deployed (required) |
| `mode` | `launcher` (default; floating button + panel) or `inline` (fills its container) |
| `page-context` | what the visitor is reading; passed to the agent as data |
| `no-fonts` | skip loading Fraunces/Nunito and use the host page's fonts |

- **Size:** the loader is about 2 KB gzipped and draws only the button. The chat (about 20 KB gzipped, Preact included) loads on hover or first click.
- **Styles:** everything renders in Shadow DOM, so styles can't collide with the host page. Override colours from the host with `--ap-*` CSS variables.
- **Allowed origins:** add the embedding site's origin to `allowedOrigins` in `bot.config.ts`, or set `ALLOWED_ORIGINS`.

## Hosting (your choice)

The parts deploy separately:

| Part | Build output | Runs on |
| --- | --- | --- |
| API | `apps/api/dist/node.js` (self-contained, no `node_modules` needed) | any Node 20+ host: VPS, Render, Railway, Fly.io, a container |
| API | `apps/api/dist/worker.js` / `src/worker.ts` | Cloudflare Workers (see `apps/api/wrangler.toml.example`) or other fetch-style runtimes |
| Widget | `apps/widget/dist/` | any static host or CDN |
| Site | `apps/site/dist/` | any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages) |

API environment variables are documented in `.env.example`. Key ones: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, `RATE_LIMIT_SALT`, `ALLOWED_ORIGINS`, `LOG_QUESTIONS`, `PORT`.

The site reads `VITE_API_URL`, `VITE_PORTFOLIO_URL` and `VITE_SOURCE_URL` at build time.

- **Rate limiting with several instances:** the in-memory limiter works for one Node process. With several instances, plug a shared store into the `CounterStore` interface (`apps/api/src/ratelimit.ts`). A Cloudflare KV adapter is included.
- **Logs:** answers are logged as one JSON line each, to stdout. The log has the question (unless `LOG_QUESTIONS=0`), the visitor hash, the model, steps, sources, timing, tokens and cost. Raw IPs are never stored.

## Security notes

- Model keys stay on the server. `/api/config` exposes only public settings.
- Browsers on origins outside the allowlist get a 403. Requests with no `Origin` header (curl, server-to-server) are allowed but still rate-limited.
- Input limits: questions 1,000 characters, job descriptions 8,000, history 10 turns. Answers are capped at 700 output tokens and 4 model turns.
- Pasted job descriptions and page context are wrapped in tags and marked as data in the system prompt. Tag-closing tricks are stripped (there's a test for it).
- Tools can't send messages or fetch URLs. `contact_paul` only prepares a draft for the visitor to send.

## Reusing this for another bot

1. Replace `kb/` with the new person's or company's material.
2. Edit `bot.config.ts`: name, owner, persona, starters, saved answers, tools and limits.
3. Rewrite `evals/cases.json` for the new material, then run `npm run eval`.
4. Re-theme the widget with `--ap-*` variables or by editing `apps/widget/src/styles.css`.

The agent loop, protocol, widget, API and eval runner don't change.

## Still to fill in

Run `npm run kb:build` for the full list. It covers:

- company websites and one-line company descriptions
- a booking link (`owner.bookingUrl` in `bot.config.ts`), which enables the booking card
