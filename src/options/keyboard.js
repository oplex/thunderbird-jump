// Options page section for rebinding the add-on's keyboard shortcuts in place
// (same effect as Thunderbird's "Manage Extension Shortcuts").

import { eventToShortcut, displayShortcut } from "../lib/keys.js";

const LABELS = {
  "open-spotlight": "Open spotlight (centered palette)",
  _execute_action: "Open palette from the toolbar button",
  _execute_browser_action: "Open palette from the toolbar button",
};

let isMac = false;
// Last result per command, kept across re-renders: { [name]: { text, cls } }.
const notes = {};

function button(text, onClick) {
  const b = document.createElement("button");
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function note(name, status, text, cls) {
  notes[name] = { text, cls };
  status.textContent = text;
  status.className = cls;
}

async function apply(name, shortcut, status) {
  try {
    await browser.commands.update({ name, shortcut });
    note(name, status, shortcut ? "Saved" : "Cleared", "ok");
    browser.runtime.sendMessage({ type: "config-changed" }).catch(() => {});
  } catch (e) {
    note(name, status, e?.message ?? String(e), "missing");
  }
}

function recorder(cmd, status) {
  const input = document.createElement("input");
  input.className = "shortcut";
  input.readOnly = true;
  input.dataset.command = cmd.name;
  input.value = displayShortcut(cmd.shortcut, { isMac });
  input.title = "Click, then press the new key combination";
  input.addEventListener("focus", () => {
    input.value = "Press keys…";
  });
  input.addEventListener("blur", () => renderKeyboard());
  input.addEventListener("keydown", async (ev) => {
    if (ev.key === "Tab") return;
    ev.preventDefault();
    if (ev.key === "Escape") return input.blur();
    if ((ev.key === "Backspace" || ev.key === "Delete") && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
      await apply(cmd.name, "", status);
      return input.blur();
    }
    const r = eventToShortcut(ev, { isMac });
    if (r.pending) return;
    if (r.error) return note(cmd.name, status, r.error, "missing");
    await apply(cmd.name, r.shortcut, status);
    input.blur();
  });
  return input;
}

export async function renderKeyboard() {
  isMac = (await browser.runtime.getPlatformInfo()).os === "mac";
  const tbody = document.getElementById("keyboard");
  const commands = await browser.commands.getAll();
  tbody.replaceChildren();
  for (const cmd of commands) {
    const tr = document.createElement("tr");
    const label = document.createElement("td");
    const m = /^jump-(\d+)$/.exec(cmd.name);
    label.textContent = LABELS[cmd.name] ?? (m ? `Jump to shortcut j${m[1]}` : cmd.description || cmd.name);
    const status = document.createElement("td");
    status.className = notes[cmd.name]?.cls ?? "dim";
    status.textContent = notes[cmd.name]?.text ?? "";
    const keyCell = document.createElement("td");
    keyCell.append(recorder(cmd, status));
    const actions = document.createElement("td");
    actions.append(
      button("Clear", () => apply(cmd.name, "", status).then(renderKeyboard)),
      button("Reset", async () => {
        await browser.commands.reset(cmd.name);
        browser.runtime.sendMessage({ type: "config-changed" }).catch(() => {});
        notes[cmd.name] = { text: "Reset to default", cls: "ok" };
        renderKeyboard();
      }),
    );
    tr.append(label, keyCell, actions, status);
    tbody.append(tr);
  }
}
