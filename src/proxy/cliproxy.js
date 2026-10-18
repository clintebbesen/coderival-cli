// @ts-check
// CLIProxyAPI (v7 and later) keeps no usage totals. It puts one record per request on a queue that is kept
// for a short time (redis-usage-queue-retention-seconds, 60 by default). Reading pops records, so exactly one
// collector per proxy must drain it. We keep only tokens per UTC day; nothing else from a record is stored.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { configPath } from "../config.js";
import { addDays, inWindow, utcDay } from "../days.js";
import { writeJsonAtomic } from "../files.js";

export const DEFAULT_AGENT_PATTERN = "claude-cli|claude-code|codex|opencode|t3code";
const KEEP_DAYS = 400;

/** @typedef {{ host: string, days: Record<string, number> }} ProxyTokens */

/** @param {NodeJS.ProcessEnv} [env] */
export function proxyTokensPath(env = process.env) {
  return join(dirname(configPath(env)), "cliproxy-tokens.json");
}

/**
 * @param {string} [path]
 * @returns {Promise<ProxyTokens | null>}
 */
export async function loadProxyTokens(path = proxyTokensPath()) {
  try {
    const stored = JSON.parse(await readFile(path, "utf8"));
    return { host: String(stored.host ?? ""), days: stored.days && typeof stored.days === "object" ? stored.days : {} };
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * @param {ProxyTokens} data
 * @param {string} [path]
 */
export function saveProxyTokens(data, path = proxyTokensPath()) {
  return writeJsonAtomic(path, data);
}

/**
 * Add the counted records to `days`. Only successful requests from coding agents count.
 * @param {any[]} records
 * @param {Record<string, number>} days
 * @param {RegExp} agentPattern
 * @returns {{ counted: number, skipped: number }}
 */
export function addRecords(records, days, agentPattern) {
  let counted = 0;
  let skipped = 0;
  for (const record of records) {
    const total = Number(record?.tokens?.total_tokens);
    const t = Date.parse(record?.timestamp);
    if (record?.failed || !Number.isFinite(t) || !(total > 0) || !agentPattern.test(String(record?.user_agent ?? ""))) {
      skipped += 1;
      continue;
    }
    const day = utcDay(t);
    days[day] = (days[day] ?? 0) + Math.round(total);
    counted += 1;
  }
  return { counted, skipped };
}

/**
 * Keep the newest KEEP_DAYS days.
 * @param {Record<string, number>} days
 * @param {Date} [now]
 */
export function trimDays(days, now = new Date()) {
  const oldest = addDays(utcDay(now), -(KEEP_DAYS - 1));
  for (const day of Object.keys(days)) if (day < oldest) delete days[day];
}

/**
 * Days inside the report window, for the sync payload.
 * @param {Record<string, number>} days
 * @param {{ from: string, to: string }} window
 */
export function daysInWindow(days, window) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const day of Object.keys(days).sort()) if (inWindow(day, window) && days[day] > 0) out[day] = days[day];
  return out;
}

/**
 * Pop up to `count` records. Throws with the HTTP status on failure (never with the key).
 * @param {{ url: string, key: string, count?: number, fetchImpl?: typeof fetch }} options
 * @returns {Promise<any[]>}
 */
export async function popRecords({ url, key, count = 500, fetchImpl = fetch }) {
  const endpoint = `${url.replace(/\/+$/, "")}/v0/management/usage-queue?count=${count}`;
  const response = await fetchImpl(endpoint, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`usage-queue answered HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error("usage-queue did not return a list");
  return body;
}

/** @param {string} keyFile */
export async function readKey(keyFile) {
  const key = (await readFile(keyFile, "utf8")).trim();
  if (!key) throw new Error(`${keyFile} is empty`);
  return key;
}
