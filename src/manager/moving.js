// Moving from the Manager: Move to… picker, drag and drop, and the
// "Drop to move" quick targets (shortcuts + recent move targets).

import { pathLabel } from "../tb/folders.js";
import { getShortcuts, getSettings } from "../tb/store.js";
import { canMove, enableMoving, moveMessages, undoMove, getMoveTargets, removeMoveTarget } from "../tb/messages.js";
import { compareShortcutKeys } from "../lib/parse.js";
import { pickFolder } from "./picker.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const MAX_TARGETS = 10;

// ui: { state, toast(text, undo?), refresh() }
export function createMover(ui) {
  const { state } = ui;

  async function ensureAllowed() {
    if ((await canMove()) || (await enableMoving().catch(() => false))) return true;
    ui.toast("Moving is off (permission not given). Turn it on in ThunderJump's options.");
    return false;
  }

  async function moveTo(messages, target) {
    if (!messages.length || !(await ensureAllowed())) return;
    const name = state.byId.get(target)?.name ?? "folder";
    if ((await getSettings()).confirmMove && !window.confirm(`Move ${plural(messages.length, "message")} to ${name}?`)) return;
    const labels = Object.fromEntries(state.folders.map((f) => [f.id, pathLabel(f)]));
    try {
      const entry = await moveMessages(messages, target, { labels });
      state.selected.clear();
      ui.toast(`Moved ${plural(entry.count, "message")} to ${name}`, () => undoMove(entry.id));
    } catch (e) {
      ui.toast(`Move failed: ${e?.message ?? e}`);
    }
    ui.refresh();
    renderTargets();
  }

  const selectedMessages = () => state.shown.filter((m) => state.selected.has(m.id));

  async function moveSelected() {
    const messages = selectedMessages();
    if (!messages.length || !(await ensureAllowed())) return;
    const sources = new Set(messages.map((m) => m.folderId));
    const [shortcuts, moveTargets] = await Promise.all([getShortcuts(), getMoveTargets()]);
    const target = await pickFolder(`Move ${plural(messages.length, "message")}`, {
      folders: state.folders,
      byId: state.byId,
      shortcuts,
      moveTargets,
      exclude: sources.size === 1 ? sources : new Set(),
    });
    if (target) await moveTo(messages, target);
  }

  // Drag: the selection if the row is in it, otherwise just that row.
  function idsForDrag(id) {
    if (!state.selected.has(id)) {
      state.selected = new Set([id]);
      ui.render();
    }
    return state.shown.filter((m) => state.selected.has(m.id)).map((m) => m.id);
  }

  function dropped(folderId, ids) {
    const want = new Set(ids);
    return moveTo(state.shown.filter((m) => want.has(m.id)), folderId);
  }

  async function renderTargets() {
    const [shortcuts, recent] = await Promise.all([getShortcuts(), getMoveTargets()]);
    const items = [];
    const seen = new Set();
    const add = (id, badge = "", removable = false) => {
      const e = state.byId.get(id);
      if (!e || e.isRoot || e.isVirtual || seen.has(id) || items.length >= MAX_TARGETS) return;
      seen.add(id);
      items.push({ e, badge, removable });
    };
    for (const key of Object.keys(shortcuts).sort(compareShortcutKeys)) add(shortcuts[key].folderId, /^\d+$/.test(key) ? `j${key}` : shortcuts[key].name);
    for (const id of recent) add(id, "", true);
    const ul = document.getElementById("quickTargets");
    ul.replaceChildren(
      ...items.map(({ e, badge, removable }) => {
        const li = document.createElement("li");
        li.dataset.folderId = e.id;
        li.title = `${pathLabel(e)}\nDrop messages here, or click to move the selection`;
        const name = document.createElement("span");
        name.className = "label";
        name.textContent = e.name;
        li.append(name);
        if (badge) {
          const b = document.createElement("span");
          b.className = "count";
          b.textContent = badge;
          li.append(b);
        }
        if (removable) {
          const x = document.createElement("button");
          x.className = "remove";
          x.textContent = "×";
          x.title = "Remove from this list";
          x.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            await removeMoveTarget(e.id);
            renderTargets();
          });
          li.append(x);
        }
        li.addEventListener("click", () => moveTo(selectedMessages(), e.id));
        return li;
      }),
    );
    document.getElementById("quickBox").hidden = !items.length;
  }

  return { moveSelected, idsForDrag, dropped, renderTargets };
}
