// Runs the add-on inside a real (headless) Thunderbird and collects the
// self-test report.  Usage:
//   TB_BIN=/path/to/thunderbird node test/integration/run.mjs
// scripts/fetch-thunderbird.sh downloads a pinned ESR build for this.
// If Dovecot is installed, an IMAP account is tested too (TB_REQUIRE_IMAP=1
// makes a missing Dovecot an error, as in CI).

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildTestXpi, makeProfile } from "./profile.mjs";
import { findDovecot, startDovecot, freePort, IMAP_USER, IMAP_PASSWORD } from "./imap.mjs";
import { marionette, storeImapLogin } from "./marionette.mjs";

const IMAP_ACCOUNT = "Test IMAP";
const root = resolve(import.meta.dirname, "../..");
const bin = process.env.TB_BIN;
const timeoutMs = Number(process.env.TB_TIMEOUT_MS ?? 240000);
if (!bin) {
  console.error("Set TB_BIN to the thunderbird executable");
  process.exit(2);
}

// Short path: Dovecot's unix sockets live under it.
const work = mkdtempSync("/tmp/tbj-");
let finish;
let ready = false;
const report = new Promise((r) => (finish = r));

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
    if (req.method === "GET") return res.end(ready ? "yes" : "no");
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

const dovecotBin = findDovecot();
if (!dovecotBin && process.env.TB_REQUIRE_IMAP) {
  console.error("Dovecot not found but TB_REQUIRE_IMAP is set");
  process.exit(2);
}
const dovecot = dovecotBin ? await startDovecot(dovecotBin, join(work, "dv"), ["Projects/Clients"]) : null;
if (dovecot) console.log(`Dovecot IMAP on 127.0.0.1:${dovecot.port}`);

const xpi = join(work, "addon.xpi");
const addonId = buildTestXpi(root, join(work, "stage"), xpi, port, dovecot ? IMAP_ACCOUNT : null);
const profile = join(work, "profile");
const marionettePort = await freePort();
const imap = dovecot ? { port: dovecot.port, user: IMAP_USER, accountName: IMAP_ACCOUNT } : null;
makeProfile(profile, xpi, addonId, { imap, marionettePort });

console.log(`Starting ${bin} (headless), report port ${port}`);
const tb = spawn(bin, ["--headless", "--no-remote", "--marionette", "-remote-allow-system-access", "--profile", profile], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, MOZ_HEADLESS: "1" },
});
let output = "";
tb.stdout.on("data", (d) => (output += d));
tb.stderr.on("data", (d) => (output += d));
tb.on("exit", (code) => finish({ crashed: true, code }));
const timer = setTimeout(() => finish({ timeout: true }), timeoutMs);

if (dovecot) {
  try {
    const m = await marionette(marionettePort);
    const n = await storeImapLogin(m, { host: "127.0.0.1", user: IMAP_USER, password: IMAP_PASSWORD });
    console.log(`Stored IMAP login via Marionette (${n} login)`);
    m.close();
  } catch (e) {
    finish({ setupError: `Marionette: ${e.message}` });
  }
}
ready = true;

const result = await report;
clearTimeout(timer);
tb.kill("SIGTERM");
server.close();

// Folders created through Thunderbird must really exist on the IMAP server.
if (dovecot && result.tests) {
  for (const path of ["Projects/Clients/Acme/2026", "Archive2026"]) {
    const ok = dovecot.hasFolder(path);
    result.tests.push({ name: `IMAP server has mailbox ${path}`, ok, error: ok ? "" : "missing on server" });
  }
}
dovecot?.stop();

let ok = false;
if (!result.tests) {
  console.error(result.setupError ?? (result.timeout ? "Timed out waiting for the self-test" : `Thunderbird exited (${result.code})`));
  console.error(output.split("\n").filter((l) => !/Gtk|glib|^\s*$/i.test(l)).slice(-60).join("\n"));
} else {
  console.log(`Thunderbird ${result.version}${dovecot ? " + IMAP" : " (IMAP skipped)"}`);
  for (const t of result.tests) console.log(`${t.ok ? "ok  " : "FAIL"} ${t.name}${t.ok ? "" : `\n     ${t.error}`}`);
  const failed = result.tests.filter((t) => !t.ok).length;
  console.log(`\n${result.tests.length - failed} passed, ${failed} failed`);
  ok = failed === 0 && result.tests.length > 0;
}
if (!process.env.TB_KEEP) rmSync(work, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
