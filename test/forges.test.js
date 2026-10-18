// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, windowFor } from "../src/days.js";
import { collectGithub, countMergedPrs, dayChunks } from "../src/forges/github.js";
import { collectGitlab, nextPageUrl } from "../src/forges/gitlab.js";
import { fakeFetch } from "./helpers.js";

test("windowFor covers N inclusive UTC days ending today", () => {
  assert.deepEqual(windowFor(1, new Date("2026-10-18T23:00:00Z")), { from: "2026-10-18", to: "2026-10-18" });
  assert.deepEqual(windowFor(35, new Date("2026-10-18T01:00:00Z")), { from: "2026-09-14", to: "2026-10-18" });
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("dayChunks splits a long window into at most 90-day pieces", () => {
  const chunks = dayChunks({ from: "2025-09-14", to: "2026-10-18" }, 90);
  assert.equal(chunks.length, 5);
  assert.equal(chunks[0].fromIso, "2025-09-14T00:00:00Z");
  assert.equal(chunks[0].toIso, "2025-12-12T23:59:59.000Z");
  assert.equal(chunks.at(-1)?.toIso, "2026-10-18T23:59:59.000Z");
});

test("GitHub search splits ranges over 1000 results and buckets by merge day", async () => {
  const { impl, calls } = fakeFetch(({ url }) => {
    const range = /merged:(\S+)\.\.(\S+)/.exec(url.searchParams.get("q") ?? "");
    assert.ok(range);
    const [, from, to] = range;
    if (from === "2026-10-01" && to === "2026-10-04") return { body: { total_count: 1500, items: [] } };
    const item = { pull_request: { merged_at: `${from}T12:00:00Z` } };
    return { body: { total_count: 1, items: [item] } };
  });
  /** @type {Record<string, { prs: number, commits: number }>} */
  const days = {};
  await countMergedPrs({ apiBase: "https://api.github.com", token: "t", username: "octo", fetchImpl: impl }, "2026-10-01", "2026-10-04", days);
  assert.deepEqual(days, { "2026-10-01": { prs: 1, commits: 0 }, "2026-10-03": { prs: 1, commits: 0 } });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].headers.authorization, "Bearer t");
});

test("GitHub pages through results and counts commits from GraphQL", async () => {
  const { impl } = fakeFetch(({ url, body }) => {
    if (url.pathname === "/graphql") {
      assert.ok(body.query.includes("contributionsCollection"));
      const nodes = body.variables.from.startsWith("2026-10-01") ? [{ occurredAt: "2026-10-02T07:00:00Z", commitCount: 4 }] : [];
      return { body: { data: { viewer: { contributionsCollection: { commitContributionsByRepository: [{ contributions: { nodes } }] } } } } };
    }
    const page = Number(url.searchParams.get("page"));
    const items = Array.from({ length: page === 1 ? 100 : 5 }, () => ({ pull_request: { merged_at: "2026-10-02T01:00:00Z" } }));
    return { body: { total_count: 105, items } };
  });
  const days = await collectGithub({ apiBase: "https://api.github.com", token: "t", username: "octo", fetchImpl: impl }, { from: "2026-10-01", to: "2026-10-03" });
  assert.deepEqual(days, { "2026-10-02": { prs: 105, commits: 4 } });
});

test("GitLab follows pagination and counts merges and pushed commits in the window", async () => {
  const { impl, calls } = fakeFetch((/** @type {any} */ { url }) => {
    if (url.pathname.endsWith("/merge_requests")) {
      if (url.searchParams.get("page") === "2") return { body: [{ merged_at: "2026-10-02T03:00:00Z" }, { merged_at: "2026-09-20T03:00:00Z" }] };
      return { body: [{ merged_at: "2026-10-02T01:00:00Z" }, { merged_at: null }], headers: { "x-next-page": "2" } };
    }
    if (url.searchParams.get("cursor") === "abc") return { body: [{ created_at: "2026-10-03T05:00:00Z", push_data: { commit_count: 2 } }] };
    return {
      body: [{ created_at: "2026-10-02T05:00:00Z", push_data: { commit_count: 3 } }, { created_at: "2026-09-30T05:00:00Z", push_data: { commit_count: 9 } }],
      headers: { link: `<https://gitlab.example.com/api/v4/events?cursor=abc>; rel="next"` },
    };
  });
  const days = await collectGitlab({ apiBase: "https://gitlab.example.com/api/v4", token: "g", fetchImpl: impl }, { from: "2026-10-01", to: "2026-10-03" });
  assert.deepEqual(days, { "2026-10-02": { prs: 2, commits: 3 }, "2026-10-03": { prs: 0, commits: 2 } });
  assert.equal(calls[0].headers["private-token"], "g");
  assert.equal(calls[0].url.searchParams.get("scope"), "created_by_me");
  assert.equal(calls.find((c) => c.url.pathname.endsWith("/events"))?.url.searchParams.get("after"), "2026-09-30");
});

test("nextPageUrl stops when there is no next page", () => {
  assert.equal(nextPageUrl("https://x/api/v4/merge_requests?page=1", new Headers()), null);
});

test("rate-limited requests wait and retry", async () => {
  let first = true;
  const { impl, calls } = fakeFetch(() => {
    if (first) {
      first = false;
      return { status: 403, body: { message: "rate" }, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000)) } };
    }
    return { body: { total_count: 0, items: [] } };
  });
  const waits = [];
  await countMergedPrs({ apiBase: "https://api.github.com", token: "t", username: "o", fetchImpl: impl, onWait: (ms) => waits.push(ms) }, "2026-10-01", "2026-10-01", {});
  assert.equal(calls.length, 2);
  assert.equal(waits.length, 1);
});
