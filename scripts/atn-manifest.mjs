// Manifest for uploading to addons.thunderbird.net (ATN): ATN delivers
// updates itself, so the self-hosted update_url is removed. ATN gets one file
// for every Thunderbird (the MV2 build without an upper version limit),
// because its listing page judges compatibility by the newest version only.
//   node scripts/atn-manifest.mjs <in> <out>
import { readFileSync, writeFileSync } from "node:fs";

export function toATN(manifest) {
  const m = structuredClone(manifest);
  delete m.browser_specific_settings.gecko.update_url;
  return m;
}

if (process.argv[1]?.endsWith("atn-manifest.mjs")) {
  const [, , input, output] = process.argv;
  writeFileSync(output, JSON.stringify(toATN(JSON.parse(readFileSync(input, "utf8"))), null, 2) + "\n");
}
