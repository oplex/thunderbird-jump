/*
 * Where filed messages usually go, kept in the add-on's own storage:
 *   rules    the user's "sender or subject contains X → folder" rules
 *   learned  sender address → { folderId: number of messages moved there }
 * lib/suggest.js turns both into suggested folders.
 */

import { senderEmail } from "../lib/suggest.js";
import { getSettings } from "./store.js";

const LEARN_LIMIT = 500; // senders remembered

const get = async (key, fallback) => (await browser.storage.local.get(key))[key] ?? fallback;

export const getRules = () => get("rules", []);

export async function addRule(text, folderId, label) {
  const clean = String(text).trim();
  if (!clean) throw new Error("Type what the sender or subject should contain");
  const rules = (await getRules()).filter((r) => r.text.toLowerCase() !== clean.toLowerCase());
  rules.push({ id: `r${Date.now().toString(36)}`, text: clean, folderId, label });
  await browser.storage.local.set({ rules });
}

export async function deleteRule(id) {
  await browser.storage.local.set({ rules: (await getRules()).filter((r) => r.id !== id) });
}

export const getLearned = () => get("learned", {});

// Remember that mail from these senders went to `folderId` (only while
// suggestions are turned on).
export async function learnSenders(messages, folderId) {
  if (!(await getSettings()).suggestEnabled) return;
  const learned = await getLearned();
  const now = Date.now();
  for (const m of messages) {
    const email = senderEmail(m.author);
    if (!email) continue;
    const entry = (learned[email] ??= { f: {}, at: now });
    entry.f[folderId] = (entry.f[folderId] ?? 0) + 1;
    entry.at = now;
  }
  const keys = Object.keys(learned);
  if (keys.length > LEARN_LIMIT) {
    keys.sort((a, b) => learned[a].at - learned[b].at);
    for (const k of keys.slice(0, keys.length - LEARN_LIMIT)) delete learned[k];
  }
  await browser.storage.local.set({ learned });
}

export const forgetLearned = () => browser.storage.local.set({ learned: {} });
