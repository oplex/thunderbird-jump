import { test } from "node:test";
import assert from "node:assert/strict";
import { expandTemplate, hasTemplate } from "../src/lib/template.js";
import { buildRows } from "../src/lib/rows.js";

const d = new Date(2026, 2, 7, 14, 5, 9); // 7 Mar 2026 14:05:09 local time

test("date patterns in braces", () => {
  assert.equal(expandTemplate("{YYYY}-{MM}-{DD}", d), "2026-03-07");
  assert.equal(expandTemplate("{YYYYMMDDHHMM}", d), "202603071405");
  assert.equal(expandTemplate("{YYYYMMDDHHmmss}", d), "20260307140509");
  assert.equal(expandTemplate("Q{Q} {MMM} {YY} w{WW} {D}/{M}", d), "Q1 Mar 26 w10 7/3");
  assert.equal(expandTemplate("MMA YYYY {{x}", d), "MMA YYYY {x}");
  assert.ok(hasTemplate("a {YYYY}") && !hasTemplate("plain"));
});

test("new folder rows show the filled-in name", () => {
  const root = { id: "r", name: "Work", segments: ["Work"], isRoot: true, specialUse: [] };
  const ctx = { folders: [root], byId: new Map([["r", root]]), shortcuts: {}, recent: [], currentId: "r", now: d };
  const [row] = buildRows(":new Reports/{YYYY}-{MM}", ctx);
  assert.deepEqual(row.action.segments, ["Reports", "2026-03"]);
  const [inMode] = buildRows("{YYYYMMDD} call", { ...ctx, createParentId: "r" });
  assert.deepEqual(inMode.action.segments, ["20260307 call"]);
});
