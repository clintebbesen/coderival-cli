// @ts-check
// Device login: the site shows a code, you approve it while signed in, this machine gets its own token.
import { spawn } from "node:child_process";
import { saveConfig } from "../config.js";
import { sleep } from "../http.js";
import { pollDeviceLogin, startDeviceLogin } from "../server.js";

/** @param {string} target */
function openBrowser(target) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", target] : [target];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // No browser on this machine; the printed link is enough.
  }
}

/**
 * @param {import("../config.js").Config} config
 * @param {{ log?: (line: string) => void, fetchImpl?: typeof fetch, wait?: (ms: number) => Promise<void>, open?: (url: string) => void }} [deps]
 */
export async function login(config, deps = {}) {
  const { log = console.error, fetchImpl, wait = sleep, open = openBrowser } = deps;
  const start = await startDeviceLogin(config.server, config.deviceName, fetchImpl);
  log(`Open this link and approve the code ${start.userCode}:`);
  log(`  ${start.verifyUrl}`);
  open(start.verifyUrl);
  const deadline = Date.now() + (start.expiresIn || 600) * 1000;
  while (Date.now() < deadline) {
    await wait(Math.max(1, start.interval || 5) * 1000);
    const result = await pollDeviceLogin(config.server, start.deviceCode, fetchImpl);
    if (result.status === "done") {
      config.token = result.token;
      await saveConfig(config);
      log(`Linked to ${result.profile.name} (${result.profile.url}).`);
      return result.profile;
    }
  }
  throw new Error("The login code expired. Run `coderival login` again.");
}

/** @param {import("../config.js").Config} config */
export async function logout(config) {
  delete config.token;
  await saveConfig(config);
  console.error("Logged out on this machine. Your stats stay on the site; remove them from your profile page.");
}
