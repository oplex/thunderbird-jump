/*
 * Date patterns in new folder names, written in braces:
 *   {YYYY} 2026   {YY} 26   {MM} 03   {M} 3   {MMM} Mar   {DD} 07   {D} 7
 *   {HH} 14   {mm} 05   {ss} 09   {Q} 1 (quarter)   {WW} 10 (ISO week)
 * Tokens combine: {YYYYMMDD}, {YYYY-MM}, {YYYYMMDDHHMM} (MM after HH is
 * minutes there). Text outside braces is never changed. {{ gives a "{".
 */

const pad = (n, w = 2) => String(n).padStart(w, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TOKEN = /YYYY|YY|MMM|MM|M|DD|D|HH|mm|ss|WW|Q/g;

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - start) / 86400000 + 1) / 7);
}

function expandPattern(pattern, d) {
  let prev = "";
  return pattern.replace(TOKEN, (tok) => {
    const minutes = tok === "MM" && prev === "HH";
    prev = tok;
    switch (tok) {
      case "YYYY": return String(d.getFullYear());
      case "YY": return pad(d.getFullYear() % 100);
      case "MMM": return MONTHS[d.getMonth()];
      case "MM": return pad(minutes ? d.getMinutes() : d.getMonth() + 1);
      case "M": return String(d.getMonth() + 1);
      case "DD": return pad(d.getDate());
      case "D": return String(d.getDate());
      case "HH": return pad(d.getHours());
      case "mm": return pad(d.getMinutes());
      case "ss": return pad(d.getSeconds());
      case "WW": return pad(isoWeek(d));
      default: return String(Math.floor(d.getMonth() / 3) + 1); // Q
    }
  });
}

export function expandTemplate(text, date = new Date()) {
  return String(text)
    .replace(/\{\{/g, "\u0000")
    .replace(/\{([^{}]+)\}/g, (_, p) => expandPattern(p, date))
    .replace(/\u0000/g, "{");
}

export const hasTemplate = (text) => /\{[^{}]+\}/.test(String(text).replace(/\{\{/g, ""));

// New folder path segments with their patterns filled in.
export const expandSegments = (segments, date = new Date()) => segments.map((s) => expandTemplate(s, date));
