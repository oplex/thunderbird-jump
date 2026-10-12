// Differences between the Thunderbird versions this add-on supports.
//
//   Thunderbird 121+  folders have ids (MailFolder.id), accounts have rootFolder,
//                     folders.get / mailTabs.create exist.
//   Thunderbird 115   no folder ids: a folder is { accountId, path }; accounts
//                     list top-level `folders`; APIs take folder objects.
//   Manifest V3 (140 build)    MailTab.tabId, mailTabs.update({ displayedFolderId })
//   Manifest V2 (91–139 build) MailTab.id,    mailTabs.update({ displayedFolder })
//
// The rest of the add-on works with plain string ids; on 115 they are made up
// here as "<accountId>:<path>" (account root: "<accountId>:/").
// (Thunderbird 91–114 behave like 115 here; 78 is not supported.)

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
  if (isLegacyRoot(id)) return getAccount(legacyRef(id).accountId);
  return legacyRef(id);
}

// Properties for mailTabs.update / mailTabs.create that show `id`.
export function displayProps(id) {
  if (isMV3()) return { displayedFolderId: id };
  return { displayedFolder: hasFolderIds() ? id : legacyRef(id) };
}

let major = null;
// Thunderbird's major version number (e.g. 115).
export async function thunderbirdMajor() {
  if (major == null) major = parseInt((await browser.runtime.getBrowserInfo()).version, 10);
  return major;
}

// accounts.list with folders. Thunderbird 78 takes no argument (and always
// includes folders); 91+ take includeFolders / includeSubFolders.
export async function listAccounts() {
  try {
    return await browser.accounts.list(true);
  } catch {
    return browser.accounts.list();
  }
}

// folders.getSubFolders without/with descendants; 78 has no second argument.
export async function getSubFolders(arg, deep) {
  try {
    return await browser.folders.getSubFolders(arg, deep);
  } catch (e) {
    if (!/argument/i.test(e?.message ?? "")) throw e;
    return browser.folders.getSubFolders(arg);
  }
}

// accounts.get(id) without folders; 78 takes only the id.
export async function getAccount(id) {
  try {
    return await browser.accounts.get(id, false);
  } catch {
    return browser.accounts.get(id);
  }
}

// mailTabs.get is missing in 78; find the tab through query instead.
export async function getMailTab(tabId) {
  if (typeof browser.mailTabs.get === "function") return browser.mailTabs.get(tabId);
  return (await browser.mailTabs.query({})).find((t) => tabIdOf(t) === tabId) ?? null;
}

// Destination for messages.move/copy: MV3 takes a folder id (folderId),
// MV2 a MailFolder (91–120) or, from 121, also an id.
export function messageFolderArg(id) {
  return hasFolderIds() ? id : legacyRef(id);
}

// messages.query filter for one folder: `folderId` from Thunderbird 121
// (both manifest versions), a MailFolder object as `folder` before that.
export function queryFolder(id) {
  return hasFolderIds() ? { folderId: id } : { folder: legacyRef(id) };
}

// messages.query "unread only": MV3 `read: false`, MV2 `unread: true`.
export function queryUnread() {
  return isMV3() ? { read: false } : { unread: true };
}

// Thunderbird 115 has no mailTabs.create.
export const canCreateMailTab = () => typeof browser.mailTabs.create === "function";

// Special-use flags: `specialUse` array (121+) or a single `type` (115).
export function specialUseOf(folder) {
  if (Array.isArray(folder.specialUse)) return folder.specialUse;
  return folder.type ? [folder.type] : [];
}
