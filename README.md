# CodeRival CLI

A little friendly competition never hurt anyone. This is the open-source client for
[CodeRival](https://coderival.cesolutions.dev), the leaderboard for how much developers ship with AI agents.

It runs on your machine, counts a few numbers per day, and sends only those numbers. Never code, never
repo or project names, never PR titles, never your forge tokens.

## Run it

```sh
npx -y github:clintebbesen/coderival-cli
```

The first run opens CodeRival in your browser to link this machine to your profile (you approve a short
code while signed in), then counts and sends. Needs Node 20 or newer. No dependencies.

## What it sends

This is the whole report. Run `coderival --dry-run` to see your own before anything is sent.

```json
{
  "client": { "name": "coderival-cli", "version": "0.2.0" },
  "device": { "id": "9b1c2f8e-6d0a-4c4e-9a51-3f0e2b7d1a44", "name": "laptop" },
  "window": { "from": "2025-09-14", "to": "2026-10-18" },
  "agent": { "days": { "2026-10-17": { "claude": 12345, "codex": 600 } } },
  "forges": [
    { "provider": "gitlab", "host": "gitlab.example.com", "username": "dev",
      "days": { "2026-10-17": { "prs": 40, "commits": 120 } } }
  ],
  "tokens": [{ "source": "logs", "days": { "2026-10-17": 1172000000 } }]
}
```

- `agent.days`: seconds of agent time per UTC day, per tool.
- `forges`: merged PRs or MRs and commits per UTC day, for forges you add yourself.
- `tokens`: a list of total tokens per UTC day: this device's logs (`"source": "logs"`) and, on the device
  that runs the collector, the CLIProxyAPI totals too (`"source": "cliproxy", "host": "<label>"`). See "How tokens are counted".
- `device`: a random id made on first run and the machine name, so two machines add up instead of overwriting each other.
  Change the name in the config file if you want.

The site shows self-hosted hosts as "Self-hosted GitLab", not by name.

## What it never sends

Code, diffs, file names, repo or project names, branch names, PR or MR titles, commit messages, prompts,
chat text, and forge tokens. Forge tokens stay in your local config and are only ever sent to that forge.

## How agent hours are measured

It reads the session logs that Claude Code (`~/.claude/projects/**/*.jsonl`, subagents included) and Codex
(`~/.codex/sessions` and `~/.codex/archived_sessions`) already write. T3 Code runs Claude Code and Codex, so
its sessions are in the same logs.

For each session file it sorts the event times and looks at each pair of neighbouring events (a, b):

- If b is a human prompt (the agent was waiting for a person) or a ends a turn, the gap counts 0.
- Otherwise the agent was working: the gap counts, up to 15 minutes, on b's UTC day.

Sessions that run at the same time add up. That is the point: agent hours, not wall-clock hours.
Only the line type, timestamp and the kind of content (prompt or tool result) are read. Message text is not kept.
Copied lines in resumed Claude sessions are counted once.

## How forge totals are counted

Most people do not need this: link GitHub or GitLab on the website and the site counts for you (Verified).
Use `coderival add` only for a forge the site cannot reach, such as a company GitLab behind a firewall.

- GitHub: merged PRs you authored (search API, by merge date) and commits from your contribution graph.
- GitLab: merged MRs you created (by merge date) and commits from your push events.

## How tokens are counted

Tokens are everything the provider reports as processed for a request: input (uncached, cache reads and cache
writes) plus output (including reasoning). Long agent sessions re-read their context from cache on every step,
so cache reads dominate and the totals are large (billions a month for a heavy user). That is expected.

- **From logs (default):** read in the same pass as agent hours.
  - Claude Code: each assistant message's `usage` (`input_tokens + cache_creation_input_tokens +
    cache_read_input_tokens + output_tokens`). Streaming writes one message over several lines with the same
    message id; each id is counted once (the most complete line), also across resumed or copied session files.
  - Codex: every `token_count` event carries the session's running `total_token_usage.total_tokens` (its input
    already includes cached input). The positive steps between events are counted on the event's UTC day; a
    smaller total (a restarted counter) counts from zero.
- **From CLIProxyAPI:** when all your agents talk to one CLIProxyAPI, its numbers are the most complete.
  CLIProxyAPI v7 and later keep no totals: each request becomes a record on a queue that is kept only
  `redis-usage-queue-retention-seconds` (60 by default), and reading a record removes it. So one machine runs
  `coderival proxy collect` all the time; it reads the queue every 15 seconds, counts successful requests whose
  user agent looks like a coding agent (`claude-cli|claude-code|codex|opencode|t3code`, change with
  `--agent-pattern`), and keeps only tokens per UTC day in `~/.config/coderival/cliproxy-tokens.json`. Run only
  one collector per proxy, and stop any other tool that drains the same queue. Raise the retention in
  CLIProxyAPI to cover collector restarts.
- **No double counting:** every device sends its log totals, and the device running the collector also sends
  the proxy totals. For each day the site counts the larger of the proxy total and the sum of all devices' log
  totals, never both. Days before the collector started keep their log totals.

## Trust label

Numbers from this client are **Attested**: self-reported by this open-source client. It can be modified, so
the site labels it Attested. Numbers the site fetches itself from GitHub or GitLab are labelled Verified.

## Commands

| Command | What it does |
|---|---|
| `coderival` or `coderival sync` | Count and send (logs in first if needed) |
| `coderival login` / `logout` | Link or unlink this machine |
| `coderival add github [--host HOST]` | Add a GitHub or GitHub Enterprise account with a read-only token |
| `coderival add gitlab [--host HOST]` | Add a GitLab account with a `read_api` token |
| `coderival add cliproxy --url URL --key-file PATH [--host-label NAME]` | Count tokens from a CLIProxyAPI (the management key stays in its file) |
| `coderival proxy collect` | Run the CLIProxyAPI collector until stopped |
| `coderival proxy service` | Print a systemd user service or launchd hint for the collector (installs nothing) |
| `coderival remove HOST` | Remove a forge (all accounts on that host) or the CLIProxyAPI |
| `coderival status` | Show what is set up |
| `coderival schedule` | Print a crontab line to run it every 6 hours at a random minute (installs nothing). The site takes one upload per computer every 6 hours; an earlier run sends nothing and exits cleanly |

Options: `--dry-run`, `--days N` (default 400 on the first sync, then 35), `--no-agents`, `--no-forges`,
`--no-tokens`, `--quiet` (cron: errors and one summary line; never starts a login), `--no-login`,
`--claude-dir DIR`, `--codex-dir DIR`, `--token-env NAME`, `--token-command CMD`, `--server URL` (or `CODERIVAL_SERVER`).

`--token-command` saves a command instead of a token and runs it (without a shell) at each sync, so a token that
already lives in another tool is never copied. Example: `coderival add github --token-command "gh auth token"`.
You can add several accounts on one host (personal and company); adding the same account again replaces it.

Tokens for `add`: GitHub fine-grained token with read-only Pull requests, Contents and Metadata on all
repositories (or a classic token with `repo`); GitLab personal access token with only `read_api`.

## Privacy

Config lives in `~/.config/coderival/config.json` (or `$XDG_CONFIG_HOME/coderival`), written mode 600.
Delete it to forget everything locally. Remove your stats from your profile page on the site.

## Develop

```sh
npm install   # dev tools only: TypeScript for type checks
npm run check # type check and tests
```

MIT licence.
