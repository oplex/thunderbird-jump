// Navigation helpers: find the mail window/tab and change the displayed folder.
// Changing the displayed folder is purely a view change; no data is modified.

import { hasFolderIds, legacyRef, legacyRootId, isLegacyRoot, folderIdOf, tabIdOf, displayProps, canCreateMailTab, thunderbirdMajor, getMailTab, getAccount } from "./compat.js";

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

export async function findMailTab(windowId) {
  const opts = windowId == null ? {} : { windowId };
  const [active] = await browser.mailTabs.query({ ...opts, active: true });
  if (active) return active;
  const [any] = await browser.mailTabs.query(opts);
  return any ?? null;
}

// Id of the folder shown in the window's mail tab, or null.
export async function currentFolderId(windowId) {
  const tab = await findMailTab(windowId);
  return tab?.displayedFolder ? folderIdOf(tab.displayedFolder) : null;
}

// Thunderbird selects the folder in the folder pane, expanding collapsed
// parents and scrolling to it. With `revealPane` the pane is also shown if it
// was hidden. If the folder is not listed in any enabled folder-pane view
// (e.g. only "Favorite folders"), the "All folders" view is turned on.
async function showFolder(tabId, folderId, revealPane) {
  const props = displayProps(folderId);
  // Show the pane *before* selecting: Thunderbird scrolls the selected row
  // into view at selection time, which does nothing while the pane is hidden.
  if (revealPane) {
    const tab = await getMailTab(tabId);
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
  // Thunderbird 102 and older *toggle* the parents of a hidden folder open,
  // so parents that were already expanded get closed again and the folder
  // isn't selected. Each retry gets one level further.
  if ((await thunderbirdMajor()) < 115) {
    for (let i = 0; i < 8; i++) {
      const tab = await getMailTab(tabId);
      if (tab.displayedFolder && folderIdOf(tab.displayedFolder) === folderId) break;
      await browser.mailTabs.update(tabId, props);
    }
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

async function rootAndDepth(folderId) {
  if (!hasFolderIds()) {
    const { accountId, path } = legacyRef(folderId);
    return { rootId: legacyRootId(accountId), depth: isLegacyRoot(folderId) ? 0 : path.split("/").filter(Boolean).length };
  }
  const folder = await browser.folders.get(folderId);
  const account = await getAccount(folder.accountId);
  const depth = folder.isRoot ? 0 : (folder.path ?? "").split("/").filter(Boolean).length;
  return { rootId: account?.rootFolder?.id, depth };
}

async function rescrollAfterExpand(tabId, folderId) {
  if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  // The animated folder tree arrived in 115; older versions scroll correctly.
  if ((await thunderbirdMajor()) < 115) return;
  const { rootId, depth } = await rootAndDepth(folderId);
  if (!rootId || depth < 2) return;
  await new Promise((r) => setTimeout(r, EXPAND_ANIMATION_MS));
  await browser.mailTabs.update(tabId, displayProps(rootId));
  await browser.mailTabs.update(tabId, displayProps(folderId));
}

// Show `folderId` in the window's mail tab (or in a new tab when asked).
// (Tab and folder field names differ by version; see compat.js.)
export async function jumpToFolder(folderId, windowId, { newTab = false, revealPane = true } = {}) {
  // Thunderbird 115 can't open a mail tab for an add-on; use the current one.
  let tab = newTab && canCreateMailTab() ? null : await findMailTab(windowId);
  if (!tab) {
    tab = await browser.mailTabs.create(displayProps(folderId));
    if (revealPane && tab) await showFolder(tabIdOf(tab), folderId, true);
  } else {
    if (!tab.active) await browser.tabs.update(tabIdOf(tab), { active: true });
    await showFolder(tabIdOf(tab), folderId, revealPane);
  }
  if (windowId != null) {
    await browser.windows.update(windowId, { focused: true }).catch(() => {});
  }
}

// Open the ThunderJump Manager in a tab (or switch to it if already open).
// `params`: e.g. { folder: id } to open it searching inside one folder.
export async function openManager(params = {}) {
  const base = browser.runtime.getURL("src/manager/manager.html");
  const query = new URLSearchParams(params).toString();
  const url = query ? `${base}?${query}` : base;
  const [open] = await browser.tabs.query({ url: `${base}*` }).catch(() => []);
  if (open) {
    await browser.tabs.update(open.id, query ? { active: true, url } : { active: true });
    await browser.windows.update(open.windowId, { focused: true }).catch(() => {});
    return;
  }
  await browser.tabs.create({ url });
}
