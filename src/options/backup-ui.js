// Options page: export / import, automatic backup, and the first-run welcome.

import { backupText, importConfig, hasDownloadsPermission, requestDownloadsPermission } from "../tb/backup.js";
import { getSettings, saveSettings } from "../tb/store.js";

const $ = (id) => document.getElementById(id);

function say(text, kind = "ok") {
  const el = $("backupStatus");
  el.textContent = text;
  el.className = kind;
}

function exportFile() {
  backupText().then((text) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = `thunderjump-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    say(`Exported ${a.download} (look in your Downloads folder).`);
  });
}

async function importFile(file, onDone) {
  try {
    say(await importConfig(await file.text()));
    browser.runtime.sendMessage({ type: "config-changed" }).catch(() => {});
    onDone?.();
  } catch (e) {
    say(e?.message ?? String(e), "missing");
  }
}

async function showLastBackup() {
  const { lastBackup, lastBackupError } = await browser.storage.local.get(["lastBackup", "lastBackupError"]);
  const el = $("lastBackup");
  if (lastBackupError) {
    el.textContent = `Last automatic backup failed: ${lastBackupError}`;
    el.className = "missing";
  } else {
    el.textContent = lastBackup ? `Last automatic backup: ${new Date(lastBackup).toLocaleString()}` : "";
    el.className = "dim";
  }
}

async function initAutoBackup() {
  const box = $("autoBackup");
  const { autoBackup } = await getSettings();
  box.checked = autoBackup && (await hasDownloadsPermission());
  box.addEventListener("change", async () => {
    if (box.checked) {
      // Thunderbird asks the user for the "downloads" permission here.
      const granted = await requestDownloadsPermission().catch(() => false);
      if (!granted) {
        box.checked = false;
        return say("Automatic backup needs permission to save files.", "missing");
      }
      await saveSettings({ autoBackup: true });
      const ok = await browser.runtime.sendMessage({ type: "backup-now" });
      say(ok ? "Automatic backup is on. The file is in your Downloads folder." : "Automatic backup is on, but the first backup failed.", ok ? "ok" : "missing");
    } else {
      await saveSettings({ autoBackup: false });
      say("Automatic backup is off. The last backup file is kept.");
    }
    showLastBackup();
  });
  browser.storage.onChanged.addListener((changes) => {
    if (changes.lastBackup || changes.lastBackupError) showLastBackup();
  });
  showLastBackup();
}

async function initWelcome(onRestored) {
  const { showWelcome } = await browser.storage.local.get("showWelcome");
  const box = $("welcome");
  box.hidden = !showWelcome;
  const dismiss = () => {
    box.hidden = true;
    browser.storage.local.remove("showWelcome");
  };
  $("welcomeDismiss").addEventListener("click", dismiss);
  $("welcomeImport").addEventListener("change", (ev) => {
    const file = ev.target.files?.[0];
    if (file) importFile(file, () => (dismiss(), onRestored?.()));
  });
}

export async function initBackup(onRestored) {
  $("exportBackup").addEventListener("click", exportFile);
  $("importBackup").addEventListener("change", (ev) => {
    const file = ev.target.files?.[0];
    if (file) importFile(file, onRestored);
    ev.target.value = "";
  });
  await initAutoBackup();
  await initWelcome(onRestored);
}
