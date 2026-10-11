// Executes row actions. The only write operations are: storing shortcuts /
// recent folders in the add-on's own storage, and creating folders when the
// user explicitly asks. Messages are never touched.

import { createFolderPath, pathLabel } from "../tb/folders.js";
import { jumpToFolder } from "../tb/tabs.js";
import { setShortcut, deleteShortcut, pushRecent } from "../tb/store.js";

// Returns { close: bool, message?: string, reload?: bool, folderId?: string }.
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

    case "options":
      await browser.runtime.openOptionsPage();
      return { close: true };

    default:
      throw new Error(`Unknown action ${action.op}`);
  }
}
