// Runs the add-on inside a real (headless) Thunderbird and collects the
// self-test report.  Usage:
//   TB_BIN=/path/to/thunderbird node test/integration/run.mjs
// scripts/fetch-thunderbird.sh downloads a pinned ESR build for this.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildTestXpi, makeProfile } from "./profile.mjs";

const root = resolve(import.meta.dirname, "../..");
const bin = process.env.TB_BIN;
const timeoutMs = Number(process.env.TB_TIMEOUT_MS ?? 120000);
if (!bin) {
  console.error("Set TB_BIN to the thunderbird executable");
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), "tbjump-it-"));
let finish;
const report = new Promise((r) => (finish = r));

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
    res.end("ok");
    try {
      const msg = JSON.parse(body);
      if (msg.type === "log") console.log(`  [tb] ${msg.text}`);
      else finish(msg);
    } catch {
      // Ignore preflight / malformed requests.
    }
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();

const xpi = join(work, "addon.xpi");
const addonId = buildTestXpi(root, join(work, "stage"), xpi, port);
const profile = join(work, "profile");
makeProfile(profile, xpi, addonId);

console.log(`Starting ${bin} (headless), report port ${port}`);
const tb = spawn(bin, ["--headless", "--no-remote", "--profile", profile], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, MOZ_HEADLESS: "1" },
});
let output = "";
tb.stdout.on("data", (d) => (output += d));
tb.stderr.on("data", (d) => (output += d));
tb.on("exit", (code) => finish({ crashed: true, code }));

const timer = setTimeout(() => finish({ timeout: true }), timeoutMs);
const result = await report;
clearTimeout(timer);
tb.kill("SIGTERM");
server.close();

let ok = false;
if (result.timeout || result.crashed) {
  console.error(result.timeout ? "Timed out waiting for the self-test" : `Thunderbird exited (${result.code})`);
  console.error(output.split("\n").slice(-60).join("\n"));
} else {
  console.log(`Thunderbird ${result.version}`);
  for (const t of result.tests) console.log(`${t.ok ? "ok  " : "FAIL"} ${t.name}${t.ok ? "" : `\n     ${t.error}`}`);
  const failed = result.tests.filter((t) => !t.ok).length;
  console.log(`\n${result.tests.length - failed} passed, ${failed} failed`);
  ok = failed === 0 && result.tests.length > 0;
}
if (!process.env.TB_KEEP) rmSync(work, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
