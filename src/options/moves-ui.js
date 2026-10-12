// Options page: turn moving on/off, confirm-each-move, and the move history
// (the add-on's own log) with Undo buttons.

import { canMove, enableMoving, getMoveLog, undoMove, MOVE_PERMISSIONS } from "../tb/messages.js";
import { getSettings, saveSettings } from "../tb/store.js";

const $ = (id) => document.getElementById(id);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function say(text, cls = "ok") {
  $("moveStatus").textContent = text;
  $("moveStatus").className = cls;
}

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

async function renderHistory() {
  const log = await getMoveLog();
  const tbody = $("moveHistory");
  tbody.replaceChildren();
  if (!log.length) {
    const tr = document.createElement("tr");
    const td = cell("No moves yet.", "dim");
    td.colSpan = 4;
    tr.append(td);
    tbody.append(tr);
    return;
  }
  for (const e of log.slice(0, 30)) {
    const tr = document.createElement("tr");
    const from = [...new Set(e.groups.map((g) => g.fromLabel.split(" › ").pop() || "?"))].join(", ");
    const subjects = e.groups.flatMap((g) => g.items.map((i) => i.subject));
    const what = cell(`${plural(e.count, "message")}: ${subjects.slice(0, 2).join(" · ")}${subjects.length > 2 ? " …" : ""}`);
    what.title = subjects.join("\n");
    tr.append(cell(new Date(e.at).toLocaleString()), what, cell(`${from} → ${e.targetLabel.split(" › ").pop() || "?"}`));
    const actions = document.createElement("td");
    if (e.undone) actions.append(cell("undone", "dim").firstChild);
    else {
      const b = document.createElement("button");
      b.textContent = "Undo";
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          const { restored, missing } = await undoMove(e.id);
          say(`Moved ${plural(restored, "message")} back${missing ? ` · ${missing} not found` : ""}`);
        } catch (err) {
          say(err?.message ?? String(err), "missing");
        }
        renderHistory();
      });
      actions.append(b);
    }
    tr.append(actions);
    tbody.append(tr);
  }
}

export async function initMoves() {
  const box = $("enableMoving");
  const confirm = $("confirmMove");
  const sync = async () => {
    box.checked = await canMove();
    confirm.disabled = !box.checked;
  };
  confirm.checked = !!(await getSettings()).confirmMove;
  confirm.addEventListener("change", () => saveSettings({ confirmMove: confirm.checked }));
  box.addEventListener("change", async () => {
    if (box.checked) {
      const granted = await enableMoving().catch(() => false);
      say(granted ? "Moving is on. Select messages and press Alt+Shift+M." : "Moving stays off (permission not given).", granted ? "ok" : "missing");
    } else {
      await browser.permissions.remove(MOVE_PERMISSIONS);
      say("Moving is off. ThunderJump is read-only again.");
    }
    sync();
  });
  browser.storage.onChanged.addListener((changes) => {
    if (changes.moveLog) renderHistory();
  });
  await sync();
  await renderHistory();
}
