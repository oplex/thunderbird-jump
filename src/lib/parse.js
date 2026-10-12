/*
 * Parser for the palette's input line.
 *
 *   (empty)            home: shortcuts + recent folders
 *   text               fuzzy folder search
 *   j1, j2 ...         jump to numbered shortcut
 *   :j name            jump to shortcut "name" (":j" alone lists all)
 *   :jl                list shortcuts
 *   :jj1, :jj name     set shortcut to the current folder
 *   :jj name = query   set shortcut to a searched folder
 *   :jd name           delete shortcut
 *   :new A/B           create folder path A/B inside the current folder
 *   query > A/B        search a parent folder, create A/B inside it
 *   :keys, :backup     open the options page (keys, backup, settings)
 *   :move, :m          move the selected messages (when moving is turned on)
 *   move name, :m name move the selected messages, searching "name" as target
 *   copy name, :c name copy them instead;  tag name, :t name  tag them
 *   :rule text = query suggest a folder for mail whose sender/subject has text
 *   :undo, :u          undo the last move
 *   :s text            search mail in the current folder (Manager)
 *   :sa text           search mail in all folders (Manager)
 *   ? or :help         help
 */

// "move inv", "mv inv", ":m inv" → move, searching "inv"; the same with
// copy (cp, :c) and tag (:t). Single letters only with the colon.
export const FILE_PREFIX = /^(?::(m|move|c|copy|t|tag)|(move|mv|copy|cp|tag))\s+(?=\S)/i;
const FILE_OPS = { m: "move", move: "move", mv: "move", c: "copy", copy: "copy", cp: "copy", t: "tag", tag: "tag" };

// { op, query } for "move inv" etc., or null.
export function fileCommand(text) {
  const t = String(text).trimStart();
  const m = FILE_PREFIX.exec(t);
  return m ? { op: FILE_OPS[(m[1] ?? m[2]).toLowerCase()], query: t.slice(m[0].length) } : null;
}

export function shortcutKey(name) {
  return String(name).trim().toLowerCase();
}

// Split "A/B/C" into clean segments; empty segments are dropped.
export function splitFolderPath(path) {
  return String(path)
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseInput(raw) {
  const text = String(raw ?? "");
  const t = text.trim();
  if (!t) return { kind: "home" };
  if (t === "?" || /^:h(elp)?$/i.test(t)) return { kind: "help" };
  if (/^:(keys|options|settings|backup|export|import)$/i.test(t)) return { kind: "options" };
  const alone = /^:(move|m|copy|c|tag|t)$/i.exec(t);
  if (alone) return { kind: "move-mode", op: FILE_OPS[alone[1].toLowerCase()] };
  const file = fileCommand(t);
  if (file) return { kind: "move-mode", ...file };
  const rule = /^:rule(?:\s+(.*))?$/i.exec(t);
  if (rule) {
    const [text, query = null] = (rule[1] ?? "").split("=").map((x) => x.trim());
    return { kind: "rule", text, query };
  }
  if (/^:(undo|u)$/i.test(t)) return { kind: "undo" };
  if (/^:(manage|manager|search|find)$/i.test(t)) return { kind: "manager" };

  const sm = /^:(sa?)(?:\s+(.*))?$/i.exec(t);
  if (sm) return { kind: "search-mail", query: (sm[2] ?? "").trim(), all: sm[1].toLowerCase() === "sa" };

  let m = /^j(\d+)$/i.exec(t);
  if (m) return { kind: "jump-shortcut", name: m[1] };

  if (t.startsWith(":")) return parseCommand(t.slice(1));

  const gt = t.indexOf(">");
  if (gt !== -1) {
    return {
      kind: "create-in",
      query: t.slice(0, gt).trim(),
      segments: splitFolderPath(t.slice(gt + 1)),
    };
  }
  return { kind: "search", query: t };
}

function parseCommand(cmd) {
  let m = /^jj(.*)$/i.exec(cmd);
  if (m) {
    const rest = m[1];
    const eq = rest.indexOf("=");
    if (eq !== -1) {
      return {
        kind: "set-shortcut",
        name: rest.slice(0, eq).trim(),
        query: rest.slice(eq + 1).trim(),
      };
    }
    return { kind: "set-shortcut", name: rest.trim(), query: null };
  }

  if (/^jl$/i.test(cmd)) return { kind: "jump-shortcut", name: "" };

  m = /^jd(?:\s+(.*))?$/i.exec(cmd);
  if (m) return { kind: "delete-shortcut", name: (m[1] ?? "").trim() };

  m = /^j(.*)$/i.exec(cmd);
  if (m) return { kind: "jump-shortcut", name: m[1].trim() };

  m = /^(?:new|mk|n)(?:\s+(.*))?$/i.exec(cmd);
  if (m) return { kind: "create", segments: splitFolderPath(m[1] ?? "") };

  return { kind: "unknown", command: cmd };
}

// Shortcuts matching a (partial) name: exact, then prefix, then substring.
// `shortcuts` is the stored object { key: {name, folderId, label} }.
export function matchShortcuts(shortcuts, name) {
  const all = Object.entries(shortcuts).map(([key, s]) => ({ key, ...s }));
  const q = shortcutKey(name);
  const rank = (s) => {
    if (!q) return 2;
    if (s.key === q) return 0;
    if (s.key.startsWith(q)) return 1;
    if (s.key.includes(q)) return 2;
    return -1;
  };
  return all
    .map((s) => ({ s, r: rank(s) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || compareShortcutKeys(a.s.key, b.s.key))
    .map((x) => x.s);
}

// Numeric keys sort numerically ("2" before "10"), then names alphabetically.
export function compareShortcutKeys(a, b) {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (na !== nb) return na ? -1 : 1;
  return a.localeCompare(b);
}
