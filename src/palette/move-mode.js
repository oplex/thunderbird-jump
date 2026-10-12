// Palette move mode: load the selected messages and show what is being moved.

import { canMove, selectedMessages, getMoveTargets, lastUndoableMove } from "../tb/messages.js";
import { describeSelection } from "../lib/move-rows.js";

export async function loadMoveState(state) {
  const [moveTargets, lastMove] = await Promise.all([getMoveTargets(), lastUndoableMove()]);
  state.moveTargets = moveTargets;
  state.lastMove = lastMove;
}

// Switch the palette to moving the messages selected in the mail tab.
export async function startMove(state) {
  state.confirmTarget = null;
  if (!(await canMove())) {
    state.needsPermission = true;
    state.moving = [];
    return;
  }
  state.needsPermission = false;
  state.moving = await selectedMessages(state.windowId);
}

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
  el.append(line("sel-head", n ? `Moving ${describeSelection(state.moving, state.byId)}` : "No messages selected"));
  for (const m of state.moving.slice(0, 3)) {
    const row = line("sel-msg", "");
    row.append(line("sel-subject", m.subject), line("sel-meta", `${m.author.replace(/\s*<.*>$/, "")} · ${shortDate(m.date)}`));
    el.append(row);
  }
  if (n > 3) el.append(line("sel-more", `+ ${n - 3} more`));
}
