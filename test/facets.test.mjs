import { test } from "node:test";
import assert from "node:assert/strict";
import { dateRange, buildQueries, senderName, computeFacets, applyChips, mergeResults } from "../src/lib/facets.js";

const now = new Date(2026, 9, 12, 15, 30); // 12 Oct 2026, local time

test("date presets", () => {
  assert.deepEqual(dateRange("any", now), {});
  assert.equal(dateRange("today", now).fromDate.getTime(), new Date(2026, 9, 12).getTime());
  assert.equal(dateRange("7d", now).fromDate.getTime(), new Date(2026, 9, 6).getTime());
  assert.equal(dateRange("year", now).fromDate.getTime(), new Date(2026, 0, 1).getTime());
  assert.equal(dateRange("older", now).toDate.getTime(), new Date(2025, 9, 12).getTime());
});

test("queries: subject-or-sender needs two, others one", () => {
  const f = { text: "invoice", matchIn: "subjectFrom", unread: true, date: "any" };
  assert.deepEqual(buildQueries(f, now), [
    { unread: true, subject: "invoice" },
    { unread: true, author: "invoice" },
  ]);
  assert.deepEqual(buildQueries({ ...f, matchIn: "everything" }, now), [{ unread: true, fullText: "invoice" }]);
  assert.deepEqual(buildQueries({ text: " ", flagged: true, attachment: true }, now), [{ flagged: true, attachment: true }]);
});

test("sender names", () => {
  assert.equal(senderName("Ann Smith <ann@example.com>"), "Ann Smith");
  assert.equal(senderName('"Smith, Ann" <ann@example.com>'), "Smith, Ann");
  assert.equal(senderName("<bob@example.com>"), "bob@example.com");
  assert.equal(senderName("bob@example.com"), "bob@example.com");
  assert.equal(senderName(""), "(unknown)");
});

const msgs = [
  { id: 1, folderId: "a", author: "Ann <a@x>", date: new Date(2026, 1, 1).getTime() },
  { id: 2, folderId: "a", author: "Bob <b@x>", date: new Date(2025, 1, 1).getTime() },
  { id: 3, folderId: "b", author: "Ann <a@x>", date: new Date(2026, 5, 1).getTime() },
];
const byId = new Map([
  ["a", { segments: ["Mail", "Inbox"] }],
  ["b", { segments: ["Mail", "Work"] }],
]);

test("facet counts", () => {
  const f = computeFacets(msgs, byId);
  assert.deepEqual(f.folder, [
    { key: "a", label: "Inbox", title: "Mail › Inbox", count: 2 },
    { key: "b", label: "Work", title: "Mail › Work", count: 1 },
  ]);
  assert.deepEqual(f.sender.map((s) => [s.key, s.count]), [["Ann", 2], ["Bob", 1]]);
  assert.deepEqual(f.year.map((y) => [y.key, y.count]), [["2026", 2], ["2025", 1]]);
});

test("chips: same facet OR, different facets AND", () => {
  assert.deepEqual(applyChips(msgs, [{ facet: "sender", key: "Ann" }]).map((m) => m.id), [1, 3]);
  assert.deepEqual(applyChips(msgs, [{ facet: "sender", key: "Ann" }, { facet: "folder", key: "a" }]).map((m) => m.id), [1]);
  assert.deepEqual(applyChips(msgs, [{ facet: "year", key: "2025" }, { facet: "year", key: "2026" }]).length, 3);
});

test("merge drops duplicates, newest first", () => {
  assert.deepEqual(mergeResults([[msgs[1], msgs[0]], [msgs[0], msgs[2]]]).map((m) => m.id), [3, 1, 2]);
});
