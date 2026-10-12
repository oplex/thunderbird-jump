// Read-only folder listing plus the single write operation this add-on
// performs: creating new folders when the user explicitly asks for it.
// Nothing here moves, copies, renames or deletes messages or folders.

import { splitFolderPath } from "../lib/parse.js";
import { hasFolderIds, legacyRootId, folderIdOf, folderArg, specialUseOf, listAccounts, getSubFolders } from "./compat.js";

// Flatten every account's folder tree into palette entries:
// { id, name, accountId, accountName, segments, specialUse, isRoot, isVirtual }
export async function loadFolders() {
  const accounts = await listAccounts();
  const out = [];
  for (const account of accounts) {
    const root = account.rootFolder;
    if (!root && hasFolderIds()) continue;
    out.push({
      id: root ? root.id : legacyRootId(account.id),
      name: account.name,
      accountId: account.id,
      accountName: account.name,
      segments: [account.name],
      specialUse: [],
      isRoot: true,
      isVirtual: false,
    });
    // Thunderbird 115: no rootFolder, the top-level folders are `account.folders`.
    let subs = root ? root.subFolders : account.folders;
    if (!subs) subs = await getSubFolders(root ? root.id : account, true);
    walk(subs, account, [account.name], out);
  }
  return out;
}

function walk(folders, account, parentSegments, out) {
  for (const f of folders ?? []) {
    const segments = [...parentSegments, f.name];
    const specialUse = specialUseOf(f);
    out.push({
      id: folderIdOf(f),
      name: f.name,
      accountId: account.id,
      accountName: account.name,
      segments,
      specialUse,
      isRoot: false,
      isVirtual: !!f.isVirtual || specialUse.includes("virtual"),
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
  // Thunderbird 121+ takes folder ids (an account's root folder id for the
  // top level); 115 takes folder / account objects (see compat.js).
  let target = parent.id;
  for (const name of segments) {
    const arg = await folderArg(target);
    const children = await getSubFolders(arg, false);
    const existing = children.find((c) => c.name.toLowerCase() === name.toLowerCase());
    target = folderIdOf(existing ?? (await browser.folders.create(arg, name)));
  }
  return target;
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
