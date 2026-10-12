/*
 * Suggested folders for messages being filed (pure, unit tested):
 * matching rules first, then folders their senders' mail went to before.
 */

import { fold } from "./fuzzy.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// "Ann Lee <Ann@Example.com>" → "ann@example.com".
export function senderEmail(author) {
  const s = String(author ?? "");
  const m = /<([^>]+)>/.exec(s) ?? /([^\s<>"]+@[^\s<>"]+)/.exec(s);
  return m ? m[1].trim().toLowerCase() : "";
}

export function ruleMatches(rule, message) {
  const needle = fold(rule.text);
  return !!needle && (fold(message.author ?? "").includes(needle) || fold(message.subject ?? "").includes(needle));
}

// [{ folderId, reason }] best first. `exists(id)` filters out deleted folders.
export function suggestFolders(messages, rules, learned, { limit = 3, exists = () => true } = {}) {
  const score = new Map();
  const add = (folderId, points, reason) => {
    if (!exists(folderId)) return;
    const cur = score.get(folderId) ?? { folderId, points: 0, reason };
    cur.points += points;
    score.set(folderId, cur);
  };
  for (const rule of rules) {
    const n = messages.filter((m) => ruleMatches(rule, m)).length;
    if (n) add(rule.folderId, 1000 + n, `rule: contains “${rule.text}”`);
  }
  const bySender = new Map();
  for (const m of messages) {
    const email = senderEmail(m.author);
    if (email) bySender.set(email, (bySender.get(email) ?? 0) + 1);
  }
  for (const [email, n] of bySender) {
    for (const [folderId, count] of Object.entries(learned[email]?.f ?? {})) {
      add(folderId, count * n, `${plural(count, "message")} from ${email} went here`);
    }
  }
  return [...score.values()].sort((a, b) => b.points - a.points).slice(0, limit).map(({ folderId, reason }) => ({ folderId, reason }));
}
