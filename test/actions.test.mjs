import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeFakeBrowser } from "./helpers/fake-browser.mjs";

const { loadFolders, createFolderPath } = await import("../src/tb/folders.js");
const { runAction } = await import("../src/palette/actions.js");
const { buildRows } = await import("../src/lib/rows.js");
const store = await import("../src/tb/store.js");
const tabs = await import("../src/tb/tabs.js");

let fake;
beforeEach(() => {
  fake = makeFakeBrowser();
  globalThis.browser = fake.browser;
});

async function makeState() {
  const folders = await loadFolders();
  return {
    folders,
    byId: new Map(folders.map((f) => [f.id, f])),
    shortcuts: await store.getShortcuts(),
    recent: await store.getRecent(),
    currentId: await tabs.currentFolderId(1),
    createParentId: null,
    windowId: 1,
    settings: await store.getSettings(),
  };
}

const writes = () => fake.calls.filter(([op]) => op === "folders.create");

test("loadFolders flattens account tree with paths", async () => {
  const folders = await loadFolders();
  assert.deepEqual(folders.map((f) => f.segments.join("/")), [
    "Work Mail",
    "Work Mail/Inbox",
    "Work Mail/Inbox/Clients",
    "Work Mail/Inbox/Clients/Acme",
  ]);
  assert.equal(folders[0].id, fake.ids.root);
});

test("searching and jumping only changes the displayed folder", async () => {
  const state = await makeState();
  const [row] = buildRows("acme", state);
  assert.equal(row.entry.name, "Acme");
  const res = await runAction(row.action, state);
  assert.equal(res.close, true);
  // Nested folder: shown, then account row + folder again to re-scroll the pane.
  assert.deepEqual(fake.calls, [
    ["mailTabs.update", 7, row.entry.id],
    ["mailTabs.update", 7, fake.ids.root],
    ["mailTabs.update", 7, row.entry.id],
  ]);
  assert.deepEqual(await store.getRecent(), [row.entry.id]);
});

test(":jj1 saves current folder, j1 jumps back", async () => {
  let state = await makeState();
  const [setRow] = buildRows(":jj1", state);
  const res = await runAction(setRow.action, state);
  assert.match(res.message, /Saved j1 → Work Mail › Inbox/);

  state = await makeState();
  const [jumpRow] = buildRows("j1", state);
  assert.equal(jumpRow.action.folderId, fake.ids.inbox);
  assert.equal(jumpRow.badge, "1");
});

test(":jj name = query saves a searched folder; :jd deletes", async () => {
  let state = await makeState();
  const [row] = buildRows(":jj c = clients", state);
  await runAction(row.action, state);
  assert.equal((await store.getShortcut("C")).folderId, fake.ids.clients);

  state = await makeState();
  const [del] = buildRows(":jd c", state);
  await runAction(del.action, state);
  assert.equal(await store.getShortcut("c"), null);
});

test("query > A/B creates nested folders and reuses existing ones", async () => {
  const state = await makeState();
  const [row] = buildRows("clients > Acme/2026", state);
  assert.equal(row.action.parentId, fake.ids.clients);
  await runAction(row.action, state);
  const acme = state.folders.find((f) => f.name === "Acme");
  // "Acme" already exists, so only "2026" is created, inside it.
  assert.deepEqual(writes(), [["folders.create", acme.id, "2026"]]);
  const folders = await loadFolders();
  assert.ok(folders.some((f) => f.segments.join("/") === "Work Mail/Inbox/Clients/Acme/2026"));
});

test("creating at account root uses the root folder id", async () => {
  const state = await makeState();
  const root = state.folders.find((f) => f.isRoot);
  const id = await createFolderPath(root, "Projects");
  assert.deepEqual(writes(), [["folders.create", fake.ids.root, "Projects"]]);
  assert.ok(id);
});

test(":new creates inside the current folder", async () => {
  const state = await makeState();
  state.settings.jumpAfterCreate = false;
  const [row] = buildRows(":new Receipts", state);
  const res = await runAction(row.action, state);
  assert.deepEqual(writes(), [["folders.create", fake.ids.inbox, "Receipts"]]);
  assert.equal(res.close, false);
});

test("Ctrl+N create mode builds a create row for the parent", async () => {
  const state = await makeState();
  state.createParentId = fake.ids.clients;
  const [row] = buildRows("Beta / Q1", state);
  assert.deepEqual(row.action, { op: "create", parentId: fake.ids.clients, segments: ["Beta", "Q1"] });
});

test("empty name never creates anything", async () => {
  const state = await makeState();
  await assert.rejects(createFolderPath(state.folders[1], " / "));
  assert.deepEqual(writes(), []);
});

test("jumping to a missing folder fails cleanly", async () => {
  const state = await makeState();
  await assert.rejects(runAction({ op: "jump", folderId: "nope" }, state), /no longer exists/);
});

test("help and unknown commands have no actions", async () => {
  const state = await makeState();
  assert.ok(buildRows("?", state).every((r) => r.action == null));
  assert.equal(buildRows(":zz", state)[0].type, "info");
});

test("search lists matching recent folders first", async () => {
  const state = await makeState();
  const acme = state.folders.find((f) => f.name === "Acme");
  const clients = state.folders.find((f) => f.name === "Clients");
  state.recent = [acme.id];
  const rows = buildRows("c", state);
  assert.equal(rows[0].type, "header");
  assert.equal(rows[0].text, "Recent");
  assert.equal(rows[1].entry.id, acme.id);
  assert.equal(rows[2].text, "Folders");
  assert.ok(rows.slice(3).some((r) => r.entry?.id === clients.id));
});

test("jumping shows a hidden folder pane first, unless turned off", async () => {
  const state = await makeState();
  const [row] = buildRows("acme", state);
  await fake.browser.mailTabs.update(7, { folderPaneVisible: false });
  fake.calls.length = 0;
  state.settings.revealFolderPane = false;
  await runAction(row.action, state);
  assert.deepEqual(fake.calls, [["mailTabs.update", 7, row.entry.id]]);
  fake.calls.length = 0;
  state.settings.revealFolderPane = true;
  await runAction(row.action, state);
  // Pane first, then the folder (so Thunderbird can scroll to it).
  assert.deepEqual(fake.calls.slice(0, 2), [
    ["mailTabs.update", 7, { folderPaneVisible: true }],
    ["mailTabs.update", 7, row.entry.id],
  ]);
});

test("top-level folders are not re-selected", async () => {
  const state = await makeState();
  const [row] = buildRows("inbox", state);
  fake.calls.length = 0;
  await runAction(row.action, state);
  assert.deepEqual(fake.calls, [["mailTabs.update", 7, fake.ids.inbox]]);
});

test("an exact folder name beats recent folders", async () => {
  const state = await makeState();
  const acme = state.folders.find((f) => f.name === "Acme");
  const clients = state.folders.find((f) => f.name === "Clients");
  state.recent = [acme.id];
  const rows = buildRows("clients", state);
  assert.equal(rows[0].entry.id, clients.id);
  assert.equal(rows[1].text, "Recent");
  assert.equal(rows[2].entry.id, acme.id);
});

test("falls back to the All Folders view when the folder isn't listed", async () => {
  const state = await makeState();
  const [row] = buildRows("acme", state);
  const update = fake.browser.mailTabs.update;
  const modes = [];
  fake.browser.mailTabs.update = async (id, props) => {
    modes.push(props.folderMode);
    if (modes.length === 1) throw new Error("Requested folder is not viewable in any of the enabled folder modes");
    return update(id, props);
  };
  await runAction(row.action, state);
  assert.deepEqual(modes.slice(0, 2), [undefined, "all"]);
});
