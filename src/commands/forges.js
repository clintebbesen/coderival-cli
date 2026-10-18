// @ts-check
// Add or remove a forge the site cannot reach. The token stays in the local config and only goes to that forge.
import { saveConfig } from "../config.js";
import { apiBaseFor, defaultHost, scopeHelp, whoami } from "../forges/index.js";
import { askHidden } from "../prompt.js";

/**
 * @param {import("../config.js").Config} config
 * @param {string | undefined} kind
 * @param {{ host?: string, tokenEnv?: string }} options
 * @param {{ log?: (line: string) => void, ask?: (question: string) => Promise<string>, fetchImpl?: typeof fetch }} [deps]
 */
export async function addForge(config, kind, options, deps = {}) {
  const { log = console.error, ask = askHidden, fetchImpl } = deps;
  if (kind !== "github" && kind !== "gitlab") throw new Error("Usage: coderival add github|gitlab [--host HOST]");
  const host = normaliseHost(options.host || defaultHost(kind));
  const apiBase = apiBaseFor(kind, host);
  log(scopeHelp(kind));

  let token;
  if (options.tokenEnv) {
    token = process.env[options.tokenEnv];
    if (!token) throw new Error(`Environment variable ${options.tokenEnv} is empty`);
  } else {
    token = await ask(`Token for ${host} (hidden): `);
  }
  if (!token) throw new Error("No token given");

  const username = await whoami({ provider: kind, apiBase, token, fetchImpl });
  config.forges = config.forges.filter((forge) => forge.host !== host);
  config.forges.push({ provider: kind, host, apiBase, username, token });
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
