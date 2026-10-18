// @ts-check
// UTC day helpers. Every day CodeRival sees is a UTC calendar date, "YYYY-MM-DD".

const DAY_MS = 86_400_000;

/** @param {Date | number | string} value */
export function utcDay(value) {
  return new Date(value).toISOString().slice(0, 10);
}

/** @param {string} day @param {number} delta */
export function addDays(day, delta) {
  return utcDay(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS);
}

/**
 * Inclusive window of `days` UTC dates ending today.
 * @param {number} days
 * @param {Date} [now]
 * @returns {{ from: string, to: string }}
 */
export function windowFor(days, now = new Date()) {
  const to = utcDay(now);
  return { from: addDays(to, -(days - 1)), to };
}

/** @param {string} day @param {{ from: string, to: string }} window */
export function inWindow(day, window) {
  return day >= window.from && day <= window.to;
}

/** Start of the window as an ISO timestamp. @param {{ from: string }} window */
export function windowStartIso(window) {
  return `${window.from}T00:00:00Z`;
}

/** End of the window (exclusive) as an ISO timestamp. @param {{ to: string }} window */
export function windowEndIso(window) {
  return `${addDays(window.to, 1)}T00:00:00Z`;
}
