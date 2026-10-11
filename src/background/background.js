// Background event page: keyboard commands and the centered "spotlight" window.

import { resolveMailWindowId, jumpToFolder } from "../tb/tabs.js";
import { getShortcut, pushRecent, getSettings } from "../tb/store.js";
import { writeBackupFile, hasDownloadsPermission } from "../tb/backup.js";

const WIDTH = 640;
const HEIGHT = 460;

async function spotlightWindowId() {
  const { spotlightWindowId: id } = await browser.storage.session.get("spotlightWindowId");
  if (id == null) return null;
  try {
    await browser.windows.get(id);
    return id;
  } catch {
    return null;
  }
}

export async function openSpotlight() {
  const existing = await spotlightWindowId();
  if (existing != null) {
    await browser.windows.update(existing, { focused: true });
    return;
  }
  const parentId = await resolveMailWindowId();
  const parent = parentId == null ? null : await browser.windows.get(parentId);
  const geometry = { width: WIDTH, height: HEIGHT };
  if (parent?.width) {
    geometry.left = Math.round(parent.left + (parent.width - WIDTH) / 2);
    geometry.top = Math.round(parent.top + Math.max(40, (parent.height - HEIGHT) / 4));
  }
  const win = await browser.windows.create({
    type: "popup",
    url: browser.runtime.getURL(`src/palette/palette.html?mode=window&win=${parentId ?? ""}`),
    allowScriptsToClose: true,
    ...geometry,
  });
  await browser.storage.session.set({ spotlightWindowId: win.id });
}

async function jumpToShortcut(name) {
  const s = await getShortcut(name);
  if (!s) return;
  const windowId = await resolveMailWindowId();
  await pushRecent(s.folderId);
  const { revealFolderPane } = await getSettings();
  await jumpToFolder(s.folderId, windowId, { revealPane: revealFolderPane });
}

export function handleCommand(command) {
  if (command === "open-spotlight") return openSpotlight();
  const m = /^jump-(\d+)$/.exec(command);
  if (m) return jumpToShortcut(m[1]);
}

browser.commands.onCommand.addListener((command) => handleCommand(command));

browser.windows.onRemoved.addListener(async (id) => {
  const { spotlightWindowId: current } = await browser.storage.session.get("spotlightWindowId");
  if (current === id) await browser.storage.session.remove("spotlightWindowId");
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
