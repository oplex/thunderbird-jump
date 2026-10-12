// Self-test cases for: revealing the folder in the folder pane, recent folders
// first in search, and rebinding keyboard shortcuts on the options page.

import { createFolderPath } from "../../src/tb/folders.js";
import { jumpToFolder, currentFolderId } from "../../src/tb/tabs.js";
import { check, assert, waitFor, sleep, byPath, openPalette, type, press, closed, headerTexts, chrome } from "./util.js";

// What the 3-pane folder tree shows right now (read via chrome privileges).
const PANE_STATE = `
  const win = Services.wm.getMostRecentWindow("mail:3pane");
  const pane = win.document.getElementById("tabmail").currentAbout3Pane;
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
    debug: { scroller: scroller && (scroller.id || scroller.tagName), rowTop: r.top, rowBottom: r.bottom, viewTop: v.top, viewBottom: v.bottom, scrollTop: scroller?.scrollTop, winH: win.innerHeight },
  };`;

// Collapse the folder-tree row whose URI ends with `suffix`.
const COLLAPSE = `
  const win = Services.wm.getMostRecentWindow("mail:3pane");
  const tree = win.document.getElementById("tabmail").currentAbout3Pane.folderTree;
  const row = [...tree.querySelectorAll("li")].find((li) => li.uri?.endsWith(arguments[0]));
  if (!row) return false;
  tree.collapseRow(row);
  tree.scrollTop = 0;
  for (let el = tree.parentElement; el; el = el.parentElement) el.scrollTop = 0;
  return row.classList.contains("collapsed");`;

export async function featureTests(windowId, root) {
  const at = (path) => byPath(`${root.name}/${path}`);

  await check("jump shows the folder pane, expands parents and scrolls to the folder", async () => {
    // Enough folders that the tree must scroll, and a deep target under them.
    for (let i = 0; i < 40; i++) await createFolderPath(root, `Filler ${String(i).padStart(2, "0")}`);
    await createFolderPath(root, "Zeta/Deep/Nested/Target");
    const target = await waitFor(() => at("Zeta/Deep/Nested/Target"), "Target folder");
    await jumpToFolder((await at("Trash")).id, windowId);
    const [tab] = await browser.mailTabs.query({ windowId, active: true });
    await browser.mailTabs.update(tab.tabId ?? tab.id, { folderPaneVisible: false });
    assert(await chrome(COLLAPSE, ["/Zeta"]), "could not collapse Zeta");

    const p = await openPalette(windowId);
    await type(p, "nested target");
    press(p, "Enter");
    await closed(p);
    assert((await currentFolderId(windowId)) === target.id, "did not jump to Target");
    const s = await waitFor(async () => {
      const v = await chrome(PANE_STATE);
      return v?.uri?.endsWith("/Target") && v.inView ? v : null;
    }, "Target selected and in view", 10000).catch(async () => chrome(PANE_STATE));
    assert(s?.paneVisible, `folder pane not shown: ${JSON.stringify(s)}`);
    assert(s.uri.endsWith("/Target"), `selected row is ${s.uri}`);
    assert(!s.collapsedAncestor, "a parent folder is still collapsed");
    assert(s.inView, `Target is not scrolled into view: ${JSON.stringify(s)}`);
    assert(!s.overflowing || s.scrolled, "folder pane did not scroll");
  });

  await check("jump scrolls to the folder when the pane is already open", async () => {
    await jumpToFolder((await at("Trash")).id, windowId);
    assert(await chrome(COLLAPSE, ["/Zeta"]), "could not collapse Zeta");
    const p = await openPalette(windowId);
    await type(p, "nested target");
    press(p, "Enter");
    await closed(p);
    const s = await waitFor(async () => {
      const v = await chrome(PANE_STATE);
      return v?.uri?.endsWith("/Target") && v.inView ? v : null;
    }, "Target selected and in view", 10000).catch(async () => chrome(PANE_STATE));
    assert(s?.uri?.endsWith("/Target") && !s.collapsedAncestor && s.inView, `pane state: ${JSON.stringify(s)}`);
  });

  await check("search shows matching recent folders first", async () => {
    await jumpToFolder((await at("Trash")).id, windowId);
    let p = await openPalette(windowId);
    await type(p, "filler 07");
    press(p, "Enter");
    await closed(p);

    p = await openPalette(windowId);
    const rows = await type(p, "filler");
    assert(headerTexts(p)[0] === "Recent", `headers: ${headerTexts(p)}`);
    assert(rows[0]?.includes("Filler 07"), `first row was ${rows[0]}`);
    press(p, "Escape");
    await closed(p);
  });

  await check("options page rebinds a shortcut and resets it", async () => {
    await browser.runtime.openOptionsPage();
    const view = await waitFor(
      () => browser.extension.getViews().find((v) => v.location.pathname.endsWith("options.html")),
      "options view",
    );
    const box = () => view.document.querySelector('input.shortcut[data-command="open-spotlight"]');
    const shortcut = async () => (await browser.commands.getAll()).find((c) => c.name === "open-spotlight").shortcut;
    const keydown = (opts) => box().dispatchEvent(new view.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...opts }));
    await waitFor(box, "shortcut box");

    box().focus();
    keydown({ key: "k", code: "KeyK", ctrlKey: true, altKey: true });
    await waitFor(async () => (await shortcut()) === "Alt+Ctrl+K", "Alt+Ctrl+K saved");

    box().focus();
    keydown({ key: "K", code: "KeyK", ctrlKey: true, altKey: true, shiftKey: true });
    await sleep(300);
    assert((await shortcut()) === "Alt+Ctrl+K", "3-modifier shortcut should be refused");
    const status = box().closest("tr").lastElementChild.textContent;
    assert(/at most two/.test(status), `status was “${status}”`);

    const reset = [...box().closest("tr").querySelectorAll("button")].find((b) => b.textContent === "Reset");
    reset.click();
    await waitFor(async () => (await shortcut()) === "Ctrl+Shift+Space", "reset to default");
    view.close();
  });
}
