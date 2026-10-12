// Persistent add-on state in storage.local: shortcuts, recent folders, settings.

import { shortcutKey } from "../lib/parse.js";

export const DEFAULT_SETTINGS = {
  jumpAfterCreate: true,
  closeOnBlur: true,
  revealFolderPane: true,
  autoBackup: false,
  confirmMove: false,
  recentLimit: 12,
};

async function get(key, fallback) {
  const data = await browser.storage.local.get(key);
  return data[key] ?? fallback;
}

function set(key, value) {
  return browser.storage.local.set({ [key]: value });
}

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await get("settings", {})) };
}

export async function saveSettings(patch) {
  await set("settings", { ...(await getSettings()), ...patch });
}

// Shortcuts: { key: { name, folderId, label } }, key = lower-cased name.
export function getShortcuts() {
  return get("shortcuts", {});
}

export async function setShortcut(name, folderId, label) {
  const key = shortcutKey(name);
  if (!key) throw new Error("Shortcut name is empty");
  const all = await getShortcuts();
  const previous = all[key] ?? null;
  all[key] = { name: name.trim(), folderId, label };
  await set("shortcuts", all);
  return previous;
}

export async function deleteShortcut(name) {
  const key = shortcutKey(name);
  const all = await getShortcuts();
  if (!(key in all)) return false;
  delete all[key];
  await set("shortcuts", all);
  return true;
}

export async function getShortcut(name) {
  return (await getShortcuts())[shortcutKey(name)] ?? null;
}

// Most recently jumped-to folder ids, newest first.
export function getRecent() {
  return get("recent", []);
}

export async function pushRecent(folderId) {
  const { recentLimit } = await getSettings();
  const list = (await getRecent()).filter((id) => id !== folderId);
  list.unshift(folderId);
  await set("recent", list.slice(0, recentLimit));
}

export async function removeRecent(folderId) {
  await set("recent", (await getRecent()).filter((id) => id !== folderId));
}

export function clearRecent() {
  return set("recent", []);
}
