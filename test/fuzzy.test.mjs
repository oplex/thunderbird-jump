import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, matchTerm, scoreFolder, rankFolders } from "../src/lib/fuzzy.js";

const entry = (...segments) => ({ id: segments.join("/"), name: segments.at(-1), segments });

test("fold strips diacritics and keeps length", () => {
  assert.equal(fold("Åsa Övrigt"), "asa ovrigt");
  assert.equal(fold("Åsa Övrigt").length, "Åsa Övrigt".length);
});

test("substring beats subsequence", () => {
  const sub = matchTerm("inb", "Inbox");
  const seq = matchTerm("ibx", "Inbox");
  assert.ok(sub.score > seq.score);
  assert.deepEqual(sub.positions, [0, 1, 2]);
});

test("no match returns null", () => {
  assert.equal(matchTerm("zzz", "Inbox"), null);
});

test("word starts are matched (acronyms)", () => {
  const m = matchTerm("pa", "Projects Acme");
  assert.ok(m);
  assert.deepEqual(m.positions, [0, 9]);
});

test("folder name preferred over account path", () => {
  const folders = [entry("Work", "Archive", "2023"), entry("Home", "Work stuff")];
  const ranked = rankFolders(folders, "work");
  assert.equal(ranked[0].entry.name, "Work stuff");
});

test("multiple terms must all match", () => {
  const e = entry("Work", "Clients", "Acme");
  assert.ok(scoreFolder(e, "cli acme"));
  assert.equal(scoreFolder(e, "cli nope"), null);
});

test("exact name match ranks first", () => {
  const folders = [entry("A", "Inbox", "Invoices old"), entry("A", "Invoices")];
  assert.equal(rankFolders(folders, "invoices")[0].entry.name, "Invoices");
});

test("highlight positions point into joined path", () => {
  const e = entry("Acct", "Inbox");
  const { positions } = scoreFolder(e, "inb");
  const path = e.segments.join("/");
  assert.equal(positions.map((p) => path[p]).join(""), "Inb");
});

test("boost reorders equal matches", () => {
  const a = entry("X", "Reports");
  const b = entry("Y", "Reports");
  const ranked = rankFolders([a, b], "reports", { boost: (e) => (e === b ? 50 : 0) });
  assert.equal(ranked[0].entry, b);
});
