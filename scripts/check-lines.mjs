// Fails if any source file exceeds the 300-line limit.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const LIMIT = 300;
const SKIP = new Set([".git", "node_modules", "dist", ".thunderbird"]);
const EXT = /\.(m?js|json|html|css|sh|ya?ml|md|svg)$/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXT.test(name)) yield p;
  }
}

let bad = 0;
for (const file of walk(".")) {
  const lines = readFileSync(file, "utf8").split("\n").length;
  if (lines > LIMIT) {
    console.error(`${file}: ${lines} lines (limit ${LIMIT})`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log(`All files within ${LIMIT} lines.`);
