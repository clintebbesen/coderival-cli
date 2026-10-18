// @ts-check
// Local config. It holds the CodeRival token and any forge tokens, so it is always written mode 600.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { writeJsonAtomic } from "./files.js";

export const DEFAULT_SERVER = "https://coderival.cesolutions.dev";

/**
 * A forge keeps either a token or a command that prints one (for example `gh auth token`), never both.
 * @typedef {{ provider: "github" | "gitlab", host: string, apiBase: string, username: string, token?: string, tokenCommand?: string }} Forge
 * The CLIProxyAPI management key is read from keyFile at use; it is never copied into this config.
 * @typedef {{ url: string, hostLabel: string, keyFile: string, agentPattern?: string }} CliProxy
 * @typedef {{ server: string, token?: string, deviceId: string, deviceName: string, forges: Forge[], cliproxy?: CliProxy, lastSync?: string }} Config
 */

/** @param {NodeJS.ProcessEnv} [env] */
export function configPath(env = process.env) {
  const base = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "coderival", "config.json");
}

/**
 * @param {string} [path]
 * @returns {Promise<Config>}
 */
export async function loadConfig(path = configPath()) {
  /** @type {Partial<Config>} */
  let stored = {};
  try {
    stored = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") throw error;
  }
  return {
    server: stored.server || DEFAULT_SERVER,
    token: stored.token,
    deviceId: stored.deviceId || randomUUID(),
    deviceName: stored.deviceName || hostname(),
    forges: Array.isArray(stored.forges) ? stored.forges : [],
    ...(stored.cliproxy ? { cliproxy: stored.cliproxy } : {}),
    lastSync: stored.lastSync,
  };
}

/**
 * Write atomically with mode 600 so tokens are never readable by other users.
 * @param {Config} config
 * @param {string} [path]
 */
export async function saveConfig(config, path = configPath()) {
  await writeJsonAtomic(path, config);
}
