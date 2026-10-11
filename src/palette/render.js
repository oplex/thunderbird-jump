// DOM rendering for palette rows. User/folder text is only ever inserted
// via textContent, never as HTML.

import { folderIcon } from "../tb/folders.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Append `text` to `parent`, wrapping characters whose (offset + index)
// is in `positions` in highlight spans.
function appendHighlighted(parent, text, positions, offset = 0) {
  let buf = "";
  let inHl = false;
  const flush = () => {
    if (!buf) return;
    parent.append(inHl ? el("span", "hl", buf) : document.createTextNode(buf));
    buf = "";
  };
  for (let i = 0; i < text.length; i++) {
    const hl = positions.has(offset + i);
    if (hl !== inHl) {
      flush();
      inHl = hl;
    }
    buf += text[i];
  }
  flush();
}

// Path segments joined by "/" in the matcher; rendered with " › " separators.
function renderPath(parent, segments, positions) {
  let offset = 0;
  segments.forEach((seg, i) => {
    if (i > 0) parent.append(el("span", "sep", " › "));
    appendHighlighted(parent, seg, positions, offset);
    offset += seg.length + 1;
  });
}

function renderItem(li, row) {
  const { entry } = row;
  const positions = new Set(row.positions ?? []);
  li.append(el("span", "icon", row.icon ?? (entry ? folderIcon(entry) : "•")));

  const text = el("div", "text");
  const title = el("div", "title");
  if (row.title) {
    title.textContent = row.title;
  } else if (entry) {
    const nameOffset = entry.segments.join("/").length - entry.name.length;
    appendHighlighted(title, entry.name, positions, nameOffset);
  }
  text.append(title);

  const path = el("div", "path");
  if (row.detail) path.textContent = row.detail;
  else if (entry) renderPath(path, entry.segments, positions);
  text.append(path);
  li.append(text);

  if (row.badge) li.append(el("span", "badge", row.badge));
}

export function isSelectable(row) {
  return row.type === "item" && row.action != null;
}

export function renderRows(list, rows, selected, onPick) {
  list.replaceChildren();
  rows.forEach((row, i) => {
    const li = el("li", row.type);
    if (row.type === "item") {
      renderItem(li, row);
      li.setAttribute("role", "option");
      if (i === selected) {
        li.classList.add("selected");
        li.setAttribute("aria-selected", "true");
      }
      if (isSelectable(row)) {
        li.addEventListener("mousedown", (ev) => ev.preventDefault());
        li.addEventListener("click", (ev) => onPick(i, ev));
      }
    } else {
      li.textContent = row.text;
    }
    list.append(li);
  });
  list.children[selected]?.scrollIntoView({ block: "nearest" });
}
