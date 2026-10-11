import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBackup, parseBackup, remapShortcuts, BACKUP_APP } from "../src/lib/backup.js";

const sample = {
  shortcuts: { 1: { name: "1", folderId: "account1://Inbox", label: "Mail › Inbox" } },
  settings: { closeOnBlur: false, recentLimit: 12 },
  recent: ["account1://Inbox"],
  keys: { "open-spotlight": "Alt+Ctrl+K" },
};

test("round trip", () => {
  const file = JSON.stringify(buildBackup(sample, { version: "1.2.0", now: new Date("2026-10-11T08:00:00Z") }));
  const r = parseBackup(file);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.shortcuts, sample.shortcuts);
  assert.deepEqual(r.data.settings, sample.settings);
  assert.deepEqual(r.data.recent, sample.recent);
  assert.deepEqual(r.data.keys, sample.keys);
  assert.equal(r.data.exported, "2026-10-11T08:00:00.000Z");
});

test("rejects other files with a clear message", () => {
  assert.match(parseBackup("not json").error, /not valid JSON/);
  assert.match(parseBackup('{"app":"other"}').error, /not a Thunderbird Jump backup/);
  assert.match(parseBackup(JSON.stringify({ app: BACKUP_APP, format: 99 })).error, /newer version/);
});

test("drops malformed entries instead of failing", () => {
  const r = parseBackup(
    JSON.stringify({
      app: BACKUP_APP,
      format: 1,
      shortcuts: { ok: { folderId: "x" }, bad: { folderId: 3 }, " ": { folderId: "y" } },
      settings: { a: true, b: "nope", c: 3 },
      recent: ["x", 5],
      keys: { k: "Ctrl+K", j: 5 },
    }),
  );
  assert.deepEqual(Object.keys(r.data.shortcuts), ["ok"]);
  assert.equal(r.data.shortcuts.ok.name, "ok");
  assert.deepEqual(r.data.settings, { a: true, c: 3 });
  assert.deepEqual(r.data.recent, ["x"]);
  assert.deepEqual(r.data.keys, { k: "Ctrl+K" });
});

test("remaps shortcuts by folder path when ids changed", () => {
  const folders = [
    { id: "account9://Inbox", segments: ["Mail", "Inbox"] },
    { id: "account9://Work", segments: ["Mail", "Work"] },
  ];
  const shortcuts = {
    1: { name: "1", folderId: "account1://Inbox", label: "Mail › Inbox" },
    w: { name: "w", folderId: "account9://Work", label: "Mail › Work" },
    gone: { name: "gone", folderId: "account1://Old", label: "Mail › Old" },
  };
  const r = remapShortcuts(shortcuts, folders);
  assert.equal(r.shortcuts[1].folderId, "account9://Inbox");
  assert.equal(r.shortcuts.w.folderId, "account9://Work");
  assert.deepEqual(r.remapped, ["1"]);
  assert.deepEqual(r.missing, ["gone"]);
});
