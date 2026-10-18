// @ts-check
// Command-line parsing on top of node:util parseArgs.
import { parseArgs } from "node:util";

export const HELP = `coderival: send your daily coding totals to CodeRival. Never code, never names, only numbers.

Usage:
  coderival [sync]             Count and send (logs in first if needed)
  coderival login              Link this machine to your CodeRival profile
  coderival logout             Forget the CodeRival token on this machine
  coderival add github|gitlab  Add a forge the site cannot reach (asks for a read-only token)
  coderival add cliproxy       Count tokens from a CLIProxyAPI (--url, --key-file, --host-label)
  coderival remove <host>      Remove a forge (all its accounts) or the CLIProxyAPI
  coderival status             Show what is configured
  coderival schedule           Print a line to run this every 6 hours
  coderival proxy collect      Drain the CLIProxyAPI usage queue into daily token totals (runs until stopped)
  coderival proxy service      Print a systemd or launchd service for the collector

Options:
  --dry-run          Print the exact JSON that would be sent, send nothing
  --days N           Days to cover (default 400 on the first sync, then 35; max 400)
  --no-agents        Do not count agent hours
  --no-forges        Do not count forge PRs and commits
  --no-tokens        Do not send token totals
  --quiet            Only errors and a one-line summary (for cron)
  --no-login         Fail instead of starting a device login when not logged in
  --claude-dir DIR   Claude Code projects folder (default ~/.claude/projects)
  --codex-dir DIR    Codex sessions folder (default ~/.codex/sessions)
  --host HOST        Forge host for add (default github.com or gitlab.com)
  --token-env NAME   Read the forge token from this environment variable instead of asking
  --token-command C  Run C (no shell) at each sync to get the forge token, e.g. "gh auth token"
  --url URL          CLIProxyAPI base URL for add cliproxy, e.g. http://192.168.30.150:8317
  --key-file PATH    File holding the CLIProxyAPI management key (the key is never copied)
  --host-label NAME  Name shown for the proxy (default: the URL host)
  --agent-pattern RE Which user agents count as coding agents (default claude-cli|claude-code|codex|opencode|t3code)
  --server URL       CodeRival site (default https://coderival.cesolutions.dev)
  -h, --help         Show this help
  -v, --version      Show the version
`;

/**
 * @param {string[]} argv
 */
export function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean" },
      days: { type: "string" },
      "no-agents": { type: "boolean" },
      "no-forges": { type: "boolean" },
      "no-tokens": { type: "boolean" },
      quiet: { type: "boolean" },
      "no-login": { type: "boolean" },
      "token-command": { type: "string" },
      url: { type: "string" },
      "key-file": { type: "string" },
      "host-label": { type: "string" },
      "agent-pattern": { type: "string" },
      "claude-dir": { type: "string" },
      "codex-dir": { type: "string" },
      host: { type: "string" },
      "token-env": { type: "string" },
      server: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  let days;
  if (values.days !== undefined) {
    days = Number(values.days);
    if (!Number.isInteger(days) || days < 1 || days > 400) throw new Error("--days must be a whole number from 1 to 400");
  }
  return {
    command: positionals[0] ?? "sync",
    rest: positionals.slice(1),
    dryRun: Boolean(values["dry-run"]),
    days,
    agents: !values["no-agents"],
    forges: !values["no-forges"],
    tokens: !values["no-tokens"],
    quiet: Boolean(values.quiet),
    noLogin: Boolean(values["no-login"]),
    tokenCommand: values["token-command"],
    url: values.url,
    keyFile: values["key-file"],
    hostLabel: values["host-label"],
    agentPattern: values["agent-pattern"],
    claudeDir: values["claude-dir"],
    codexDir: values["codex-dir"],
    host: values.host,
    tokenEnv: values["token-env"],
    server: values.server,
    help: Boolean(values.help),
    version: Boolean(values.version),
  };
}

/** @typedef {ReturnType<typeof parseCli>} CliOptions */
