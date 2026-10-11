import { test } from "node:test";
import assert from "node:assert/strict";
import { eventToShortcut, keyName, displayShortcut } from "../src/lib/keys.js";

const ev = (code, mods = {}, key = code) => ({ code, key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

test("key names come from physical key codes", () => {
  assert.equal(keyName("KeyJ"), "J");
  assert.equal(keyName("Digit7"), "7");
  assert.equal(keyName("Space"), "Space");
  assert.equal(keyName("ArrowUp"), "Up");
  assert.equal(keyName("F19"), "F19");
  assert.equal(keyName("Backquote"), null);
});

test("common combinations", () => {
  assert.deepEqual(eventToShortcut(ev("Space", { ctrlKey: true, shiftKey: true })), { shortcut: "Ctrl+Shift+Space" });
  assert.deepEqual(eventToShortcut(ev("KeyJ", { altKey: true, ctrlKey: true })), { shortcut: "Alt+Ctrl+J" });
  assert.deepEqual(eventToShortcut(ev("F2")), { shortcut: "F2" });
  assert.deepEqual(eventToShortcut(ev("F2", { shiftKey: true })), { shortcut: "Shift+F2" });
});

test("mac uses Command and MacCtrl", () => {
  assert.deepEqual(eventToShortcut(ev("KeyJ", { metaKey: true, shiftKey: true }), { isMac: true }), { shortcut: "Command+Shift+J" });
  assert.deepEqual(eventToShortcut(ev("KeyJ", { ctrlKey: true }), { isMac: true }), { shortcut: "MacCtrl+J" });
});

test("invalid combinations are explained", () => {
  assert.ok(eventToShortcut(ev("KeyJ")).error);
  assert.ok(eventToShortcut(ev("KeyJ", { shiftKey: true })).error);
  assert.ok(eventToShortcut(ev("KeyK", { ctrlKey: true, altKey: true, shiftKey: true })).error);
  assert.ok(eventToShortcut(ev("Backquote", { ctrlKey: true }, "`")).error);
  assert.deepEqual(eventToShortcut(ev("ControlLeft", { ctrlKey: true }, "Control")), { pending: true });
});

test("display", () => {
  assert.equal(displayShortcut("Ctrl+Shift+Space"), "Ctrl + Shift + Space");
  assert.equal(displayShortcut("Command+Shift+J", { isMac: true }), "⌘⇧J");
  assert.equal(displayShortcut(""), "—");
});
