/*
 * Moving and copying messages, and undoing moves and tag changes. Only used
 * once the user has turned on moving (optional message permissions, see
 * filingPermissions); without it ThunderJump never touches messages.
 *
 * Thunderbird gives a message a new id when it moves, so a move is logged
 * with each message's Message-ID header; undo finds the messages again in
 * the destination folder by that header and moves them back.
 */

import { folderIdOf, messageFolderArg, queryFolder, tabIdOf } from "./compat.js";
import { findMailTab } from "./tabs.js";
import { restoreTags } from "./tags.js";
import { learnSenders } from "./rules.js";

export const MOVE_PERMISSIONS = { permissions: ["messagesRead", "messagesMove"] };
const LOG_LIMIT = 100;
const RECENT_TARGETS = 12;

// Thunderbird 125+ guards tags behind two more permissions (91–115 don't know
// them). Worked out without awaiting, so requests stay in the user's click.
const major = Number(/Thunderbird\/(\d+)/.exec(navigator.userAgent)?.[1] ?? 0);
export const TAG_PERMISSIONS = { permissions: major >= 116 ? ["messagesRead", "messagesUpdate", "messagesTagsList"] : ["messagesRead"] };
const ALL = { permissions: [...new Set([...MOVE_PERMISSIONS.permissions, ...TAG_PERMISSIONS.permissions])] };

export function canMove() {
  return browser.permissions.contains(MOVE_PERMISSIONS);
}

export function canTag() {
  return browser.permissions.contains(TAG_PERMISSIONS);
}

// Moving, copying and tagging in one prompt. Must be called from a user
// action (click / key press in an add-on page), before any await.
export function enableMoving() {
  return browser.permissions.request(ALL);
}

export function disableMoving() {
  return browser.permissions.remove(ALL);
}

// Collect every page of a MessageList (Thunderbird returns 100 at a time).
export async function listAll(page, limit = Infinity) {
  const out = [...(page?.messages ?? [])];
  let id = page?.id;
  while (id && out.length < limit) {
    const next = await browser.messages.continueList(id);
    out.push(...next.messages);
    id = next.id;
  }
  if (id && browser.messages.abortList) browser.messages.abortList(id).catch(() => {});
  return out.slice(0, limit);
}

export function summarize(m) {
  return {
    id: m.id,
    headerMessageId: m.headerMessageId ?? "",
    subject: m.subject || "(no subject)",
    author: m.author ?? "",
    date: m.date ? new Date(m.date).getTime() : 0,
    folderId: m.folder ? folderIdOf(m.folder) : null,
    read: !!m.read,
    flagged: !!m.flagged,
    tags: m.tags ?? [],
  };
}

// Messages selected in the window's mail tab ([] if none).
export async function selectedMessages(windowId) {
  const tab = await findMailTab(windowId);
  if (!tab) return [];
  const page = await browser.mailTabs.getSelectedMessages(tabIdOf(tab));
  return (await listAll(page)).map(summarize);
}

// --- move log (the add-on's own storage) ---------------------------------

export async function getMoveLog() {
  return (await browser.storage.local.get("moveLog")).moveLog ?? [];
}

export const newEntryId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export async function saveMoveLog(log) {
  await browser.storage.local.set({ moveLog: log.slice(0, LOG_LIMIT) });
}

export async function getMoveTargets() {
  return (await browser.storage.local.get("moveTargets")).moveTargets ?? [];
}

export async function removeMoveTarget(folderId) {
  const list = (await getMoveTargets()).filter((id) => id !== folderId);
  await browser.storage.local.set({ moveTargets: list });
}

export async function clearMoveTargets() {
  await browser.storage.local.set({ moveTargets: [] });
}

async function pushMoveTarget(folderId) {
  const list = (await getMoveTargets()).filter((id) => id !== folderId);
  list.unshift(folderId);
  await browser.storage.local.set({ moveTargets: list.slice(0, RECENT_TARGETS) });
}

// Move `messages` (summaries) to `targetId`. Returns the log entry.
export async function moveMessages(messages, targetId, { labels = {} } = {}) {
  const moving = messages.filter((m) => m.folderId !== targetId);
  if (!moving.length) throw new Error("The messages are already in that folder");
  const groups = new Map();
  for (const m of moving) {
    if (!groups.has(m.folderId)) groups.set(m.folderId, []);
    groups.get(m.folderId).push(m);
  }
  await browser.messages.move(moving.map((m) => m.id), messageFolderArg(targetId));
  const entry = {
    id: newEntryId(),
    at: Date.now(),
    target: targetId,
    targetLabel: labels[targetId] ?? "",
    count: moving.length,
    undone: false,
    groups: [...groups].map(([from, items]) => ({
      from,
      fromLabel: labels[from] ?? "",
      items: items.map((m) => ({ headerMessageId: m.headerMessageId, subject: m.subject, author: m.author })),
    })),
  };
  await saveMoveLog([entry, ...(await getMoveLog())]);
  await pushMoveTarget(targetId);
  await learnSenders(moving, targetId);
  return entry;
}

// Copy `messages` to `targetId` (not logged: undoing a copy would mean
// deleting mail). Returns the number copied.
export async function copyMessages(messages, targetId) {
  if (!messages.length) throw new Error("No messages are selected");
  await browser.messages.copy(messages.map((m) => m.id), messageFolderArg(targetId));
  await pushMoveTarget(targetId);
  return messages.length;
}

async function findInFolder(folderId, headerMessageId) {
  if (!headerMessageId) return [];
  const page = await browser.messages.query({ ...queryFolder(folderId), headerMessageId });
  return (await listAll(page)).map((m) => m.id);
}

// Move the messages of a logged move back. Returns { restored, missing }.
export async function undoMove(entryId) {
  const log = await getMoveLog();
  const entry = log.find((e) => e.id === entryId);
  if (!entry) throw new Error("That move is no longer in the history");
  if (entry.undone) throw new Error("That move was already undone");
  if (entry.kind === "tag") return restoreTags(entry, log);
  let restored = 0;
  let missing = 0;
  const taken = new Set();
  for (const group of entry.groups) {
    const ids = [];
    for (const item of group.items) {
      // Duplicates share a Message-ID; take a different copy each time.
      const found = (await findInFolder(entry.target, item.headerMessageId)).filter((id) => !taken.has(id));
      if (found.length) {
        ids.push(found[0]);
        taken.add(found[0]);
      } else missing++;
    }
    if (ids.length) {
      await browser.messages.move(ids, messageFolderArg(group.from));
      restored += ids.length;
    }
  }
  entry.undone = true;
  entry.undoneAt = Date.now();
  await saveMoveLog(log);
  return { restored, missing, entry };
}

// The newest move that can still be undone, or null.
export async function lastUndoableMove() {
  return (await getMoveLog()).find((e) => !e.undone) ?? null;
}
