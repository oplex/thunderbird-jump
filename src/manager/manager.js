// ThunderJump Manager: faceted search over folders and messages, with bulk
// move (+ undo). Searching only reads; moving needs moving to be turned on.

import { loadFolders } from "../tb/folders.js";
import { jumpToFolder, resolveMailWindowId } from "../tb/tabs.js";
import { rankFolders } from "../lib/fuzzy.js";
import { computeFacets, applyChips } from "../lib/facets.js";
import { searchMessages, hasCriteria, openMessage } from "./search.js";
import { renderResults, renderFacet, renderChips, renderAccounts, renderFolders } from "./render.js";
import { createMover } from "./moving.js";
import { makeDraggable, makeDropTarget } from "./dnd.js";

const READ = { permissions: ["messagesRead"] };
const LIMIT = 500;
const $ = (id) => document.getElementById(id);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const state = {
  tab: "messages",
  folders: [],
  byId: new Map(),
  filters: { text: "", matchIn: "subjectFrom", date: "any", unread: false, flagged: false, attachment: false, accountIds: [], folderIds: [] },
  results: [],
  shown: [],
  truncated: false,
  chips: [], // { facet: folder|sender|year|scope, key, label }
  selected: new Set(),
  anchor: null,
  seq: 0,
  windowId: null,
};

let timer = null;
const schedule = (ms = 250) => {
  clearTimeout(timer);
  timer = setTimeout(runSearch, ms);
};

async function runSearch() {
  if (state.tab === "folders") return renderFolderTab();
  const allowed = await browser.permissions.contains(READ);
  $("permission").hidden = allowed;
  if (!allowed) return;
  state.filters.folderIds = state.chips.filter((c) => c.facet === "scope").map((c) => c.key);
  if (!hasCriteria(state.filters)) {
    Object.assign(state, { results: [], truncated: false });
    $("summary").textContent = "Type to search, or pick a filter.";
    return renderMessages();
  }
  const seq = ++state.seq;
  $("summary").textContent = "Searching…";
  try {
    const res = await searchMessages(state.filters, { byId: state.byId, limit: LIMIT, isStale: () => seq !== state.seq });
    if (res.stale || seq !== state.seq) return;
    state.results = res.messages;
    state.truncated = res.truncated;
    const present = new Set(res.messages.map((m) => m.id));
    state.selected = new Set([...state.selected].filter((id) => present.has(id)));
  } catch (e) {
    if (seq === state.seq) $("summary").textContent = `Search failed: ${e?.message ?? e}`;
    return;
  }
  renderMessages();
}

function renderMessages() {
  const facetChips = state.chips.filter((c) => c.facet !== "scope");
  state.shown = applyChips(state.results, facetChips);
  const facets = computeFacets(state.shown, state.byId);
  const active = (facet) => new Set(facetChips.filter((c) => c.facet === facet).map((c) => c.key));
  $("facetBox").hidden = !state.results.length;
  renderFacet($("facetFolder"), facets.folder, active("folder"), (key, label) => toggleChip("folder", key, label), { dropTargets: true });
  renderFacet($("facetSender"), facets.sender, active("sender"), (key, label) => toggleChip("sender", key, label));
  renderFacet($("facetYear"), facets.year, active("year"), (key, label) => toggleChip("year", key, label));
  renderChips($("chips"), state.chips, removeChip);
  if (state.results.length || hasCriteria(state.filters)) {
    $("summary").textContent = `${plural(state.shown.length, "message")}${state.truncated ? ` (first ${LIMIT}; narrow the search to see more)` : ""}`;
  }
  renderResults($("rows"), state.shown, state.selected, state.byId, { onToggle: toggleRow, onOpen: (m) => openMessage(m, jump) });
  updateBar();
}

function updateBar() {
  const n = state.selected.size;
  $("selCount").textContent = n ? `${n} selected` : "";
  $("moveTo").disabled = !n;
  $("showInFolder").disabled = n !== 1;
  $("checkAll").checked = n > 0 && n === state.shown.length;
}

function toggleChip(facet, key, label) {
  const i = state.chips.findIndex((c) => c.facet === facet && c.key === key);
  if (i === -1) state.chips.push({ facet, key, label });
  else state.chips.splice(i, 1);
  renderMessages();
}

function removeChip(i) {
  const [chip] = state.chips.splice(i, 1);
  if (chip.facet === "scope") schedule(0);
  else renderMessages();
}

function toggleRow(id, shift) {
  const ids = state.shown.map((m) => m.id);
  if (shift && state.anchor != null && ids.includes(state.anchor)) {
    const [a, b] = [ids.indexOf(state.anchor), ids.indexOf(id)].sort((x, y) => x - y);
    for (const x of ids.slice(a, b + 1)) state.selected.add(x);
  } else if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  state.anchor = id;
  renderMessages();
}

const jump = (folderId) => jumpToFolder(folderId, state.windowId);
const mover = createMover({ state, toast: (...a) => toast(...a), refresh: () => schedule(0), render: () => renderMessages() });

function toast(text, undo) {
  $("toastText").textContent = text;
  $("toast").hidden = false;
  $("toastUndo").hidden = !undo;
  $("toastUndo").onclick = async () => {
    $("toast").hidden = true;
    const { restored, missing } = await undo();
    toast(`Moved ${plural(restored, "message")} back${missing ? ` · ${missing} not found` : ""}`);
    schedule(0);
  };
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ($("toast").hidden = true), 12000);
}

function renderFolderTab() {
  const ranked = rankFolders(state.folders, state.filters.text, { limit: 200 });
  renderFolders($("foldersView"), ranked, {
    onOpen: (entry) => jump(entry.id),
    onSearchIn: (entry) => {
      state.chips = state.chips.filter((c) => c.facet !== "scope");
      state.chips.push({ facet: "scope", key: entry.id, label: entry.segments.join(" › ") });
      setTab("messages");
    },
  });
  $("summary").textContent = `${plural(ranked.length, "folder")}`;
}

function setTab(tab) {
  state.tab = tab;
  $("tabMessages").setAttribute("aria-selected", String(tab === "messages"));
  $("tabFolders").setAttribute("aria-selected", String(tab === "folders"));
  $("messagesView").hidden = tab !== "messages";
  $("foldersView").hidden = tab !== "folders";
  for (const id of ["moveTo", "showInFolder", "selectAll", "selCount"]) $(id).hidden = tab !== "messages";
  schedule(0);
}

function wire() {
  $("q").addEventListener("input", () => {
    state.filters.text = $("q").value;
    schedule();
  });
  $("matchIn").addEventListener("change", () => ((state.filters.matchIn = $("matchIn").value), schedule(0)));
  for (const id of ["unread", "flagged", "attachment"]) $(id).addEventListener("change", () => ((state.filters[id] = $(id).checked), schedule(0)));
  $("date").addEventListener("click", (ev) => {
    const v = ev.target.dataset?.v;
    if (!v) return;
    for (const b of $("date").children) b.classList.toggle("on", b === ev.target);
    state.filters.date = v;
    schedule(0);
  });
  $("tabMessages").addEventListener("click", () => setTab("messages"));
  $("tabFolders").addEventListener("click", () => setTab("folders"));
  $("allowRead").addEventListener("click", async () => {
    if (await browser.permissions.request(READ).catch(() => false)) schedule(0);
  });
  const selectAll = () => {
    const all = state.selected.size !== state.shown.length;
    state.selected = new Set(all ? state.shown.map((m) => m.id) : []);
    renderMessages();
  };
  $("selectAll").addEventListener("click", selectAll);
  $("checkAll").addEventListener("click", (ev) => (ev.preventDefault(), selectAll()));
  $("moveTo").addEventListener("click", mover.moveSelected);
  makeDraggable($("rows"), mover.idsForDrag);
  makeDropTarget($("filters"), mover.dropped);
  $("showInFolder").addEventListener("click", () => {
    const m = state.shown.find((x) => state.selected.has(x.id));
    if (m) jump(m.folderId);
  });
  document.addEventListener("keydown", (ev) => {
    if (!$("picker").hidden) return;
    const typing = ev.target.matches?.("input[type=search], input[type=text], select");
    if (ev.key === "/" && !typing) {
      ev.preventDefault();
      $("q").focus();
    } else if ((ev.key === "m" || ev.key === "M") && !typing && state.selected.size) {
      ev.preventDefault();
      mover.moveSelected();
    } else if (ev.key === "Escape" && state.selected.size) {
      state.selected.clear();
      renderMessages();
    }
  });
}

async function init() {
  state.windowId = await resolveMailWindowId();
  state.folders = await loadFolders();
  state.byId = new Map(state.folders.map((f) => [f.id, f]));
  const accounts = state.folders.filter((f) => f.isRoot);
  const checked = new Set();
  renderAccounts($("accounts"), accounts, checked, (id, on) => {
    if (on) checked.add(id);
    else checked.delete(id);
    state.filters.accountIds = [...checked];
    schedule(0);
  });
  wire();
  mover.renderTargets();
  const params = new URLSearchParams(location.search);
  const q = params.get("q");
  if (q) $("q").value = state.filters.text = q;
  // ?folder=<id> (folder pane → ThunderJump → Search messages here).
  const scope = state.byId.get(params.get("folder"));
  if (scope) state.chips.push({ facet: "scope", key: scope.id, label: scope.segments.join(" › ") });
  $("q").focus();
  schedule(0);
}

init().catch((e) => ($("summary").textContent = `Could not start: ${e?.message ?? e}`));
