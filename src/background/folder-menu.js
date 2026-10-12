/*
 * Right-click menu on a folder in the folder pane:
 *   ThunderJump ▸ Save as j1 … j9 (shows what each one points to now)
 *                 Save as named shortcut…   (palette, ":jj " for this folder)
 *                 Remove shortcut jN        (only shortcuts pointing here)
 *                 New subfolder…            (palette in create mode)
 *                 Search messages here      (Manager, limited to the folder)
 */

import { getShortcuts, setShortcut, deleteShortcut } from "../tb/store.js";
import { loadFolders, pathLabel } from "../tb/folders.js";
import { folderIdOf, legacyRootId } from "../tb/compat.js";
import { compareShortcutKeys } from "../lib/parse.js";
import { openManager } from "../tb/tabs.js";

const CONTEXTS = ["folder_pane"];
const PARENT = "tj-f";
const SLOTS = 9;
let dynamicItems = [];

function create(props) {
  return new Promise((resolve) => {
    browser.menus.create({ contexts: CONTEXTS, ...props }, () => resolve(void browser.runtime.lastError));
  });
}

export async function setupFolderMenu() {
  if (!browser.menus) return;
  await create({ id: PARENT, title: "ThunderJump" });
}

// The clicked folder's id: selectedFolders (Thunderbird 128+), selectedFolder
// (older), or the account root when an account was clicked.
export function folderIdFromInfo(info) {
  const folder = info.selectedFolders?.[0] ?? info.selectedFolder;
  if (folder) return folderIdOf(folder);
  const account = info.selectedAccount;
  if (!account) return null;
  return account.rootFolder?.id ?? legacyRootId(account.id);
}

const shortName = (s) => (s.label ?? "").split(" › ").pop() || "folder";

// The submenu items for one folder (also used by the tests).
export function folderMenuItems(folderId, shortcuts, entry) {
  const items = [];
  for (let n = 1; n <= SLOTS; n++) {
    const s = shortcuts[String(n)];
    const here = s?.folderId === folderId;
    const now = here ? " ✓" : s ? `   (now: ${shortName(s)})` : "";
    items.push({ id: `tj-f-set:${n}`, title: `Save as j${n}${now}`, enabled: !here });
  }
  items.push({ id: "tj-f-name", title: "Save as named shortcut…" });
  const mine = Object.keys(shortcuts)
    .filter((k) => shortcuts[k].folderId === folderId)
    .sort(compareShortcutKeys);
  if (mine.length) items.push({ id: "tj-f-sep1", type: "separator" });
  for (const key of mine) {
    const shown = /^\d+$/.test(key) ? `j${key}` : `“${shortcuts[key].name}”`;
    items.push({ id: `tj-f-del:${key}`, title: `Remove shortcut ${shown}` });
  }
  items.push({ id: "tj-f-sep2", type: "separator" });
  items.push({ id: "tj-f-new", title: "New subfolder…", enabled: !entry?.isVirtual });
  items.push({ id: "tj-f-search", title: "Search messages here", enabled: !!entry && !entry.isRoot });
  return items;
}

async function rebuild(folderId) {
  for (const id of dynamicItems) await browser.menus.remove(id).catch(() => {});
  dynamicItems = [];
  if (!folderId) return;
  const [shortcuts, folders] = await Promise.all([getShortcuts(), loadFolders()]);
  const entry = folders.find((f) => f.id === folderId);
  for (const item of folderMenuItems(folderId, shortcuts, entry)) {
    await create({ ...item, parentId: PARENT });
    dynamicItems.push(item.id);
  }
}

// What a click does; exported so the tests can run it without a real menu.
export async function runFolderMenu(menuItemId, folderId, { openSpotlight }) {
  const id = String(menuItemId);
  if (!folderId) return;
  if (id.startsWith("tj-f-set:")) {
    const entry = (await loadFolders()).find((f) => f.id === folderId);
    if (!entry) return;
    await setShortcut(id.slice("tj-f-set:".length), folderId, pathLabel(entry));
  } else if (id.startsWith("tj-f-del:")) {
    const key = id.slice("tj-f-del:".length);
    const s = (await getShortcuts())[key];
    if (s) await deleteShortcut(s.name);
  } else if (id === "tj-f-name") {
    await openSpotlight("", { setFor: folderId });
  } else if (id === "tj-f-new") {
    await openSpotlight("", { createIn: folderId });
  } else if (id === "tj-f-search") {
    await openManager({ folder: folderId });
  }
}

export function registerFolderMenu({ openSpotlight }) {
  if (!browser.menus) return;
  browser.menus.onShown.addListener(async (info) => {
    if (!info.menuIds?.includes(PARENT)) return;
    await rebuild(folderIdFromInfo(info));
    browser.menus.refresh();
  });
  browser.menus.onClicked.addListener((info) => {
    if (!String(info.menuItemId).startsWith("tj-f-")) return;
    return runFolderMenu(info.menuItemId, folderIdFromInfo(info), { openSpotlight });
  });
}
