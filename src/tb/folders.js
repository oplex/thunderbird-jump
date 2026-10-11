// Read-only folder listing plus the single write operation this add-on
// performs: creating new folders when the user explicitly asks for it.
// Nothing here moves, copies, renames or deletes messages or folders.

import { splitFolderPath } from "../lib/parse.js";

// Flatten every account's folder tree into palette entries:
// { id, name, accountId, accountName, segments, specialUse, isRoot, isVirtual }
export async function loadFolders() {
  const accounts = await browser.accounts.list(true);
  const out = [];
  for (const account of accounts) {
    const root = account.rootFolder;
    if (!root) continue;
    out.push({
      id: root.id,
      name: account.name,
      accountId: account.id,
      accountName: account.name,
      segments: [account.name],
      specialUse: [],
      isRoot: true,
      isVirtual: false,
    });
    let subs = root.subFolders;
    if (!subs) subs = await browser.folders.getSubFolders(root.id, true);
    walk(subs, account, [account.name], out);
  }
  return out;
}

function walk(folders, account, parentSegments, out) {
  for (const f of folders ?? []) {
    const segments = [...parentSegments, f.name];
    out.push({
      id: f.id,
      name: f.name,
      accountId: account.id,
      accountName: account.name,
      segments,
      specialUse: f.specialUse ?? [],
      isRoot: false,
      isVirtual: !!f.isVirtual,
    });
    walk(f.subFolders, account, segments, out);
  }
}

export function pathLabel(entry) {
  return entry.segments.join(" › ");
}

// Create `path` ("A/B/C" or an array of segments) under `parent`.
// Existing folders along the way are reused, so this is idempotent.
// `parent` is a palette entry; returns the id of the deepest folder.
export async function createFolderPath(parent, path) {
  const segments = Array.isArray(path) ? path : splitFolderPath(path);
  if (!segments.length) throw new Error("Folder name is empty");
  if (parent.isVirtual) throw new Error("Cannot create folders inside a saved search");
  // MV3 folders.create/getSubFolders take a MailFolderId; for an account
  // that is the id of its root folder.
  let target = parent.id;
  let folder = null;
  for (const name of segments) {
    const children = await browser.folders.getSubFolders(target, false);
    const existing = children.find((c) => c.name.toLowerCase() === name.toLowerCase());
    folder = existing ?? (await browser.folders.create(target, name));
    target = folder.id;
  }
  return folder.id;
}

const SPECIAL_ICONS = {
  inbox: "📥",
  sent: "📤",
  drafts: "📝",
  trash: "🗑️",
  junk: "🚫",
  archives: "🗄️",
  templates: "📄",
  outbox: "📮",
};

export function folderIcon(entry) {
  if (entry.isRoot) return "👤";
  if (entry.isVirtual) return "🔎";
  for (const use of entry.specialUse ?? []) {
    if (SPECIAL_ICONS[use]) return SPECIAL_ICONS[use];
  }
  return "📁";
}
