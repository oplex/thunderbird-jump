// Backup file format: build, validate, and re-map folder ids on import.
// Pure (no browser APIs) so it can be unit tested.

export const BACKUP_APP = "thunderbird-jump";
export const BACKUP_FORMAT = 1;
export const BACKUP_FILENAME = "thunderbird-jump-backup.json";

// { shortcuts, settings, recent, keys } -> JSON-ready object.
export function buildBackup({ shortcuts = {}, settings = {}, recent = [], keys = {} }, { version = "", now = new Date() } = {}) {
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    addonVersion: version,
    exported: now.toISOString(),
    shortcuts,
    settings,
    recent,
    keys,
  };
}

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// Parse and sanitise a backup file. Returns { ok: true, data } or { ok: false, error }.
export function parseBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file is not valid JSON." };
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP) return { ok: false, error: "This is not a Thunderbird Jump backup file." };
  if (typeof raw.format !== "number" || raw.format > BACKUP_FORMAT) {
    return { ok: false, error: "This backup was made by a newer version of Thunderbird Jump. Update the add-on first." };
  }

  const shortcuts = {};
  for (const [key, s] of Object.entries(isObject(raw.shortcuts) ? raw.shortcuts : {})) {
    if (!isObject(s) || typeof s.folderId !== "string" || !key.trim()) continue;
    shortcuts[key.trim().toLowerCase()] = {
      name: typeof s.name === "string" && s.name.trim() ? s.name.trim() : key.trim(),
      folderId: s.folderId,
      label: typeof s.label === "string" ? s.label : "",
    };
  }
  const settings = {};
  for (const [k, v] of Object.entries(isObject(raw.settings) ? raw.settings : {})) {
    if (typeof v === "boolean" || typeof v === "number") settings[k] = v;
  }
  const recent = Array.isArray(raw.recent) ? raw.recent.filter((id) => typeof id === "string") : [];
  const keys = {};
  for (const [k, v] of Object.entries(isObject(raw.keys) ? raw.keys : {})) {
    if (typeof v === "string") keys[k] = v;
  }
  return { ok: true, data: { shortcuts, settings, recent, keys, exported: raw.exported ?? null } };
}

// Folder ids differ between profiles/computers. Keep shortcuts whose folder
// still exists; otherwise find the folder by its path label ("A › B › C").
// `folders` are palette entries ({ id, segments }).
// Returns { shortcuts, remapped: [names], missing: [names] }.
export function remapShortcuts(shortcuts, folders) {
  const ids = new Set(folders.map((f) => f.id));
  const byLabel = new Map(folders.map((f) => [f.segments.join(" › "), f.id]));
  const out = {};
  const remapped = [];
  const missing = [];
  for (const [key, s] of Object.entries(shortcuts)) {
    if (ids.has(s.folderId)) {
      out[key] = s;
    } else if (byLabel.has(s.label)) {
      out[key] = { ...s, folderId: byLabel.get(s.label) };
      remapped.push(s.name);
    } else {
      out[key] = s; // keep it; the palette shows it as a missing folder
      missing.push(s.name);
    }
  }
  return { shortcuts: out, remapped, missing };
}
