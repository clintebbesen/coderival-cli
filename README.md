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
  "client": { "name": "coderival-cli", "version": "0.1.0" },
  "device": { "id": "9b1c2f8e-6d0a-4c4e-9a51-3f0e2b7d1a44", "name": "laptop" },
  "window": { "from": "2025-09-14", "to": "2026-10-18" },
  "agent": { "days": { "2026-10-17": { "claude": 12345, "codex": 600 } } },
  "forges": [
    { "provider": "gitlab", "host": "gitlab.example.com", "username": "dev",
      "days": { "2026-10-17": { "prs": 40, "commits": 120 } } }
  ]
}
```

- `agent.days`: seconds of agent time per UTC day, per tool.
- `forges`: merged PRs or MRs and commits per UTC day, for forges you add yourself.
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
| `coderival remove HOST` | Remove a forge |
| `coderival status` | Show what is set up |
| `coderival schedule` | Print a crontab line to run it every hour (installs nothing) |

Options: `--dry-run`, `--days N` (default 400 on the first sync, then 35), `--no-agents`, `--no-forges`,
`--claude-dir DIR`, `--codex-dir DIR`, `--token-env NAME`, `--server URL` (or `CODERIVAL_SERVER`).

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
