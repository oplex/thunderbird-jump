// Navigation helpers: find the mail window/tab and change the displayed folder.
// Changing the displayed folder is purely a view change; no data is modified.

// The 3-pane window the palette should act on.
// `hint` is a window id passed in by the opener (spotlight mode), if any.
export async function resolveMailWindowId(hint) {
  if (Number.isInteger(hint)) {
    try {
      const w = await browser.windows.get(hint);
      if (w.type === "normal") return w.id;
    } catch {
      // Window was closed; fall through.
    }
  }
  try {
    const current = await browser.windows.getCurrent();
    if (current.type === "normal") return current.id;
  } catch {
    // No current window (e.g. called from the background page).
  }
  const w = await browser.windows.getLastFocused({ windowTypes: ["normal"] });
  return w?.id ?? null;
}

async function findMailTab(windowId) {
  const opts = windowId == null ? {} : { windowId };
  const [active] = await browser.mailTabs.query({ ...opts, active: true });
  if (active) return active;
  const [any] = await browser.mailTabs.query(opts);
  return any ?? null;
}

// Id of the folder shown in the window's mail tab, or null.
export async function currentFolderId(windowId) {
  const tab = await findMailTab(windowId);
  return tab?.displayedFolder?.id ?? null;
}

// Show `folderId` in the window's mail tab (or in a new tab when asked).
// MV3 MailTab exposes `tabId` and takes `displayedFolderId` (Thunderbird 128+).
export async function jumpToFolder(folderId, windowId, { newTab = false } = {}) {
  const tab = newTab ? null : await findMailTab(windowId);
  if (!tab) {
    await browser.mailTabs.create({ displayedFolderId: folderId });
  } else {
    if (!tab.active) await browser.tabs.update(tab.tabId, { active: true });
    await browser.mailTabs.update(tab.tabId, { displayedFolderId: folderId });
  }
  if (windowId != null) {
    await browser.windows.update(windowId, { focused: true }).catch(() => {});
  }
}
