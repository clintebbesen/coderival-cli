// @ts-check
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseCli } from "../src/args.js";
import { sync } from "../src/commands/sync.js";
import { configPath, loadConfig, saveConfig } from "../src/config.js";
import { buildReport } from "../src/report.js";
import { VERSION } from "../src/version.js";
import { fakeFetch } from "./helpers.js";

const now = new Date("2026-10-18T05:00:00Z");
const agentDays = { "2026-10-17": { claude: 3600, codex: 60 } };
const logTokens = { "2026-10-17": 5_000_000 };
const collectAgents = async () => ({ days: agentDays, tokens: logTokens, files: { claude: 1, codex: 1 } });
const forgeDays = { "2026-10-16": { prs: 2, commits: 5 }, "2026-10-15": { prs: 0, commits: 0 } };
const collect = async () => forgeDays;

async function tempConfig() {
  const dir = await mkdtemp(join(tmpdir(), "coderival-test-"));
  process.env.XDG_CONFIG_HOME = dir;
  const config = await loadConfig();
  config.server = "https://coderival.test";
  config.forges = [
    { provider: "gitlab", host: "gitlab.example.com", apiBase: "https://gitlab.example.com/api/v4", username: "dev", token: "secret-forge-token" },
    { provider: "github", host: "github.com", apiBase: "https://api.github.com", username: "Dev", token: "secret-gh-token" },
  ];
  return config;
}

test("config is written mode 600", async () => {
  const config = await tempConfig();
  config.token = "cr_x";
  await saveConfig(config);
  const info = await stat(configPath());
  assert.equal(info.mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(configPath(), "utf8")).token, "cr_x");
});

test("report payload matches the contract and drops empty days", () => {
  const report = buildReport({
    device: { id: "d1", name: "laptop" },
    window: { from: "2026-09-14", to: "2026-10-18" },
    agentDays,
    forges: [{ provider: "gitlab", host: "gitlab.example.com", username: "dev", days: forgeDays }],
  });
  assert.deepEqual(report, {
    client: { name: "coderival-cli", version: VERSION },
    device: { id: "d1", name: "laptop" },
    window: { from: "2026-09-14", to: "2026-10-18" },
    agent: { days: agentDays },
    forges: [{ provider: "gitlab", host: "gitlab.example.com", username: "dev", days: { "2026-10-16": { prs: 2, commits: 5 } } }],
  });
});

test("dry run prints the payload and sends nothing", async () => {
  const config = await tempConfig();
  const { impl, calls } = fakeFetch(() => ({ status: 500 }));
  let printed = "";
  const options = parseCli(["--dry-run"]);
  const result = await sync(config, options, { fetchImpl: impl, collectAgents, collect, now, log: () => {}, print: (text) => (printed += text) });
  assert.equal(calls.length, 0);
  assert.equal(result.sent, false);
  const payload = JSON.parse(printed);
  assert.deepEqual(payload.window, { from: "2025-09-14", to: "2026-10-18" });
  assert.equal(payload.forges.length, 2);
  assert.ok(!printed.includes("secret"), "forge tokens never appear in the payload");
});

test("sync skips server-verified forges, sends, and remembers the sync", async () => {
  const config = await tempConfig();
  config.token = "cr_token";
  config.lastSync = "2026-10-01T00:00:00Z";
  const { impl, calls } = fakeFetch(({ url }) => {
    if (url.pathname === "/api/cli/me") return { body: { profile: { slug: "dev", name: "Dev", url: "https://coderival.test/dev" }, verifiedForges: [{ provider: "github", host: "GitHub.com", username: "dev" }] } };
    return { body: { ok: true, profileUrl: "https://coderival.test/dev", accepted: { agentDays: 1, forges: [{ host: "gitlab.example.com", username: "dev", status: "ok" }] } } };
  });
  const result = await sync(config, parseCli([]), { fetchImpl: impl, collectAgents, collect, now, log: () => {} });
  assert.equal(result.sent, true);
  const report = calls.find((c) => c.url.pathname === "/api/cli/report");
  assert.ok(report);
  assert.equal(report.headers.authorization, "Bearer cr_token");
  assert.deepEqual(report.body.window, { from: "2026-09-14", to: "2026-10-18" });
  assert.deepEqual(report.body.forges.map((/** @type {{ host: string }} */ f) => f.host), ["gitlab.example.com"]);
  assert.equal((await loadConfig()).lastSync, now.toISOString());
});

test("--no-agents and --no-forges leave those sections out", async () => {
  const config = await tempConfig();
  let printed = "";
  await sync(config, parseCli(["--dry-run", "--no-agents", "--no-forges"]), { collectAgents, collect, now, log: () => {}, print: (t) => (printed += t) });
  const payload = JSON.parse(printed);
  assert.equal("agent" in payload, false);
  assert.equal("forges" in payload, false);
});

test("--days is validated", () => {
  assert.equal(parseCli(["--days", "7"]).days, 7);
  assert.throws(() => parseCli(["--days", "401"]));
});

test("package.json version matches the client version", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.version, VERSION);
});

test("log tokens are sent by default and --no-tokens leaves them out", async () => {
  const config = await tempConfig();
  let printed = "";
  await sync(config, parseCli(["--dry-run", "--no-forges"]), { collectAgents, collect, now, log: () => {}, print: (t) => (printed += t) });
  assert.deepEqual(JSON.parse(printed).tokens, [{ source: "logs", days: logTokens }]);
  printed = "";
  await sync(config, parseCli(["--dry-run", "--no-forges", "--no-tokens"]), { collectAgents, collect, now, log: () => {}, print: (t) => (printed += t) });
  assert.equal("tokens" in JSON.parse(printed), false);
});

test("a configured CLIProxyAPI is sent next to this device's log tokens", async () => {
  const config = await tempConfig();
  config.cliproxy = { url: "http://proxy.test", hostLabel: "proxy.example", keyFile: "/nope" };
  const loadProxy = async () => ({ host: "proxy.example", days: { "2026-10-17": 9, "2020-01-01": 1 } });
  let printed = "";
  await sync(config, parseCli(["--dry-run", "--no-forges"]), { collectAgents, collect, loadProxy, now, log: () => {}, print: (t) => (printed += t) });
  assert.deepEqual(JSON.parse(printed).tokens, [{ source: "logs", days: logTokens }, { source: "cliproxy", host: "proxy.example", days: { "2026-10-17": 9 } }]);
});

test("forge tokens can come from a command, and quiet runs never start a login", async () => {
  const config = await tempConfig();
  config.forges = [{ provider: "github", host: "github.com", apiBase: "https://api.github.com", username: "dev", tokenCommand: "gh auth token" }];
  /** @type {string[]} */
  const used = [];
  const collectSpy = async (/** @type {any} */ forge) => { used.push(forge.token); return forgeDays; };
  await sync(config, parseCli(["--dry-run", "--no-agents"]), { collect: collectSpy, tokenFor: async () => "from-command", now, log: () => {}, print: () => {} });
  assert.deepEqual(used, ["from-command"]);
  await assert.rejects(sync(config, parseCli(["--quiet"]), { collectAgents, collect, now, log: () => {} }), /Not logged in/);
  await assert.rejects(sync(config, parseCli(["--no-login"]), { collectAgents, collect, now, log: () => {} }), /Not logged in/);
});
