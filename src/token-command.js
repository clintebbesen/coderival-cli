// @ts-check
// Forge tokens can come from a command (for example `gh auth token`) so the token is never copied into the config.
import { execFile } from "node:child_process";

/**
 * Split a command line on spaces, keeping "double" or 'single' quoted parts together. No shell is used.
 * @param {string} command
 */
export function splitCommand(command) {
  const parts = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return parts.map((part) => (/^(["']).*\1$/.test(part) ? part.slice(1, -1) : part));
}

/**
 * @param {string} command
 * @returns {Promise<string>}
 */
export function runTokenCommand(command) {
  const [file, ...args] = splitCommand(command);
  if (!file) return Promise.reject(new Error("Empty token command"));
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 30_000, maxBuffer: 64 * 1024 }, (error, stdout) => {
      if (error) return reject(new Error(`Token command "${file}" failed: ${error.message.split("\n")[0]}`));
      const token = String(stdout).trim();
      if (!token) return reject(new Error(`Token command "${file}" printed nothing`));
      resolve(token);
    });
  });
}

/**
 * @param {{ token?: string, tokenCommand?: string }} forge
 * @param {(command: string) => Promise<string>} [run]
 */
export async function resolveToken(forge, run = runTokenCommand) {
  if (forge.tokenCommand) return run(forge.tokenCommand);
  if (forge.token) return forge.token;
  throw new Error("No token or token command configured");
}
