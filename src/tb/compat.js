// Differences between the Thunderbird versions this add-on supports.
//
//   Thunderbird 121+  folders have ids (MailFolder.id), accounts have rootFolder,
//                     folders.get / mailTabs.create exist.
//   Thunderbird 115   no folder ids: a folder is { accountId, path }; accounts
//                     list top-level `folders`; APIs take folder objects.
//   Manifest V3 (140 build)    MailTab.tabId, mailTabs.update({ displayedFolderId })
//   Manifest V2 (115 build)    MailTab.id,    mailTabs.update({ displayedFolder })
//
// The rest of the add-on works with plain string ids; on 115 they are made up
// here as "<accountId>:<path>" (account root: "<accountId>:/").

export const hasFolderIds = () => typeof browser.folders?.get === "function";
const isMV3 = () => browser.runtime.getManifest().manifest_version >= 3;

const LEGACY_ROOT = "/";

export function legacyId(accountId, path) {
  return `${accountId}:${path}`;
}

export function legacyRef(id) {
  const i = id.indexOf(":");
  return { accountId: id.slice(0, i), path: id.slice(i + 1) };
}

export function legacyRootId(accountId) {
  return legacyId(accountId, LEGACY_ROOT);
}

export const isLegacyRoot = (id) => legacyRef(id).path === LEGACY_ROOT;

export function folderIdOf(folder) {
  return folder.id ?? legacyId(folder.accountId, folder.path);
}

export function tabIdOf(tab) {
  return tab.tabId ?? tab.id;
}

// What folders.getSubFolders / folders.create take as the parent.
export async function folderArg(id) {
  if (hasFolderIds()) return id;
  if (isLegacyRoot(id)) return browser.accounts.get(legacyRef(id).accountId, false);
  return legacyRef(id);
}

// Properties for mailTabs.update / mailTabs.create that show `id`.
export function displayProps(id) {
  if (isMV3()) return { displayedFolderId: id };
  return { displayedFolder: hasFolderIds() ? id : legacyRef(id) };
}

// Thunderbird 115 has no mailTabs.create.
export const canCreateMailTab = () => typeof browser.mailTabs.create === "function";

// Special-use flags: `specialUse` array (121+) or a single `type` (115).
export function specialUseOf(folder) {
  if (Array.isArray(folder.specialUse)) return folder.specialUse;
  return folder.type ? [folder.type] : [];
}
