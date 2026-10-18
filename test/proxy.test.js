// @ts-check
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { addCliProxy, proxyCollect } from "../src/commands/proxy.js";
import { loadConfig } from "../src/config.js";
import { DEFAULT_AGENT_PATTERN, addRecords, daysInWindow, trimDays } from "../src/proxy/cliproxy.js";
import { fakeFetch } from "./helpers.js";

const record = (/** @type {object} */ over) => ({ timestamp: "2026-10-17T10:00:00Z", user_agent: "claude-cli/2.1.302 (external)", failed: false, tokens: { total_tokens: 1000 }, ...over });

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "coderival-proxy-"));
  process.env.XDG_CONFIG_HOME = dir;
  const keyFile = join(dir, "key");
  await writeFile(keyFile, "secret-management-key\n", { mode: 0o600 });
  const config = await loadConfig();
  return { dir, keyFile, config };
}

test("only successful coding-agent requests count, on their UTC day", () => {
  /** @type {Record<string, number>} */
  const days = {};
  const result = addRecords([
    record({}),
    record({ user_agent: "codex_cli_rs/0.50.0", timestamp: "2026-10-17T23:59:59Z", tokens: { total_tokens: 5 } }),
    record({ failed: true }),
    record({ user_agent: "Home Assistant/2026.10" }),
    record({ timestamp: "nope" }),
    record({ tokens: {} }),
  ], days, new RegExp(DEFAULT_AGENT_PATTERN, "i"));
  assert.deepEqual(result, { counted: 2, skipped: 4 });
  assert.deepEqual(days, { "2026-10-17": 1005 });
});

test("days are kept for 400 days and clipped to the report window", () => {
  const days = { "2024-01-01": 1, "2026-10-17": 2, "2026-10-18": 0 };
  trimDays(days, new Date("2026-10-18T00:00:00Z"));
  assert.deepEqual(days, { "2026-10-17": 2, "2026-10-18": 0 });
  assert.deepEqual(daysInWindow(days, { from: "2026-10-01", to: "2026-10-31" }), { "2026-10-17": 2 });
});

test("add cliproxy saves the key file path, never the key", async () => {
  const { keyFile, config } = await setup();
  await addCliProxy(config, { url: "http://proxy.test:8317/", keyFile, hostLabel: "proxy.example" }, { log: () => {} });
  const saved = await readFile(join(String(process.env.XDG_CONFIG_HOME), "coderival", "config.json"), "utf8");
  assert.ok(!saved.includes("secret-management-key"));
  assert.deepEqual(JSON.parse(saved).cliproxy, { url: "http://proxy.test:8317", hostLabel: "proxy.example", keyFile });
});

test("the collector drains the queue, writes a private file and never logs the key", async () => {
  const { dir, keyFile, config } = await setup();
  config.cliproxy = { url: "http://proxy.test:8317", hostLabel: "proxy.example", keyFile };
  const batches = [[record({}), record({ tokens: { total_tokens: 500 } })], [record({ user_agent: "curl/8" })], []];
  const { impl, calls } = fakeFetch(() => ({ body: batches.shift() ?? [] }));
  const lines = /** @type {string[]} */ ([]);
  const path = join(dir, "tokens.json");
  const data = await proxyCollect(config, {}, { fetchImpl: impl, log: (l) => lines.push(l), wait: async () => {}, maxTicks: 2, path, signal: new AbortController().signal });
  assert.deepEqual(data.days, { "2026-10-17": 1500 });
  assert.equal(calls[0].url.pathname, "/v0/management/usage-queue");
  assert.equal(calls[0].url.searchParams.get("count"), "500");
  assert.equal(calls[0].headers.authorization, "Bearer secret-management-key");
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { host: "proxy.example", days: { "2026-10-17": 1500 } });
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.ok(lines.some((l) => l.includes("counted 2 requests, skipped 1")));
  assert.ok(!lines.join("\n").includes("secret-management-key"));
});

test("collector errors back off instead of crashing", async () => {
  const { keyFile, config, dir } = await setup();
  config.cliproxy = { url: "http://proxy.test:8317", hostLabel: "p", keyFile };
  const { impl } = fakeFetch(() => ({ status: 401, body: { error: "nope" } }));
  /** @type {number[]} */
  const waits = [];
  const lines = /** @type {string[]} */ ([]);
  await proxyCollect(config, {}, { fetchImpl: impl, log: (l) => lines.push(l), wait: async (ms) => { waits.push(ms); }, maxTicks: 4, path: join(dir, "t.json"), signal: new AbortController().signal });
  assert.deepEqual(waits, [30000, 60000, 60000]);
  assert.ok(lines.some((l) => l.includes("HTTP 401")));
});
