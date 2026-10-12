import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInput, matchShortcuts, splitFolderPath, compareShortcutKeys } from "../src/lib/parse.js";

test("empty and help", () => {
  assert.deepEqual(parseInput(""), { kind: "home" });
  assert.deepEqual(parseInput("   "), { kind: "home" });
  assert.equal(parseInput("?").kind, "help");
  assert.equal(parseInput(":help").kind, "help");
});

test("j1 / J12 jump to numbered shortcut", () => {
  assert.deepEqual(parseInput("j1"), { kind: "jump-shortcut", name: "1" });
  assert.deepEqual(parseInput("J12"), { kind: "jump-shortcut", name: "12" });
  assert.equal(parseInput("jx").kind, "search");
});

test(":j name jumps, :j and :jl list", () => {
  assert.deepEqual(parseInput(":j work"), { kind: "jump-shortcut", name: "work" });
  assert.deepEqual(parseInput(":j1"), { kind: "jump-shortcut", name: "1" });
  assert.deepEqual(parseInput(":j"), { kind: "jump-shortcut", name: "" });
  assert.deepEqual(parseInput(":jl"), { kind: "jump-shortcut", name: "" });
});

test(":jj sets shortcuts", () => {
  assert.deepEqual(parseInput(":jj1"), { kind: "set-shortcut", name: "1", query: null });
  assert.deepEqual(parseInput(":jj work"), { kind: "set-shortcut", name: "work", query: null });
  assert.deepEqual(parseInput(":jj w = clients acme"), { kind: "set-shortcut", name: "w", query: "clients acme" });
  assert.deepEqual(parseInput(":jj"), { kind: "set-shortcut", name: "", query: null });
});

test(":jd deletes, :jdog still jumps to 'dog'", () => {
  assert.deepEqual(parseInput(":jd work"), { kind: "delete-shortcut", name: "work" });
  assert.deepEqual(parseInput(":jd"), { kind: "delete-shortcut", name: "" });
  assert.deepEqual(parseInput(":jdog"), { kind: "jump-shortcut", name: "dog" });
});

test(":new creates in current folder", () => {
  assert.deepEqual(parseInput(":new A / B"), { kind: "create", segments: ["A", "B"] });
  assert.deepEqual(parseInput(":mk Acme"), { kind: "create", segments: ["Acme"] });
  assert.deepEqual(parseInput(":new"), { kind: "create", segments: [] });
});

test("query > path creates in searched parent", () => {
  assert.deepEqual(parseInput("proj > Acme/2026"), { kind: "create-in", query: "proj", segments: ["Acme", "2026"] });
  assert.deepEqual(parseInput("> Top"), { kind: "create-in", query: "", segments: ["Top"] });
});

test(":keys opens options", () => {
  assert.deepEqual(parseInput(":keys"), { kind: "options" });
  assert.deepEqual(parseInput(":options"), { kind: "options" });
  assert.deepEqual(parseInput(":backup"), { kind: "options" });
});

test("unknown command", () => {
  assert.deepEqual(parseInput(":zz"), { kind: "unknown", command: "zz" });
});

test("splitFolderPath trims and drops empty segments", () => {
  assert.deepEqual(splitFolderPath(" a // b /c "), ["a", "b", "c"]);
});

test("shortcut matching order and numeric sort", () => {
  const s = {
    "10": { name: "10", folderId: "a" },
    "2": { name: "2", folderId: "b" },
    work: { name: "Work", folderId: "c" },
    homework: { name: "homework", folderId: "d" },
    workshop: { name: "workshop", folderId: "e" },
  };
  assert.deepEqual(matchShortcuts(s, "work").map((x) => x.key), ["work", "workshop", "homework"]);
  assert.deepEqual(matchShortcuts(s, "").map((x) => x.key), ["2", "10", "homework", "work", "workshop"]);
  assert.ok(compareShortcutKeys("9", "10") < 0);
});

test("move/copy/tag name: file the selection, searching name", async () => {
  const { fileCommand } = await import("../src/palette/move-mode.js");
  assert.deepEqual(parseInput("move inv"), { kind: "move-mode", op: "move", query: "inv" });
  assert.deepEqual(parseInput(":m acme/2026"), { kind: "move-mode", op: "move", query: "acme/2026" });
  assert.deepEqual(parseInput(":move"), { kind: "move-mode", op: "move" });
  assert.deepEqual(parseInput("copy arch"), { kind: "move-mode", op: "copy", query: "arch" });
  assert.deepEqual(parseInput(":c arch"), { kind: "move-mode", op: "copy", query: "arch" });
  assert.deepEqual(parseInput("tag imp"), { kind: "move-mode", op: "tag", query: "imp" });
  assert.deepEqual(parseInput(":t"), { kind: "move-mode", op: "tag" });
  assert.deepEqual(parseInput("move"), { kind: "search", query: "move" });
  assert.deepEqual(parseInput("c inbox"), { kind: "search", query: "c inbox" });
  assert.deepEqual(fileCommand("  mv cl"), { op: "move", query: "cl" });
  assert.equal(fileCommand("mover"), null);
});

test(":rule text = folder", () => {
  assert.deepEqual(parseInput(":rule acme.com = clients"), { kind: "rule", text: "acme.com", query: "clients" });
  assert.deepEqual(parseInput(":rule acme"), { kind: "rule", text: "acme", query: null });
  assert.deepEqual(parseInput(":rule"), { kind: "rule", text: "", query: null });
});

test(":s and :sa search mail", () => {
  assert.deepEqual(parseInput(":s invoice 2026"), { kind: "search-mail", query: "invoice 2026", all: false });
  assert.deepEqual(parseInput(":sa acme"), { kind: "search-mail", query: "acme", all: true });
  assert.deepEqual(parseInput(":s"), { kind: "search-mail", query: "", all: false });
  assert.equal(parseInput(":settings").kind, "options");
});
