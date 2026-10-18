// @ts-check
// `coderival add cliproxy`, `coderival proxy collect` and `coderival proxy service`.
import { resolve } from "node:path";
import { saveConfig } from "../config.js";
import { sleep } from "../http.js";
import {
  DEFAULT_AGENT_PATTERN, addRecords, loadProxyTokens, popRecords, proxyTokensPath, readKey, saveProxyTokens, trimDays,
} from "../proxy/cliproxy.js";

const TICK_MS = 15_000;
const MAX_BACKOFF_MS = 60_000;
const MAX_POPS_PER_TICK = 40;

/**
 * @param {import("../config.js").Config} config
 * @param {{ url?: string, hostLabel?: string, keyFile?: string, agentPattern?: string }} options
 * @param {{ log?: (line: string) => void, fetchImpl?: typeof fetch }} [deps]
 */
export async function addCliProxy(config, options, deps = {}) {
  const { log = console.error } = deps;
  if (!options.url || !options.keyFile) throw new Error("Usage: coderival add cliproxy --url URL --key-file PATH [--host-label NAME]");
  const url = options.url.replace(/\/+$/, "");
  const keyFile = resolve(options.keyFile);
  await readKey(keyFile);
  if (options.agentPattern) new RegExp(options.agentPattern, "i");
  const hostLabel = options.hostLabel || new URL(url).hostname;
  config.cliproxy = { url, hostLabel, keyFile, ...(options.agentPattern ? { agentPattern: options.agentPattern } : {}) };
  await saveConfig(config);
  log(`Added CLIProxyAPI ${hostLabel}. Run \`coderival proxy collect\` as a service (see \`coderival proxy service\`).`);
  log("Only one collector per proxy: reading the usage queue removes the records.");
}

/**
 * Long-running loop that drains the proxy's usage queue into daily token totals.
 * @param {import("../config.js").Config} config
 * @param {{ agentPattern?: string }} options
 * @param {{ log?: (line: string) => void, fetchImpl?: typeof fetch, wait?: (ms: number) => Promise<void>, maxTicks?: number, path?: string, signal?: AbortSignal }} [deps]
 */
export async function proxyCollect(config, options, deps = {}) {
  const { log = console.error, fetchImpl, wait = sleep, maxTicks = Infinity, path = proxyTokensPath(), signal } = deps;
  const proxy = config.cliproxy;
  if (!proxy) throw new Error("No CLIProxyAPI configured. Run: coderival add cliproxy --url URL --key-file PATH");
  const pattern = new RegExp(options.agentPattern || proxy.agentPattern || DEFAULT_AGENT_PATTERN, "i");
  const data = (await loadProxyTokens(path)) ?? { host: proxy.hostLabel, days: {} };
  data.host = proxy.hostLabel;

  let stopped = false;
  const stop = () => { stopped = true; };
  signal?.addEventListener("abort", stop);
  if (!signal) { process.once("SIGTERM", stop); process.once("SIGINT", stop); }

  log(`Collecting tokens from ${proxy.hostLabel} every ${TICK_MS / 1000}s into ${path}`);
  let backoff = TICK_MS;
  for (let tick = 0; tick < maxTicks && !stopped; tick += 1) {
    try {
      const key = await readKey(proxy.keyFile);
      let counted = 0;
      let skipped = 0;
      for (let pop = 0; pop < MAX_POPS_PER_TICK && !stopped; pop += 1) {
        const records = await popRecords({ url: proxy.url, key, count: 500, fetchImpl });
        if (!records.length) break;
        const result = addRecords(records, data.days, pattern);
        counted += result.counted;
        skipped += result.skipped;
      }
      if (counted || skipped) {
        trimDays(data.days);
        await saveProxyTokens(data, path);
        log(`${new Date().toISOString()} counted ${counted} requests, skipped ${skipped}`);
      }
      backoff = TICK_MS;
    } catch (error) {
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      log(`${new Date().toISOString()} ${/** @type {Error} */ (error).message}; retrying in ${backoff / 1000}s`);
    }
    if (!stopped && tick + 1 < maxTicks) await wait(backoff);
  }
  log("Collector stopped.");
  return data;
}

export function proxyService() {
  console.log(`Run the CLIProxyAPI token collector all the time. Nothing is installed for you.

Linux (systemd user service): save as ~/.config/systemd/user/coderival-proxy.service

[Unit]
Description=CodeRival CLIProxyAPI token collector

[Service]
ExecStart=${process.execPath} ${resolve(process.argv[1] ?? "coderival")} proxy collect
Restart=always
RestartSec=10

[Install]
WantedBy=default.target

then run:
  systemctl --user daemon-reload
  systemctl --user enable --now coderival-proxy
  loginctl enable-linger "$USER"   # keep it running when you are logged out

macOS: a LaunchAgent plist with ProgramArguments = coderival proxy collect, KeepAlive = true,
then launchctl load ~/Library/LaunchAgents/<your plist>.

Only one collector per proxy. Records stay on the queue for redis-usage-queue-retention-seconds
(60 by default); raise it in CLIProxyAPI to cover collector restarts.`);
}
