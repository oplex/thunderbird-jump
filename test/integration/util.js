// Shared helpers for the in-Thunderbird self-test.

import { REPORT_URL } from "./config.js";
import { loadFolders } from "../../src/tb/folders.js";

export const results = [];

export const post = (msg) => fetch(REPORT_URL, { method: "POST", body: JSON.stringify(msg) }).catch(() => {});
export const log = (text) => post({ type: "log", text });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, what, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(200);
  }
}

export async function check(name, fn) {
  log(`- ${name}`);
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    log(`  failed: ${e}`);
    results.push({ name, ok: false, error: String(e?.stack ?? e) });
  }
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export const byPath = async (path) => (await loadFolders()).find((f) => f.segments.join("/") === path);

// Open the palette as a spotlight window and return its live document.
export async function openPalette(windowId) {
  const url = browser.runtime.getURL(`src/palette/palette.html?mode=window&win=${windowId}`);
  const win = await browser.windows.create({ type: "popup", url, width: 640, height: 460 });
  const view = await waitFor(
    () => browser.extension.getViews({ windowId: win.id }).find((v) => v.location.pathname.endsWith("palette.html")),
    "palette view",
  );
  await waitFor(() => view.document.querySelector("#list li"), "palette rows");
  return { win, view, doc: view.document };
}

export function rowTexts(p) {
  return [...p.doc.querySelectorAll("#list li")].map((li) => li.textContent);
}

export async function type(p, text) {
  const input = p.doc.getElementById("input");
  input.value = text;
  input.dispatchEvent(new p.view.Event("input"));
  return rowTexts(p);
}

export function press(p, key, opts = {}) {
  const input = p.doc.getElementById("input");
  input.dispatchEvent(new p.view.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
}

export async function isOpen(p) {
  return (await browser.windows.getAll()).some((w) => w.id === p.win.id);
}

export async function closed(p) {
  await waitFor(async () => !(await isOpen(p)), "palette to close");
}

export async function statusText(p, includes) {
  await waitFor(() => p.doc.getElementById("status").textContent.includes(includes), `status “${includes}”`);
}
