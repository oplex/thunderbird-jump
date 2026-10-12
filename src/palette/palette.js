/*
 * Palette controller: loads state, wires keyboard handling, runs actions.
 */

import { buildRows } from "../lib/rows.js";
import { loadFolders, pathLabel } from "../tb/folders.js";
import { resolveMailWindowId, currentFolderId, jumpToFolder } from "../tb/tabs.js";
import { getShortcuts, getRecent, getSettings, getShortcut, pushRecent } from "../tb/store.js";
import { renderRows, isSelectable } from "./render.js";
import { runAction } from "./actions.js";
import { loadMoveState, startMove, renderSelection, typedMoveQuery } from "./move-mode.js";
import { presetFromMenu } from "./presets.js";
import { isLite, hideWindow, onWake, wireTools } from "./lite.js";

let params = new URLSearchParams(location.search);
const mode = params.get("mode") === "window" ? "window" : "popup";

const [input, list, status, modeBadge, selection, hints] = ["input", "list", "status", "mode", "selection", "hints"].map((id) =>
  document.getElementById(id),
);
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
  setTargetId: null, // folder for ":jj name" when opened from a folder's menu
};

function setStatus(text = "", kind = "") {
  status.textContent = text;
  status.className = kind;
}

function close() {
  if (isLite(mode, state.settings)) return void hideWindow().catch(() => {});
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
  renderRows(
    list,
    state.rows,
    state.selected,
    (i, ev) => {
      state.selected = i;
      execute({ newTab: ev.shiftKey });
    },
    { onRemove: (i) => editList({ op: "remove", ...state.rows[i].remove }, i), onClear: (l) => editList({ op: "clear", list: l }, 0) },
  );
  const parent = state.byId.get(state.createParentId);
  const badge = parent ? `New in ${parent.name} ›` : state.moving ? "Move to ›" : "";
  modeBadge.hidden = !badge;
  modeBadge.textContent = badge;
  renderSelection(selection, state);
  hints.textContent = state.moving ? MOVE_HINTS : HINTS;
}

// Typed "move inv": keep what follows "move " as the folder search.
async function enterMove() {
  await startMove(state);
  input.value = typedMoveQuery(input.value) ?? "";
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

// Remove an item from / clear one of the user's lists, keeping the palette
// (typed text, position) as it is.
function editList(action, index) {
  guarded(async () => {
    const result = await runAction(action, state);
    await reload();
    state.rows = buildRows(input.value, state);
    const selectable = state.rows.map((r, i) => (isSelectable(r) ? i : -1)).filter((i) => i >= 0);
    state.selected = selectable.find((i) => i >= index) ?? selectable.at(-1) ?? -1;
    draw();
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
  } else if (key === "Delete" && state.rows[state.selected]?.remove && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
    // Delete removes the highlighted item when there's no text after the caret.
    ev.preventDefault();
    editList({ op: "remove", ...state.rows[state.selected].remove }, state.selected);
  } else if (key === "Escape") {
    ev.preventDefault();
    if (state.createParentId != null) leaveCreateMode();
    else if (state.confirmTarget != null) leaveConfirm();
    else close();
  } else if (key === "Backspace" && !input.value && (state.createParentId != null || state.moving)) {
    ev.preventDefault();
    state.moving = null;
    leaveCreateMode();
  }
}

// Everything that depends on this open (window, folder, ?action=…).
async function start() {
  const hint = Number.parseInt(params.get("win") ?? "", 10);
  state.windowId = await resolveMailWindowId(Number.isNaN(hint) ? undefined : hint);
  const [settings, currentId] = await Promise.all([getSettings(), currentFolderId(state.windowId).catch(() => null), reload()]);
  state.settings = settings;
  state.currentId = currentId;
  if (params.get("action") === "move") await enterMove();
  presetFromMenu(params, state, input, setStatus);
  refresh();
}

// Lite mode: the kept window is opened again. Show the home list at once
// with the data already loaded, then refresh it.
function wake(newParams) {
  params = newParams;
  Object.assign(state, { moving: null, confirmTarget: null, createParentId: null, setTargetId: null, busy: false });
  input.value = "";
  input.placeholder = PLACEHOLDER;
  setStatus();
  refresh();
  window.focus();
  input.focus();
  start().catch((e) => setStatus(e?.message ?? String(e), "error"));
}

async function init() {
  document.body.classList.add(mode);
  input.focus();
  input.addEventListener("input", () => {
    setStatus();
    if (!state.moving && typedMoveQuery(input.value) != null) return guarded(enterMove);
    refresh();
  });
  input.addEventListener("keydown", onKey);
  wireTools((op) => guarded(async () => (await runAction({ op }, state)).close && close()));
  await start();
  if (mode === "window") onWake(wake);
  if (mode === "window" && state.settings.closeOnBlur) {
    window.addEventListener("blur", () => {
      if (!state.busy && !document.hidden) close();
    });
  }
}

init().catch((e) => setStatus(e?.message ?? String(e), "error"));
