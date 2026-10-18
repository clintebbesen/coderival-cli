// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseClaudeLine } from "../src/agents/claude.js";
import { parseCodexLine } from "../src/agents/codex.js";
import { addCodexTokens, claudeUsageTotal } from "../src/agents/tokens.js";
import { splitCommand, resolveToken } from "../src/token-command.js";

const window = { from: "2026-10-01", to: "2026-10-31" };

test("Claude tokens add input, cache writes, cache reads and output", () => {
  assert.equal(claudeUsageTotal({ input_tokens: 2, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 7 }), 119);
  assert.equal(claudeUsageTotal(null), 0);
  const event = parseClaudeLine('{"type":"assistant","uuid":"a","timestamp":"2026-10-17T00:00:00Z","message":{"id":"m1","usage":{"input_tokens":1,"output_tokens":2}}}');
  assert.equal(event?.msgId, "m1");
  assert.equal(event?.tokens, 3);
  assert.equal(event?.out, 2);
});

test("Codex tokens are the steps of the running total, and a restart counts from zero", () => {
  const line = (/** @type {string} */ ts, /** @type {number} */ total) => parseCodexLine(JSON.stringify({ timestamp: ts, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { total_tokens: total } } } }));
  assert.equal(line("2026-10-17T00:00:00Z", 42)?.cumTokens, 42);
  assert.equal(parseCodexLine('{"timestamp":"2026-10-17T00:00:00Z","type":"event_msg","payload":{"type":"token_count","info":null}}')?.cumTokens, undefined);
  /** @type {Record<string, number>} */
  const days = {};
  const events = [line("2026-10-17T00:00:00Z", 100), line("2026-10-17T01:00:00Z", 100), line("2026-10-18T00:00:00Z", 250), line("2026-10-18T01:00:00Z", 40), line("2026-09-30T01:00:00Z", 9999)];
  addCodexTokens(/** @type {any[]} */ (events), days, window);
  assert.deepEqual(days, { "2026-10-17": 100, "2026-10-18": 190 });
});

test("token commands are split without a shell and their output is trimmed", async () => {
  assert.deepEqual(splitCommand('gh auth token --hostname "github.com"'), ["gh", "auth", "token", "--hostname", "github.com"]);
  assert.equal(await resolveToken({ tokenCommand: "x" }, async () => "tok"), "tok");
  assert.equal(await resolveToken({ token: "saved" }), "saved");
  await assert.rejects(resolveToken({}));
  assert.equal(await resolveToken({ tokenCommand: `${process.execPath} -e "process.stdout.write('  abc\\n')"` }), "abc");
});
