// Right-click menu on the message list:
//   Move with ThunderJump…   (opens the palette in move mode)
//   Move to ▸ <shortcuts and recent targets>   (one click)
//   Undo last ThunderJump move
// and Tools → ThunderJump Manager.

import { canMove, listAll, summarize, moveMessages, undoMove, lastUndoableMove, getMoveTargets } from "../tb/messages.js";
import { getShortcuts } from "../tb/store.js";
import { loadFolders, pathLabel } from "../tb/folders.js";
import { compareShortcutKeys } from "../lib/parse.js";
import { openManager } from "../tb/tabs.js";

const CONTEXTS = ["message_list"];
const MAX_TARGETS = 10;
let targetItems = [];

function create(props) {
  return new Promise((resolve) => {
    // Re-creating an existing id (e.g. after the event page wakes) is fine.
    browser.menus.create(props, () => resolve(void browser.runtime.lastError));
  });
}

export async function setupMenus() {
  if (!browser.menus) return;
  await create({ id: "tj-move", title: "Move with ThunderJump…", contexts: CONTEXTS });
  await create({ id: "tj-move-to", title: "Move to", contexts: CONTEXTS });
  await create({ id: "tj-undo", title: "Undo last ThunderJump move", contexts: CONTEXTS });
  await create({ id: "tj-manager", title: "ThunderJump Manager", contexts: ["tools_menu"] });
  // Right-click on the toolbar button ("action" in MV3, "browser_action" in MV2).
  const button = browser.runtime.getManifest().manifest_version >= 3 ? "action" : "browser_action";
  await create({ id: "tj-manager-button", title: "ThunderJump Manager", contexts: [button] });
  await create({ id: "tj-options-button", title: "ThunderJump settings", contexts: [button] });
}

// Shortcuts first (j1, j2 …), then recently used move targets.
async function targetList() {
  const [shortcuts, recent, folders] = await Promise.all([getShortcuts(), getMoveTargets(), loadFolders()]);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out = [];
  const seen = new Set();
  const add = (id, prefix = "") => {
    const f = byId.get(id);
    if (!f || f.isRoot || f.isVirtual || seen.has(id) || out.length >= MAX_TARGETS) return;
    seen.add(id);
    out.push({ id, title: `${prefix}${f.name}`, label: pathLabel(f) });
  };
  for (const key of Object.keys(shortcuts).sort(compareShortcutKeys)) {
    add(shortcuts[key].folderId, /^\d+$/.test(key) ? `j${key}  ` : `${shortcuts[key].name}  `);
  }
  for (const id of recent) add(id);
  return { out, labels: Object.fromEntries(folders.map((f) => [f.id, pathLabel(f)])) };
}

let labelsCache = {};

async function refreshTargets() {
  for (const id of targetItems) await browser.menus.remove(id).catch(() => {});
  targetItems = [];
  const allowed = await canMove();
  if (!allowed) {
    await create({ id: "tj-to-enable", parentId: "tj-move-to", title: "Turn on moving in ThunderJump options…", contexts: CONTEXTS });
    targetItems.push("tj-to-enable");
    return;
  }
  const { out, labels } = await targetList();
  labelsCache = labels;
  if (!out.length) {
    await create({ id: "tj-to-none", parentId: "tj-move-to", title: "(no shortcuts or recent targets yet)", enabled: false, contexts: CONTEXTS });
    targetItems.push("tj-to-none");
  }
  for (const t of out) {
    const id = `tj-to:${t.id}`;
    await create({ id, parentId: "tj-move-to", title: t.title, contexts: CONTEXTS });
    targetItems.push(id);
  }
  const last = await lastUndoableMove();
  await browser.menus.update("tj-undo", {
    enabled: !!last,
    title: last ? `Undo ThunderJump move (${last.count} → ${last.targetLabel.split(" › ").pop() || "folder"})` : "Undo last ThunderJump move",
  });
}

async function selected(info) {
  const list = info.selectedMessages ? await listAll(info.selectedMessages) : [];
  return list.map(summarize);
}

export function registerMenuHandlers({ openSpotlight }) {
  if (!browser.menus) return;
  browser.menus.onShown.addListener(async (info) => {
    if (!info.menuIds?.includes("tj-move")) return;
    await refreshTargets();
    browser.menus.refresh();
  });
  browser.menus.onClicked.addListener(async (info) => {
    const id = String(info.menuItemId);
    if (id === "tj-move") return openSpotlight("move");
    if (id === "tj-manager" || id === "tj-manager-button") return openManager();
    if (id === "tj-options-button") return browser.runtime.openOptionsPage();
    if (id === "tj-to-enable") return browser.runtime.openOptionsPage();
    if (id === "tj-undo") {
      const last = await lastUndoableMove();
      if (last) await undoMove(last.id);
      return;
    }
    if (id.startsWith("tj-to:")) {
      const messages = await selected(info);
      if (messages.length) await moveMessages(messages, id.slice("tj-to:".length), { labels: labelsCache });
    }
  });
}
