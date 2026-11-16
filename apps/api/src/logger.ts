/**
 * Console logger for the API.
 *
 * - `json`: one JSON object per line (for log collectors: Render, Fly, Cloudflare...).
 * - `pretty`: a readable, coloured line per event, plus indented details (for local dev).
 */
export type LogEntry = Record<string, unknown> & { event: string; level?: 'info' | 'warn' | 'error' };
export type Logger = (entry: LogEntry) => void;
export type LogFormat = 'json' | 'pretty';

export function createConsoleLogger(format: LogFormat = 'json', opts: { color?: boolean } = {}): Logger {
  if (format === 'json') {
    return (entry) => {
      const line = JSON.stringify({ ts: new Date().toISOString(), level: entry.level ?? 'info', ...entry });
      if (entry.level === 'error') console.error(line);
      else if (entry.level === 'warn') console.warn(line);
      else console.log(line);
    };
  }

  const color = opts.color ?? true;
  const paint = (code: number, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const dim = (s: string) => paint(2, s);
  const red = (s: string) => paint(31, s);
  const green = (s: string) => paint(32, s);
  const yellow = (s: string) => paint(33, s);
  const cyan = (s: string) => paint(36, s);

  return (entry) => {
    const { event, level = 'info', ts: _ts, ...rest } = entry;
    const time = dim(new Date().toISOString().slice(11, 23));
    const tag = level === 'error' ? red('ERROR') : level === 'warn' ? yellow('WARN ') : cyan('INFO ');
    let headline: string;
    let details: Record<string, unknown> = rest;

    switch (event) {
      case 'request': {
        const { method, path, status, durationMs, ...more } = rest as Record<string, unknown> & { status: number };
        const s = String(status);
        const statusStr = status >= 500 ? red(s) : status >= 400 ? yellow(s) : green(s);
        headline = `${method} ${path} ${statusStr} ${dim(`${durationMs}ms`)}`;
        details = more;
        break;
      }
      case 'answer': {
        const { model, question, durationMs, firstTextMs, usage, costUsd, conversationId, ...more } = rest as Record<string, any>;
        const tokens = usage ? `in ${usage.inputTokens} (cached ${usage.cachedInputTokens}) / out ${usage.outputTokens}` : '';
        headline = `${green('answer')} ${model} ${dim(`${durationMs}ms, first text ${firstTextMs ?? '-'}ms`)} ${dim(tokens)}`;
        details = { ...(question ? { question } : {}), conversationId, ...(costUsd !== undefined ? { costUsd } : {}), ...more };
        break;
      }
      case 'error': {
        const { error, ...more } = rest;
        headline = `${red(event)} ${error}`;
        details = more;
        break;
      }
      default: {
        const { message, ...more } = rest;
        headline = message ? `${event}: ${message}` : event;
        details = more;
      }
    }

    const out = [`${time} ${tag} ${headline}`];
    for (const [k, v] of Object.entries(details)) {
      if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) continue;
      if (k === 'stack' && typeof v === 'string') {
        out.push(dim(v.split('\n').map((l) => `    ${l}`).join('\n')));
        continue;
      }
      out.push(`    ${dim(`${k}:`)} ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    }
    const text = out.join('\n');
    if (level === 'error') console.error(text);
    else if (level === 'warn') console.warn(text);
    else console.log(text);
  };
}
