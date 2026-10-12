// Background event page: keyboard commands and the centered "spotlight" window.

import { resolveMailWindowId, jumpToFolder } from "../tb/tabs.js";
import { getShortcut, pushRecent, getSettings } from "../tb/store.js";
import { writeBackupFile, hasDownloadsPermission } from "../tb/backup.js";
import { undoMove, lastUndoableMove } from "../tb/messages.js";
import { openManager } from "../tb/tabs.js";
import { setupMenus, registerMenuHandlers } from "./menus.js";
import { setupFolderMenu, registerFolderMenu } from "./folder-menu.js";

const WIDTH = 640;
const HEIGHT = 460;

// storage.session survives the MV3 event page being suspended; the MV2 build
// for Thunderbird 115 has a persistent page, so memory is enough there.
const memory = {};
const session = browser.storage.session ?? {
  get: async (k) => ({ [k]: memory[k] }),
  set: async (o) => Object.assign(memory, o),
  remove: async (k) => delete memory[k],
};

async function spotlightWindowId() {
  const { spotlightWindowId: id } = await session.get("spotlightWindowId");
  if (id == null) return null;
  try {
    await browser.windows.get(id);
    return id;
  } catch {
    return null;
  }
}

// `action`: "move" opens the palette in move mode for the selected messages.
// `extra`: more page parameters, e.g. { setFor: folderId } or { createIn: folderId }.
export async function openSpotlight(action = "", extra = {}) {
  const existing = await spotlightWindowId();
  const query = new URLSearchParams({ mode: "window", ...(action ? { action } : {}), ...extra });
  const parentId = await resolveMailWindowId();
  query.set("win", parentId ?? "");
  if (existing != null) {
    // Lite mode keeps the window (minimized): reset it and show it again.
    if ((await getSettings()).liteMode) {
      await browser.runtime.sendMessage({ type: "palette-wake", params: query.toString() }).catch(() => {});
      return browser.windows.update(existing, { state: "normal", focused: true });
    }
    // A window left minimized from lite mode (now off) is made fresh.
    const kept = (await browser.windows.get(existing)).state === "minimized";
    if (!kept && !action && !Object.keys(extra).length) return browser.windows.update(existing, { focused: true });
    await browser.windows.remove(existing).catch(() => {});
  }
  const parent = parentId == null ? null : await browser.windows.get(parentId);
  const geometry = { width: WIDTH, height: HEIGHT };
  if (parent?.width) {
    geometry.left = Math.round(parent.left + (parent.width - WIDTH) / 2);
    geometry.top = Math.round(parent.top + Math.max(40, (parent.height - HEIGHT) / 4));
  }
  const win = await browser.windows.create({
    type: "popup",
    url: browser.runtime.getURL(`src/palette/palette.html?${query}`),
    allowScriptsToClose: true,
    ...geometry,
  });
  // Older Thunderbird (102) ignores left/top when creating the window.
  if (geometry.left != null) await browser.windows.update(win.id, { left: geometry.left, top: geometry.top }).catch(() => {});
  await session.set({ spotlightWindowId: win.id });
}

async function jumpToShortcut(name) {
  const s = await getShortcut(name);
  if (!s) return;
  const windowId = await resolveMailWindowId();
  await pushRecent(s.folderId);
  const { revealFolderPane } = await getSettings();
  await jumpToFolder(s.folderId, windowId, { revealPane: revealFolderPane });
}

async function undoLastMove() {
  const last = await lastUndoableMove();
  if (last) await undoMove(last.id);
}

export function handleCommand(command) {
  if (command === "open-spotlight") return openSpotlight();
  if (command === "move-selected") return openSpotlight("move");
  if (command === "copy-selected") return openSpotlight("copy");
  if (command === "tag-selected") return openSpotlight("tag");
  if (command === "undo-move") return undoLastMove();
  if (command === "open-manager") return openManager();
  const m = /^jump-(\d+)$/.exec(command);
  if (m) return jumpToShortcut(m[1]);
}

browser.commands.onCommand.addListener((command) => handleCommand(command));

browser.windows.onRemoved.addListener(async (id) => {
  const { spotlightWindowId: current } = await session.get("spotlightWindowId");
  if (current === id) await session.remove("spotlightWindowId");
});

// Automatic backup file (opt-in): rewritten a moment after shortcuts,
// settings or keys change. Recent folders ride along but don't trigger it.
let backupTimer = null;

export async function runAutoBackup() {
  const { autoBackup } = await getSettings();
  if (!autoBackup || !(await hasDownloadsPermission())) return false;
  try {
    await writeBackupFile();
    await browser.storage.local.remove("lastBackupError");
    return true;
  } catch (e) {
    await browser.storage.local.set({ lastBackupError: e?.message ?? String(e) });
    return false;
  }
}

function scheduleBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(runAutoBackup, 1500);
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.shortcuts || changes.settings)) scheduleBackup();
});

// After a fresh install, show the options page with a welcome note (keys to
// use, and a button to restore a backup from a previous install).
// On a fresh install Thunderbird may not have a mail window yet, and opening
// the page then fails, so wait for one (up to a minute).
async function openWelcome() {
  for (let i = 0; i < 60; i++) {
    if ((await browser.mailTabs.query({})).length) {
      try {
        await browser.runtime.openOptionsPage();
        return;
      } catch {
        // Window still starting up; try again.
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

browser.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install") return;
  await browser.storage.local.set({ showWelcome: true });
  await openWelcome();
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "open-spotlight") return openSpotlight();
  if (msg?.type === "config-changed") return scheduleBackup();
  if (msg?.type === "backup-now") return runAutoBackup();
});

registerMenuHandlers({ openSpotlight });
registerFolderMenu({ openSpotlight });
setupMenus();
setupFolderMenu();
