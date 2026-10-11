// In-Thunderbird self-test. Only bundled into the test build (see profile.mjs).
// Drives the real palette page and the real folder/tab APIs, then POSTs a
// report to the runner.

import { REPORT_URL } from "./config.js";
import { loadFolders, createFolderPath } from "../../src/tb/folders.js";
import { jumpToFolder, currentFolderId, resolveMailWindowId } from "../../src/tb/tabs.js";
import { getShortcut, saveSettings } from "../../src/tb/store.js";
import { openSpotlight } from "../../src/background/background.js";

const tests = [];
const post = (msg) => fetch(REPORT_URL, { method: "POST", body: JSON.stringify(msg) }).catch(() => {});
const log = (text) => post({ type: "log", text });

async function waitFor(fn, what, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function check(name, fn) {
  log(`- ${name}`);
  try {
    await fn();
    tests.push({ name, ok: true });
  } catch (e) {
    log(`  failed: ${e}`);
    tests.push({ name, ok: false, error: String(e?.stack ?? e) });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const byPath = async (path) => (await loadFolders()).find((f) => f.segments.join("/") === path);

// Open the palette as a spotlight window and return its live document.
async function openPalette(windowId) {
  const url = browser.runtime.getURL(`src/palette/palette.html?mode=window&win=${windowId}`);
  const win = await browser.windows.create({ type: "popup", url, width: 640, height: 460 });
  const view = await waitFor(
    () => browser.extension.getViews({ windowId: win.id }).find((v) => v.location.pathname.endsWith("palette.html")),
    "palette view",
  );
  await waitFor(() => view.document.querySelector("#list li"), "palette rows");
  return { win, view, doc: view.document };
}

async function type(p, text) {
  const input = p.doc.getElementById("input");
  input.value = text;
  input.dispatchEvent(new p.view.Event("input"));
  return [...p.doc.querySelectorAll("#list li")].map((li) => li.textContent);
}

function press(p, key, opts = {}) {
  const input = p.doc.getElementById("input");
  input.dispatchEvent(new p.view.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
}

async function closed(p) {
  await waitFor(async () => !(await browser.windows.getAll()).some((w) => w.id === p.win.id), "palette to close");
}

async function run() {
  const info = await browser.runtime.getBrowserInfo();
  log(`running in ${info.name} ${info.version}`);
  await waitFor(async () => (await browser.mailTabs.query({})).length > 0, "a mail tab", 60000);
  const windowId = await resolveMailWindowId();
  await saveSettings({ closeOnBlur: false, jumpAfterCreate: true });

  let root;
  await check("lists Local Folders account with its folders", async () => {
    const folders = await waitFor(async () => {
      const all = await loadFolders();
      return all.some((f) => f.name === "Trash") ? all : null;
    }, "Local Folders' Trash");
    root = folders.find((f) => f.isRoot);
    assert(root, "no account root");
    log(`folders: ${folders.map((f) => f.segments.join("/")).join(", ")}`);
  });

  await check("creates nested folders and reuses existing ones", async () => {
    await createFolderPath(root, "JumpTest/Clients/Acme");
    await createFolderPath(root, "JumpTest/Clients/Beta");
    const folders = await loadFolders();
    const paths = folders.map((f) => f.segments.slice(1).join("/"));
    for (const p of ["JumpTest", "JumpTest/Clients", "JumpTest/Clients/Acme", "JumpTest/Clients/Beta"]) {
      assert(paths.includes(p), `missing ${p}`);
    }
    assert(paths.filter((p) => p === "JumpTest/Clients").length === 1, "duplicate Clients folder");
  });

  await check("jumpToFolder changes the displayed folder", async () => {
    const acme = await byPath(`${root.name}/JumpTest/Clients/Acme`);
    await jumpToFolder(acme.id, windowId);
    assert((await currentFolderId(windowId)) === acme.id, "displayed folder did not change");
  });

  await check("palette: fuzzy search + Enter jumps", async () => {
    const trash = await byPath(`${root.name}/Trash`);
    const p = await openPalette(windowId);
    const rows = await type(p, "jt beta");
    assert(rows[0]?.includes("Beta"), `first row was ${rows[0]}`);
    press(p, "Enter");
    await closed(p);
    const beta = await byPath(`${root.name}/JumpTest/Clients/Beta`);
    assert((await currentFolderId(windowId)) === beta.id, "did not jump to Beta");
    await jumpToFolder(trash.id, windowId);
  });

  await check("palette: :jj1 saves current folder, j1 jumps to it", async () => {
    const acme = await byPath(`${root.name}/JumpTest/Clients/Acme`);
    await jumpToFolder(acme.id, windowId);
    let p = await openPalette(windowId);
    await type(p, ":jj1");
    press(p, "Enter");
    await waitFor(() => p.doc.getElementById("status").textContent.includes("Saved j1"), "save status");
    assert((await getShortcut("1"))?.folderId === acme.id, "shortcut not stored");
    await type(p, ":jj work = beta");
    press(p, "Enter");
    await waitFor(async () => (await getShortcut("work"))?.folderId, "named shortcut");
    press(p, "Escape");
    await closed(p);

    await jumpToFolder((await byPath(`${root.name}/Trash`)).id, windowId);
    p = await openPalette(windowId);
    await type(p, "j1");
    press(p, "Enter");
    await closed(p);
    assert((await currentFolderId(windowId)) === acme.id, "j1 did not jump");

    p = await openPalette(windowId);
    await type(p, ":j work");
    press(p, "Enter");
    await closed(p);
    const beta = await byPath(`${root.name}/JumpTest/Clients/Beta`);
    assert((await currentFolderId(windowId)) === beta.id, ":j work did not jump");
  });

  await check("palette: 'query > Name' creates inside searched parent", async () => {
    const p = await openPalette(windowId);
    await type(p, "jumptest clients > Gamma/2026");
    press(p, "Enter");
    await closed(p);
    const gamma = await waitFor(() => byPath(`${root.name}/JumpTest/Clients/Gamma/2026`), "Gamma/2026");
    assert((await currentFolderId(windowId)) === gamma.id, "did not jump to new folder");
  });

  await check("palette: Ctrl+N creates a subfolder of the highlighted folder", async () => {
    const p = await openPalette(windowId);
    await type(p, "acme");
    press(p, "n", { ctrlKey: true });
    const rows = await type(p, "Invoices");
    assert(rows[0]?.includes("Create") && rows[0].includes("Acme"), `row was ${rows[0]}`);
    press(p, "Enter");
    await closed(p);
    await waitFor(() => byPath(`${root.name}/JumpTest/Clients/Acme/Invoices`), "Acme/Invoices");
  });

  await check("toolbar popup page also works standalone", async () => {
    const win = await browser.windows.create({ type: "popup", url: browser.runtime.getURL("src/palette/palette.html") });
    const view = await waitFor(() => browser.extension.getViews({ windowId: win.id })[0], "popup view");
    await waitFor(() => view.document.querySelector("#list li"), "popup rows");
    assert(view.document.body.classList.contains("popup"), "popup mode class missing");
    await browser.windows.remove(win.id);
  });

  await check("spotlight command opens one centered palette window", async () => {
    const palettes = async () => (await browser.windows.getAll({ populate: true })).filter((w) => w.tabs?.some((t) => t.url?.includes("palette.html")));
    await openSpotlight();
    await waitFor(async () => (await palettes()).length === 1, "spotlight window");
    await openSpotlight();
    await new Promise((r) => setTimeout(r, 500));
    const wins = await palettes();
    assert(wins.length === 1, `expected 1 spotlight window, got ${wins.length}`);
    await browser.windows.remove(wins[0].id);
  });

  await post({ type: "result", version: info.version, tests });
}

run().catch((e) => post({ type: "result", version: "?", tests: [...tests, { name: "self-test crashed", ok: false, error: String(e?.stack ?? e) }] }));
