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

// Thunderbird selects the folder in the folder pane, expanding collapsed
// parents and scrolling to it. With `revealPane` the pane is also shown if it
// was hidden. If the folder is not listed in any enabled folder-pane view
// (e.g. only "Favorite folders"), the "All folders" view is turned on.
async function showFolder(tabId, folderId, revealPane) {
  const props = { displayedFolderId: folderId };
  // Show the pane *before* selecting: Thunderbird scrolls the selected row
  // into view at selection time, which does nothing while the pane is hidden.
  if (revealPane) {
    const tab = await browser.mailTabs.get(tabId);
    if (!tab.folderPaneVisible) {
      await browser.mailTabs.update(tabId, { folderPaneVisible: true });
      // Let the pane get its final size before Thunderbird scrolls in it.
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  try {
    await browser.mailTabs.update(tabId, props);
  } catch (e) {
    if (!/not viewable/i.test(e?.message ?? "")) throw e;
    await browser.mailTabs.update(tabId, { ...props, folderMode: "all" });
  }
  if (revealPane) await rescrollAfterExpand(tabId, folderId);
}

// Thunderbird scrolls to the selected folder at the *start* of its 200 ms
// expand animation, so a folder whose parents were collapsed ends up just
// out of view. After the animation, briefly select the account row and the
// folder again so Thunderbird scrolls once more with the final layout. The
// account row shows no message list, so nothing extra is loaded. Skipped for
// top-level folders and when the system asks for reduced motion (no animation).
const EXPAND_ANIMATION_MS = 250;

async function rescrollAfterExpand(tabId, folderId) {
  if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const folder = await browser.folders.get(folderId);
  if (folder.isRoot || (folder.path ?? "").split("/").filter(Boolean).length < 2) return;
  const account = await browser.accounts.get(folder.accountId);
  const rootId = account?.rootFolder?.id;
  if (!rootId) return;
  await new Promise((r) => setTimeout(r, EXPAND_ANIMATION_MS));
  await browser.mailTabs.update(tabId, { displayedFolderId: rootId });
  await browser.mailTabs.update(tabId, { displayedFolderId: folderId });
}

// Show `folderId` in the window's mail tab (or in a new tab when asked).
// MV3 MailTab exposes `tabId` and takes `displayedFolderId` (Thunderbird 128+).
export async function jumpToFolder(folderId, windowId, { newTab = false, revealPane = true } = {}) {
  let tab = newTab ? null : await findMailTab(windowId);
  if (!tab) {
    tab = await browser.mailTabs.create({ displayedFolderId: folderId });
    if (revealPane && tab?.tabId) await showFolder(tab.tabId, folderId, true);
  } else {
    if (!tab.active) await browser.tabs.update(tab.tabId, { active: true });
    await showFolder(tab.tabId, folderId, revealPane);
  }
  if (windowId != null) {
    await browser.windows.update(windowId, { focused: true }).catch(() => {});
  }
}
