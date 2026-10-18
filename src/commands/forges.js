// @ts-check
// Add or remove a forge the site cannot reach. The token stays in the local config and only goes to that forge.
import { saveConfig } from "../config.js";
import { apiBaseFor, defaultHost, scopeHelp, whoami } from "../forges/index.js";
import { askHidden } from "../prompt.js";
import { runTokenCommand } from "../token-command.js";

/**
 * @param {import("../config.js").Config} config
 * @param {string | undefined} kind
 * @param {{ host?: string, tokenEnv?: string, tokenCommand?: string }} options
 * @param {{ log?: (line: string) => void, ask?: (question: string) => Promise<string>, fetchImpl?: typeof fetch, run?: (command: string) => Promise<string> }} [deps]
 */
export async function addForge(config, kind, options, deps = {}) {
  const { log = console.error, ask = askHidden, fetchImpl, run = runTokenCommand } = deps;
  if (kind !== "github" && kind !== "gitlab") throw new Error("Usage: coderival add github|gitlab|cliproxy [--host HOST]");
  const host = normaliseHost(options.host || defaultHost(kind));
  const apiBase = apiBaseFor(kind, host);
  log(scopeHelp(kind));

  let token;
  if (options.tokenCommand) {
    // Run it once now to check it; only the command is saved, the token stays wherever it lives.
    token = await run(options.tokenCommand);
  } else if (options.tokenEnv) {
    token = process.env[options.tokenEnv];
    if (!token) throw new Error(`Environment variable ${options.tokenEnv} is empty`);
  } else {
    token = await ask(`Token for ${host} (hidden): `);
  }
  if (!token) throw new Error("No token given");

  const username = await whoami({ provider: kind, apiBase, token, fetchImpl });
  // Several accounts on one host are fine (personal and company); the same account is replaced.
  config.forges = config.forges.filter((forge) => !(forge.host === host && forge.username.toLowerCase() === username.toLowerCase()));
  config.forges.push(options.tokenCommand
    ? { provider: kind, host, apiBase, username, tokenCommand: options.tokenCommand }
    : { provider: kind, host, apiBase, username, token });
  await saveConfig(config);
  log(`Added ${username} on ${host}. Run \`coderival\` to send.`);
}

/**
 * @param {import("../config.js").Config} config
 * @param {string | undefined} host
 */
export async function removeForge(config, host) {
  if (!host) throw new Error("Usage: coderival remove <host>");
  const target = normaliseHost(host);
  if (config.cliproxy && normaliseHost(config.cliproxy.hostLabel) === target) {
    delete config.cliproxy;
    await saveConfig(config);
    console.error(`Removed CLIProxyAPI ${target}. Stop its collector service too.`);
    return;
  }
  const before = config.forges.length;
  config.forges = config.forges.filter((forge) => forge.host !== target);
  if (config.forges.length === before) throw new Error(`No forge for ${target}`);
  await saveConfig(config);
  console.error(`Removed ${target}. Remove its stats from your profile page on the site if you want them gone.`);
}

/** @param {string} host */
export function normaliseHost(host) {
  return host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}
