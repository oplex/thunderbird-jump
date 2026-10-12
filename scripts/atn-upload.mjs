/*
 * Upload .xpi files to addons.thunderbird.net (listed channel) as new
 * versions of ThunderJump, for review.
 *   ATN_API_KEY=user:… ATN_API_SECRET=… node scripts/atn-upload.mjs file.xpi …
 * The key and secret come from ATN → Developer Hub → API keys. A version that
 * is already on ATN is skipped. API: thunderbird-addons-server.readthedocs.io
 * (topics/api/signing.html, topics/api/auth.html).
 */

import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { execFileSync } from "node:child_process";

const API = process.env.ATN_API_URL ?? "https://addons.thunderbird.net/api/v3";
const key = process.env.ATN_API_KEY;
const secret = process.env.ATN_API_SECRET;
if (!key || !secret) {
  console.error("ATN_API_KEY and ATN_API_SECRET must be set");
  process.exit(1);
}

const b64 = (data) => Buffer.from(data).toString("base64url");

// A fresh token for every request, valid for 4 minutes (ATN allows 5).
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ iss: key, jti: randomUUID(), iat: now, exp: now + 240 }));
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

// id and version from the manifest inside the .xpi.
function manifestOf(file) {
  return JSON.parse(execFileSync("unzip", ["-p", file, "manifest.json"], { encoding: "utf8" }));
}

async function upload(file) {
  const manifest = manifestOf(file);
  const id = manifest.browser_specific_settings?.gecko?.id ?? manifest.applications?.gecko?.id;
  const url = `${API}/addons/${encodeURIComponent(id)}/versions/${encodeURIComponent(manifest.version)}/`;
  const form = new FormData();
  form.append("upload", new Blob([readFileSync(file)]), basename(file));
  form.append("channel", "listed");
  const res = await fetch(url, { method: "PUT", headers: { Authorization: `JWT ${token()}` }, body: form });
  const text = await res.text();
  if (res.status === 409) return console.log(`${basename(file)}: ${manifest.version} is already on ATN, skipped`);
  if (!res.ok) throw new Error(`${basename(file)}: ATN answered ${res.status}: ${text.slice(0, 500)}`);
  const info = JSON.parse(text);
  console.log(`${basename(file)}: uploaded ${manifest.version} (${res.status}); validation: ${info.validation_url ?? "pending"}`);
}

let failed = false;
for (const file of process.argv.slice(2)) {
  try {
    await upload(file);
  } catch (e) {
    console.error(e.message);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
