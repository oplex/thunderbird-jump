// Drag and drop in the Manager: drag result rows (or the whole selection)
// onto any element with data-folder-id to move the messages there.

export const DND_TYPE = "application/x-thunderjump-messages";

// `idsFor(rowId)` returns the message ids to drag for a row (selection or row).
export function makeDraggable(tbody, idsFor) {
  tbody.addEventListener("dragstart", (ev) => {
    const tr = ev.target.closest?.("tr[data-id]");
    if (!tr) return;
    const ids = idsFor(Number(tr.dataset.id));
    ev.dataTransfer.setData(DND_TYPE, JSON.stringify(ids));
    ev.dataTransfer.setData("text/plain", `${ids.length} message${ids.length === 1 ? "" : "s"}`);
    ev.dataTransfer.effectAllowed = "move";
    const ghost = document.getElementById("dragGhost");
    if (ghost) {
      ghost.textContent = `Move ${ids.length} message${ids.length === 1 ? "" : "s"}`;
      try {
        ev.dataTransfer.setDragImage(ghost, 12, 12);
      } catch {
        // Default drag image then.
      }
    }
  });
}

const isOurs = (ev) => [...(ev.dataTransfer?.types ?? [])].includes(DND_TYPE);

// Any [data-folder-id] inside `container` accepts drops: onDrop(folderId, ids).
export function makeDropTarget(container, onDrop) {
  let current = null;
  const mark = (el) => {
    if (current === el) return;
    current?.classList.remove("drop");
    current = el;
    current?.classList.add("drop");
  };
  container.addEventListener("dragover", (ev) => {
    const target = ev.target.closest?.("[data-folder-id]");
    if (!target || !isOurs(ev)) return mark(null);
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    mark(target);
  });
  container.addEventListener("dragleave", (ev) => {
    if (!container.contains(ev.relatedTarget)) mark(null);
  });
  container.addEventListener("drop", (ev) => {
    const target = ev.target.closest?.("[data-folder-id]");
    mark(null);
    if (!target || !isOurs(ev)) return;
    ev.preventDefault();
    onDrop(target.dataset.folderId, JSON.parse(ev.dataTransfer.getData(DND_TYPE)));
  });
}
