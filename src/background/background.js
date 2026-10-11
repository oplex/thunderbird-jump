// Background event page: keyboard commands and the centered "spotlight" window.

import { resolveMailWindowId, jumpToFolder } from "../tb/tabs.js";
import { getShortcut, pushRecent, getSettings } from "../tb/store.js";

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

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "open-spotlight") return openSpotlight();
});
