// Self-test cases for the folder pane's right-click menu, typing "move name"
// in the palette, grayed-out account roots, and create-and-move with a date
// pattern. Runs after tests-manager.js ("TJ move A/B/C" are in MoveSrc).

import { runFolderMenu } from "../../src/background/folder-menu.js";
import { openSpotlight, handleCommand } from "../../src/background/background.js";
import { getShortcut } from "../../src/tb/store.js";
import { listAll } from "../../src/tb/messages.js";
import { queryFolder } from "../../src/tb/compat.js";
import { select } from "./tests-moves.js";
import { check, assert, waitFor, byPath, openPalette, type, press, closed, statusText, chrome } from "./util.js";

const subjectsIn = async (folderId) =>
  (await listAll(await browser.messages.query(queryFolder(folderId)))).map((m) => m.subject).sort();
const view = (page) => browser.extension.getViews().find((v) => v.location.pathname.endsWith(page));

export async function quickTests(windowId, root) {
  const src = await byPath(`${root.name}/JumpTest/MoveSrc`);
  const noSpotlight = { openSpotlight: async () => {} };

  await check("folder menu: “ThunderJump” is in the folder pane's right-click menu", async () => {
    const labels = await chrome(
      `return (async () => {
         const win = Services.wm.getMostRecentWindow("mail:3pane");
         const pane = win.document.getElementById("tabmail").currentAbout3Pane;
         const doc = pane?.document ?? win.document;
         const menu = doc.getElementById("folderPaneContext");
         const tree = pane?.folderTree ?? doc.getElementById("folderTree");
         const shown = new Promise((r) => menu.addEventListener("popupshown", r, { once: true }));
         // A real (trusted) right-click on the first folder row.
         const r = tree.getBoundingClientRect();
         tree.ownerGlobal.windowUtils.sendMouseEvent("contextmenu", r.left + 40, r.top + 12, 2, 1, 0);
         await shown;
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
