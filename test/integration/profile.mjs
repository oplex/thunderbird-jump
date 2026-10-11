// Builds a throwaway Thunderbird profile with a "Local Folders" account and the
// test build of the add-on side-loaded, plus prefs that keep startup quiet.

import { mkdirSync, writeFileSync, cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const PREFS = {
  // Local Folders as the only account, so the 3-pane window opens directly.
  "mail.accountmanager.accounts": "account1",
  "mail.accountmanager.defaultaccount": "account1",
  "mail.accountmanager.localfoldersserver": "server1",
  "mail.account.account1.server": "server1",
  "mail.server.server1.type": "none",
  "mail.server.server1.hostname": "Local Folders",
  "mail.server.server1.name": "Local Folders",
  "mail.server.server1.userName": "nobody",
  // Quiet first run.
  "mail.provider.suppress_dialog_on_startup": true,
  "mail.shell.checkDefaultClient": false,
  "mail.rights.override": true,
  "mail.spotlight.firstRunDone": true,
  "mail.winsearch.firstRunDone": true,
  "mailnews.start_page.enabled": false,
  "mail.inappnotifications.enabled": false,
  "app.update.disabledForTesting": true,
  "browser.dom.window.dump.enabled": true,
  "datareporting.policy.dataSubmissionEnabled": false,
  "toolkit.telemetry.reportingpolicy.firstRun": false,
  // Load the unsigned, side-loaded test build.
  "xpinstall.signatures.required": false,
  "extensions.autoDisableScopes": 0,
  "extensions.enabledScopes": 15,
  "extensions.startupScanScopes": 15,
};

function prefLine(name, value) {
  return `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`;
}

// Copy the add-on into `stage`, add the self-test, and zip it to `xpi`.
export function buildTestXpi(root, stage, xpi, port) {
  mkdirSync(stage, { recursive: true });
  cpSync(join(root, "src"), join(stage, "src"), { recursive: true });
  cpSync(join(root, "icons"), join(stage, "icons"), { recursive: true });
  mkdirSync(join(stage, "test/integration"), { recursive: true });
  cpSync(join(root, "test/integration/selftest.js"), join(stage, "test/integration/selftest.js"));
  writeFileSync(join(stage, "test/integration/config.js"), `export const REPORT_URL = "http://127.0.0.1:${port}/";\n`);

  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  manifest.background.scripts.push("test/integration/selftest.js");
  manifest.host_permissions = ["http://127.0.0.1/*"];
  writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));

  execFileSync("zip", ["-qr", xpi, "."], { cwd: stage });
  return manifest.browser_specific_settings.gecko.id;
}

export function makeProfile(dir, xpi, addonId) {
  mkdirSync(join(dir, "extensions"), { recursive: true });
  cpSync(xpi, join(dir, "extensions", `${addonId}.xpi`));
  writeFileSync(join(dir, "user.js"), Object.entries(PREFS).map(([k, v]) => prefLine(k, v)).join("\n") + "\n");
}
