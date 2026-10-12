/*
 * Tags: list Thunderbird's tags and put one on (or take it off) messages.
 * Each change is logged with every message's previous tags, so undo (Ctrl+Z,
 * the move history) restores them exactly.
 */

import { getMoveLog, saveMoveLog, newEntryId } from "./messages.js";

// [{ key, name, color }] — messages.tags.list from Thunderbird 121, listTags before.
export async function listTags() {
  const list = browser.messages.tags?.list ? await browser.messages.tags.list() : await browser.messages.listTags();
  return list.map((t) => ({ key: t.key, name: t.tag, color: t.color }));
}

// Like Thunderbird's own tag keys: adds the tag, or takes it off when every
// message already has it. Returns the log entry.
export async function tagMessages(messages, tag) {
  if (!messages.length) throw new Error("No messages are selected");
  const remove = messages.every((m) => (m.tags ?? []).includes(tag.key));
  const items = [];
  for (const m of messages) {
    const before = m.tags ?? [];
    const has = before.includes(tag.key);
    if (has !== remove) continue;
    const after = remove ? before.filter((k) => k !== tag.key) : [...before, tag.key];
    await browser.messages.update(m.id, { tags: after });
    items.push({ id: m.id, before, subject: m.subject });
  }
  const entry = { id: newEntryId(), kind: "tag", at: Date.now(), targetLabel: tag.name, remove, count: items.length, undone: false, items };
  await saveMoveLog([entry, ...(await getMoveLog())]);
  return entry;
}

// Undo for a logged tag change (called by undoMove).
export async function restoreTags(entry, log) {
  let restored = 0;
  let missing = 0;
  for (const item of entry.items) {
    try {
      await browser.messages.update(item.id, { tags: item.before });
      restored++;
    } catch {
      missing++; // deleted (or moved and given a new id) since
    }
  }
  entry.undone = true;
  entry.undoneAt = Date.now();
  await saveMoveLog(log);
  return { restored, missing, entry };
}
