// Manager search: filters -> query objects, facet counts, and chip filtering.
// Pure (no browser APIs) so it can be unit tested.
//
// filters = { text, matchIn, unread, flagged, attachment, date, accountIds }
//   matchIn: "subjectFrom" (default) | "subject" | "from" | "everything"
//   date:    "any" | "today" | "7d" | "30d" | "year" | "older"

const DAY = 24 * 60 * 60 * 1000;

export function dateRange(preset, now = new Date()) {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { fromDate: startOfDay };
    case "7d":
      return { fromDate: new Date(startOfDay.getTime() - 6 * DAY) };
    case "30d":
      return { fromDate: new Date(startOfDay.getTime() - 29 * DAY) };
    case "year":
      return { fromDate: new Date(now.getFullYear(), 0, 1) };
    case "older":
      return { toDate: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()) };
    default:
      return {};
  }
}

// Generic query objects (before version-specific renaming in search.js).
// "Subject or sender" needs two queries whose results are merged.
export function buildQueries(filters, now = new Date()) {
  const base = { ...dateRange(filters.date, now) };
  if (filters.unread) base.unread = true;
  if (filters.flagged) base.flagged = true;
  if (filters.attachment) base.attachment = true;
  const text = (filters.text ?? "").trim();
  if (!text) return [base];
  switch (filters.matchIn) {
    case "subject":
      return [{ ...base, subject: text }];
    case "from":
      return [{ ...base, author: text }];
    case "everything":
      return [{ ...base, fullText: text }];
    default:
      return [
        { ...base, subject: text },
        { ...base, author: text },
      ];
  }
}

// "Ann Smith <ann@example.com>" -> "Ann Smith"; bare address stays.
export function senderName(author) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(author ?? "");
  if (m) return m[1].trim() || m[2];
  return (author ?? "").trim() || "(unknown)";
}

const yearOf = (m) => (m.date ? String(new Date(m.date).getFullYear()) : "?");

function top(counter, limit) {
  return [...counter.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, limit);
}

// Facet counts over a result list: [{ key, label, count }] per facet.
export function computeFacets(messages, byId, limit = 12) {
  const folder = new Map();
  const sender = new Map();
  const year = new Map();
  for (const m of messages) {
    folder.set(m.folderId, (folder.get(m.folderId) ?? 0) + 1);
    const s = senderName(m.author);
    sender.set(s, (sender.get(s) ?? 0) + 1);
    const y = yearOf(m);
    year.set(y, (year.get(y) ?? 0) + 1);
  }
  // Facet label without the account name (full path in `title`).
  const segs = (id) => byId.get(id)?.segments ?? [id];
  const folderLabel = (id) => (segs(id).length > 1 ? segs(id).slice(1) : segs(id)).join(" › ");
  return {
    folder: top(folder, limit).map(([key, count]) => ({ key, label: folderLabel(key), title: segs(key).join(" › "), count })),
    sender: top(sender, limit).map(([key, count]) => ({ key, label: key, count })),
    year: [...year.entries()].sort((a, b) => String(b[0]).localeCompare(String(a[0]))).map(([key, count]) => ({ key, label: key, count })),
  };
}

// Chips narrow the results client-side: [{ facet: "folder"|"sender"|"year", key }].
// Chips of the same facet are OR-ed, different facets AND-ed.
export function applyChips(messages, chips) {
  if (!chips.length) return messages;
  const by = { folder: new Set(), sender: new Set(), year: new Set() };
  for (const c of chips) by[c.facet]?.add(c.key);
  return messages.filter(
    (m) =>
      (!by.folder.size || by.folder.has(m.folderId)) &&
      (!by.sender.size || by.sender.has(senderName(m.author))) &&
      (!by.year.size || by.year.has(yearOf(m))),
  );
}

// Merge result lists (several queries), drop duplicates, newest first.
export function mergeResults(lists) {
  const seen = new Map();
  for (const list of lists) for (const m of list) if (!seen.has(m.id)) seen.set(m.id, m);
  return [...seen.values()].sort((a, b) => b.date - a.date);
}
