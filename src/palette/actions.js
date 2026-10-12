// Executes row actions. Write operations: storing shortcuts / recent folders
// in the add-on's own storage, creating folders when asked, and moving
// messages (only after the user turned moving on, and always undoable).

import { createFolderPath, pathLabel } from "../tb/folders.js";
import { jumpToFolder } from "../tb/tabs.js";
import { setShortcut, deleteShortcut, pushRecent } from "../tb/store.js";
import { moveMessages, undoMove, enableMoving } from "../tb/messages.js";
import { openManager } from "../tb/tabs.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Returns { close, message?, reload?, folderId?, confirm?, enterMove? }.
export async function runAction(action, state, { newTab = false } = {}) {
  switch (action.op) {
    case "jump": {
      if (!state.byId.has(action.folderId)) throw new Error("That folder no longer exists");
      await pushRecent(action.folderId);
      await jumpToFolder(action.folderId, state.windowId, { newTab, revealPane: state.settings.revealFolderPane });
      return { close: true };
    }

    case "set": {
      const entry = state.byId.get(action.folderId);
      const label = pathLabel(entry);
      const previous = await setShortcut(action.name, action.folderId, label);
      const shown = /^\d+$/.test(action.name.trim()) ? `j${action.name.trim()}` : `:j ${action.name.trim()}`;
      const replaced = previous && previous.folderId !== action.folderId ? " (replaced)" : "";
      return { close: false, reload: true, message: `Saved ${shown} → ${label}${replaced}` };
    }

    case "delete": {
      const removed = await deleteShortcut(action.name);
      return { close: false, reload: true, message: removed ? `Deleted shortcut “${action.name}”` : `No shortcut “${action.name}”` };
    }

    case "create": {
      const parent = state.byId.get(action.parentId);
      if (!parent) throw new Error("Parent folder not found");
      const folderId = await createFolderPath(parent, action.segments);
      const where = `${pathLabel(parent)} › ${action.segments.join(" › ")}`;
      if (state.settings.jumpAfterCreate) {
        await pushRecent(folderId);
        await jumpToFolder(folderId, state.windowId, { newTab, revealPane: state.settings.revealFolderPane });
        return { close: true };
      }
      return { close: false, reload: true, folderId, message: `Created ${where}` };
    }

    case "move": {
      if (state.settings.confirmMove && !action.confirmed) return { close: false, confirm: action.folderId };
      const labels = Object.fromEntries(state.folders.map((f) => [f.id, pathLabel(f)]));
      await moveMessages(state.moving, action.folderId, { labels });
      return { close: true };
    }

    case "undo": {
      const { restored, missing } = await undoMove(action.entryId);
      const note = missing ? ` · ${missing} could not be found (moved or deleted since)` : "";
      return { close: false, reload: true, message: `Moved ${plural(restored, "message")} back${note}` };
    }

    case "enable-move": {
      const granted = await enableMoving().catch(() => false);
      if (!granted) throw new Error("Moving stays off (permission not given)");
      return { close: false, enterMove: true };
    }

    case "enter-move":
      return { close: false, enterMove: true };

    case "manager":
      await openManager();
      return { close: true };

    case "options":
      await browser.runtime.openOptionsPage();
      return { close: true };

    default:
      throw new Error(`Unknown action ${action.op}`);
  }
}
