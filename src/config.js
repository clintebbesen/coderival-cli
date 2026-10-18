// @ts-check
// Local config. It holds the CodeRival token and any forge tokens, so it is always written mode 600.
import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_SERVER = "https://coderival.cesolutions.dev";

/**
 * @typedef {{ provider: "github" | "gitlab", host: string, apiBase: string, username: string, token: string }} Forge
 * @typedef {{ server: string, token?: string, deviceId: string, deviceName: string, forges: Forge[], lastSync?: string }} Config
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
    lastSync: stored.lastSync,
  };
}

/**
 * Write atomically with mode 600 so tokens are never readable by other users.
 * @param {Config} config
 * @param {string} [path]
 */
export async function saveConfig(config, path = configPath()) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
}
