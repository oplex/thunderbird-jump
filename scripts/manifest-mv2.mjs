// Derives the Manifest V2 manifest for the Thunderbird 91–139 build from
// manifest.json (Manifest V3, Thunderbird 140+). Same add-on id and update
// URL; updates.json sends each Thunderbird the build that fits it.
import { readFileSync, writeFileSync } from "node:fs";

export const LEGACY_MIN = "91.0";
export const LEGACY_MAX = "139.*";

export function toMV2(manifest) {
  const m = structuredClone(manifest);
  m.manifest_version = 2;
  m.browser_action = m.action;
  delete m.action;
  // MV2 module scripts need a background page.
  m.background = { page: "src/background/background.html" };
  m.permissions = [...(m.permissions ?? []), ...(m.host_permissions ?? [])];
  delete m.host_permissions;
  if (m.commands?._execute_action) {
    m.commands = Object.fromEntries(
      Object.entries(m.commands).map(([k, v]) => [k === "_execute_action" ? "_execute_browser_action" : k, v]),
    );
  }
  const gecko = m.browser_specific_settings.gecko;
  gecko.strict_min_version = LEGACY_MIN;
  gecko.strict_max_version = LEGACY_MAX;
  return m;
}

// CLI: node scripts/manifest-mv2.mjs <in> <out>
if (process.argv[1]?.endsWith("manifest-mv2.mjs")) {
  const [, , input = "manifest.json", output] = process.argv;
  const json = JSON.stringify(toMV2(JSON.parse(readFileSync(input, "utf8"))), null, 2) + "\n";
  if (output) writeFileSync(output, json);
  else process.stdout.write(json);
}
