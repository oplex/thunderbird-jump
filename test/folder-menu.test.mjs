import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeFakeBrowser } from "./helpers/fake-browser.mjs";

const { folderIdFromInfo, folderMenuItems, runFolderMenu } = await import("../src/background/folder-menu.js");
const store = await import("../src/tb/store.js");
const { loadFolders } = await import("../src/tb/folders.js");
const { buildRows } = await import("../src/lib/rows.js");

let fake;
beforeEach(() => {
  fake = makeFakeBrowser();
  globalThis.browser = fake.browser;
});

test("finds the clicked folder in every Thunderbird's menu info", () => {
  assert.equal(folderIdFromInfo({ selectedFolders: [{ id: "f1" }] }), "f1");
  assert.equal(folderIdFromInfo({ selectedFolder: { id: "f2" } }), "f2");
  assert.equal(folderIdFromInfo({ selectedFolder: { accountId: "a1", path: "/Inbox" } }), "a1:/Inbox");
  assert.equal(folderIdFromInfo({ selectedAccount: { id: "a1", rootFolder: { id: "r" } } }), "r");
  assert.equal(folderIdFromInfo({ selectedAccount: { id: "a1" } }), "a1:/");
  assert.equal(folderIdFromInfo({}), null);
});

test("menu shows what each slot points to and shortcuts to remove", () => {
  const shortcuts = { 1: { name: "1", folderId: "x", label: "Work › Clients" }, 2: { name: "2", folderId: "here" }, work: { name: "Work", folderId: "here" } };
  const items = folderMenuItems("here", shortcuts, { isRoot: false });
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.match(byId["tj-f-set:1"].title, /j1 +\(now: Clients\)/);
  assert.equal(byId["tj-f-set:2"].enabled, false);
  assert.equal(byId["tj-f-set:3"].title, "Save as j3");
  assert.ok(byId["tj-f-del:2"] && byId["tj-f-del:work"]);
  assert.ok(!byId["tj-f-del:1"]);
  assert.equal(folderMenuItems("r", {}, { isRoot: true }).find((i) => i.id === "tj-f-search").enabled, false);
});

test("clicks save, remove, and open the palette or Manager", async () => {
  const opened = [];
  const openSpotlight = async (action, extra) => opened.push(extra);
  await runFolderMenu("tj-f-set:4", fake.ids.clients, { openSpotlight });
  assert.equal((await store.getShortcut("4")).folderId, fake.ids.clients);
  await runFolderMenu("tj-f-del:4", fake.ids.clients, { openSpotlight });
  assert.equal(await store.getShortcut("4"), null);
  await runFolderMenu("tj-f-name", fake.ids.clients, { openSpotlight });
  await runFolderMenu("tj-f-new", fake.ids.clients, { openSpotlight });
  assert.deepEqual(opened, [{ setFor: fake.ids.clients }, { createIn: fake.ids.clients }]);
});

test(":jj name saves the folder the menu was opened for", async () => {
  const folders = await loadFolders();
  const ctx = { folders, byId: new Map(folders.map((f) => [f.id, f])), shortcuts: {}, recent: [], currentId: fake.ids.inbox, setTargetId: fake.ids.clients };
  const [row] = buildRows(":jj acme", ctx);
  assert.deepEqual(row.action, { op: "set", name: "acme", folderId: fake.ids.clients });
});
