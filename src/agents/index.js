// @ts-check
// Walk the Claude Code and Codex log folders and total agent time per UTC day.
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { windowStartIso } from "../days.js";
import { parseClaudeLine } from "./claude.js";
import { parseCodexLine } from "./codex.js";
import { addSessionTime, toSeconds } from "./sessions.js";

/** @param {NodeJS.ProcessEnv} [env] */
export function defaultAgentDirs(env = process.env) {
  const claudeBase = env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const codexBase = env.CODEX_HOME || join(homedir(), ".codex");
  return {
    claude: [join(claudeBase, "projects")],
    codex: [join(codexBase, "sessions"), join(codexBase, "archived_sessions")],
  };
}

/**
 * Every .jsonl file under `dir` modified at or after `sinceMs`. Missing folders yield nothing.
 * @param {string} dir
 * @param {number} sinceMs
 * @returns {AsyncGenerator<string>}
 */
export async function* jsonlFiles(dir, sinceMs) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* jsonlFiles(path, sinceMs);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      const info = await stat(path).catch(() => null);
      if (info && info.mtimeMs >= sinceMs) yield path;
    }
  }
}

/**
 * @template T
 * @param {string} path
 * @param {(line: string) => T | null} parse
 * @returns {Promise<T[]>}
 */
async function readEvents(path, parse) {
  /** @type {T[]} */
  const events = [];
  const lines = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    const event = parse(line);
    if (event) events.push(event);
  }
  return events;
}

/**
 * @param {{ window: { from: string, to: string }, claudeDirs?: string[], codexDirs?: string[], onFile?: (tool: string, path: string) => void }} options
 * @returns {Promise<{ days: Record<string, Record<string, number>>, files: { claude: number, codex: number } }>}
 */
export async function collectAgentDays(options) {
  const defaults = defaultAgentDirs();
  const { window, claudeDirs = defaults.claude, codexDirs = defaults.codex, onFile } = options;
  // A file untouched since the day before the window cannot hold events inside it.
  const sinceMs = Date.parse(windowStartIso(window)) - 86_400_000;
  /** @type {import("./sessions.js").DayTotalsMs} */
  const totals = {};
  const files = { claude: 0, codex: 0 };

  // Resumed or forked Claude sessions copy earlier lines into a new file; skip any uuid already counted.
  const seen = new Set();
  for (const dir of claudeDirs) {
    for await (const path of jsonlFiles(dir, sinceMs)) {
      onFile?.("claude", path);
      const events = (await readEvents(path, parseClaudeLine)).filter((event) => {
        if (!event.uuid) return true;
        if (seen.has(event.uuid)) return false;
        seen.add(event.uuid);
        return true;
      });
      addSessionTime(events, "claude", window, totals);
      files.claude += 1;
    }
  }

  for (const dir of codexDirs) {
    for await (const path of jsonlFiles(dir, sinceMs)) {
      onFile?.("codex", path);
      addSessionTime(await readEvents(path, parseCodexLine), "codex", window, totals);
      files.codex += 1;
    }
  }

  return { days: toSeconds(totals), files };
}
