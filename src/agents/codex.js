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
 * @param {string} text
 * @returns {import("./sessions.js").AgentEvent | null}
 */
export function parseCodexLine(text) {
  const head = readHead(text);
  if (!head || head.type === "session_meta") return null;
  const t = Date.parse(head.timestamp);
  if (!Number.isFinite(t)) return null;
  const isEvent = head.type === "event_msg";
  return {
    t,
    prompt: isEvent && TURN_START.has(head.payloadType),
    turnEnd: isEvent && TURN_END.has(head.payloadType),
  };
}
