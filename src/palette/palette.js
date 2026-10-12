// Palette controller: loads state, wires keyboard handling, runs actions.

import { buildRows } from "../lib/rows.js";
import { loadFolders, pathLabel } from "../tb/folders.js";
import { resolveMailWindowId, currentFolderId } from "../tb/tabs.js";
import { getShortcuts, getRecent, getSettings, getShortcut, pushRecent } from "../tb/store.js";
import { jumpToFolder } from "../tb/tabs.js";
import { renderRows, isSelectable } from "./render.js";
import { runAction } from "./actions.js";
import { loadMoveState, startMove, renderSelection } from "./move-mode.js";

const params = new URLSearchParams(location.search);
const mode = params.get("mode") === "window" ? "window" : "popup";

const input = document.getElementById("input");
const list = document.getElementById("list");
const status = document.getElementById("status");
const modeBadge = document.getElementById("mode");
const selection = document.getElementById("selection");
const hints = document.getElementById("hints");
const HINTS = hints.textContent;
const MOVE_HINTS = "↵ move · Alt+1‥9 move to shortcut · ⌃Z undo · Esc cancel";
const PLACEHOLDER = "Jump to folder…   ? for help";

const state = {
  folders: [],
  byId: new Map(),
  shortcuts: {},
  recent: [],
  currentId: null,
  createParentId: null,
  windowId: null,
  settings: {},
  rows: [],
  selected: -1,
  busy: false,
  // Moving messages (see move-mode.js / lib/move-rows.js).
  moving: null,
  needsPermission: false,
  confirmTarget: null,
  moveTargets: [],
  lastMove: null,
};

function setStatus(text = "", kind = "") {
  status.textContent = text;
  status.className = kind;
}

function close() {
  window.close();
  // Thunderbird 115 ignores window.close() in a window the add-on opened
  // without allowScriptsToClose; close the spotlight window directly too.
  if (mode === "window") browser.windows.getCurrent().then((w) => browser.windows.remove(w.id)).catch(() => {});
}

async function reload() {
  const [folders, shortcuts, recent] = await Promise.all([loadFolders(), getShortcuts(), getRecent(), loadMoveState(state)]);
  state.folders = folders;
  state.byId = new Map(folders.map((f) => [f.id, f]));
  state.shortcuts = shortcuts;
  state.recent = recent;
}

function refresh() {
  state.rows = buildRows(input.value, state);
  state.selected = state.rows.findIndex(isSelectable);
  draw();
}

function draw() {
  renderRows(list, state.rows, state.selected, (i, ev) => {
    state.selected = i;
    execute({ newTab: ev.shiftKey });
  });
  const parent = state.byId.get(state.createParentId);
  const badge = parent ? `New in ${parent.name} ›` : state.moving ? "Move to ›" : "";
  modeBadge.hidden = !badge;
  modeBadge.textContent = badge;
  renderSelection(selection, state);
  hints.textContent = state.moving ? MOVE_HINTS : HINTS;
}

async function enterMove() {
  await startMove(state);
  input.value = "";
  input.placeholder = "Move to folder…  (type a name, j1, :j name)";
  refresh();
}

function leaveConfirm() {
  state.confirmTarget = null;
  refresh();
}

function move(delta) {
  const n = state.rows.length;
  if (!n) return;
  let i = state.selected;
  for (let step = 0; step < n; step++) {
    i = (i + delta + n) % n;
    if (isSelectable(state.rows[i])) break;
  }
  state.selected = i;
  draw();
}

function enterCreateMode() {
  const row = state.rows[state.selected];
  const entry = row?.entry;
  if (!entry || entry.isVirtual) {
    setStatus("Highlight a folder first, then press Ctrl+N", "error");
    return;
  }
  state.createParentId = entry.id;
  input.value = "";
  input.placeholder = "New folder name (use / to nest)…";
  setStatus(`Creating inside ${pathLabel(entry)}`);
  refresh();
}

function leaveCreateMode() {
  state.createParentId = null;
  input.value = "";
  input.placeholder = PLACEHOLDER;
  setStatus();
  refresh();
}

async function guarded(fn) {
  if (state.busy) return;
  state.busy = true;
  try {
    await fn();
  } catch (e) {
    setStatus(e?.message ?? String(e), "error");
  } finally {
    state.busy = false;
  }
}

function execute({ newTab = false } = {}) {
  const row = state.rows[state.selected];
  if (!row || !isSelectable(row)) return;
  guarded(async () => {
    const result = await runAction(row.action, state, { newTab });
    if (result.close) return close();
    if (result.confirm != null) {
      state.confirmTarget = result.confirm;
      return refresh();
    }
    if (result.enterMove) return enterMove();
    if (result.reload) await reload();
    state.createParentId = null;
    input.value = "";
    refresh();
    setStatus(result.message ?? "", "ok");
  });
}

// Alt+1‥9: jump straight to a numbered shortcut (or move there in move mode).
function quickJump(digit) {
  guarded(async () => {
    const s = await getShortcut(digit);
    if (!s || !state.byId.has(s.folderId)) {
      setStatus(`No shortcut j${digit} · set it with :jj${digit}`, "error");
      return;
    }
    if (state.moving?.length) {
      const result = await runAction({ op: "move", folderId: s.folderId }, state);
      if (result.confirm != null) {
        state.confirmTarget = result.confirm;
        return refresh();
      }
      return close();
    }
    await pushRecent(s.folderId);
    await jumpToFolder(s.folderId, state.windowId, { revealPane: state.settings.revealFolderPane });
    close();
  });
}

function onKey(ev) {
  const key = ev.key;
  if (key === "ArrowDown" || (key === "Tab" && !ev.shiftKey) || (ev.ctrlKey && key === "j")) {
    ev.preventDefault();
    move(1);
  } else if (key === "ArrowUp" || (key === "Tab" && ev.shiftKey) || (ev.ctrlKey && key === "k")) {
    ev.preventDefault();
    move(-1);
  } else if (key === "Enter" && ev.ctrlKey) {
    ev.preventDefault();
    enterCreateMode();
  } else if (key === "Enter") {
    ev.preventDefault();
    execute({ newTab: ev.shiftKey });
  } else if (ev.ctrlKey && (key === "n" || key === "N")) {
    ev.preventDefault();
    enterCreateMode();
  } else if (ev.ctrlKey && (key === "z" || key === "Z")) {
    ev.preventDefault();
    if (state.lastMove && !state.lastMove.undone) {
      guarded(async () => {
        const result = await runAction({ op: "undo", entryId: state.lastMove.id }, state);
        await reload();
        refresh();
        setStatus(result.message, "ok");
      });
    } else setStatus("Nothing to undo");
  } else if (ev.altKey && /^[1-9]$/.test(key)) {
    ev.preventDefault();
    quickJump(key);
  } else if (key === "Escape") {
    ev.preventDefault();
    if (state.createParentId != null) leaveCreateMode();
    else if (state.confirmTarget != null) leaveConfirm();
    else close();
  } else if (key === "Backspace" && !input.value && state.createParentId != null) {
    ev.preventDefault();
    leaveCreateMode();
  }
}

// Manager / settings buttons in the palette's top bar (with the current key).
function wireTools() {
  document.getElementById("openManager").addEventListener("click", () => guarded(async () => (await runAction({ op: "manager" }, state)).close && close()));
  document.getElementById("openOptions").addEventListener("click", () => guarded(async () => (await runAction({ op: "options" }, state)).close && close()));
  browser.commands.getAll().then((cmds) => {
    const key = cmds.find((c) => c.name === "open-manager")?.shortcut;
    document.getElementById("managerKey").textContent = key ? key.replace(/\+/g, "+") : "";
  });
}

async function init() {
  document.body.classList.add(mode);
  input.focus();
  const hint = Number.parseInt(params.get("win") ?? "", 10);
  state.windowId = await resolveMailWindowId(Number.isNaN(hint) ? undefined : hint);
  const [settings, currentId] = await Promise.all([getSettings(), currentFolderId(state.windowId).catch(() => null), reload()]);
  state.settings = settings;
  state.currentId = currentId;
  input.addEventListener("input", () => {
    setStatus();
    refresh();
  });
  input.addEventListener("keydown", onKey);
  wireTools();
  if (params.get("action") === "move") await enterMove();
  if (mode === "window" && settings.closeOnBlur) {
    window.addEventListener("blur", () => {
      if (!state.busy) close();
    });
  }
  refresh();
}

init().catch((e) => setStatus(e?.message ?? String(e), "error"));
