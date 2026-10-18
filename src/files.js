// @ts-check
// Atomic, private JSON writes for files that hold tokens or totals.
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Write to a temp file in the same folder with mode 600, then rename over the target.
 * @param {string} path
 * @param {unknown} data
 */
export async function writeJsonAtomic(path, data) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
}
