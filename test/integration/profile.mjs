// Builds a throwaway Thunderbird profile with a "Local Folders" account and the
// test build of the add-on side-loaded, plus prefs that keep startup quiet.

import { mkdirSync, writeFileSync, cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { toMV2 } from "../../scripts/manifest-mv2.mjs";

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
  // Load the side-loaded test build. (No signature pref: Thunderbird accepts
  // unsigned add-ons by default, which this run also verifies.)
  "extensions.autoDisableScopes": 0,
  "extensions.enabledScopes": 15,
  "extensions.startupScanScopes": 15,
  // Keep the background page (which runs the self-test) from being suspended.
  "extensions.background.idle.enabled": false,
};

// Adds a plain-IMAP account pointing at the local Dovecot test server.
function imapPrefs(imap) {
  return {
    "mail.accountmanager.accounts": "account1,account2",
    "mail.account.account2.server": "server2",
    "mail.account.account2.identities": "id1",
    "mail.identity.id1.useremail": "test@localhost",
    "mail.identity.id1.fullName": "Test",
    "mail.server.server2.type": "imap",
    "mail.server.server2.hostname": "127.0.0.1",
    "mail.server.server2.port": imap.port,
    "mail.server.server2.userName": imap.user,
    "mail.server.server2.name": imap.accountName,
    "mail.server.server2.socketType": 0,
    "mail.server.server2.authMethod": 3,
    "mail.server.server2.login_at_startup": false,
    "mail.server.server2.check_new_mail": false,
    "mail.server.server2.using_subscription": false,
  };
}

function prefLine(name, value) {
  return `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`;
}

// Copy the add-on into `stage`, add the self-test, and zip it to `xpi`.
// `legacy`: build the Manifest V2 variant for Thunderbird 115–139.
export function buildTestXpi(root, stage, xpi, port, imapAccount = null, downloadDir = "", legacy = false) {
  mkdirSync(stage, { recursive: true });
  cpSync(join(root, "src"), join(stage, "src"), { recursive: true });
  cpSync(join(root, "icons"), join(stage, "icons"), { recursive: true });
  mkdirSync(join(stage, "test/integration"), { recursive: true });
  for (const f of ["selftest.js", "util.js", "tests-local.js", "tests-ui.js", "tests-imap.js", "tests-features.js", "tests-backup.js", "pane-scripts.js", "tests-moves.js", "tests-manager.js", "tests-quick.js"]) {
    cpSync(join(root, "test/integration", f), join(stage, "test/integration", f));
  }
  writeFileSync(
    join(stage, "test/integration/config.js"),
    `export const REPORT_URL = "http://127.0.0.1:${port}/";\n` +
      `export const IMAP_ACCOUNT = ${JSON.stringify(imapAccount)};\n` +
      `export const DOWNLOAD_DIR = ${JSON.stringify(downloadDir)};\n`,
  );

  let manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  manifest.host_permissions = ["http://127.0.0.1/*"];
  // Granting message permissions at runtime needs a click on Thunderbird's
  // prompt; the test build declares them instead (same APIs afterwards).
  manifest.permissions.push("messagesRead", "messagesMove");
  // Lets the tests add real messages to folders (Thunderbird 106+; older
  // versions ignore the unknown permission and the test uses another way).
  manifest.permissions.push("messagesImport");
  manifest.optional_permissions = manifest.optional_permissions.filter((p) => !manifest.permissions.includes(p));
  if (legacy) {
    manifest = toMV2(manifest);
    // The MV2 background page loads the add-on and then the self-test.
    writeFileSync(
      join(stage, "src/background/background.html"),
      '<!doctype html><meta charset="utf-8"><script type="module" src="background.js"></script>' +
        '<script type="module" src="../../test/integration/selftest.js"></script>\n',
    );
  } else {
    manifest.background.scripts.push("test/integration/selftest.js");
  }
  writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));

  execFileSync("zip", ["-qr", xpi, "."], { cwd: stage });
  return manifest.browser_specific_settings.gecko.id;
}

// `imap`: { port, user, accountName } or null. `marionettePort` enables Marionette.
// `downloadDir`: where Thunderbird saves downloads (exports, auto-backup).
export function makeProfile(dir, xpi, addonId, { imap = null, marionettePort = null, downloadDir = null } = {}) {
  mkdirSync(join(dir, "extensions"), { recursive: true });
  cpSync(xpi, join(dir, "extensions", `${addonId}.xpi`));
  const prefs = { ...PREFS, ...(imap ? imapPrefs(imap) : {}) };
  if (marionettePort) prefs["marionette.port"] = marionettePort;
  if (downloadDir) {
    Object.assign(prefs, {
      "browser.download.folderList": 2,
      "browser.download.dir": downloadDir,
      "browser.download.useDownloadDir": true,
      "browser.download.always_ask_before_handling_new_types": false,
      // Older Thunderbird (91) asks what to do with a download unless told.
      "browser.helperApps.neverAsk.saveToDisk": "application/json",
    });
  }
  writeFileSync(join(dir, "user.js"), Object.entries(prefs).map(([k, v]) => prefLine(k, v)).join("\n") + "\n");
}
