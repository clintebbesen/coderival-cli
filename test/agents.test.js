// @ts-check
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { collectAgentDays } from "../src/agents/index.js";
import { isClaudePrompt, parseClaudeLine } from "../src/agents/claude.js";
import { parseCodexLine } from "../src/agents/codex.js";
import { MAX_GAP_MS, addSessionTime, toSeconds } from "../src/agents/sessions.js";

const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));
const window = { from: "2026-10-01", to: "2026-10-31" };

test("Claude prompts are plain user text, not tool results or meta lines", () => {
  assert.equal(isClaudePrompt({ type: "user", message: { content: "hi" } }), true);
  assert.equal(isClaudePrompt({ type: "user", message: { content: [{ type: "text", text: "hi" }] } }), true);
  assert.equal(isClaudePrompt({ type: "user", message: { content: [{ type: "image" }, { type: "text" }] } }), true);
  assert.equal(isClaudePrompt({ type: "user", message: { content: [{ type: "tool_result" }] } }), false);
  assert.equal(isClaudePrompt({ type: "user", isMeta: true, message: { content: "x" } }), false);
  assert.equal(isClaudePrompt({ type: "user", isCompactSummary: true, message: { content: "x" } }), false);
  assert.equal(isClaudePrompt({ type: "assistant", message: { content: "x" } }), false);
});

test("Claude lines without a timestamp or of other types are ignored", () => {
  assert.equal(parseClaudeLine('{"type":"ai-title","title":"x"}'), null);
  assert.equal(parseClaudeLine('{"type":"user","message":{"content":"x"}}'), null);
  assert.equal(parseClaudeLine("not json"), null);
  const event = parseClaudeLine('{"type":"assistant","uuid":"a","timestamp":"2026-10-17T00:00:00Z","message":{"content":[]}}');
  assert.deepEqual(event, { t: Date.parse("2026-10-17T00:00:00Z"), prompt: false, uuid: "a" });
});

test("Codex turn starts are prompts and turn ends close the turn", () => {
  const start = parseCodexLine('{"timestamp":"2026-10-17T09:00:00Z","type":"event_msg","payload":{"type":"task_started"}}');
  const end = parseCodexLine('{"timestamp":"2026-10-17T09:00:00Z","type":"event_msg","payload":{"type":"task_complete"}}');
  const work = parseCodexLine('{"timestamp":"2026-10-17T09:00:00Z","type":"response_item","payload":{"type":"function_call"}}');
  assert.equal(start?.prompt, true);
  assert.equal(end?.turnEnd, true);
  assert.deepEqual(work, { t: Date.parse("2026-10-17T09:00:00Z"), prompt: false, turnEnd: false });
  assert.equal(parseCodexLine('{"timestamp":"2026-10-17T09:00:00Z","type":"session_meta","payload":{}}'), null);
});

test("gaps are capped, idle before prompts, and land on the later event's UTC day", () => {
  /** @type {import("../src/agents/sessions.js").DayTotalsMs} */
  const totals = {};
  const at = (/** @type {string} */ iso) => Date.parse(iso);
  addSessionTime(
    [
      { t: at("2026-10-16T23:59:50Z") },
      { t: at("2026-10-17T00:00:10Z") }, // 20s, counted on the 17th
      { t: at("2026-10-17T02:00:00Z") }, // capped at 15 minutes
      { t: at("2026-10-17T02:00:00Z") }, // duplicate timestamp, merged
      { t: at("2026-10-17T03:00:00Z"), prompt: true }, // waiting for a person: 0
      { t: at("2026-10-17T03:00:30Z") }, // 30s
    ],
    "claude",
    window,
    totals,
  );
  assert.deepEqual(toSeconds(totals), { "2026-10-17": { claude: 20 + MAX_GAP_MS / 1000 + 30 } });
});

test("time outside the window is dropped", () => {
  /** @type {import("../src/agents/sessions.js").DayTotalsMs} */
  const totals = {};
  addSessionTime([{ t: Date.parse("2026-09-30T10:00:00Z") }, { t: Date.parse("2026-09-30T10:01:00Z") }], "codex", window, totals);
  assert.deepEqual(toSeconds(totals), {});
});

test("collectAgentDays totals fixture sessions, subagents and skips resumed copies", async () => {
  const result = await collectAgentDays({
    window,
    claudeDirs: [join(fixtures, "claude")],
    codexDirs: [join(fixtures, "codex"), join(fixtures, "missing-folder")],
  });
  // Main session 980s (5 + 60 + 900 capped + 5 + 10), subagent 150s; the resumed copy adds nothing.
  // Codex 400s (10 + 300 + 10, idle across the turn break, then 20 + 60).
  assert.deepEqual(result.days, { "2026-10-17": { claude: 1130, codex: 400 } });
  assert.deepEqual(result.files, { claude: 3, codex: 1 });
});
