// @ts-check
// Build the report payload. This is the complete list of what leaves your machine.
import { VERSION } from "./version.js";

/**
 * @typedef {{ provider: "github" | "gitlab", host: string, username: string, days: Record<string, { prs: number, commits: number }> }} ForgeTotals
 */

/**
 * @param {{
 *   device: { id: string, name: string },
 *   window: { from: string, to: string },
 *   agentDays?: Record<string, Record<string, number>>,
 *   forges?: ForgeTotals[],
 * }} input
 */
export function buildReport({ device, window, agentDays, forges }) {
  /** @type {Record<string, unknown>} */
  const report = {
    client: { name: "coderival-cli", version: VERSION },
    device: { id: device.id, name: device.name },
    window: { from: window.from, to: window.to },
  };
  if (agentDays) report.agent = { days: agentDays };
  if (forges) {
    report.forges = forges.map((forge) => ({
      provider: forge.provider,
      host: forge.host,
      username: forge.username,
      days: dropEmptyDays(forge.days),
    }));
  }
  return report;
}

/** @param {Record<string, { prs: number, commits: number }>} days */
function dropEmptyDays(days) {
  /** @type {Record<string, { prs: number, commits: number }>} */
  const out = {};
  for (const day of Object.keys(days).sort()) {
    const { prs, commits } = days[day];
    if (prs > 0 || commits > 0) out[day] = { prs, commits };
  }
  return out;
}

/**
 * Sum the last `n` days of a day map, for the human summary.
 * @param {Record<string, Record<string, number>>} days
 * @param {string} sinceDay
 */
export function sumSince(days, sinceDay) {
  /** @type {Record<string, number>} */
  const totals = {};
  for (const [day, values] of Object.entries(days)) {
    if (day < sinceDay) continue;
    for (const [key, value] of Object.entries(values)) totals[key] = (totals[key] ?? 0) + value;
  }
  return totals;
}
