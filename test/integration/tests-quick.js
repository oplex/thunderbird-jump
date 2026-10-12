// Self-test cases for the folder pane's right-click menu, typing "move name"
// in the palette, grayed-out account roots, and create-and-move with a date
// pattern. Runs after tests-manager.js ("TJ move A/B/C" are in MoveSrc).

import { runFolderMenu } from "../../src/background/folder-menu.js";
import { openSpotlight, handleCommand } from "../../src/background/background.js";
import { getShortcut, saveSettings } from "../../src/tb/store.js";
import { listAll } from "../../src/tb/messages.js";
import { queryFolder } from "../../src/tb/compat.js";
import { select } from "./tests-moves.js";
import { jumpToFolder } from "../../src/tb/tabs.js";
import { check, log, assert, waitFor, byPath, openPalette, type, press, closed, statusText, chrome } from "./util.js";

const subjectsIn = async (folderId) =>
  (await listAll(await browser.messages.query(queryFolder(folderId)))).map((m) => m.subject).sort();
const view = (page) => browser.extension.getViews().find((v) => v.location.pathname.endsWith(page));

export async function quickTests(windowId, root) {
  const src = await byPath(`${root.name}/JumpTest/MoveSrc`);
  const noSpotlight = { openSpotlight: async () => {} };
  await check("“:s text” searches mail in the current folder (Manager)", async () => {
    await jumpToFolder(src.id, windowId);
    const p = await openPalette(windowId);
    const rows = await type(p, ":s TJ move");
    assert(rows[0]?.includes("in MoveSrc"), `row: ${rows[0]}`);
    press(p, "Enter");
    await closed(p);
    const v = await waitFor(() => view("manager.html"), "manager page");
    await waitFor(() => v.document.querySelector("#chips .chip")?.textContent.includes("MoveSrc"), "MoveSrc chip");
    await waitFor(() => v.document.getElementById("q").value === "TJ move" && v.document.querySelectorAll("#rows tr").length === 3, "3 results");
    v.close();
  });

  await check("a plain function key (F2) can be a shortcut", async () => {
    await browser.commands.update({ name: "open-spotlight", shortcut: "F2" });
    const cmd = (await browser.commands.getAll()).find((c) => c.name === "open-spotlight");
    assert(cmd.shortcut === "F2", `shortcut: ${cmd.shortcut}`);
    await browser.commands.reset("open-spotlight");
  });

  await check("lite mode: Esc minimizes, the next open restores it fast and reset", async () => {
    const popup = async () => (await browser.windows.getAll()).find((x) => x.type === "popup");
    const openTimed = async () => {
      const t0 = performance.now();
      await handleCommand("open-spotlight");
      const v = await waitFor(async () => (view("palette.html")?.document.querySelector("#list li") && (await popup())?.state === "normal" ? view("palette.html") : null), "palette shown");
      return { v, ms: Math.round(performance.now() - t0) };
    };
    await saveSettings({ liteMode: true });
    try {
      const first = await openTimed();
      type({ view: first.v, doc: first.v.document }, "zzz leftover");
      first.v.document.getElementById("input").dispatchEvent(new first.v.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await waitFor(async () => (await popup())?.state === "minimized", "minimized");
      const again = await openTimed();
      log(`lite mode: first open ${first.ms} ms, reopen ${again.ms} ms`);
      assert(again.v === first.v, "a new page was made");
      assert(again.v.document.getElementById("input").value === "", "old text still there");
      assert(again.ms < first.ms, `reopen ${again.ms} ms not faster than ${first.ms} ms`);
    } finally {
      await saveSettings({ liteMode: false });
      for (const x of await browser.windows.getAll()) if (x.type === "popup") await browser.windows.remove(x.id);
    }
  });

  await check("folder menu: “ThunderJump” is in the folder pane's right-click menu", async () => {
    const labels = await chrome(
      `return (async () => {
         const win = Services.wm.getMostRecentWindow("mail:3pane");
         const pane = win.document.getElementById("tabmail").currentAbout3Pane;
         const doc = pane?.document ?? win.document;
         const menu = doc.getElementById("folderPaneContext");
         const tree = doc.getElementById("folderTree") ?? pane?.folderTree;
         const shown = new Promise((r) => menu.addEventListener("popupshown", r, { once: true }));
         // A real (trusted) right-click on the first folder row where that
         // exists (91 reads the folder from the click); newer versions drop
         // sendMouseEvent and are fine with a popup opened on the tree.
         const r = tree.getBoundingClientRect();
         const wu = (tree.ownerGlobal ?? pane ?? win).windowUtils;
         const timeout = (ms) => new Promise((res) => win.setTimeout(() => res("timeout"), ms));
         if (typeof wu.sendMouseEvent === "function") wu.sendMouseEvent("contextmenu", r.left + 40, r.top + 12, 2, 1, 0);
         if (typeof wu.sendMouseEvent !== "function" || (await Promise.race([shown, timeout(3000)])) === "timeout") {
           menu.openPopup(tree, "overlap", 20, 20, true, false);
           await shown;
         }
         await new Promise((res) => win.setTimeout(res, 500));
         const out = [...menu.querySelectorAll("menu, menuitem")].map((m) => m.getAttribute("label"));
         menu.hidePopup();
         return out;
       })();`,
    );
    assert(labels.includes("ThunderJump"), `not in the menu: ${labels.slice(-8).join(", ")}`);
  });

  await check("folder menu: Save as j7, then Remove shortcut j7", async () => {
    await runFolderMenu("tj-f-set:7", src.id, noSpotlight);
    assert((await getShortcut("7"))?.folderId === src.id, "j7 not saved");
    await runFolderMenu("tj-f-del:7", src.id, noSpotlight);
    assert(!(await getShortcut("7")), "j7 not removed");
  });

  await check("folder menu: Search messages here opens the Manager scoped to the folder", async () => {
    await runFolderMenu("tj-f-search", src.id, noSpotlight);
    const v = await waitFor(() => view("manager.html"), "manager page");
    await waitFor(() => v.document.querySelector("#chips .chip")?.textContent.includes("MoveSrc"), "MoveSrc chip");
    await waitFor(() => v.document.querySelectorAll("#rows tr").length === 3, "3 messages");
    v.close();
  });

  await check("folder menu: Save as named shortcut… opens the palette for that folder", async () => {
    await runFolderMenu("tj-f-name", src.id, { openSpotlight });
    const v = await waitFor(() => view("palette.html"), "palette");
    const p = { view: v, doc: v.document, win: await browser.windows.getLastFocused() };
    await waitFor(() => p.doc.getElementById("input").value === ":jj ", "“:jj ” typed");
    const rows = await type(p, ":jj quick");
    assert(rows[0]?.includes("MoveSrc"), `row: ${rows[0]}`);
    press(p, "Enter");
    await statusText(p, "Saved :j quick");
    assert((await getShortcut("quick"))?.folderId === src.id, "shortcut not saved");
    v.close();
  });

  await check("typing “move name” switches to moving; account roots are grayed out", async () => {
    await select(windowId, src.id, ["TJ move A"]);
    const p = await openPalette(windowId);
    await type(p, "move movedst");
    await waitFor(() => !p.doc.getElementById("selection").hidden, "selection banner");
    assert(p.doc.getElementById("input").value === "movedst", `input: ${p.doc.getElementById("input").value}`);
    await waitFor(() => p.doc.querySelector("#list li.item")?.textContent.includes("MoveDst"), "MoveDst first");
    await type(p, root.name.slice(0, 5));
    const off = await waitFor(() => p.doc.querySelector("#list li.disabled"), "grayed-out root");
    assert(/Account root/.test(off.textContent), `row: ${off.textContent}`);
    press(p, "Escape");
    await closed(p);
  });

  await check("move mode: “parent > Name {YYYY}” creates the folder and moves there", async () => {
    await select(windowId, src.id, ["TJ move A"]);
    const p = await openPalette(windowId, "move");
    await waitFor(() => !p.doc.getElementById("selection").hidden, "selection banner");
    const year = String(new Date().getFullYear());
    const rows = await type(p, "jumptest > Made {YYYY}");
    assert(rows[0]?.includes(`New “Made ${year}” in JumpTest`), `row: ${rows[0]}`);
    press(p, "Enter");
    await closed(p);
    const made = await waitFor(() => byPath(`${root.name}/JumpTest/Made ${year}`), "new folder");
    await waitFor(async () => (await subjectsIn(made.id)).join() === "TJ move A", "A in the new folder");
    await handleCommand("undo-move");
    await waitFor(async () => (await subjectsIn(src.id)).length === 3, "A back in MoveSrc");
  });
}
