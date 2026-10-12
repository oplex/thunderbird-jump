// Runs the add-on inside a real (headless) Thunderbird and collects the
// self-test report.  Usage:
//   TB_BIN=/path/to/thunderbird node test/integration/run.mjs
// scripts/fetch-thunderbird.sh downloads a pinned ESR build for this.
// If Dovecot is installed, an IMAP account is tested too (TB_REQUIRE_IMAP=1
// makes a missing Dovecot an error, as in CI).

import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
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
let chrome = null; // Marionette session (chrome context), set once connected.
const report = new Promise((r) => (finish = r));

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
    if (req.method === "GET") return res.end(ready ? "yes" : "no");
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      return res.end("ok"); // Ignore preflight / malformed requests.
    }
    // Lets the self-test inspect Thunderbird's own UI (e.g. the folder pane).
    if (msg.type === "chrome") {
      return chrome
        .exec(msg.script, msg.args ?? [])
        .then((value) => res.end(JSON.stringify({ value })))
        .catch((e) => res.end(JSON.stringify({ error: e.message })));
    }
    res.end("ok");
    try {
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
const downloadDir = join(work, "downloads");
mkdirSync(downloadDir);
// Thunderbird 115–139 get the Manifest V2 build (see scripts/manifest-mv2.mjs).
const tbVersion = execFileSync(bin, ["--version"], { encoding: "utf8" }).match(/(\d+)\./)?.[1];
const legacy = Number(tbVersion) < 140;
console.log(`Thunderbird ${tbVersion}: ${legacy ? "Manifest V2 (115) build" : "Manifest V3 build"}`);
const addonId = buildTestXpi(root, join(work, "stage"), xpi, port, dovecot ? IMAP_ACCOUNT : null, downloadDir, legacy);
const profile = join(work, "profile");
const marionettePort = await freePort();
const imap = dovecot ? { port: dovecot.port, user: IMAP_USER, accountName: IMAP_ACCOUNT } : null;
makeProfile(profile, xpi, addonId, { imap, marionettePort, downloadDir });

console.log(`Starting ${bin} (headless), report port ${port}`);
// Newer Thunderbird needs -remote-allow-system-access for Marionette's chrome scope.
const extraArgs = legacy ? [] : ["-remote-allow-system-access"];
const tb = spawn(bin, ["--headless", "--no-remote", "--marionette", ...extraArgs, "--profile", profile], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, MOZ_HEADLESS: "1" },
});
let output = "";
tb.stdout.on("data", (d) => (output += d));
tb.stderr.on("data", (d) => (output += d));
tb.on("exit", (code) => finish({ crashed: true, code }));
const timer = setTimeout(() => finish({ timeout: true }), timeoutMs);

try {
  chrome = await marionette(marionettePort);
  if (dovecot) {
    const n = await storeImapLogin(chrome, { host: "127.0.0.1", user: IMAP_USER, password: IMAP_PASSWORD });
    console.log(`Stored IMAP login via Marionette (${n} login)`);
  }
  ready = true;
} catch (e) {
  finish({ setupError: `Marionette: ${e.message}` });
}

const result = await report;
clearTimeout(timer);

// Removing the add-on must leave the automatic backup file behind.
if (result.tests && chrome) {
  const backup = join(downloadDir, "thunderbird-jump-backup.json");
  try {
    const gone = await chrome.exec(
      `return (async () => {
        const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
        const addon = await AddonManager.getAddonByID(arguments[0]);
        await addon.uninstall();
        return !(await AddonManager.getAddonByID(arguments[0]));
      })();`,
      [addonId],
    );
    const ok = gone && existsSync(backup);
    result.tests.push({ name: "backup file survives removing the add-on", ok, error: ok ? "" : `uninstalled=${gone} file=${existsSync(backup)}` });
  } catch (e) {
    result.tests.push({ name: "backup file survives removing the add-on", ok: false, error: e.message });
  }
}
chrome?.close();
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
