// @ts-check
// Count agent hours, tokens and forge totals, then send them (or print them with --dry-run).
import { collectAgentDays } from "../agents/index.js";
import { saveConfig } from "../config.js";
import { addDays, windowFor } from "../days.js";
import { collectForge } from "../forges/index.js";
import { daysInWindow, loadProxyTokens } from "../proxy/cliproxy.js";
import { buildReport, sumSince } from "../report.js";
import { getMe, sendReport } from "../server.js";
import { resolveToken } from "../token-command.js";
import { login } from "./login.js";

/**
 * @typedef {{
 *   log?: (line: string) => void,
 *   print?: (text: string) => void,
 *   fetchImpl?: typeof fetch,
 *   collectAgents?: typeof collectAgentDays,
 *   collect?: typeof collectForge,
 *   loadProxy?: typeof loadProxyTokens,
 *   tokenFor?: typeof resolveToken,
 *   now?: Date,
 * }} SyncDeps
 */

/**
 * @param {import("../config.js").Config} config
 * @param {import("../args.js").CliOptions} options
 * @param {SyncDeps} [deps]
 */
export async function sync(config, options, deps = {}) {
  const {
    log: logAll = console.error, print = (text) => process.stdout.write(text), fetchImpl, collectAgents = collectAgentDays,
    collect = collectForge, loadProxy = loadProxyTokens, tokenFor = resolveToken, now = new Date(),
  } = deps;
  // --quiet keeps errors (logAll) and the final line; progress lines go through `log`.
  const log = options.quiet ? () => {} : logAll;
  const window = windowFor(options.days ?? (config.lastSync ? 35 : 400), now);

  if (!options.dryRun && !config.token) {
    if (options.noLogin || options.quiet) throw new Error("Not logged in on this machine. Run `coderival login` once by hand first.");
    await login(config, { log, fetchImpl });
  }

  /** @type {Set<string>} */
  const verified = new Set();
  if (config.token && options.forges && config.forges.length) {
    const me = await getMe(config.server, config.token, fetchImpl);
    for (const forge of me.verifiedForges ?? []) verified.add(forgeKey(forge.host, forge.username));
  }

  let agentDays;
  /** @type {Record<string, number> | undefined} */
  let logTokens;
  if (options.agents) {
    log(`Counting agent hours from ${window.from} to ${window.to}...`);
    const dirs = {
      ...(options.claudeDir ? { claudeDirs: [options.claudeDir] } : {}),
      ...(options.codexDir ? { codexDirs: [options.codexDir] } : {}),
    };
    const result = await collectAgents({ window, ...dirs });
    log(`  read ${result.files.claude} Claude Code and ${result.files.codex} Codex session files`);
    agentDays = result.days;
    logTokens = result.tokens;
  }

  // This device's log tokens, plus the proxy's totals when this device runs the collector. The server counts
  // the larger of the two per day, so history from before the collector started is kept.
  /** @type {import("../report.js").TokenTotals[]} */
  const tokenList = [];
  if (options.tokens && logTokens) tokenList.push({ source: "logs", days: logTokens });
  if (options.tokens && config.cliproxy) {
    const stored = await loadProxy();
    if (stored) tokenList.push({ source: "cliproxy", host: config.cliproxy.hostLabel, days: daysInWindow(stored.days, window) });
    else logAll(`No token totals collected from ${config.cliproxy.hostLabel} yet; is \`coderival proxy collect\` running? Proxy tokens not sent.`);
  }
  const tokens = tokenList.length ? tokenList : undefined;

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
        const token = await tokenFor(forge);
        const days = await collect({ ...forge, token, fetchImpl, onWait: (ms) => log(`  rate limited, waiting ${Math.ceil(ms / 1000)}s`) }, window);
        forges.push({ provider: forge.provider, host: forge.host, username: forge.username, days });
      } catch (error) {
        // Leave it out of the report so the site keeps its last good numbers for this forge.
        logAll(`${forge.username} on ${forge.host} failed, not sent: ${/** @type {Error} */ (error).message}`);
      }
    }
  }

  const report = buildReport({ device: { id: config.deviceId, name: config.deviceName }, window, agentDays, forges, tokens });
  const since = addDays(window.to, -29);
  summarise(report, since, log);

  if (options.dryRun) {
    print(`${JSON.stringify(report, null, 2)}\n`);
    log("Dry run: nothing was sent.");
    return { report, sent: false };
  }

  const response = await sendReport(config.server, /** @type {string} */ (config.token), report, fetchImpl);
  config.lastSync = now.toISOString();
  await saveConfig(config);
  for (const forge of response.accepted?.forges ?? []) {
    if (forge.status !== "ok" && forge.status !== "attested") log(`  ${forge.username} on ${forge.host}: ${forge.status}`);
  }
  if (options.quiet) logAll(`${now.toISOString()} sent: ${oneLine(report, since)} ${response.profileUrl}`);
  else log(`Sent. Your profile: ${response.profileUrl}`);
  return { report, sent: true };
}

/**
 * One-line 30-day summary for --quiet runs.
 * @param {Record<string, any>} report
 * @param {string} since
 */
function oneLine(report, since) {
  const parts = [];
  if (report.agent) {
    const seconds = Object.values(sumSince(report.agent.days, since)).reduce((a, b) => a + b, 0);
    parts.push(`agent ${(seconds / 3600).toFixed(1)}h`);
  }
  for (const t of report.tokens ?? []) parts.push(`tokens ${formatTokens(sumTokens(t.days, since))} (${t.source})`);
  if (report.forges) parts.push(`${report.forges.length} forge${report.forges.length === 1 ? "" : "s"}`);
  return `last 30 days ${parts.join(", ") || "nothing"}.`;
}

/** @param {Record<string, number>} days @param {string} since */
const sumTokens = (days, since) => Object.entries(days).reduce((sum, [day, n]) => (day >= since ? sum + n : sum), 0);

/** @param {number} n */
export function formatTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
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
  for (const t of report.tokens ?? []) log(`  tokens: ${formatTokens(sumTokens(t.days, since))} (from ${t.source === "cliproxy" ? t.host : "Claude Code and Codex logs"})`);
  for (const forge of report.forges ?? []) {
    const totals = sumSince(forge.days, since);
    log(`  ${forge.username} on ${forge.host}: ${totals.prs ?? 0} merged, ${totals.commits ?? 0} commits`);
  }
}
