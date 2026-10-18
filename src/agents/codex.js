// @ts-check
// Classify Codex rollout lines (~/.codex/sessions/**/*.jsonl).
// Rollout lines start with {"timestamp":...,"type":...,"payload":{"type":...}, so the first few hundred
// characters are enough. Lines can be megabytes long, so the rest is never parsed when the prefix matches.

const TURN_START = new Set(["task_started", "turn_started", "user_message"]);
const TURN_END = new Set(["task_complete", "turn_complete", "turn_aborted"]);
const HEAD = 400;

/**
 * @param {string} text one JSONL line
 * @returns {{ timestamp: string, type: string, payloadType: string } | null}
 */
function readHead(text) {
  const head = text.slice(0, HEAD);
  const timestamp = /"timestamp":"([^"]+)"/.exec(head)?.[1];
  const type = /"type":"([a-z_]+)"/.exec(head)?.[1];
  const payloadType = /"payload":\{"type":"([a-z_]+)"/.exec(head)?.[1] ?? "";
  if (timestamp && type) return { timestamp, type, payloadType };
  try {
    const line = JSON.parse(text);
    if (typeof line.timestamp !== "string" || typeof line.type !== "string") return null;
    return { timestamp: line.timestamp, type: line.type, payloadType: String(line.payload?.type ?? "") };
  } catch {
    return null;
  }
}

/**
 * token_count events are small, so they are parsed in full for the running session total.
 * @param {string} text
 * @returns {number | undefined}
 */
function cumulativeTokens(text) {
  try {
    const total = JSON.parse(text).payload?.info?.total_token_usage?.total_tokens;
    return typeof total === "number" && Number.isFinite(total) ? total : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @typedef {import("./sessions.js").AgentEvent & { cumTokens?: number }} CodexEvent
 * @param {string} text
 * @returns {CodexEvent | null}
 */
export function parseCodexLine(text) {
  const head = readHead(text);
  if (!head || head.type === "session_meta") return null;
  const t = Date.parse(head.timestamp);
  if (!Number.isFinite(t)) return null;
  const isEvent = head.type === "event_msg";
  /** @type {CodexEvent} */
  const event = {
    t,
    prompt: isEvent && TURN_START.has(head.payloadType),
    turnEnd: isEvent && TURN_END.has(head.payloadType),
  };
  if (isEvent && head.payloadType === "token_count") {
    const total = cumulativeTokens(text);
    if (total !== undefined) event.cumTokens = total;
  }
  return event;
}
