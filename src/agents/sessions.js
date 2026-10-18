// @ts-check
// Agent time for one session file.
//
// Rule: sort the session's event timestamps and look at each consecutive pair (a, b).
// If b is a human prompt (the agent was waiting for a person) or a is the end of a turn,
// the gap is idle and counts 0. Otherwise the agent was working: count min(b - a, 15 minutes),
// attributed to b's UTC day. Sessions running in parallel add up.
import { inWindow, utcDay } from "../days.js";

export const MAX_GAP_MS = 15 * 60_000;

/**
 * @typedef {{ t: number, prompt?: boolean, turnEnd?: boolean }} AgentEvent
 * @typedef {Record<string, Record<string, number>>} DayTotalsMs  day -> tool -> milliseconds
 */

/**
 * Sort by time and merge events that share a timestamp, keeping their flags.
 * @param {AgentEvent[]} events
 * @returns {AgentEvent[]}
 */
export function normaliseEvents(events) {
  const sorted = events.filter((e) => Number.isFinite(e.t)).sort((a, b) => a.t - b.t);
  /** @type {AgentEvent[]} */
  const out = [];
  for (const event of sorted) {
    const last = out[out.length - 1];
    if (last && last.t === event.t) {
      last.prompt = Boolean(last.prompt || event.prompt);
      last.turnEnd = Boolean(last.turnEnd || event.turnEnd);
    } else {
      out.push({ ...event });
    }
  }
  return out;
}

/**
 * Add one session's agent time into `totals` (milliseconds per UTC day per tool).
 * @param {AgentEvent[]} events
 * @param {string} tool
 * @param {{ from: string, to: string }} window
 * @param {DayTotalsMs} totals
 * @returns {number} milliseconds added
 */
export function addSessionTime(events, tool, window, totals) {
  const list = normaliseEvents(events);
  let added = 0;
  for (let i = 1; i < list.length; i += 1) {
    const a = list[i - 1];
    const b = list[i];
    if (b.prompt || a.turnEnd) continue;
    const gap = Math.min(b.t - a.t, MAX_GAP_MS);
    if (gap <= 0) continue;
    const day = utcDay(b.t);
    if (!inWindow(day, window)) continue;
    const byTool = (totals[day] ??= {});
    byTool[tool] = (byTool[tool] ?? 0) + gap;
    added += gap;
  }
  return added;
}

/**
 * Convert millisecond totals to whole seconds, dropping empty days.
 * @param {DayTotalsMs} totals
 * @returns {Record<string, Record<string, number>>}
 */
export function toSeconds(totals) {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const day of Object.keys(totals).sort()) {
    /** @type {Record<string, number>} */
    const tools = {};
    for (const [tool, ms] of Object.entries(totals[day])) {
      const seconds = Math.round(ms / 1000);
      if (seconds > 0) tools[tool] = seconds;
    }
    if (Object.keys(tools).length) out[day] = tools;
  }
  return out;
}
