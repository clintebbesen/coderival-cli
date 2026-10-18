// @ts-check
// Token totals from the same log lines that give agent hours.
//
// Tokens = everything the provider bills as processed: input (uncached + cache read + cache write) plus output
// (including reasoning). Cache reads dominate for long agent sessions, so totals are large.
import { inWindow, utcDay } from "../days.js";

/** @param {unknown} value */
const n = (value) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/**
 * Claude Code `message.usage`: input_tokens excludes cache reads and writes, output_tokens includes thinking.
 * @param {any} usage
 */
export function claudeUsageTotal(usage) {
  if (!usage || typeof usage !== "object") return 0;
  return n(usage.input_tokens) + n(usage.cache_creation_input_tokens) + n(usage.cache_read_input_tokens) + n(usage.output_tokens);
}

/**
 * Add `count` tokens at time `t` into a day map, when the day is inside the window.
 * @param {Record<string, number>} days
 * @param {number} t
 * @param {number} count
 * @param {{ from: string, to: string }} window
 */
export function addTokens(days, t, count, window) {
  if (!(count > 0)) return;
  const day = utcDay(t);
  if (inWindow(day, window)) days[day] = (days[day] ?? 0) + Math.round(count);
}

/**
 * Codex writes a running session total (`total_token_usage.total_tokens`, where input already includes cached
 * input) on every token_count event. The positive steps between them are the tokens used at each event.
 * @param {{ t: number, cumTokens?: number }[]} events in file order
 * @param {Record<string, number>} days
 * @param {{ from: string, to: string }} window
 */
export function addCodexTokens(events, days, window) {
  let last = 0;
  for (const event of events) {
    if (event.cumTokens === undefined) continue;
    const current = event.cumTokens;
    // A smaller total means the counter restarted (new conversation in the same file): count it from zero.
    const step = current >= last ? current - last : current;
    last = current;
    addTokens(days, event.t, step, window);
  }
}

/**
 * Drop zero days and sort.
 * @param {Record<string, number>} days
 */
export function cleanTokenDays(days) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const day of Object.keys(days).sort()) if (days[day] > 0) out[day] = days[day];
  return out;
}
