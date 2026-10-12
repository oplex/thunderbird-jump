// Palette rows for moving messages and undoing moves. Pure (no browser APIs).
//
// ctx additions used here:
//   moving        message summaries being moved (null when not moving)
//   moveTargets   folder ids recently moved to, newest first
//   confirmTarget folder id waiting for "yes" (confirm-each-move setting)
//   lastMove      newest undoable move log entry (or null)

import { parseInput, matchShortcuts, shortcutKey } from "./parse.js";
import { rankFolders } from "./fuzzy.js";

const UNDO_WINDOW_MS = 30 * 60 * 1000;
const label = (e) => e.segments.join(" › ");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// "3 messages from Inbox" / "2 messages from 2 folders".
export function describeSelection(messages, byId) {
  const from = new Set(messages.map((m) => m.folderId));
  const where = from.size === 1 ? byId.get([...from][0])?.name ?? "one folder" : `${from.size} folders`;
  return `${plural(messages.length, "message")} from ${where}`;
}

export function undoRow(entry, now = Date.now()) {
  if (!entry || entry.undone || now - entry.at > UNDO_WINDOW_MS) return null;
  return {
    type: "item",
    icon: "↶",
    title: `Undo: moved ${plural(entry.count, "message")} to ${entry.targetLabel || "folder"}`,
    detail: "Ctrl+Z · moves them back where they were",
    action: { op: "undo", entryId: entry.id },
  };
}

// Folders messages can go into: not account roots or saved searches.
const isTarget = (e) => !e.isRoot && !e.isVirtual;

function targetRow(entry, ctx, extra = {}) {
  return { type: "item", entry, action: { op: "move", folderId: entry.id }, ...extra };
}

export function buildMoveRows(input, ctx) {
  const { moving, byId } = ctx;
  if (ctx.confirmTarget != null) {
    const target = byId.get(ctx.confirmTarget);
    return [
      {
        type: "item",
        icon: "✔",
        title: `Move ${describeSelection(moving, byId)} to ${target?.name ?? "?"}?`,
        detail: `${target ? label(target) : ""} · Enter = move, Esc = back`,
        action: { op: "move", folderId: ctx.confirmTarget, confirmed: true },
      },
    ];
  }
  if (ctx.needsPermission) {
    return [{ type: "item", icon: "🔓", title: "Turn on moving messages", detail: "Thunderbird asks once for permission to read and move messages", action: { op: "enable-move" } }];
  }
  if (!moving.length) return [{ type: "info", text: "No messages are selected. Select some in the message list first." }];

  const p = parseInput(input);
  const sources = new Set(moving.map((m) => m.folderId));
  const allowed = (e) => isTarget(e) && !(sources.size === 1 && sources.has(e.id));

  if (p.kind === "jump-shortcut") {
    const list = matchShortcuts(ctx.shortcuts, p.name).filter((s) => byId.has(s.folderId) && allowed(byId.get(s.folderId)));
    if (!list.length) return [{ type: "info", text: p.name ? `No shortcut “${p.name}”` : "No shortcuts yet" }];
    return list.map((s) => targetRow(byId.get(s.folderId), ctx, { badge: s.name }));
  }

  if (p.kind === "home") {
    const rows = [];
    const seen = new Set();
    const add = (heading, ids) => {
      const entries = ids.map((id) => byId.get(id)).filter((e) => e && allowed(e) && !seen.has(e.id));
      if (!entries.length) return;
      rows.push({ type: "header", text: heading });
      for (const e of entries) {
        seen.add(e.id);
        rows.push(targetRow(e, ctx));
      }
    };
    add("Recently moved to", ctx.moveTargets ?? []);
    add("Shortcuts", Object.values(ctx.shortcuts).map((s) => s.folderId));
    add("Recent folders", ctx.recent);
    if (!rows.length) rows.push({ type: "info", text: "Type a folder name to move the messages there" });
    return rows;
  }

  if (p.kind !== "search") return [{ type: "info", text: "Type a folder name, j1 or :j name" }];
  const rows = [];
  const exact = ctx.shortcuts[shortcutKey(p.query)];
  if (exact && byId.has(exact.folderId) && allowed(byId.get(exact.folderId))) {
    rows.push(targetRow(byId.get(exact.folderId), ctx, { badge: exact.name }));
  }
  const targetRank = new Map((ctx.moveTargets ?? []).map((id, i) => [id, i]));
  const boost = (e) => (targetRank.has(e.id) ? Math.max(0, 60 - targetRank.get(e.id) * 4) : 0);
  for (const r of rankFolders(ctx.folders.filter(allowed), p.query, { boost })) {
    if (exact && r.entry.id === exact.folderId) continue;
    rows.push(targetRow(r.entry, ctx, { positions: r.positions }));
  }
  if (!rows.length) rows.push({ type: "info", text: `No folder matches “${p.query}”` });
  return rows;
}
