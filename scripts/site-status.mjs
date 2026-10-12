/*
 * Writes the website's status.json: the newest CI run, the newest
 * Compatibility run with one result per Thunderbird version, and the latest
 * releases. Run by the Website workflow with GITHUB_TOKEN and
 * GITHUB_REPOSITORY set.  node scripts/site-status.mjs _site/status.json
 */

import { writeFileSync } from "node:fs";

const repo = process.env.GITHUB_REPOSITORY;
const headers = { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
const api = async (path) => {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
};

// Newest finished run of a workflow on main, with its jobs.
async function latestRun(file) {
  const { workflow_runs: runs } = await api(`/actions/workflows/${file}/runs?branch=main&status=completed&per_page=1`);
  const run = runs?.[0];
  if (!run) return null;
  const { jobs } = await api(`/actions/runs/${run.id}/jobs?per_page=100`);
  return { run, jobs };
}

// "Thunderbird 140.7.1esr" / "thunderbird (latest-esr)" → version text.
const versionOf = (name) => /thunderbird \(?([^)]+)\)?/i.exec(name)?.[1]?.trim() ?? null;

function summary(found) {
  if (!found) return null;
  const { run, jobs } = found;
  return {
    conclusion: run.conclusion,
    date: run.updated_at,
    url: run.html_url,
    commit: run.head_sha.slice(0, 7),
    versions: jobs
      .filter((j) => versionOf(j.name))
      .map((j) => ({ version: versionOf(j.name), conclusion: j.conclusion, url: j.html_url }))
      .sort((a, b) => parseFloat(a.version) - parseFloat(b.version) || a.version.localeCompare(b.version)),
  };
}

const [ci, compat, releases] = await Promise.all([latestRun("ci.yml"), latestRun("compat.yml"), api("/releases?per_page=6")]);
const status = {
  generated: new Date().toISOString(),
  ci: summary(ci),
  compat: summary(compat),
  releases: releases.map((r) => ({ tag: r.tag_name, date: r.published_at, url: r.html_url })),
};
writeFileSync(process.argv[2] ?? "status.json", JSON.stringify(status, null, 1));
console.log(`status.json: CI ${status.ci?.conclusion}, compat ${status.compat?.versions.length ?? 0} versions, ${status.releases.length} releases`);
