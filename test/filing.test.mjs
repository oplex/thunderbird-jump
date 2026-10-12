import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeFakeBrowser } from "./helpers/fake-browser.mjs";
import { addMessages } from "./helpers/fake-messages.mjs";

const { loadFolders } = await import("../src/tb/folders.js");
const { buildRows } = await import("../src/lib/rows.js");
const { runAction } = await import("../src/palette/actions.js");
const { suggestFolders, senderEmail } = await import("../src/lib/suggest.js");
const msgs = await import("../src/tb/messages.js");
const store = await import("../src/tb/store.js");
const rules = await import("../src/tb/rules.js");
const { startMove } = await import("../src/palette/move-mode.js");

let fake, mail;
beforeEach(() => {
  fake = makeFakeBrowser();
  globalThis.browser = fake.browser;
  mail = addMessages(fake);
});

async function filing(op, settings = {}) {
  await store.saveSettings(settings);
  const folders = await loadFolders();
  const state = { folders, byId: new Map(folders.map((f) => [f.id, f])), shortcuts: {}, recent: [], currentId: fake.ids.inbox, windowId: 1, settings: await store.getSettings(), moveTargets: [], lastMove: null };
  await startMove(state, op);
  return state;
}

test("copy and tags are off until turned on", async () => {
  mail.select([mail.add(fake.ids.inbox, "A")]);
  const state = await filing("move");
  for (const text of ["copy cl", "tag imp"]) {
    const [row] = buildRows(text, { ...state, moving: null });
    assert.match(row.title, /is off/);
    assert.equal(row.action.op, "options");
  }
});

test("copy keeps the original and adds a copy in the target", async () => {
  mail.select([mail.add(fake.ids.inbox, "Report")]);
  const state = await filing("copy", { copyEnabled: true });
  const row = buildRows("clients", state).find((r) => r.action);
  assert.equal(row.action.op, "copy");
  await runAction(row.action, state);
  assert.deepEqual(mail.inFolder(fake.ids.inbox), ["Report"]);
  assert.deepEqual(mail.inFolder(fake.ids.clients), ["Report"]);
});

test("tag adds, a second time takes it off, and undo restores", async () => {
  mail.select([mail.add(fake.ids.inbox, "Bill")]);
  let state = await filing("tag", { tagsEnabled: true });
  const [important] = buildRows("imp", state);
  assert.equal(important.title, "Important");
  await runAction(important.action, state);
  assert.deepEqual(mail.tagsOf("Bill"), ["$label1"]);
  state = await filing("tag", { tagsEnabled: true });
  assert.match(buildRows("imp", state)[0].detail, /takes it off/);
  await runAction(buildRows("imp", state)[0].action, state);
  assert.deepEqual(mail.tagsOf("Bill"), []);
  const last = await msgs.lastUndoableMove();
  assert.equal(last.kind, "tag");
  const r = await runAction({ op: "undo", entryId: last.id }, state);
  assert.match(r.message, /Restored the tags of 1 message/);
  assert.deepEqual(mail.tagsOf("Bill"), ["$label1"]);
});

test("suggestions: rules first, then learned senders; learning only when on", async () => {
  mail.select([mail.add(fake.ids.inbox, "Hi", undefined, "Bob <bob@acme.com>")]);
  let state = await filing("move");
  await runAction({ op: "move", folderId: fake.ids.clients }, state);
  assert.deepEqual(await rules.getLearned(), {}, "learned while off");

  mail.select([mail.add(fake.ids.inbox, "Hi again", undefined, "Bob <bob@acme.com>")]);
  state = await filing("move", { suggestEnabled: true });
  await runAction({ op: "move", folderId: fake.ids.clients }, state);
  assert.equal((await rules.getLearned())["bob@acme.com"].f[fake.ids.clients], 1);

  mail.select([mail.add(fake.ids.inbox, "Third", undefined, "Bob <bob@acme.com>")]);
  state = await filing("move", { suggestEnabled: true });
  const rows = buildRows("", state);
  assert.equal(rows[0].text, "Suggested");
  assert.equal(rows[1].entry.id, fake.ids.clients);
  assert.match(rows[1].detail, /from bob@acme.com went here/);
});

test("suggestFolders ranks rules over learned folders", () => {
  const messages = [{ author: "Bob <Bob@Acme.com>", subject: "Invoice 12" }];
  const learned = { "bob@acme.com": { f: { a: 5 } } };
  const out = suggestFolders(messages, [{ text: "invoice", folderId: "b" }], learned);
  assert.deepEqual(out.map((x) => x.folderId), ["b", "a"]);
  assert.match(out[0].reason, /rule/);
  assert.equal(senderEmail("Bob <Bob@Acme.com>"), "bob@acme.com");
  assert.equal(senderEmail("plain@x.org"), "plain@x.org");
});

test(":rule saves a rule from the palette", async () => {
  const state = await filing("move", { suggestEnabled: true });
  const row = buildRows(":rule acme = clients", { ...state, moving: null }).find((r) => r.action);
  const r = await runAction(row.action, state);
  assert.match(r.message, /Rule saved/);
  assert.deepEqual((await rules.getRules()).map((x) => [x.text, x.folderId]), [["acme", fake.ids.clients]]);
});
