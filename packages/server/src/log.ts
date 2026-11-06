// The game server's log: connections, disconnects, errors and stuck bots,
// so a dropped or frozen game can be traced afterwards. Each entry is one
// line of JSON with a timestamp. `npm run server` writes them to the
// terminal and to logs/server.log at the project root (git ignores it); the
// last entries are also kept in memory (GET /api/debug/log, from this
// computer only). Tests log nowhere unless they ask. Entries older than 30
// days are deleted (when the server starts, and once a day while it runs).

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface LogEntry {
  at: string;
  event: string;
  [detail: string]: unknown;
}

const KEEP = 500;
/** How long entries are kept (user, 2026-11-06). */
export const LOG_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Past this size the file is renamed to server.log.1 (one old file is kept). */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const recent: LogEntry[] = [];
let file: string | null = null;
let toConsole = false;

/** Where `npm run server` writes the log (and whether it prints it too). */
export function startLog(opts: { file?: string; console?: boolean }): void {
  file = opts.file ?? null;
  toConsole = opts.console ?? false;
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  pruneLog(file);
  const daily = setInterval(() => file && pruneLog(file), DAY_MS);
  daily.unref();
}

/**
 * Deletes entries older than 30 days from the log file and its older copy
 * (server.log.1); a file left with nothing recent is removed. Returns how
 * many entries were deleted.
 */
export function pruneLog(path: string, now = Date.now()): number {
  const cutoff = now - LOG_RETENTION_DAYS * DAY_MS;
  let removed = 0;
  for (const f of [path, `${path}.1`]) {
    try {
      if (!existsSync(f)) continue;
      const lines = readFileSync(f, 'utf8').split('\n').filter((l) => l.trim());
      const kept = lines.filter((l) => {
        try {
          const at = Date.parse((JSON.parse(l) as { at?: string }).at ?? '');
          return !Number.isFinite(at) || at >= cutoff;
        } catch {
          return true;
        }
      });
      removed += lines.length - kept.length;
      if (kept.length === lines.length) continue;
      if (kept.length === 0) unlinkSync(f);
      else writeFileSync(f, kept.join('\n') + '\n');
    } catch {
      // Logging must never take the server down.
    }
  }
  for (let i = recent.length - 1; i >= 0; i--) if (Date.parse(recent[i]!.at) < cutoff) recent.splice(i, 1);
  return removed;
}

/** Records one event with its details (no secrets: never tokens). */
export function log(event: string, details: Record<string, unknown> = {}): void {
  const entry: LogEntry = { at: new Date().toISOString(), event, ...details };
  recent.push(entry);
  if (recent.length > KEEP) recent.splice(0, recent.length - KEEP);
  const line = JSON.stringify(entry);
  if (toConsole) console.log(`[log] ${line}`);
  if (!file) return;
  try {
    if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_FILE_BYTES) renameSync(file, `${file}.1`);
    appendFileSync(file, line + '\n');
  } catch {
    // Logging must never take the server down.
  }
}

/** An error's message and the top of its stack. */
export function errorDetails(e: unknown): { error: string; stack?: string } {
  if (!(e instanceof Error)) return { error: String(e) };
  return { error: e.message, ...(e.stack ? { stack: e.stack.split('\n').slice(0, 8).join('\n') } : {}) };
}

/** The last entries, newest last. */
export function recentLog(): LogEntry[] {
  return [...recent];
}
