// @ts-check
// Calls to the CodeRival site. Only the CodeRival token is sent here, never a forge token.
import { requestJson, requestOk } from "./http.js";

/**
 * @typedef {{ slug: string, name: string, url: string }} Profile
 * @typedef {{ provider: string, host: string, username: string }} VerifiedForge
 */

/** @param {string} server @param {string} path */
const url = (server, path) => `${server.replace(/\/+$/, "")}${path}`;

/**
 * @param {string} server
 * @param {string} deviceName
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ deviceCode: string, userCode: string, verifyUrl: string, interval: number, expiresIn: number }>}
 */
export async function startDeviceLogin(server, deviceName, fetchImpl) {
  return (await requestOk(url(server, "/api/cli/device"), { method: "POST", body: { deviceName }, fetchImpl })).body;
}

/**
 * @param {string} server
 * @param {string} deviceCode
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ status: "pending" } | { status: "done", token: string, profile: Profile }>}
 */
export async function pollDeviceLogin(server, deviceCode, fetchImpl) {
  const result = await requestJson(url(server, "/api/cli/device/poll"), { method: "POST", body: { deviceCode }, fetchImpl });
  if (result.status === 428) return { status: "pending" };
  if (result.status === 200) return { status: "done", token: result.body.token, profile: result.body.profile };
  if (result.status === 410) throw new Error(result.body?.error || "The login code expired or was denied. Run `coderival login` again.");
  throw new Error(result.body?.error || `Login failed with HTTP ${result.status}`);
}

/**
 * @param {string} server
 * @param {string} token
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ profile: Profile, verifiedForges: VerifiedForge[] }>}
 */
export async function getMe(server, token, fetchImpl) {
  return (await requestOk(url(server, "/api/cli/me"), { headers: { authorization: `Bearer ${token}` }, fetchImpl })).body;
}

/**
 * @param {string} server
 * @param {string} token
 * @param {unknown} payload
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ ok: boolean, profileUrl: string, accepted: { agentDays: number, forges: { host: string, username: string, status: string }[] } }>}
 */
export async function sendReport(server, token, payload, fetchImpl) {
  return (await requestOk(url(server, "/api/cli/report"), { method: "POST", headers: { authorization: `Bearer ${token}` }, body: payload, fetchImpl })).body;
}
