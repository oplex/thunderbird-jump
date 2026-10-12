// Turns a keydown event into a WebExtension command shortcut string such as
// "Ctrl+Shift+Space", following the rules commands.update() accepts
// (Thunderbird's ShortcutUtils.validate: one or two modifiers, Shift only
// together with another modifier unless it's a function key, F1–F19).
// Pure (takes a plain event-like object) so it can be unit tested.

const NAMED = {
  Space: "Space",
  Comma: "Comma",
  Period: "Period",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  Delete: "Delete",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "OS", "AltGraph"]);

// Key part of the shortcut from KeyboardEvent.code (layout independent).
export function keyName(code) {
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (m) return m[1];
  m = /^F([1-9]|1[0-9])$/.exec(code);
  if (m) return code;
  return NAMED[code] ?? null;
}

// ev: { key, code, ctrlKey, altKey, shiftKey, metaKey }.
// Returns { shortcut } when valid, { pending: true } while only modifiers are
// held, or { error } explaining why the combination can't be used.
export function eventToShortcut(ev, { isMac = false } = {}) {
  if (MODIFIER_KEYS.has(ev.key)) return { pending: true };
  const key = keyName(ev.code);
  if (!key) return { error: `“${ev.key}” can't be used in a shortcut` };

  const mods = [];
  if (ev.altKey) mods.push("Alt");
  if (isMac) {
    if (ev.metaKey) mods.push("Command");
    if (ev.ctrlKey) mods.push("MacCtrl");
  } else if (ev.ctrlKey) {
    mods.push("Ctrl");
  }
  const isFunctionKey = /^F\d+$/.test(key);
  if (!mods.length && !isFunctionKey) {
    // Thunderbird only gives add-ons keys with a modifier, or F1–F19 alone.
    return { error: `Add ${isMac ? "Cmd, Ctrl or Option" : "Ctrl or Alt"}, or use a function key (F1–F12) on its own` };
  }
  if (ev.shiftKey) mods.push("Shift");
  // Thunderbird's validator allows at most two modifiers.
  if (mods.length > 2) return { error: "Use at most two modifier keys (e.g. Ctrl+Shift+K)" };
  return { shortcut: [...mods, key].join("+") };
}

// Human-friendly label (macOS symbols on Mac).
export function displayShortcut(shortcut, { isMac = false } = {}) {
  if (!shortcut) return "—";
  if (!isMac) return shortcut.replace(/\+/g, " + ");
  const sym = { Command: "⌘", MacCtrl: "⌃", Ctrl: "⌘", Alt: "⌥", Shift: "⇧" };
  return shortcut
    .split("+")
    .map((p) => sym[p] ?? p)
    .join("");
}
