// Options page: the folder-suggestion rules ("sender or subject contains X
// → folder") and the suggestions ThunderJump learned from earlier moves.

import { getRules, addRule, deleteRule, getLearned, forgetLearned } from "../tb/rules.js";
import { loadFolders, pathLabel } from "../tb/folders.js";

const $ = (id) => document.getElementById(id);

function say(text, cls = "ok") {
  $("ruleStatus").textContent = text;
  $("ruleStatus").className = cls;
}

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

async function render() {
  const [rules, learned, folders] = await Promise.all([getRules(), getLearned(), loadFolders()]);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const tbody = $("rules");
  tbody.replaceChildren();
  if (!rules.length) {
    const tr = document.createElement("tr");
    const td = cell("No rules yet.", "dim");
    td.colSpan = 3;
    tr.append(td);
    tbody.append(tr);
  }
  for (const r of rules) {
    const tr = document.createElement("tr");
    const folder = byId.get(r.folderId);
    tr.append(cell(r.text), cell(folder ? pathLabel(folder) : `${r.label} (missing)`, folder ? "" : "missing"));
    const td = document.createElement("td");
    const b = document.createElement("button");
    b.textContent = "Delete";
    b.addEventListener("click", () => deleteRule(r.id));
    td.append(b);
    tr.append(td);
    tbody.append(tr);
  }
  const senders = Object.keys(learned).length;
  $("learnedCount").textContent = senders ? `Learned from ${senders} sender${senders === 1 ? "" : "s"}.` : "Nothing learned yet.";
}

async function fillFolders() {
  const folders = (await loadFolders()).filter((f) => !f.isRoot && !f.isVirtual);
  const select = $("ruleFolder");
  select.replaceChildren(
    ...folders
      .map((f) => [f.id, pathLabel(f)])
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, text]) => Object.assign(document.createElement("option"), { value: id, textContent: text })),
  );
}

export async function initRules() {
  await fillFolders();
  $("addRule").addEventListener("click", async () => {
    try {
      const folderId = $("ruleFolder").value;
      await addRule($("ruleText").value, folderId, $("ruleFolder").selectedOptions[0]?.textContent ?? "");
      $("ruleText").value = "";
      say("Rule saved.");
    } catch (e) {
      say(e?.message ?? String(e), "missing");
    }
  });
  $("forgetLearned").addEventListener("click", async () => {
    await forgetLearned();
    say("Learned suggestions forgotten.");
  });
  browser.storage.onChanged.addListener((changes) => {
    if (changes.rules || changes.learned) render();
  });
  await render();
}
