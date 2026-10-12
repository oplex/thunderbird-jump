// In-Thunderbird self-test entry point. Only bundled into the test build (see
// profile.mjs). Runs every case against the real APIs and the real palette
// page, then POSTs a report to the runner.

import { REPORT_URL, IMAP_ACCOUNT } from "./config.js";
import { resolveMailWindowId } from "../../src/tb/tabs.js";
import { saveSettings } from "../../src/tb/store.js";
import { results, post, log, waitFor, check } from "./util.js";
import { localTests } from "./tests-local.js";
import { uiTests } from "./tests-ui.js";
import { imapTests } from "./tests-imap.js";
import { featureTests } from "./tests-features.js";
import { welcomeTest, backupTests } from "./tests-backup.js";
import { moveTests } from "./tests-moves.js";
import { managerTests } from "./tests-manager.js";
import { quickTests } from "./tests-quick.js";
import { filingTests } from "./tests-filing.js";

// The runner answers "yes" once it has stored the IMAP password.
async function runnerReady() {
  try {
    return (await (await fetch(`${REPORT_URL}ready`)).text()) === "yes";
  } catch {
    return false;
  }
}

async function run() {
  const info = await browser.runtime.getBrowserInfo();
  log(`running in ${info.name} ${info.version}`);
  await waitFor(async () => (await browser.mailTabs.query({})).length > 0, "a mail tab", 60000);
  await waitFor(runnerReady, "runner to be ready", 60000);
  const windowId = await resolveMailWindowId();
  // Lite mode is tested on its own (tests-quick.js); other tests expect Esc to close.
  await saveSettings({ closeOnBlur: false, jumpAfterCreate: true, liteMode: false });

  await welcomeTest();
  const root = await localTests(windowId);
  if (root) {
    await uiTests(windowId, root);
    await featureTests(windowId, root);
    await moveTests(windowId, root);
    await managerTests(windowId, root);
    await quickTests(windowId, root);
    await filingTests(windowId, root);
    await backupTests(root);
  }
  else await check("UI tests need the Local Folders account", () => Promise.reject(new Error("no root")));
  if (IMAP_ACCOUNT) await imapTests(windowId, IMAP_ACCOUNT);
  else log("IMAP tests skipped (no Dovecot)");

  await post({ type: "result", version: info.version, tests: results });
}

run().catch((e) =>
  post({ type: "result", version: "?", tests: [...results, { name: "self-test crashed", ok: false, error: String(e?.stack ?? e) }] }),
);
