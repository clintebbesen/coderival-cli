// @ts-check
// GitLab (gitlab.com or self-hosted): merged MRs authored by the token's user, and pushed commits, per UTC day.
// Only merge dates and commit counts are kept. Titles, project names and code are never put in the report.
import { addDays, inWindow, utcDay, windowStartIso } from "../days.js";
import { requestOk } from "../http.js";

/** @param {string} host */
export function gitlabApiBase(host) {
  return `https://${host}/api/v4`;
}

/** @param {string} token */
const authHeaders = (token) => ({ "private-token": token });

/**
 * @param {{ apiBase: string, token: string, fetchImpl?: typeof fetch }} forge
 * @returns {Promise<string>} username of the token's user
 */
export async function gitlabWhoami(forge) {
  const { body } = await requestOk(`${forge.apiBase}/user`, { headers: authHeaders(forge.token), fetchImpl: forge.fetchImpl });
  return String(body.username);
}

/**
 * Follow GitLab pagination: keyset `link` headers when present, else `x-next-page`.
 * @param {string} firstUrl
 * @param {{ token: string, fetchImpl?: typeof fetch, onWait?: (ms: number) => void }} forge
 * @param {(item: any) => void} visit
 */
export async function eachPage(firstUrl, forge, visit) {
  /** @type {string | null} */
  let url = firstUrl;
  for (let guard = 0; url && guard < 10_000; guard += 1) {
    const result = await requestOk(url, { headers: authHeaders(forge.token), fetchImpl: forge.fetchImpl, onWait: forge.onWait });
    for (const item of Array.isArray(result.body) ? result.body : []) visit(item);
    url = nextPageUrl(url, result.headers);
  }
}

/** @param {string} url @param {Headers} headers */
export function nextPageUrl(url, headers) {
  const link = headers.get("link");
  const next = link && /<([^>]+)>;\s*rel="next"/.exec(link)?.[1];
  if (next) return next;
  const page = headers.get("x-next-page");
  if (!page) return null;
  const parsed = new URL(url);
  parsed.searchParams.set("page", page);
  return parsed.toString();
}

/**
 * @param {{ apiBase: string, token: string, fetchImpl?: typeof fetch, onWait?: (ms: number) => void }} forge
 * @param {{ from: string, to: string }} window
 */
export async function collectGitlab(forge, window) {
  /** @type {Record<string, { prs: number, commits: number }>} */
  const days = {};
  /** @param {string} day @param {"prs" | "commits"} key @param {number} amount */
  const bump = (day, key, amount) => {
    if (!inWindow(day, window)) return;
    const entry = (days[day] ??= { prs: 0, commits: 0 });
    entry[key] += amount;
  };

  // A merged MR was last updated at or after its merge, so updated_after catches every merge in the window.
  const mrs = new URLSearchParams({
    scope: "created_by_me",
    state: "merged",
    updated_after: windowStartIso(window),
    order_by: "updated_at",
    sort: "asc",
    per_page: "100",
  });
  await eachPage(`${forge.apiBase}/merge_requests?${mrs}`, forge, (mr) => {
    if (mr.merged_at) bump(utcDay(mr.merged_at), "prs", 1);
  });

  // GitLab's `after` is exclusive and date-only, so start one day early and filter by created_at.
  const events = new URLSearchParams({ action: "pushed", after: addDays(window.from, -1), per_page: "100" });
  await eachPage(`${forge.apiBase}/events?${events}`, forge, (event) => {
    const count = Number(event.push_data?.commit_count) || 0;
    if (count > 0 && event.created_at) bump(utcDay(event.created_at), "commits", count);
  });

  return days;
}
