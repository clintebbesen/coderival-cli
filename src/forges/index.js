// @ts-check
// Dispatch to the right forge counter and its token check.
import { collectGithub, githubApiBase, githubWhoami } from "./github.js";
import { collectGitlab, gitlabApiBase, gitlabWhoami } from "./gitlab.js";

/**
 * @typedef {import("../config.js").Forge} Forge
 */

/** @param {"github" | "gitlab"} provider @param {string} host */
export function apiBaseFor(provider, host) {
  return provider === "github" ? githubApiBase(host) : gitlabApiBase(host);
}

/** @param {"github" | "gitlab"} provider */
export function defaultHost(provider) {
  return provider === "github" ? "github.com" : "gitlab.com";
}

/** @param {{ provider: "github" | "gitlab", apiBase: string, token: string, fetchImpl?: typeof fetch }} forge */
export function whoami(forge) {
  return forge.provider === "github" ? githubWhoami(forge) : gitlabWhoami(forge);
}

/**
 * @param {Forge & { token: string, fetchImpl?: typeof fetch, onWait?: (ms: number) => void }} forge
 * @param {{ from: string, to: string }} window
 * @returns {Promise<Record<string, { prs: number, commits: number }>>}
 */
export function collectForge(forge, window) {
  return forge.provider === "github" ? collectGithub(forge, window) : collectGitlab(forge, window);
}

/** @param {"github" | "gitlab"} provider */
export function scopeHelp(provider) {
  return provider === "github"
    ? "Use a fine-grained token with read-only access to Pull requests, Contents and Metadata on all repositories (or a classic token with `repo`)."
    : "Use a personal access token with only the `read_api` scope.";
}
