// Fuzzy matching used by the jump palette.
// Pure functions only (no Thunderbird APIs) so they can be unit tested in Node.

const SEPARATORS = new Set([" ", "/", ".", "_", "-", "(", ")", "[", "]"]);

// Fold a single character: lower-case and strip diacritics while keeping a
// strict 1:1 character mapping so match positions stay valid for highlighting.
function foldChar(c) {
  const base = c.normalize("NFD")[0] || c;
  return base.toLowerCase();
}

export function fold(text) {
  let out = "";
  for (const c of text) out += foldChar(c);
  return out;
}

function isWordStart(text, i) {
  if (i === 0) return true;
  const prev = text[i - 1];
  if (SEPARATORS.has(prev)) return true;
  // camelCase boundary: "fooBar" -> "B" starts a word.
  const cur = text[i];
  return prev === prev.toLowerCase() && cur !== cur.toLowerCase();
}

function range(start, length) {
  return Array.from({ length }, (_, k) => start + k);
}

// Best contiguous (substring) match of `q` in `text`, or null.
function substringMatch(q, folded, text) {
  let best = null;
  let idx = folded.indexOf(q);
  while (idx !== -1) {
    let score = 100 + q.length * 12;
    if (idx === 0) score += 60;
    else if (isWordStart(text, idx)) score += 35;
    score -= idx * 0.2;
    if (!best || score > best.score) best = { score, positions: range(idx, q.length) };
    idx = folded.indexOf(q, idx + 1);
  }
  return best;
}

// Subsequence match: every query char must appear in order.
function subsequenceMatch(q, folded, text) {
  const positions = [];
  let score = 0;
  let from = 0;
  for (const ch of q) {
    let idx = folded.indexOf(ch, from);
    if (idx === -1) return null;
    // Prefer a word-start occurrence a little further ahead, if any.
    let ws = idx;
    while (ws !== -1 && !isWordStart(text, ws)) ws = folded.indexOf(ch, ws + 1);
    if (ws !== -1 && ws - idx < 12 && positions.at(-1) !== idx - 1) idx = ws;
    const prev = positions.at(-1);
    score += 8;
    if (prev !== undefined && idx === prev + 1) score += 14;
    if (isWordStart(text, idx)) score += 18;
    if (prev !== undefined) score -= Math.min(idx - prev - 1, 20) * 0.6;
    positions.push(idx);
    from = idx + 1;
  }
  return { score, positions };
}

// Match one query term against `text`. Returns {score, positions} or null.
export function matchTerm(term, text) {
  const q = fold(term);
  if (!q) return { score: 0, positions: [] };
  const folded = fold(text);
  return substringMatch(q, folded, text) || subsequenceMatch(q, folded, text);
}

export function splitTerms(query) {
  return query.trim().split(/\s+/).filter(Boolean);
}

// Score a folder entry ({name, segments}) against a query.
// The folder's own name is preferred over matches elsewhere in its path.
// Returns {score, namePositions, pathPositions} or null when any term misses.
export function scoreFolder(entry, query) {
  const terms = splitTerms(query);
  const path = entry.segments.join("/");
  const nameOffset = path.length - entry.name.length;
  let score = 0;
  const pathPositions = new Set();
  for (const term of terms) {
    const inName = matchTerm(term, entry.name);
    const inPath = matchTerm(term, path);
    if (!inName && !inPath) return null;
    if (inName && (!inPath || inName.score * 1.5 >= inPath.score)) {
      score += inName.score * 1.5 + 20;
      for (const p of inName.positions) pathPositions.add(p + nameOffset);
    } else {
      score += inPath.score;
      for (const p of inPath.positions) pathPositions.add(p);
    }
  }
  if (terms.length && fold(entry.name) === fold(terms.join(" "))) score += 80;
  score -= entry.segments.length * 2;
  return { score, positions: [...pathPositions].sort((a, b) => a - b) };
}

// Rank entries for a query. `boost(entry)` adds extra score (e.g. recency).
export function rankFolders(entries, query, { limit = 60, boost } = {}) {
  const out = [];
  for (const entry of entries) {
    const m = scoreFolder(entry, query);
    if (!m) continue;
    out.push({ entry, score: m.score + (boost ? boost(entry) : 0), positions: m.positions });
  }
  out.sort((a, b) => b.score - a.score || a.entry.segments.join("/").localeCompare(b.entry.segments.join("/")));
  return out.slice(0, limit);
}
