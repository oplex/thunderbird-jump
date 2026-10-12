// Palette rows for filing messages (move, copy, tag) and undoing moves.
// Pure (no browser APIs).
//
// ctx additions used here:
//   moving        message summaries being filed (null when not filing)
//   fileOp        "move" (default), "copy" or "tag"
//   suggestions   [{ folderId, reason }] from rules and earlier moves
//   tags          Thunderbird's tags (tag mode)
//   moveTargets   folder ids recently moved to, newest first
//   confirmTarget folder id waiting for "yes" (confirm-each-move setting)
//   lastMove      newest undoable log entry (or null)

import { parseInput, matchShortcuts, shortcutKey } from "./parse.js";
import { rankFolders } from "./fuzzy.js";
import { expandSegments } from "./template.js";
import { buildTagRows } from "./tag-rows.js";

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
  const tag = entry.kind === "tag";
  const what = tag ? `${entry.remove ? "untagged" : "tagged"} ${plural(entry.count, "message")} “${entry.targetLabel}”` : `moved ${plural(entry.count, "message")} to ${entry.targetLabel || "folder"}`;
  return {
    type: "item",
    icon: "↶",
    title: `Undo: ${what}`,
    detail: tag ? "Ctrl+Z · puts their tags back as they were" : "Ctrl+Z · moves them back where they were",
    action: { op: "undo", entryId: entry.id },
  };
}

// Why messages can't go into `e` (null when they can): account roots and
// saved searches hold no messages, and moving into the source does nothing.
export function whyNotTarget(e, sources = new Set()) {
  if (e.isRoot) return `Account root · messages can't go here · type “${e.name} > New” to make a folder`;
  if (e.isVirtual) return "Saved search · not a real folder, messages can't go here";
  if (sources.size === 1 && sources.has(e.id)) return "The messages are already in this folder";
  return null;
}

// Shown grayed out, with the reason, instead of silently left out.
function blockedRow(entry, reason, extra = {}) {
  return { type: "item", entry, detail: reason, disabled: true, ...extra };
}

function targetRow(entry, ctx, extra = {}) {
  return { type: "item", entry, action: { op: ctx.fileOp === "copy" ? "copy" : "move", folderId: entry.id }, ...extra };
}

export function buildMoveRows(input, ctx) {
  const { moving, byId } = ctx;
  const verb = ctx.fileOp === "copy" ? "Copy" : "Move";
  if (ctx.confirmTarget != null) {
    const target = byId.get(ctx.confirmTarget);
    return [
      {
        type: "item",
        icon: "✔",
        title: `${verb} ${describeSelection(moving, byId)} to ${target?.name ?? "?"}?`,
        detail: `${target ? label(target) : ""} · Enter = ${verb.toLowerCase()}, Esc = back`,
        action: { op: verb.toLowerCase(), folderId: ctx.confirmTarget, confirmed: true },
      },
    ];
  }
  if (ctx.needsPermission) {
    return [{ type: "item", icon: "🔓", title: "Turn on moving, copying and tagging", detail: "Thunderbird asks once for permission to read, move and tag messages", action: { op: "enable-move" } }];
  }
  if (!moving.length) return [{ type: "info", text: "No messages are selected. Select some in the message list first." }];
  if (ctx.fileOp === "tag") return buildTagRows(input, ctx);

  const p = parseInput(input);
  if (p.segments) p.segments = expandSegments(p.segments, ctx.now);
  const sources = new Set(moving.map((m) => m.folderId));
  const allowed = (e) => !whyNotTarget(e, sources);
  const rowFor = (e, extra) => {
    const reason = whyNotTarget(e, sources);
    return reason ? blockedRow(e, reason, extra) : targetRow(e, ctx, extra);
  };

  if (p.kind === "jump-shortcut") {
    const list = matchShortcuts(ctx.shortcuts, p.name).filter((s) => byId.has(s.folderId));
    if (!list.length) return [{ type: "info", text: p.name ? `No shortcut “${p.name}”` : "No shortcuts yet" }];
    return list.map((s) => rowFor(byId.get(s.folderId), { badge: s.name }));
  }

  if (p.kind === "home") {
    const rows = [];
    const seen = new Set();
    const add = (heading, ids, list, keyOf = (e) => e.id) => {
      const entries = ids.map((id) => byId.get(id)).filter((e) => e && allowed(e) && !seen.has(e.id));
      if (!entries.length) return;
      rows.push({ type: "header", text: heading, ...(list !== "shortcut" ? { clear: list } : {}) });
      for (const e of entries) {
        seen.add(e.id);
        rows.push(targetRow(e, ctx, { remove: { list, key: keyOf(e) } }));
      }
    };
    const shortcutName = new Map(Object.values(ctx.shortcuts).map((s) => [s.folderId, s.name]));
    for (const sug of (ctx.suggestions ?? []).filter((x) => byId.has(x.folderId) && allowed(byId.get(x.folderId)))) {
      if (!seen.size) rows.push({ type: "header", text: "Suggested" });
      seen.add(sug.folderId);
      rows.push(targetRow(byId.get(sug.folderId), ctx, { detail: `${label(byId.get(sug.folderId))} · ${sug.reason}`, icon: "★" }));
    }
    add("Recently moved to", ctx.moveTargets ?? [], "moveTarget");
    add("Shortcuts", Object.values(ctx.shortcuts).map((s) => s.folderId), "shortcut", (e) => shortcutName.get(e.id));
    add("Recent folders", ctx.recent, "recent");
    if (!rows.length) rows.push({ type: "info", text: `Type a folder name to ${verb.toLowerCase()} the messages there` });
    return rows;
  }

  if (p.kind === "create-in") return createAndMoveRows(p, ctx);
  if (p.kind !== "search") return [{ type: "info", text: "Type a folder name, j1 or :j name · parent > New makes a folder" }];
  const rows = [];
  const exact = ctx.shortcuts[shortcutKey(p.query)];
  if (exact && byId.has(exact.folderId)) rows.push(rowFor(byId.get(exact.folderId), { badge: exact.name }));
  const targetRank = new Map((ctx.moveTargets ?? []).map((id, i) => [id, i]));
  const suggested = new Set((ctx.suggestions ?? []).map((x) => x.folderId));
  const boost = (e) => (suggested.has(e.id) ? 80 : 0) + (targetRank.has(e.id) ? Math.max(0, 60 - targetRank.get(e.id) * 4) : 0);
  for (const r of rankFolders(ctx.folders, p.query, { boost })) {
    if (exact && r.entry.id === exact.folderId) continue;
    rows.push(rowFor(r.entry, { positions: r.positions }));
  }
  if (!rows.length) rows.push({ type: "info", text: `No folder matches “${p.query}”` });
  return rows;
}

// "clients > Acme/2026": pick the parent (account roots too), create, move.
function createAndMoveRows(p, ctx) {
  const parents = ctx.folders.filter((e) => !e.isVirtual);
  const ranked = p.query ? rankFolders(parents, p.query) : parents.filter((e) => e.isRoot).map((entry) => ({ entry, positions: [] }));
  if (!ranked.length) return [{ type: "info", text: `No parent folder matches “${p.query}”` }];
  if (!p.segments.length) {
    return [{ type: "info", text: "Type the new folder name after “>” (use / to nest)" }, ...ranked.map((r) => ({ type: "item", entry: r.entry, positions: r.positions }))];
  }
  const name = p.segments.join(" / ");
  return ranked.map((r) => ({
    type: "item",
    icon: "➕",
    entry: r.entry,
    positions: r.positions,
    title: `New “${name}” in ${r.entry.name}, ${ctx.fileOp === "copy" ? "copy" : "move"} there`,
    detail: label(r.entry),
    action: { op: "create-move", parentId: r.entry.id, segments: p.segments, copy: ctx.fileOp === "copy" },
  }));
}
