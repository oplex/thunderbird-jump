// Turns parsed input + palette state into list rows. Pure (no browser APIs).
//
// ctx = { folders, byId, shortcuts, recent, currentId, createParentId }
// Row kinds:
//   { type: "header", text }
//   { type: "info", text }
//   { type: "item", entry?, positions?, title?, detail?, badge?, action }
// Actions:
//   { op: "jump", folderId }               { op: "set", name, folderId }
//   { op: "delete", name }                 { op: "create", parentId, segments }

import { parseInput, matchShortcuts, compareShortcutKeys, shortcutKey } from "./parse.js";
import { rankFolders, fold } from "./fuzzy.js";

export const HELP = [
  ["text", "fuzzy search all folders, Enter to jump"],
  ["j1, j2 …", "jump to numbered shortcut (or Alt+1‥9)"],
  [":j name", "jump to shortcut by name (:j or :jl lists all)"],
  [":jj1, :jj name", "save the current folder as a shortcut"],
  [":jj name = query", "save a searched folder as a shortcut"],
  [":jd name", "delete a shortcut"],
  [":new A/B", "create A/B inside the current folder"],
  ["query > A/B", "find a parent folder, create A/B inside it"],
  ["Ctrl+N", "create a subfolder inside the highlighted folder"],
  ["Shift+Enter", "open the folder in a new tab"],
  [":keys", "change keyboard shortcuts and settings"],
  [":backup", "export, import or auto-backup your settings"],
];

const label = (entry) => entry.segments.join(" › ");

function shortcutBadges(shortcuts) {
  const byFolder = new Map();
  for (const [key, s] of Object.entries(shortcuts)) {
    const prev = byFolder.get(s.folderId);
    if (!prev || compareShortcutKeys(key, prev) < 0) byFolder.set(s.folderId, key);
  }
  return byFolder;
}

function folderRow(entry, action, extra = {}) {
  return { type: "item", entry, action, ...extra };
}

function shortcutRows(ctx, list, makeAction) {
  return list.map((s) => {
    const entry = ctx.byId.get(s.folderId);
    if (!entry) {
      return { type: "item", title: s.label ?? "(missing folder)", detail: "folder no longer exists", badge: s.name, action: makeAction(s, true) };
    }
    return folderRow(entry, makeAction(s, false), { badge: s.name });
  });
}

function searchFolders(ctx, query, filter) {
  const recentRank = new Map(ctx.recent.map((id, i) => [id, i]));
  const boost = (e) => (recentRank.has(e.id) ? Math.max(0, 40 - recentRank.get(e.id) * 3) : 0);
  const entries = filter ? ctx.folders.filter(filter) : ctx.folders;
  return rankFolders(entries, query, { boost });
}

function homeRows(ctx) {
  const rows = [];
  const keys = Object.keys(ctx.shortcuts).sort(compareShortcutKeys);
  if (keys.length) {
    rows.push({ type: "header", text: "Shortcuts" });
    const list = keys.map((k) => ({ key: k, ...ctx.shortcuts[k] }));
    rows.push(...shortcutRows(ctx, list, (s) => ({ op: "jump", folderId: s.folderId })));
  }
  const recent = ctx.recent.map((id) => ctx.byId.get(id)).filter(Boolean);
  if (recent.length) {
    rows.push({ type: "header", text: "Recent" });
    for (const e of recent) rows.push(folderRow(e, { op: "jump", folderId: e.id }));
  }
  if (!rows.length) rows.push({ type: "info", text: "Type to search folders · ? for help" });
  return rows;
}

function rankedRows(ranked, makeAction, badges) {
  return ranked.map((r) =>
    folderRow(r.entry, makeAction(r.entry), { positions: r.positions, badge: badges.get(r.entry.id) }),
  );
}

export function buildRows(input, ctx) {
  const badges = shortcutBadges(ctx.shortcuts);
  const current = ctx.byId.get(ctx.currentId);

  if (ctx.createParentId != null) {
    const parent = ctx.byId.get(ctx.createParentId);
    const segments = input.split("/").map((s) => s.trim()).filter(Boolean);
    if (!parent) return [{ type: "info", text: "Parent folder not found" }];
    if (!segments.length) return [{ type: "info", text: `Type a name for the new folder in ${label(parent)} (use / to nest)` }];
    return [{ type: "item", title: `Create “${segments.join(" / ")}”`, detail: `in ${label(parent)}`, icon: "➕", action: { op: "create", parentId: parent.id, segments } }];
  }

  const p = parseInput(input);
  switch (p.kind) {
    case "home":
      return homeRows(ctx);

    case "options":
      return [{ type: "item", icon: "⚙", title: "Open options", detail: "keyboard shortcuts, backup, behaviour, saved shortcuts", action: { op: "options" } }];

    case "help":
      return HELP.map(([k, v]) => ({ type: "item", icon: "⌨", title: k, detail: v, action: null }));

    case "search": {
      const rows = [];
      const exact = ctx.shortcuts[shortcutKey(p.query)];
      if (exact) rows.push(...shortcutRows(ctx, [exact], (s) => ({ op: "jump", folderId: s.folderId })));
      const ranked = searchFolders(ctx, p.query).filter((r) => !exact || r.entry.id !== exact.folderId);
      // Order: folders named exactly as typed, then recently used matches
      // (newest first), then everything else by score.
      const recentRank = new Map(ctx.recent.map((id, i) => [id, i]));
      const q = fold(p.query.trim());
      const exactName = ranked.filter((r) => fold(r.entry.name) === q);
      const rest = ranked.filter((r) => !exactName.includes(r));
      const recent = rest.filter((r) => recentRank.has(r.entry.id)).sort((a, b) => recentRank.get(a.entry.id) - recentRank.get(b.entry.id));
      const others = rest.filter((r) => !recentRank.has(r.entry.id));
      const jump = (e) => ({ op: "jump", folderId: e.id });
      rows.push(...rankedRows(exactName, jump, badges));
      if (recent.length) {
        rows.push({ type: "header", text: "Recent" }, ...rankedRows(recent, jump, badges));
        if (others.length) rows.push({ type: "header", text: "Folders" });
      }
      rows.push(...rankedRows(others, jump, badges));
      if (!rows.length) rows.push({ type: "info", text: `No folder matches “${p.query}” · try “${p.query} > New name” to create` });
      return rows;
    }

    case "jump-shortcut": {
      const list = matchShortcuts(ctx.shortcuts, p.name);
      if (!list.length) {
        return [{ type: "info", text: p.name ? `No shortcut “${p.name}” · set it with :jj${/^\d+$/.test(p.name) ? "" : " "}${p.name}` : "No shortcuts yet · set one with :jj1 or :jj name" }];
      }
      return shortcutRows(ctx, list, (s) => ({ op: "jump", folderId: s.folderId }));
    }

    case "set-shortcut": {
      if (!p.name) return [{ type: "info", text: "Type a name: :jj1, :jj work, or :jj work = folder query" }];
      const existing = ctx.shortcuts[shortcutKey(p.name)];
      const note = existing ? ` (replaces ${existing.label ?? "old target"})` : "";
      if (p.query == null) {
        if (!current) return [{ type: "info", text: "No folder is open in the mail tab" }];
        return [folderRow(current, { op: "set", name: p.name, folderId: current.id }, { title: `Set “${p.name}” → ${current.name}`, detail: label(current) + note, badge: p.name })];
      }
      const ranked = searchFolders(ctx, p.query, (e) => !e.isRoot);
      if (!ranked.length) return [{ type: "info", text: `No folder matches “${p.query}”` }];
      return rankedRows(ranked, (e) => ({ op: "set", name: p.name, folderId: e.id }), badges).map((r, i) =>
        i === 0 && note ? { ...r, detail: label(r.entry) + note } : r,
      );
    }

    case "delete-shortcut": {
      const list = matchShortcuts(ctx.shortcuts, p.name);
      if (!list.length) return [{ type: "info", text: p.name ? `No shortcut “${p.name}”` : "No shortcuts to delete" }];
      return shortcutRows(ctx, list, (s) => ({ op: "delete", name: s.name })).map((r) => ({ ...r, icon: "✖" }));
    }

    case "create": {
      if (!current) return [{ type: "info", text: "No folder is open in the mail tab" }];
      if (!p.segments.length) return [{ type: "info", text: `Type a name: :new Name (created in ${label(current)})` }];
      return [{ type: "item", icon: "➕", title: `Create “${p.segments.join(" / ")}”`, detail: `in ${label(current)}`, action: { op: "create", parentId: current.id, segments: p.segments } }];
    }

    case "create-in": {
      const ranked = p.query
        ? searchFolders(ctx, p.query, (e) => !e.isVirtual)
        : ctx.folders.filter((e) => e.isRoot).map((entry) => ({ entry, positions: [] }));
      if (!ranked.length) return [{ type: "info", text: `No parent folder matches “${p.query}”` }];
      if (!p.segments.length) {
        return [{ type: "info", text: "Type the new folder name after “>” (use / to nest)" }, ...rankedRows(ranked, () => null, badges)];
      }
      const name = p.segments.join(" / ");
      return rankedRows(ranked, (e) => ({ op: "create", parentId: e.id, segments: p.segments }), badges).map((r) => ({ ...r, detail: `create “${name}” in ${label(r.entry)}` }));
    }

    default:
      return [{ type: "info", text: `Unknown command “:${p.command}” · ? for help` }];
  }
}
