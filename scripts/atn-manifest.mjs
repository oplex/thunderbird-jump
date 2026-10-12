// Manifest for uploading to addons.thunderbird.net (ATN): ATN delivers
// updates itself, so the self-hosted update_url is removed. The 91–139
// build gets its own version number (x.y.z.91), as every ATN upload needs one;
// ATN then gives each Thunderbird the newest version that fits it.
//   node scripts/atn-manifest.mjs <in> <out> [legacy]
import { readFileSync, writeFileSync } from "node:fs";

export function toATN(manifest, { legacy = false } = {}) {
  const m = structuredClone(manifest);
  delete m.browser_specific_settings.gecko.update_url;
  if (legacy) m.version = `${m.version}.91`;
  return m;
}

if (process.argv[1]?.endsWith("atn-manifest.mjs")) {
  const [, , input, output, legacy] = process.argv;
  const m = toATN(JSON.parse(readFileSync(input, "utf8")), { legacy: legacy === "legacy" });
  writeFileSync(output, JSON.stringify(m, null, 2) + "\n");
}
