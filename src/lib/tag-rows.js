// Palette rows in tag mode: Thunderbird's tags, filtered by what was typed.
// Enter adds the tag to the selected messages, or takes it off when they
// all have it already (like Thunderbird's own tag keys). Pure.

import { parseInput } from "./parse.js";
import { matchTerm } from "./fuzzy.js";

export function buildTagRows(input, ctx) {
  const p = parseInput(input);
  const query = p.kind === "search" ? p.query : p.kind === "home" ? "" : null;
  if (query == null) return [{ type: "info", text: "Type part of a tag name" }];
  const tags = ctx.tags ?? [];
  if (!tags.length) return [{ type: "info", text: "Thunderbird has no tags yet (Settings → General → Tags)" }];
  const matched = tags
    .map((tag) => ({ tag, m: matchTerm(query, tag.name) }))
    .filter((x) => x.m)
    .sort((a, b) => b.m.score - a.m.score);
  if (!matched.length) return [{ type: "info", text: `No tag matches “${query}”` }];
  return matched.map(({ tag }) => {
    const all = ctx.moving.every((msg) => (msg.tags ?? []).includes(tag.key));
    return {
      type: "item",
      icon: all ? "✓" : "🏷",
      title: tag.name,
      detail: all ? "All selected messages have it · Enter takes it off" : "Enter adds it to the selected messages",
      action: { op: "tag", tag },
    };
  });
}
