// @ts-check
// Show the local setup, and print how to run CodeRival every hour.
import { configPath } from "../config.js";
import { defaultAgentDirs } from "../agents/index.js";
import { proxyTokensPath } from "../proxy/cliproxy.js";

/** @param {import("../config.js").Config} config */
export function status(config) {
  const dirs = defaultAgentDirs();
  const lines = [
    `Config:      ${configPath()}`,
    `Server:      ${config.server}`,
    `Logged in:   ${config.token ? "yes" : "no (run coderival login)"}`,
    `Device:      ${config.deviceName} (${config.deviceId})`,
    `Last sync:   ${config.lastSync ?? "never"}`,
    `Claude logs: ${dirs.claude.join(", ")}`,
    `Codex logs:  ${dirs.codex.join(", ")}`,
    `Forges:      ${config.forges.length ? "" : "none"}`,
    ...config.forges.map((forge) => `  ${forge.provider} ${forge.username} on ${forge.host}${forge.tokenCommand ? ` (token from \`${forge.tokenCommand.split(" ")[0]} ...\`)` : ""}`),
    `Tokens:      ${config.cliproxy ? `CLIProxyAPI ${config.cliproxy.hostLabel} (collector file ${proxyTokensPath()})` : "Claude Code and Codex logs"}`,
  ];
  console.log(lines.join("\n"));
}

export function schedule() {
  console.log(`Run CodeRival every hour. Nothing is installed for you; add one of these yourself.

Linux or macOS (crontab -e):
  17 * * * * npx -y github:clintebbesen/coderival-cli sync --quiet >>"$HOME/.cache/coderival.log" 2>&1

macOS launchd: save a LaunchAgent plist in ~/Library/LaunchAgents with
  ProgramArguments = npx -y github:clintebbesen/coderival-cli sync --quiet
  StartInterval = 3600
then run: launchctl load ~/Library/LaunchAgents/<your plist>

Run \`coderival login\` once by hand first, so the scheduled run has a token.`);
}
