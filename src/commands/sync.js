// @ts-check
// Count agent hours and forge totals, then send them (or print them with --dry-run).
import { collectAgentDays } from "../agents/index.js";
import { saveConfig } from "../config.js";
import { addDays, windowFor } from "../days.js";
import { collectForge } from "../forges/index.js";
import { buildReport, sumSince } from "../report.js";
import { getMe, sendReport } from "../server.js";
import { login } from "./login.js";

/**
 * @typedef {{
 *   log?: (line: string) => void,
 *   print?: (text: string) => void,
 *   fetchImpl?: typeof fetch,
 *   collectAgents?: typeof collectAgentDays,
 *   collect?: typeof collectForge,
 *   now?: Date,
 * }} SyncDeps
 */

/**
 * @param {import("../config.js").Config} config
 * @param {import("../args.js").CliOptions} options
 * @param {SyncDeps} [deps]
 */
export async function sync(config, options, deps = {}) {
  const { log = console.error, print = (text) => process.stdout.write(text), fetchImpl, collectAgents = collectAgentDays, collect = collectForge, now = new Date() } = deps;
  const window = windowFor(options.days ?? (config.lastSync ? 35 : 400), now);

  if (!options.dryRun && !config.token) await login(config, { log, fetchImpl });

  /** @type {Set<string>} */
  const verified = new Set();
  if (config.token && options.forges && config.forges.length) {
    const me = await getMe(config.server, config.token, fetchImpl);
    for (const forge of me.verifiedForges ?? []) verified.add(forgeKey(forge.host, forge.username));
  }

  let agentDays;
  if (options.agents) {
    log(`Counting agent hours from ${window.from} to ${window.to}...`);
    const dirs = {
      ...(options.claudeDir ? { claudeDirs: [options.claudeDir] } : {}),
      ...(options.codexDir ? { codexDirs: [options.codexDir] } : {}),
    };
    const result = await collectAgents({ window, ...dirs });
    log(`  read ${result.files.claude} Claude Code and ${result.files.codex} Codex session files`);
    agentDays = result.days;
  }

  /** @type {import("../report.js").ForgeTotals[] | undefined} */
  let forges;
  if (options.forges) {
    forges = [];
    for (const forge of config.forges) {
      if (verified.has(forgeKey(forge.host, forge.username))) {
        log(`Skipping ${forge.username} on ${forge.host}: the site already verifies it directly.`);
        continue;
      }
      log(`Counting ${forge.username} on ${forge.host}...`);
      try {
        const days = await collect({ ...forge, fetchImpl, onWait: (ms) => log(`  rate limited, waiting ${Math.ceil(ms / 1000)}s`) }, window);
        forges.push({ provider: forge.provider, host: forge.host, username: forge.username, days });
      } catch (error) {
        // Leave it out of the report so the site keeps its last good numbers for this forge.
        log(`  failed, not sent: ${/** @type {Error} */ (error).message}`);
      }
    }
  }

  const report = buildReport({ device: { id: config.deviceId, name: config.deviceName }, window, agentDays, forges });
  summarise(report, addDays(window.to, -29), log);

  if (options.dryRun) {
    print(`${JSON.stringify(report, null, 2)}\n`);
    log("Dry run: nothing was sent.");
    return { report, sent: false };
  }

  const response = await sendReport(config.server, /** @type {string} */ (config.token), report, fetchImpl);
  config.lastSync = now.toISOString();
  await saveConfig(config);
  for (const forge of response.accepted?.forges ?? []) {
    if (forge.status !== "ok") log(`  ${forge.username} on ${forge.host}: ${forge.status}`);
  }
  log(`Sent. Your profile: ${response.profileUrl}`);
  return { report, sent: true };
}

/** @param {string} host @param {string} username */
const forgeKey = (host, username) => `${host.toLowerCase()}/${username.toLowerCase()}`;

/**
 * @param {Record<string, any>} report
 * @param {string} since
 * @param {(line: string) => void} log
 */
function summarise(report, since, log) {
  log("Last 30 days:");
  if (report.agent) {
    const totals = sumSince(report.agent.days, since);
    const parts = Object.entries(totals).map(([tool, seconds]) => `${tool} ${(seconds / 3600).toFixed(1)}h`);
    log(`  agent hours: ${parts.length ? parts.join(", ") : "none"}`);
  }
  for (const forge of report.forges ?? []) {
    const totals = sumSince(forge.days, since);
    log(`  ${forge.username} on ${forge.host}: ${totals.prs ?? 0} merged, ${totals.commits ?? 0} commits`);
  }
}
