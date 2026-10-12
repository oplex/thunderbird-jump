// Palette filing mode (move, copy or tag): load the selected messages, the
// suggested folders or the tags, and show what is being filed.

import { canMove, canTag, selectedMessages, getMoveTargets, lastUndoableMove } from "../tb/messages.js";
import { listTags } from "../tb/tags.js";
import { getRules, getLearned } from "../tb/rules.js";
import { suggestFolders } from "../lib/suggest.js";
import { describeSelection } from "../lib/move-rows.js";
export { fileCommand } from "../lib/parse.js";

export async function loadMoveState(state) {
  const [moveTargets, lastMove] = await Promise.all([getMoveTargets(), lastUndoableMove()]);
  state.moveTargets = moveTargets;
  state.lastMove = lastMove;
}

// Switch the palette to filing the messages selected in the mail tab.
// op: "move", "copy" or "tag".
export async function startMove(state, op = "move") {
  state.confirmTarget = null;
  state.fileOp = op;
  if (!(await (op === "tag" ? canTag() : canMove()))) {
    state.needsPermission = true;
    state.moving = [];
    return;
  }
  state.needsPermission = false;
  state.moving = await selectedMessages(state.windowId);
  if (op === "tag") {
    state.tags = await listTags();
    return;
  }
  if (!state.settings?.suggestEnabled) return void (state.suggestions = []);
  const [rules, learned] = await Promise.all([getRules(), getLearned()]);
  state.suggestions = suggestFolders(state.moving, rules, learned, { exists: (id) => state.byId.has(id) });
}

const VERB = { move: "Moving", copy: "Copying", tag: "Tagging" };

function line(className, text) {
  const div = document.createElement("div");
  div.className = className;
  div.textContent = text;
  return div;
}

const shortDate = (t) => (t ? new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

// The banner above the results: "Moving 3 messages from Inbox" + subjects.
export function renderSelection(el, state) {
  if (!state.moving || state.needsPermission) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.replaceChildren();
  const n = state.moving.length;
  el.append(line("sel-head", n ? `${VERB[state.fileOp] ?? "Moving"} ${describeSelection(state.moving, state.byId)}` : "No messages selected"));
  for (const m of state.moving.slice(0, 3)) {
    const row = line("sel-msg", "");
    row.append(line("sel-subject", m.subject), line("sel-meta", `${m.author.replace(/\s*<.*>$/, "")} · ${shortDate(m.date)}`));
    el.append(row);
  }
  if (n > 3) el.append(line("sel-more", `+ ${n - 3} more`));
}
