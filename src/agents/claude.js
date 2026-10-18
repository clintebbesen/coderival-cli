// @ts-check
// Classify Claude Code transcript lines (~/.claude/projects/**/*.jsonl).
// Only the line type, timestamp, uuid and the *kind* of user content are read. Message text is never kept.

import { claudeUsageTotal } from "./tokens.js";

/**
 * msgId and tokens are set on assistant lines that carry usage. Streaming writes one message over several
 * lines with the same msgId; `out` (output tokens) picks the most complete one.
 * @typedef {import("./sessions.js").AgentEvent & { uuid?: string, msgId?: string, tokens?: number, out?: number }} ClaudeEvent
 */

/**
 * A user line is a human prompt when it is not a tool result, not injected meta text and not a
 * compaction summary. Background-task notifications also arrive this way; the agent was idle before them.
 * @param {any} line
 */
export function isClaudePrompt(line) {
  if (line.type !== "user" || line.isMeta || line.isCompactSummary) return false;
  const content = line.message?.content;
  if (typeof content === "string") return true;
  if (!Array.isArray(content)) return false;
  return !content.some((block) => block?.type === "tool_result");
}

/**
 * @param {string} text one JSONL line
 * @returns {ClaudeEvent | null}
 */
export function parseClaudeLine(text) {
  if (!text.includes('"type":"user"') && !text.includes('"type":"assistant"')) return null;
  let line;
  try {
    line = JSON.parse(text);
  } catch {
    return null;
  }
  if (line.type !== "user" && line.type !== "assistant") return null;
  const t = Date.parse(line.timestamp);
  if (!Number.isFinite(t)) return null;
  /** @type {ClaudeEvent} */
  const event = { t, prompt: isClaudePrompt(line), uuid: typeof line.uuid === "string" ? line.uuid : undefined };
  const usage = line.type === "assistant" ? line.message?.usage : undefined;
  if (usage && typeof line.message?.id === "string") {
    event.msgId = line.message.id;
    event.tokens = claudeUsageTotal(usage);
    event.out = Number(usage.output_tokens) || 0;
  }
  return event;
}
