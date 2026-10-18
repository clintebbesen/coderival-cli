// @ts-check
// Small fetch wrapper: JSON in, JSON out, a clear error message on failure, and rate-limit waits.

/** @typedef {typeof fetch} Fetch */

export class HttpError extends Error {
  /** @param {string} message @param {number} status @param {any} body */
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** @param {number} ms */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {Response} response
 * @returns {Promise<any>}
 */
async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 300) };
  }
}

/**
 * How long to wait before retrying a rate-limited forge request, or null if it is not a rate limit.
 * @param {Response} response
 * @param {number} now
 */
export function rateLimitWaitMs(response, now = Date.now()) {
  if (response.status !== 403 && response.status !== 429) return null;
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && Number.isFinite(Number(retryAfter))) return Number(retryAfter) * 1000;
  const remaining = response.headers.get("x-ratelimit-remaining") ?? response.headers.get("ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset") ?? response.headers.get("ratelimit-reset");
  if (remaining === "0" && reset) return Math.max(1000, Number(reset) * 1000 - now + 1000);
  if (response.status === 429) return 60_000;
  return null;
}

/**
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: unknown, fetchImpl?: Fetch, retries?: number, onWait?: (ms: number) => void }} [options]
 * @returns {Promise<{ status: number, body: any, headers: Headers }>}
 */
export async function requestJson(url, options = {}) {
  const { method = "GET", headers = {}, body, fetchImpl = fetch, retries = 5, onWait } = options;
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetchImpl(url, {
      method,
      headers: {
        accept: "application/json",
        "user-agent": "coderival-cli",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const wait = rateLimitWaitMs(response);
    if (wait !== null && attempt < retries) {
      await response.text().catch(() => "");
      onWait?.(wait);
      await sleep(Math.min(wait, 15 * 60_000));
      continue;
    }
    const parsed = await readBody(response);
    return { status: response.status, body: parsed, headers: response.headers };
  }
}

/**
 * Like requestJson, but throws HttpError on any non-2xx status.
 * @param {string} url
 * @param {Parameters<typeof requestJson>[1]} [options]
 */
export async function requestOk(url, options) {
  const result = await requestJson(url, options);
  if (result.status < 200 || result.status >= 300) {
    const message = result.body?.error || result.body?.message || `HTTP ${result.status}`;
    throw new HttpError(`${message} (${new URL(url).host})`, result.status, result.body);
  }
  return result;
}
