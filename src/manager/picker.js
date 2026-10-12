// "Move to…" folder picker overlay for the Manager (same fuzzy search and
// shortcuts as the palette). Resolves with a folder id, or null if cancelled.

import { rankFolders } from "../lib/fuzzy.js";
import { parseInput, matchShortcuts } from "../lib/parse.js";

const $ = (id) => document.getElementById(id);

function candidates(text, { folders, byId, shortcuts, moveTargets, exclude }) {
  const ok = (e) => e && !e.isRoot && !e.isVirtual && !exclude.has(e.id);
  const p = parseInput(text);
  if (p.kind === "jump-shortcut") {
    return matchShortcuts(shortcuts, p.name).map((s) => byId.get(s.folderId)).filter(ok);
  }
  if (p.kind === "home") {
    const seen = new Set();
    return [...moveTargets, ...Object.values(shortcuts).map((s) => s.folderId)]
      .map((id) => byId.get(id))
      .filter((e) => ok(e) && !seen.has(e.id) && seen.add(e.id))
      .slice(0, 12);
  }
  if (p.kind !== "search") return [];
  const rank = new Map(moveTargets.map((id, i) => [id, i]));
  return rankFolders(folders.filter(ok), p.query, { boost: (e) => (rank.has(e.id) ? 60 - rank.get(e.id) * 4 : 0), limit: 40 }).map((r) => r.entry);
}

export function pickFolder(heading, ctx) {
  const overlay = $("picker");
  const input = $("pickerInput");
  const list = $("pickerList");
  $("pickerHead").textContent = heading;
  overlay.hidden = false;
  input.value = "";
  let items = [];
  let index = 0;

  const draw = () => {
    list.replaceChildren(
      ...items.map((e, i) => {
        const li = document.createElement("li");
        li.className = i === index ? "on" : "";
        const name = document.createElement("div");
        name.textContent = e.name;
        const path = document.createElement("div");
        path.className = "path";
        path.textContent = e.segments.join(" › ");
        li.append(name, path);
        li.addEventListener("click", () => finish(e.id));
        return li;
      }),
    );
    list.children[index]?.scrollIntoView({ block: "nearest" });
  };
  const update = () => {
    items = candidates(input.value, ctx);
    index = 0;
    draw();
  };

  let resolveFn;
  const finish = (value) => {
    overlay.hidden = true;
    input.removeEventListener("input", update);
    input.removeEventListener("keydown", onKey);
    resolveFn(value);
  };
  const onKey = (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (items.length) index = (index + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      draw();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (items[index]) finish(items[index].id);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      finish(null);
    }
  };
  input.addEventListener("input", update);
  input.addEventListener("keydown", onKey);
  update();
  input.focus();
  return new Promise((resolve) => (resolveFn = resolve));
}
