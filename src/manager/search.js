// Runs Manager message searches against Thunderbird (version differences
// handled here and in compat.js).

import { buildQueries, mergeResults } from "../lib/facets.js";
import { listAll, summarize } from "../tb/messages.js";
import { queryFolder } from "../tb/compat.js";

const isMV3 = () => browser.runtime.getManifest().manifest_version >= 3;

// Generic filter names -> what this Thunderbird expects.
function adapt(q) {
  const out = { ...q };
  if (out.unread) {
    delete out.unread;
    Object.assign(out, isMV3() ? { read: false } : { unread: true });
  }
  return out;
}

export function hasCriteria(filters) {
  return !!((filters.text ?? "").trim() || filters.unread || filters.flagged || filters.attachment || (filters.date && filters.date !== "any") || filters.folderIds?.length);
}

// Returns { messages, truncated }. `isStale()` lets a newer search cancel this one.
export async function searchMessages(filters, { byId, limit = 500, isStale = () => false }) {
  const scopes = filters.folderIds?.length ? filters.folderIds : [null];
  const lists = [];
  let truncated = false;
  for (const q of buildQueries(filters)) {
    for (const folderId of scopes) {
      if (isStale()) return { messages: [], truncated: false, stale: true };
      const query = adapt(q);
      if (folderId) Object.assign(query, queryFolder(folderId));
      const list = await listAll(await browser.messages.query(query), limit);
      if (list.length >= limit) truncated = true;
      lists.push(list.map(summarize));
    }
  }
  let messages = mergeResults(lists);
  if (filters.accountIds?.length) {
    const allowed = new Set(filters.accountIds);
    messages = messages.filter((m) => allowed.has(byId.get(m.folderId)?.accountId));
  }
  if (messages.length > limit) truncated = true;
  return { messages: messages.slice(0, limit), truncated };
}

// Open a message in a tab (115+), or show its folder on older versions.
export async function openMessage(message, jump) {
  if (browser.messageDisplay?.open) {
    try {
      return await browser.messageDisplay.open({ messageId: message.id, location: "tab" });
    } catch {
      // Fall back to showing the folder.
    }
  }
  return jump(message.folderId);
}
