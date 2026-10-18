// @ts-check
// A fake fetch that answers from a list of handlers and records every call.

/**
 * @typedef {{ url: URL, method: string, headers: Record<string, string>, body: any }} Call
 * @param {(call: Call) => { status?: number, body?: unknown, headers?: Record<string, string | undefined> }} handler
 */
export function fakeFetch(handler) {
  /** @type {Call[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const impl = async (input, init = {}) => {
    const call = {
      url: new URL(String(input)),
      method: init.method ?? "GET",
      headers: /** @type {Record<string, string>} */ (init.headers ?? {}),
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const { status = 200, body = null, headers = {} } = handler(call);
    return new Response(body === null ? "" : JSON.stringify(body), { status, headers: /** @type {Record<string, string>} */ (headers) });
  };
  return { impl, calls };
}
