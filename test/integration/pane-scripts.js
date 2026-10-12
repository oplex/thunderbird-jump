// Chrome-privileged scripts (run via the runner's Marionette session) that
// read and change Thunderbird's own folder pane. Thunderbird 115+ has the
// HTML folder tree in about:3pane; 102 and older a XUL tree (gFolderTreeView).

// What the folder tree shows right now.
export const PANE_STATE = `
  const win = Services.wm.getMostRecentWindow("mail:3pane");
  const pane = win.document.getElementById("tabmail").currentAbout3Pane;
  if (!pane) {
    const view = win.gFolderTreeView;
    const tree = win.document.getElementById("folderTree");
    const folder = view.getSelectedFolders()[0];
    if (!folder) return null;
    const idx = view.getIndexOfFolder(folder);
    const first = tree.getFirstVisibleRow();
    const last = tree.getLastVisibleRow();
    const box = win.document.getElementById("folderPaneBox");
    return {
      paneVisible: !box.collapsed && box.getAttribute("collapsed") !== "true",
      uri: folder.URI,
      collapsedAncestor: idx == null,
      inView: idx != null && idx >= first && idx <= last,
      scrolled: first > 0,
      overflowing: view.rowCount > last - first + 1,
    };
  }
  const tree = pane.folderTree;
  const row = tree.selectedRow;
  if (!row) return null;
  let scroller = tree;
  while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement;
  const r = row.firstElementChild.getBoundingClientRect();
  const v = (scroller ?? tree).getBoundingClientRect();
  return {
    paneVisible: pane.paneLayout.folderPaneVisible,
    uri: row.uri,
    collapsedAncestor: !!row.parentNode.closest("li.collapsed"),
    inView: r.top >= v.top - 1 && r.bottom <= v.bottom + 1,
    scrolled: (scroller?.scrollTop ?? 0) > 0,
    overflowing: !!scroller,
    debug: { rowTop: r.top, rowBottom: r.bottom, viewTop: v.top, viewBottom: v.bottom, scrollTop: scroller?.scrollTop },
  };`;

// Collapse the folder whose URI ends with arguments[0] and scroll to the top.
export const COLLAPSE = `
  const win = Services.wm.getMostRecentWindow("mail:3pane");
  const pane = win.document.getElementById("tabmail").currentAbout3Pane;
  if (!pane) {
    const view = win.gFolderTreeView;
    for (let i = 0; i < view.rowCount; i++) {
      if (!view.getFolderForIndex(i)?.URI.endsWith(arguments[0])) continue;
      if (view.isContainerOpen(i)) view.toggleOpenState(i);
      win.document.getElementById("folderTree").scrollToRow(0);
      return !view.isContainerOpen(i);
    }
    return false;
  }
  const tree = pane.folderTree;
  const row = [...tree.querySelectorAll("li")].find((li) => li.uri?.endsWith(arguments[0]));
  if (!row) return false;
  tree.collapseRow(row);
  tree.scrollTop = 0;
  for (let el = tree.parentElement; el; el = el.parentElement) el.scrollTop = 0;
  return row.classList.contains("collapsed");`;

// Import a privileged module: .sys.mjs (Thunderbird 115+) or .jsm (older).
export const importModule = (name) =>
  `(ChromeUtils.importESModule ? ChromeUtils.importESModule("resource://gre/modules/${name}.sys.mjs") : ChromeUtils.import("resource://gre/modules/${name}.jsm"))`;
