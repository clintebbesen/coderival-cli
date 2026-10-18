// @ts-check
// GitHub (github.com or GitHub Enterprise): merged PRs authored by the token's user, and commits, per UTC day.
// Only merge dates and commit counts are kept. Titles, repo names and code are never read into the report.
import { addDays, inWindow, utcDay, windowEndIso, windowStartIso } from "../days.js";
import { requestOk } from "../http.js";

const SEARCH_LIMIT = 1000;

/** @param {string} host */
export function githubApiBase(host) {
  return host === "github.com" ? "https://api.github.com" : `https://${host}/api/v3`;
}

/** @param {string} apiBase */
function graphqlUrl(apiBase) {
  return apiBase.endsWith("/api/v3") ? apiBase.replace(/\/api\/v3$/, "/api/graphql") : `${apiBase}/graphql`;
}

/** @param {string} token */
const authHeaders = (token) => ({ authorization: `Bearer ${token}`, accept: "application/vnd.github+json" });

/**
 * @param {{ apiBase: string, token: string, fetchImpl?: typeof fetch }} forge
 * @returns {Promise<string>} login of the token's user
 */
export async function githubWhoami(forge) {
  const { body } = await requestOk(`${forge.apiBase}/user`, { headers: authHeaders(forge.token), fetchImpl: forge.fetchImpl });
  return String(body.login);
}

/**
 * Count merged PRs in [from, to] (UTC days, inclusive) into `days`, splitting ranges the search API cannot list.
 * @param {{ apiBase: string, token: string, username: string, fetchImpl?: typeof fetch, onWait?: (ms: number) => void }} forge
 * @param {string} from
 * @param {string} to
 * @param {Record<string, { prs: number, commits: number }>} days
 */
export async function countMergedPrs(forge, from, to, days) {
  const query = `author:${forge.username} is:pr is:merged merged:${from}..${to}`;
  const options = { headers: authHeaders(forge.token), fetchImpl: forge.fetchImpl, onWait: forge.onWait };
  const first = await requestOk(searchUrl(forge.apiBase, query, 1), options);
  const total = Number(first.body.total_count) || 0;
  if (total > SEARCH_LIMIT && from < to) {
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    const mid = addDays(from, Math.floor(span / 2));
    await countMergedPrs(forge, from, mid, days);
    await countMergedPrs(forge, addDays(mid, 1), to, days);
    return;
  }
  // A single day with more than 1000 merges cannot be listed; use the exact count instead.
  if (total > SEARCH_LIMIT) {
    bump(days, from, "prs", total);
    return;
  }
  let items = first.body.items ?? [];
  for (let page = 1; ; page += 1) {
    for (const item of items) {
      const mergedAt = item.pull_request?.merged_at;
      if (mergedAt) bump(days, utcDay(mergedAt), "prs", 1);
    }
    if (items.length < 100 || page * 100 >= total) break;
    items = (await requestOk(searchUrl(forge.apiBase, query, page + 1), options)).body.items ?? [];
  }
}

/** @param {string} apiBase @param {string} query @param {number} page */
function searchUrl(apiBase, query, page) {
  const params = new URLSearchParams({ q: query, per_page: "100", page: String(page), sort: "created", order: "asc" });
  return `${apiBase}/search/issues?${params}`;
}

const COMMITS_QUERY = `query($from: DateTime!, $to: DateTime!) {
  viewer { contributionsCollection(from: $from, to: $to) {
    commitContributionsByRepository(maxRepositories: 100) {
      contributions(first: 100) { nodes { occurredAt commitCount } }
    }
  } }
}`;

/**
 * Commits per day from the contribution graph (GitHub counts commits on default branches).
 * Contributions per repository are one node per active day, so 90-day chunks never exceed the 100 nodes asked for.
 * @param {{ apiBase: string, token: string, fetchImpl?: typeof fetch }} forge
 * @param {{ from: string, to: string }} window
 * @param {Record<string, { prs: number, commits: number }>} days
 */
export async function countCommits(forge, window, days) {
  for (const chunk of dayChunks(window, 90)) {
    const { body } = await requestOk(graphqlUrl(forge.apiBase), {
      method: "POST",
      headers: authHeaders(forge.token),
      body: { query: COMMITS_QUERY, variables: { from: chunk.fromIso, to: chunk.toIso } },
      fetchImpl: forge.fetchImpl,
    });
    if (body.errors?.length) throw new Error(`GitHub GraphQL: ${body.errors[0].message}`);
    const repos = body.data?.viewer?.contributionsCollection?.commitContributionsByRepository ?? [];
    for (const repo of repos) {
      for (const node of repo.contributions?.nodes ?? []) {
        bump(days, utcDay(node.occurredAt), "commits", Number(node.commitCount) || 0);
      }
    }
  }
}

/**
 * Split the window into chunks of at most `size` days (GitHub also caps a contributions query at one year).
 * @param {{ from: string, to: string }} window
 * @param {number} size
 */
export function dayChunks(window, size) {
  const chunks = [];
  let from = window.from;
  while (from <= window.to) {
    const lastDay = addDays(from, size - 1) < window.to ? addDays(from, size - 1) : window.to;
    chunks.push({ fromIso: windowStartIso({ from }), toIso: new Date(Date.parse(windowEndIso({ to: lastDay })) - 1000).toISOString() });
    from = addDays(lastDay, 1);
  }
  return chunks;
}

/**
 * @param {Record<string, { prs: number, commits: number }>} days
 * @param {string} day @param {"prs" | "commits"} key @param {number} amount
 */
function bump(days, day, key, amount) {
  const entry = (days[day] ??= { prs: 0, commits: 0 });
  entry[key] += amount;
}

/**
 * @param {{ apiBase: string, token: string, username: string, fetchImpl?: typeof fetch, onWait?: (ms: number) => void }} forge
 * @param {{ from: string, to: string }} window
 */
export async function collectGithub(forge, window) {
  /** @type {Record<string, { prs: number, commits: number }>} */
  const days = {};
  await countMergedPrs(forge, window.from, window.to, days);
  await countCommits(forge, window, days);
  for (const day of Object.keys(days)) if (!inWindow(day, window)) delete days[day];
  return days;
}
