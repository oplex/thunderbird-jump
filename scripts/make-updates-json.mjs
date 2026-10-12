// Writes dist/updates.json: the self-hosted update manifest Thunderbird polls
// via manifest.json's update_url (the latest GitHub release's updates.json).
//   node scripts/make-updates-json.mjs [repo]   e.g. oplex/thunderjump
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { LEGACY_MIN, LEGACY_MAX } from "./manifest-mv2.mjs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const repo = process.argv[2] ?? process.env.GITHUB_REPOSITORY ?? "oplex/thunderjump";
const { id, strict_min_version } = manifest.browser_specific_settings.gecko;
const { version } = manifest;

const updates = {
  addons: {
    [id]: {
      // Each Thunderbird takes the newest entry whose range fits it.
      updates: [
        {
          version,
          update_link: `https://github.com/${repo}/releases/download/v${version}/thunderjump-${version}.xpi`,
          applications: { gecko: { strict_min_version } },
        },
        {
          version,
          update_link: `https://github.com/${repo}/releases/download/v${version}/thunderjump-${version}-tb91-139.xpi`,
          applications: { gecko: { strict_min_version: LEGACY_MIN, strict_max_version: LEGACY_MAX } },
        },
      ],
    },
  },
};

mkdirSync("dist", { recursive: true });
writeFileSync("dist/updates.json", JSON.stringify(updates, null, 2) + "\n");
console.log(`dist/updates.json -> ${version}`);
