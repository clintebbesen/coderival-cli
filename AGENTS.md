# CodeRival CLI: agent rules

Public, open-source client for CodeRival (site repo: gitlab.clint.earth/ce-ai/ce-ai-solutions/coderival, private).

## Product rules

- Send only daily totals. Never code, names, titles, messages, prompts or forge tokens. `src/report.js` is the
  whole payload; any new field needs Clint's OK and a README update.
- Zero runtime dependencies. Plain ESM JavaScript with `// @ts-check` and JSDoc, Node 20+, no build step, no
  `prepare` script, so `npx -y github:clintebbesen/coderival-cli` works.
- The server contract (`/api/cli/device`, `/api/cli/device/poll`, `/api/cli/me`, `/api/cli/report`) is shared
  with the site. Change both together.
- The agent-hours rule is documented in README.md; keep code and README in step.
- No em or en dashes in any file.

## Checks

`bash scripts/verify.sh` (type check and tests). The MR pipeline runs the same.

## Hosting and release

- GitLab: https://gitlab.clint.earth/ce-ai/ce-ai-solutions/coderival-cli (private, `main` protected).
- Public mirror: https://github.com/clintebbesen/coderival-cli (remote `github`).
- Release: merge to `main` on GitLab when green, then push the same `main` to GitHub
  (`git push github main`). Bump `package.json` and `src/version.js` together.

## Journal

Record each request and its outcome in `docs/journal/YYYY-MM-DD.md`.
