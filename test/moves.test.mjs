import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeFakeBrowser } from "./helpers/fake-browser.mjs";
import { addMessages } from "./helpers/fake-messages.mjs";

const { loadFolders } = await import("../src/tb/folders.js");
const { buildRows } = await import("../src/lib/rows.js");
const { describeSelection, undoRow } = await import("../src/lib/move-rows.js");
const { runAction } = await import("../src/palette/actions.js");
const msgs = await import("../src/tb/messages.js");
const store = await import("../src/tb/store.js");

let fake, mail;
beforeEach(() => {
  fake = makeFakeBrowser();
  globalThis.browser = fake.browser;
  mail = addMessages(fake);
});

async function moveState() {
  const folders = await loadFolders();
  const state = {
    folders,
    byId: new Map(folders.map((f) => [f.id, f])),
    shortcuts: await store.getShortcuts(),
    recent: [],
    currentId: fake.ids.inbox,
    windowId: 1,
    settings: await store.getSettings(),
    moveTargets: await msgs.getMoveTargets(),
    lastMove: await msgs.lastUndoableMove(),
    confirmTarget: null,
  };
  state.moving = await msgs.selectedMessages(1);
  return state;
}

test("reads the whole selection across pages", async () => {
  const ids = ["A", "B", "C", "D", "E"].map((s) => mail.add(fake.ids.inbox, `Mail ${s}`));
  mail.select(ids);
  const sel = await msgs.selectedMessages(1);
  assert.equal(sel.length, 5);
  assert.equal(sel[0].folderId, fake.ids.inbox);
});

test("move mode lists target folders, never the source or account roots", async () => {
  mail.select([mail.add(fake.ids.inbox, "Invoice")]);
  const state = await moveState();
  assert.equal(describeSelection(state.moving, state.byId), "1 message from Inbox");
  const rows = buildRows("c", state).filter((r) => r.action);
  assert.ok(rows.every((r) => r.action.op === "move"));
  assert.ok(!rows.some((r) => r.entry.id === fake.ids.inbox || r.entry.isRoot));
  assert.ok(rows.some((r) => r.entry.name === "Clients"));
});

test("move, then undo puts every message back (ids change on move)", async () => {
  const ids = ["One", "Two", "Three"].map((s) => mail.add(fake.ids.inbox, s));
  mail.select(ids);
  let state = await moveState();
  const res = await runAction({ op: "move", folderId: fake.ids.clients }, state);
  assert.equal(res.close, true);
  assert.deepEqual(mail.inFolder(fake.ids.clients), ["One", "Three", "Two"]);

  state = await moveState();
  const [undo] = buildRows("", { ...state, moving: null });
  assert.match(undo.title, /Undo: moved 3 messages/);
  const r = await runAction(undo.action, state);
  assert.match(r.message, /Moved 3 messages back/);
  assert.deepEqual(mail.inFolder(fake.ids.inbox), ["One", "Three", "Two"]);
  assert.equal(await msgs.lastUndoableMove(), null);
});

test("undo handles messages from several folders and duplicate Message-IDs", async () => {
  const a = mail.add(fake.ids.inbox, "Dup", "<same@x>");
  const b = mail.add(fake.ids.root, "Dup2", "<same@x>");
  const c = mail.add(fake.ids.root, "Other");
  mail.select([a, b, c]);
  const state = await moveState();
  const entry = await msgs.moveMessages(state.moving, fake.ids.clients);
  assert.equal(entry.groups.length, 2);
  const { restored, missing } = await msgs.undoMove(entry.id);
  assert.equal(restored, 3);
  assert.equal(missing, 0);
  assert.equal(mail.inFolder(fake.ids.inbox).length, 1);
  assert.equal(mail.inFolder(fake.ids.root).length, 2);
});

test("confirm-each-move asks first", async () => {
  mail.select([mail.add(fake.ids.inbox, "Careful")]);
  await store.saveSettings({ confirmMove: true });
  const state = await moveState();
  const res = await runAction({ op: "move", folderId: fake.ids.clients }, state);
  assert.equal(res.confirm, fake.ids.clients);
  assert.equal(mail.folderOf("Careful"), fake.ids.inbox);
  const [row] = buildRows("", { ...state, confirmTarget: res.confirm });
  assert.match(row.title, /^Move 1 message from Inbox to Clients\?/);
  await runAction(row.action, state);
  assert.equal(mail.folderOf("Careful"), fake.ids.clients);
});

test("j1 and recent targets work as move targets", async () => {
  await store.setShortcut("1", fake.ids.clients, "x");
  mail.select([mail.add(fake.ids.inbox, "Quick")]);
  let state = await moveState();
  const [row] = buildRows("j1", state);
  assert.deepEqual(row.action, { op: "move", folderId: fake.ids.clients });
  await runAction(row.action, state);
  mail.select([mail.add(fake.ids.inbox, "Again")]);
  state = await moveState();
  const home = buildRows("", state);
  assert.equal(home[0].text, "Recently moved to");
  assert.equal(home[1].entry.id, fake.ids.clients);
});

test("without permission the palette offers to turn moving on", async () => {
  mail.perms.clear();
  const state = await moveState();
  const [row] = buildRows("", { ...state, needsPermission: true });
  assert.equal(row.action.op, "enable-move");
  await assert.rejects(msgs.moveMessages([{ id: 1, folderId: "x" }], fake.ids.clients));
});

test("undo row disappears after 30 minutes or once undone", () => {
  const e = { id: "e", at: 0, count: 2, targetLabel: "A › B", undone: false };
  assert.ok(undoRow(e, 1000));
  assert.equal(undoRow(e, 31 * 60 * 1000), null);
  assert.equal(undoRow({ ...e, undone: true }, 1000), null);
});
