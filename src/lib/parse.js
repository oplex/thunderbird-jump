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
 *   :undo, :u          undo the last move
 *   ? or :help         help
 */

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
  if (/^:(move|m)$/i.test(t)) return { kind: "move-mode" };
  if (/^:(undo|u)$/i.test(t)) return { kind: "undo" };
  if (/^:(manage|manager|search|find)$/i.test(t)) return { kind: "manager" };

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
