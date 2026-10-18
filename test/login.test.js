// @ts-check
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { login } from "../src/commands/login.js";
import { loadConfig } from "../src/config.js";
import { fakeFetch } from "./helpers.js";

test("device login polls until approved and saves the token", async () => {
  process.env.XDG_CONFIG_HOME = await mkdtemp(join(tmpdir(), "coderival-login-"));
  const config = await loadConfig();
  config.server = "https://coderival.test";
  let polls = 0;
  const { impl, calls } = fakeFetch(({ url }) => {
    if (url.pathname === "/api/cli/device") return { body: { deviceCode: "dc", userCode: "ABCD-1234", verifyUrl: "https://coderival.test/cli?code=ABCD-1234", interval: 1, expiresIn: 60 } };
    polls += 1;
    if (polls < 3) return { status: 428, body: { status: "pending" } };
    return { body: { token: "cr_new", profile: { slug: "dev", name: "Dev", url: "https://coderival.test/dev" } } };
  });
  /** @type {string[]} */
  const opened = [];
  const profile = await login(config, { fetchImpl: impl, wait: async () => {}, open: (u) => opened.push(u), log: () => {} });
  assert.equal(profile.slug, "dev");
  assert.deepEqual(opened, ["https://coderival.test/cli?code=ABCD-1234"]);
  assert.equal(calls[0].body.deviceName, config.deviceName);
  assert.equal((await loadConfig()).token, "cr_new");
});

test("an expired or denied code is an error", async () => {
  process.env.XDG_CONFIG_HOME = await mkdtemp(join(tmpdir(), "coderival-login-"));
  const config = await loadConfig();
  const { impl } = fakeFetch(({ url }) => {
    if (url.pathname === "/api/cli/device") return { body: { deviceCode: "dc", userCode: "X", verifyUrl: "https://x/cli", interval: 1, expiresIn: 60 } };
    return { status: 410, body: { error: "denied" } };
  });
  await assert.rejects(login(config, { fetchImpl: impl, wait: async () => {}, open: () => {}, log: () => {} }), /denied/);
});
