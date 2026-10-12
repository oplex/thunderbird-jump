import { getShortcuts, deleteShortcut, getSettings, saveSettings, clearRecent } from "../tb/store.js";
import { loadFolders, pathLabel } from "../tb/folders.js";
import { compareShortcutKeys } from "../lib/parse.js";
import { renderKeyboard } from "./keyboard.js";
import { initBackup } from "./backup-ui.js";
import { initMoves } from "./moves-ui.js";
import { openManager } from "../tb/tabs.js";

const tbody = document.getElementById("shortcuts");

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

async function renderShortcuts() {
  const [shortcuts, folders] = await Promise.all([getShortcuts(), loadFolders()]);
  const byId = new Map(folders.map((f) => [f.id, f]));
  tbody.replaceChildren();
  const keys = Object.keys(shortcuts).sort(compareShortcutKeys);
  if (!keys.length) {
    const tr = document.createElement("tr");
    const td = cell("No shortcuts yet.", "dim");
    td.colSpan = 3;
    tr.append(td);
    tbody.append(tr);
    return;
  }
  for (const key of keys) {
    const s = shortcuts[key];
    const entry = byId.get(s.folderId);
    const tr = document.createElement("tr");
    const shown = /^\d+$/.test(key) ? `j${key}` : `:j ${s.name}`;
    tr.append(cell(shown, "name"));
    tr.append(entry ? cell(pathLabel(entry)) : cell(`${s.label ?? s.folderId} (missing)`, "missing"));
    const td = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "Delete";
    btn.addEventListener("click", async () => {
      await deleteShortcut(key);
      renderShortcuts();
    });
    td.append(btn);
    tr.append(td);
    tbody.append(tr);
  }
}

async function initSettings() {
  const settings = await getSettings();
  for (const id of ["jumpAfterCreate", "closeOnBlur", "revealFolderPane"]) {
    const box = document.getElementById(id);
    box.checked = !!settings[id];
    box.addEventListener("change", () => saveSettings({ [id]: box.checked }));
  }
  document.getElementById("clearRecent").addEventListener("click", () => clearRecent());
  document.getElementById("openManager").addEventListener("click", () => openManager());
  document.getElementById("openSpotlight").addEventListener("click", () =>
    browser.runtime.sendMessage({ type: "open-spotlight" }),
  );
}

renderShortcuts();
initSettings();
renderKeyboard();
initMoves();
// After an import, show the restored shortcuts, settings and keys.
initBackup(() => {
  renderShortcuts();
  renderKeyboard();
  getSettings().then((s) => {
    for (const id of ["jumpAfterCreate", "closeOnBlur", "revealFolderPane"]) document.getElementById(id).checked = !!s[id];
  });
});
