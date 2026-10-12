// Self-test cases for: revealing the folder in the folder pane, recent folders
// first in search, and rebinding keyboard shortcuts on the options page.

import { createFolderPath } from "../../src/tb/folders.js";
import { jumpToFolder, currentFolderId } from "../../src/tb/tabs.js";
import { check, assert, waitFor, sleep, byPath, openPalette, type, press, closed, headerTexts, chrome, statusText } from "./util.js";
import { setShortcut, getShortcut, getRecent } from "../../src/tb/store.js";
import { PANE_STATE, COLLAPSE } from "./pane-scripts.js";

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
    assert(s?.uri?.endsWith("/Target") && !s.collapsedAncestor && s.inView, `pane state: ${JSON.stringify(s)}, displayed: ${await currentFolderId(windowId)}`);
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

  await check("palette: Delete, × and Clear edit Shortcuts and Recent", async () => {
    await setShortcut("tmp", (await at("Trash")).id, "Local Folders › Trash");
    let p = await openPalette(windowId);
    await type(p, "");
    const selectedText = () => p.doc.querySelector("#list li.selected")?.textContent ?? "";
    // Shortcuts are listed first: j1, then tmp.
    for (let i = 0; i < 5 && !selectedText().includes("tmp"); i++) press(p, "ArrowDown");
    assert(selectedText().includes("tmp"), `selected: ${selectedText()}`);
    press(p, "Delete");
    await statusText(p, "Deleted shortcut “tmp”");
    assert((await getShortcut("tmp")) === null, "tmp not deleted");
    assert((await getShortcut("1")) !== null, "j1 must stay");

    const recentBefore = await getRecent();
    assert(recentBefore.length >= 2, `need recent folders, have ${recentBefore.length}`);
    const firstRecent = [...p.doc.querySelectorAll("#list li.item")].find((li) => li.querySelector(".remove") && !li.querySelector(".badge"));
    firstRecent.querySelector(".remove").click();
    await statusText(p, "from Recent");
    assert((await getRecent()).length === recentBefore.length - 1, "× did not remove one recent folder");

    const clear = [...p.doc.querySelectorAll("#list li.header")].find((h) => h.textContent.startsWith("Recent"))?.querySelector(".clear");
    clear.click();
    await statusText(p, "Cleared Recent");
    assert((await getRecent()).length === 0, "Recent not cleared");
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
