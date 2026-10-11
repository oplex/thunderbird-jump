// Export / import of the add-on's configuration, and the optional automatic
// backup file. Thunderbird wipes an add-on's storage when it is removed and
// gives no warning beforehand, so the only backup that survives an uninstall
// is a real file: the auto-backup keeps one up to date in Downloads.

import { buildBackup, parseBackup, remapShortcuts, BACKUP_FILENAME } from "../lib/backup.js";
import { getShortcuts, getSettings, getRecent, DEFAULT_SETTINGS } from "./store.js";
import { loadFolders } from "./folders.js";

const DOWNLOADS = { permissions: ["downloads"] };

export async function collectConfig() {
  const [shortcuts, settings, recent, commands] = await Promise.all([
    getShortcuts(),
    getSettings(),
    getRecent(),
    browser.commands.getAll(),
  ]);
  const keys = Object.fromEntries(commands.map((c) => [c.name, c.shortcut ?? ""]));
  return buildBackup({ shortcuts, settings, recent, keys }, { version: browser.runtime.getManifest().version });
}

export async function backupText() {
  return JSON.stringify(await collectConfig(), null, 2) + "\n";
}

// Restore a backup file's contents. Shortcuts from the file are merged in
// (the file wins on the same name); settings and key bindings are replaced.
// Returns a short summary for the user.
export async function importConfig(text) {
  const parsed = parseBackup(text);
  if (!parsed.ok) throw new Error(parsed.error);
  const { data } = parsed;
  const folders = await loadFolders();
  const { shortcuts, remapped, missing } = remapShortcuts(data.shortcuts, folders);
  const ids = new Set(folders.map((f) => f.id));

  const current = await getShortcuts();
  const settings = { ...DEFAULT_SETTINGS, ...data.settings };
  const recent = [...new Set([...data.recent.filter((id) => ids.has(id)), ...(await getRecent())])].slice(0, settings.recentLimit);
  await browser.storage.local.set({ shortcuts: { ...current, ...shortcuts }, settings, recent });

  const known = new Set((await browser.commands.getAll()).map((c) => c.name));
  const keyErrors = [];
  for (const [name, shortcut] of Object.entries(data.keys)) {
    if (!known.has(name)) continue;
    try {
      await browser.commands.update({ name, shortcut });
    } catch {
      keyErrors.push(`${name} (${shortcut})`);
    }
  }

  const parts = [`Restored ${Object.keys(shortcuts).length} shortcut(s), settings and keys.`];
  if (remapped.length) parts.push(`Matched by folder path: ${remapped.join(", ")}.`);
  if (missing.length) parts.push(`Folder not found for: ${missing.join(", ")}.`);
  if (keyErrors.length) parts.push(`Keys not accepted: ${keyErrors.join(", ")}.`);
  return parts.join(" ");
}

export function hasDownloadsPermission() {
  return browser.permissions.contains(DOWNLOADS);
}

// Must be called from a user action (click), as Thunderbird asks the user.
export function requestDownloadsPermission() {
  return browser.permissions.request(DOWNLOADS);
}

// Write the backup file into the Downloads folder without a dialog,
// replacing the previous one, and keep it out of the downloads list.
export async function writeBackupFile() {
  const url = URL.createObjectURL(new Blob([await backupText()], { type: "application/json" }));
  try {
    const id = await browser.downloads.download({ url, filename: BACKUP_FILENAME, conflictAction: "overwrite", saveAs: false });
    // A small file can finish before any listener is attached, so check
    // the download's state directly.
    for (let i = 0; ; i++) {
      const [item] = await browser.downloads.search({ id });
      if (item?.state === "complete") break;
      if (item?.state === "interrupted" || i > 100) throw new Error(`Writing the backup file failed (${item?.error ?? "timeout"})`);
      await new Promise((r) => setTimeout(r, 100));
    }
    await browser.downloads.erase({ id });
    await browser.storage.local.set({ lastBackup: new Date().toISOString() });
  } finally {
    URL.revokeObjectURL(url);
  }
}
