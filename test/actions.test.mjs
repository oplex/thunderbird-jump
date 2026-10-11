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
  assert.deepEqual(fake.calls, [["mailTabs.update", 7, row.entry.id]]);
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
