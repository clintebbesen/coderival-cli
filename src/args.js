// @ts-check
// Command-line parsing on top of node:util parseArgs.
import { parseArgs } from "node:util";

export const HELP = `coderival: send your daily coding totals to CodeRival. Never code, never names, only numbers.

Usage:
  coderival [sync]             Count and send (logs in first if needed)
  coderival login              Link this machine to your CodeRival profile
  coderival logout             Forget the CodeRival token on this machine
  coderival add github|gitlab  Add a forge the site cannot reach (asks for a read-only token)
  coderival remove <host>      Remove a forge
  coderival status             Show what is configured
  coderival schedule           Print a line to run this every hour

Options:
  --dry-run          Print the exact JSON that would be sent, send nothing
  --days N           Days to cover (default 400 on the first sync, then 35; max 400)
  --no-agents        Do not count agent hours
  --no-forges        Do not count forge PRs and commits
  --claude-dir DIR   Claude Code projects folder (default ~/.claude/projects)
  --codex-dir DIR    Codex sessions folder (default ~/.codex/sessions)
  --host HOST        Forge host for add (default github.com or gitlab.com)
  --token-env NAME   Read the forge token from this environment variable instead of asking
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
