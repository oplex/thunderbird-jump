// DOM rendering for the Manager. Text is only inserted via textContent.

import { senderName } from "../lib/facets.js";
import { folderIcon } from "../tb/folders.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const today = new Date().toDateString();
function shortDate(t) {
  if (!t) return "";
  const d = new Date(t);
  if (d.toDateString() === today) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Results table. handlers: { onToggle(id, shift), onOpen(message) }
export function renderResults(tbody, messages, selected, byId, handlers) {
  const frag = document.createDocumentFragment();
  for (const m of messages) {
    const tr = el("tr", `${selected.has(m.id) ? "sel" : ""}${m.read ? "" : " unread"}`);
    tr.dataset.id = m.id;
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = selected.has(m.id);
    box.setAttribute("aria-label", `Select “${m.subject}”`);
    const c = el("td", "c");
    c.append(box);
    const subject = el("td", "subject");
    if (m.flagged) subject.append(el("span", "flag", "⚑ "));
    subject.append(document.createTextNode(m.subject));
    subject.title = m.subject;
    const from = el("td", "from", senderName(m.author));
    from.title = m.author;
    const folder = byId.get(m.folderId);
    const where = el("td", "folder", folder?.name ?? "");
    where.title = folder ? folder.segments.join(" › ") : "";
    tr.append(c, el("td", "date", shortDate(m.date)), from, subject, where);
    tr.addEventListener("click", (ev) => handlers.onToggle(m.id, ev.shiftKey));
    tr.addEventListener("dblclick", () => handlers.onOpen(m));
    frag.append(tr);
  }
  tbody.replaceChildren(frag);
}

// One facet list; `active` is a Set of keys currently used as chips.
export function renderFacet(ul, items, active, onPick) {
  ul.replaceChildren(
    ...items.map((f) => {
      const li = el("li", active.has(f.key) ? "on" : "");
      li.title = f.title ?? f.label;
      li.append(el("span", "label", f.label), el("span", "count", String(f.count)));
      li.addEventListener("click", () => onPick(f.key, f.label));
      return li;
    }),
  );
}

export function renderChips(box, chips, onRemove) {
  const names = { folder: "Folder", sender: "From", year: "Year" };
  box.replaceChildren(
    ...chips.map((c, i) => {
      const chip = el("span", "chip", `${names[c.facet]}: ${c.label}`);
      const x = el("button", "", "×");
      x.title = "Remove filter";
      x.addEventListener("click", () => onRemove(i));
      chip.append(x);
      return chip;
    }),
  );
}

export function renderAccounts(box, accounts, checked, onChange) {
  box.replaceChildren(
    ...accounts.map((a) => {
      const label = el("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked.has(a.accountId);
      input.addEventListener("change", () => onChange(a.accountId, input.checked));
      label.append(input, document.createTextNode(` ${a.name}`));
      return label;
    }),
  );
}

function highlighted(text, positions, offset) {
  const span = el("span");
  for (let i = 0; i < text.length; i++) {
    span.append(positions.has(offset + i) ? el("span", "hl", text[i]) : document.createTextNode(text[i]));
  }
  return span;
}

// Folder search results. handlers: { onOpen(entry), onSearchIn(entry) }
export function renderFolders(ul, ranked, handlers) {
  ul.replaceChildren(
    ...ranked.map(({ entry, positions = [] }) => {
      const li = el("li");
      const set = new Set(positions);
      const nameOffset = entry.segments.join("/").length - entry.name.length;
      const text = el("div", "text");
      const name = el("div");
      name.append(el("span", "", `${folderIcon(entry)} `), highlighted(entry.name, set, nameOffset));
      text.append(name, el("div", "path", entry.segments.join(" › ")));
      const open = el("button", "", "Open");
      open.addEventListener("click", () => handlers.onOpen(entry));
      const search = el("button", "", "Messages here");
      search.addEventListener("click", () => handlers.onSearchIn(entry));
      li.append(text, search, open);
      li.addEventListener("dblclick", () => handlers.onOpen(entry));
      return li;
    }),
  );
}
