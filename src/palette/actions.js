// Executes row actions. Write operations: storing shortcuts / recent folders
// in the add-on's own storage, creating folders when asked, and moving
// messages (only after the user turned moving on, and always undoable).

import { createFolderPath, pathLabel } from "../tb/folders.js";
import { jumpToFolder } from "../tb/tabs.js";
import { setShortcut, deleteShortcut, pushRecent } from "../tb/store.js";
import { moveMessages, copyMessages, undoMove, enableMoving, removeMoveTarget, clearMoveTargets } from "../tb/messages.js";
import { tagMessages } from "../tb/tags.js";
import { addRule } from "../tb/rules.js";
import { removeRecent, clearRecent } from "../tb/store.js";
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

    // Move mode, "parent > New": create the folder, then move into it.
    case "create-move": {
      const parent = state.byId.get(action.parentId);
      if (!parent) throw new Error("Parent folder not found");
      const folderId = await createFolderPath(parent, action.segments);
      const labels = Object.fromEntries(state.folders.map((f) => [f.id, pathLabel(f)]));
      labels[folderId] = `${pathLabel(parent)} › ${action.segments.join(" › ")}`;
      if (action.copy) await copyMessages(state.moving, folderId);
      else await moveMessages(state.moving, folderId, { labels });
      return { close: true };
    }

    case "copy": {
      if (state.settings.confirmMove && !action.confirmed) return { close: false, confirm: action.folderId };
      await copyMessages(state.moving, action.folderId);
      return { close: true };
    }

    case "tag": {
      const entry = await tagMessages(state.moving, action.tag);
      const what = `${entry.remove ? "Removed" : "Added"} “${action.tag.name}” ${entry.remove ? "from" : "to"} ${plural(entry.count, "message")}`;
      return { close: true, message: what };
    }

    case "rule": {
      const entry = state.byId.get(action.folderId);
      await addRule(action.text, action.folderId, pathLabel(entry));
      return { close: false, reload: true, message: `Rule saved: “${action.text}” → ${pathLabel(entry)}` };
    }

    case "move": {
      if (state.settings.confirmMove && !action.confirmed) return { close: false, confirm: action.folderId };
      const labels = Object.fromEntries(state.folders.map((f) => [f.id, pathLabel(f)]));
      await moveMessages(state.moving, action.folderId, { labels });
      return { close: true };
    }

    case "undo": {
      const { restored, missing, entry } = await undoMove(action.entryId);
      const note = missing ? ` · ${missing} could not be found (moved or deleted since)` : "";
      const done = entry?.kind === "tag" ? `Restored the tags of ${plural(restored, "message")}` : `Moved ${plural(restored, "message")} back`;
      return { close: false, reload: true, message: `${done}${note}` };
    }

    case "enable-move": {
      const granted = await enableMoving().catch(() => false);
      if (!granted) throw new Error("Moving stays off (permission not given)");
      return { close: false, enterMove: state.fileOp ?? "move" };
    }

    case "enter-move":
      return { close: false, enterMove: action.fileOp ?? "move" };

    case "manager": // optional q (search text) and folder (scope)
      await openManager(Object.fromEntries(["q", "folder"].filter((k) => action[k]).map((k) => [k, action[k]])));
      return { close: true };

    // Remove one item from (or clear) the user's lists in the palette.
    case "remove": {
      const name = state.byId.get(action.key)?.name ?? action.key;
      if (action.list === "shortcut") {
        await deleteShortcut(action.key);
        return { close: false, reload: true, keep: true, message: `Deleted shortcut “${action.key}”` };
      }
      if (action.list === "moveTarget") await removeMoveTarget(action.key);
      else await removeRecent(action.key);
      return { close: false, reload: true, keep: true, message: `Removed “${name}” from ${action.list === "moveTarget" ? "Recently moved to" : "Recent"}` };
    }

    case "clear":
      if (action.list === "moveTarget") await clearMoveTargets();
      else await clearRecent();
      return { close: false, reload: true, keep: true, message: action.list === "moveTarget" ? "Cleared Recently moved to" : "Cleared Recent" };

    case "options":
      await browser.runtime.openOptionsPage();
      return { close: true };

    default:
      throw new Error(`Unknown action ${action.op}`);
  }
}
