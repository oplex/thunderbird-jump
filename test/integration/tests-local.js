// Self-test cases against the Local Folders account: folder API wrappers,
// search/jump, shortcuts and folder creation through the real palette.

import { loadFolders, createFolderPath } from "../../src/tb/folders.js";
import { jumpToFolder, currentFolderId } from "../../src/tb/tabs.js";
import { getShortcut } from "../../src/tb/store.js";
import { check, assert, waitFor, log, byPath, openPalette, type, press, closed, statusText } from "./util.js";

const idOf = (tab) => tab.tabId ?? tab.id; // MV3 / MV2 field name

export async function localTests(windowId) {
  let root;
  const at = (path) => byPath(`${root.name}/${path}`);
  const shown = () => currentFolderId(windowId);
  const go = async (path) => jumpToFolder((await at(path)).id, windowId);

  await check("lists Local Folders account with its folders", async () => {
    const folders = await waitFor(async () => {
      const all = await loadFolders();
      return all.some((f) => f.name === "Trash") ? all : null;
    }, "Local Folders' Trash");
    root = folders.find((f) => f.isRoot && f.name === "Local Folders");
    assert(root, "no Local Folders root");
    log(`folders: ${folders.map((f) => f.segments.join("/")).join(", ")}`);
  });

  await check("creates nested folders and reuses existing ones", async () => {
    await createFolderPath(root, "JumpTest/Clients/Acme");
    await createFolderPath(root, "JumpTest/Clients/Beta");
    const paths = (await loadFolders()).map((f) => f.segments.slice(1).join("/"));
    for (const p of ["JumpTest", "JumpTest/Clients", "JumpTest/Clients/Acme", "JumpTest/Clients/Beta"]) {
      assert(paths.includes(p), `missing ${p}`);
    }
    assert(paths.filter((p) => p === "JumpTest/Clients").length === 1, "duplicate Clients folder");
  });

  await check("jumpToFolder changes the displayed folder", async () => {
    await go("JumpTest/Clients/Acme");
    assert((await shown()) === (await at("JumpTest/Clients/Acme")).id, "displayed folder did not change");
  });

  await check("palette: fuzzy search + Enter jumps", async () => {
    await go("Trash");
    const p = await openPalette(windowId);
    const rows = await type(p, "jt beta");
    assert(rows[0]?.includes("Beta"), `first row was ${rows[0]}`);
    press(p, "Enter");
    await closed(p);
    assert((await shown()) === (await at("JumpTest/Clients/Beta")).id, "did not jump to Beta");
  });

  await check("palette: diacritics fold (å/ä/ö match a/o)", async () => {
    await createFolderPath(root, "JumpTest/Kvitton/Åsa Övrigt");
    const p = await openPalette(windowId);
    const rows = await type(p, "asa ovr");
    assert(rows[0]?.includes("Åsa Övrigt"), `first row was ${rows[0]}`);
    press(p, "Escape");
    await closed(p);
  });

  await check("palette: :jj1 saves current folder, j1 jumps to it", async () => {
    await go("JumpTest/Clients/Acme");
    const acme = await at("JumpTest/Clients/Acme");
    let p = await openPalette(windowId);
    await type(p, ":jj1");
    press(p, "Enter");
    await statusText(p, "Saved j1");
    assert((await getShortcut("1"))?.folderId === acme.id, "shortcut not stored");
    press(p, "Escape");
    await closed(p);

    await go("Trash");
    p = await openPalette(windowId);
    await type(p, "j1");
    press(p, "Enter");
    await closed(p);
    assert((await shown()) === acme.id, "j1 did not jump");
  });

  await check("palette: :jj name = query, :j name, :jd name", async () => {
    const beta = await at("JumpTest/Clients/Beta");
    let p = await openPalette(windowId);
    await type(p, ":jj work = beta");
    press(p, "Enter");
    await statusText(p, "Saved :j work");
    assert((await getShortcut("work"))?.folderId === beta.id, "named shortcut wrong");
    await type(p, ":j work");
    press(p, "Enter");
    await closed(p);
    assert((await shown()) === beta.id, ":j work did not jump");

    p = await openPalette(windowId);
    await type(p, ":jd work");
    press(p, "Enter");
    await statusText(p, "Deleted shortcut");
    assert((await getShortcut("work")) === null, "shortcut not deleted");
    press(p, "Escape");
    await closed(p);
  });

  await check("palette: Alt+1 jumps straight to shortcut 1", async () => {
    await go("Trash");
    const p = await openPalette(windowId);
    press(p, "1", { altKey: true });
    await closed(p);
    assert((await shown()) === (await at("JumpTest/Clients/Acme")).id, "Alt+1 did not jump");
  });

  await check("palette: Shift+Enter opens the folder in a new tab", async () => {
    const beta = await at("JumpTest/Clients/Beta");
    const p = await openPalette(windowId);
    await type(p, "jt beta");
    if (typeof browser.mailTabs.create !== "function") {
      // Thunderbird 115 can't open mail tabs for add-ons: it jumps in place.
      press(p, "Enter", { shiftKey: true });
      await closed(p);
      assert((await shown()) === beta.id, "did not jump to Beta");
      return;
    }
    const before = await browser.mailTabs.query({});
    press(p, "Enter", { shiftKey: true });
    await closed(p);
    const tab = await waitFor(async () => {
      const now = await browser.mailTabs.query({});
      return now.length > before.length && now.find((t) => !before.some((b) => idOf(b) === idOf(t)));
    }, "a new mail tab");
    await waitFor(async () => (await browser.mailTabs.get(idOf(tab))).displayedFolder?.id === beta.id, "new tab showing Beta");
    await browser.tabs.remove(idOf(tab));
  });

  await check("palette: 'query > Name' creates inside searched parent", async () => {
    const p = await openPalette(windowId);
    await type(p, "jumptest clients > Gamma/2026");
    press(p, "Enter");
    await closed(p);
    const gamma = await waitFor(() => at("JumpTest/Clients/Gamma/2026"), "Gamma/2026");
    assert((await shown()) === gamma.id, "did not jump to new folder");
  });

  await check("palette: :new creates inside the current folder", async () => {
    await go("JumpTest/Clients/Beta");
    const p = await openPalette(windowId);
    await type(p, ":new Receipts");
    press(p, "Enter");
    await closed(p);
    const receipts = await waitFor(() => at("JumpTest/Clients/Beta/Receipts"), "Beta/Receipts");
    assert((await shown()) === receipts.id, "did not jump to Receipts");
  });

  await check("palette: Ctrl+N creates a subfolder of the highlighted folder; Esc cancels", async () => {
    const p = await openPalette(windowId);
    await type(p, "acme");
    press(p, "n", { ctrlKey: true });
    let rows = await type(p, "Invoices");
    assert(rows[0]?.includes("Create") && rows[0].includes("Acme"), `row was ${rows[0]}`);
    press(p, "Escape");
    rows = await type(p, "acme");
    assert(!rows[0]?.includes("Create"), "Esc did not leave create mode");
    press(p, "Enter", { ctrlKey: true });
    await type(p, "Invoices");
    press(p, "Enter");
    await closed(p);
    await waitFor(() => at("JumpTest/Clients/Acme/Invoices"), "Acme/Invoices");
  });

  return root;
}
