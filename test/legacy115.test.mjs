// The same add-on code against a Thunderbird 115-shaped API (see compat.js).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeFakeBrowser115 } from "./helpers/fake-browser-115.mjs";

const { loadFolders, createFolderPath } = await import("../src/tb/folders.js");
const { jumpToFolder, currentFolderId } = await import("../src/tb/tabs.js");
const { buildRows } = await import("../src/lib/rows.js");
const { runAction } = await import("../src/palette/actions.js");
const store = await import("../src/tb/store.js");

let fake;
beforeEach(() => {
  fake = makeFakeBrowser115();
  globalThis.browser = fake.browser;
});

async function makeState() {
  const folders = await loadFolders();
  return {
    folders,
    byId: new Map(folders.map((f) => [f.id, f])),
    shortcuts: await store.getShortcuts(),
    recent: await store.getRecent(),
    currentId: await currentFolderId(1),
    createParentId: null,
    windowId: 1,
    settings: await store.getSettings(),
  };
}

test("lists folders with made-up ids and special-use from `type`", async () => {
  const folders = await loadFolders();
  assert.deepEqual(
    folders.map((f) => [f.id, f.segments.join("/")]),
    [
      ["account1:/", "Old Mail"],
      ["account1:/INBOX", "Old Mail/Inbox"],
      ["account1:/INBOX/Clients", "Old Mail/Inbox/Clients"],
      ["account1:/INBOX/Clients/Acme", "Old Mail/Inbox/Clients/Acme"],
      ["account1:/Trash", "Old Mail/Trash"],
    ],
  );
  assert.deepEqual(folders[1].specialUse, ["inbox"]);
  assert.equal(folders[0].isRoot, true);
});

test("current folder and jumping use folder objects", async () => {
  assert.equal(await currentFolderId(1), "account1:/INBOX");
  await jumpToFolder("account1:/Trash", 1, { revealPane: false });
  assert.deepEqual(fake.calls, [["mailTabs.update", 7, "/Trash"]]);
  assert.equal(await currentFolderId(1), "account1:/Trash");
});

test("nested jump re-selects via the account root to fix scrolling", async () => {
  await jumpToFolder("account1:/INBOX/Clients/Acme", 1);
  assert.deepEqual(fake.calls, [
    ["mailTabs.update", 7, "/INBOX/Clients/Acme"],
    ["mailTabs.update", 7, "/"],
    ["mailTabs.update", 7, "/INBOX/Clients/Acme"],
  ]);
});

test("new tab falls back to the current tab (no mailTabs.create in 115)", async () => {
  await jumpToFolder("account1:/Trash", 1, { newTab: true, revealPane: false });
  assert.equal(await currentFolderId(1), "account1:/Trash");
});

test("creates nested folders under a folder and at the account top level", async () => {
  const state = await makeState();
  const clients = state.byId.get("account1:/INBOX/Clients");
  const id = await createFolderPath(clients, "Acme/2026");
  assert.equal(id, "account1:/INBOX/Clients/Acme/2026");
  const top = await createFolderPath(state.byId.get("account1:/"), "Projects");
  assert.equal(top, "account1:/Projects");
  assert.deepEqual(fake.calls, [
    ["folders.create", "/INBOX/Clients/Acme", "2026"],
    ["folders.create", "/", "Projects"],
  ]);
});

test("palette flow: search, jump, :jj1 and j1", async () => {
  let state = await makeState();
  const [row] = buildRows("acme", state);
  await runAction(row.action, { ...state, settings: { ...state.settings, revealFolderPane: false } });
  state = await makeState();
  const [set] = buildRows(":jj1", state);
  await runAction(set.action, state);
  assert.equal((await store.getShortcut("1")).folderId, "account1:/INBOX/Clients/Acme");
  state = await makeState();
  assert.equal(buildRows("j1", state)[0].action.folderId, "account1:/INBOX/Clients/Acme");
});
