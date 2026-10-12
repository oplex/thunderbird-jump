/*
 * "Tested on every Thunderbird" section: renders status.json, which the
 * Website workflow writes from the newest CI and Compatibility runs.
 */

const $ = (id) => document.getElementById(id);
const nice = (v) => v.replace("latest-esr", "newest ESR").replace("latest-release", "newest release");
const day = (iso) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const ICON = { success: ["✓", "yes", "passed"], failure: ["✗", "fail", "failed"], cancelled: ["–", "no", "cancelled"] };

function el(tag, attrs = {}, text) {
  const node = Object.assign(document.createElement(tag), attrs);
  if (text != null) node.textContent = text;
  return node;
}

function result(conclusion) {
  const [icon, cls, word] = ICON[conclusion] ?? ["?", "no", conclusion ?? "unknown"];
  return el("span", { className: cls }, `${icon} ${word}`);
}

function versionTable(versions) {
  const table = el("table", { className: "compare tested" });
  const head = el("tr");
  head.append(el("th", {}, "Thunderbird"), el("th", {}, "Result"), el("th", {}, "Details"));
  table.appendChild(el("thead")).append(head);
  const body = table.appendChild(el("tbody"));
  for (const v of versions) {
    const tr = el("tr");
    const link = el("a", { href: v.url }, "test log");
    const td = el("td");
    td.append(link);
    tr.append(el("th", {}, v.version), el("td"), td);
    tr.children[1].append(result(v.conclusion));
    body.append(tr);
  }
  return table;
}

async function render() {
  const box = $("testStatus");
  let s;
  try {
    s = await (await fetch("status.json", { cache: "no-cache" })).json();
  } catch {
    return;
  }
  if (!s.compat && !s.ci) return;
  box.replaceChildren();
  if (s.ci) {
    const p = el("p");
    p.append("Latest change ", el("a", { href: s.ci.url }, `(${s.ci.commit})`), ` tested ${day(s.ci.date)} on Thunderbird ${s.ci.versions.map((v) => nice(v.version)).join(", ")}: `, result(s.ci.conclusion));
    box.append(p);
  }
  if (s.compat) {
    const passed = s.compat.versions.filter((v) => v.conclusion === "success").length;
    const p = el("p");
    p.append(`Full run over every major version, ${day(s.compat.date)}: `, el("strong", {}, `${passed} of ${s.compat.versions.length} passed`), " · ", el("a", { href: s.compat.url }, "run details"));
    box.append(p);
    const wrap = el("div", { className: "table-scroll" });
    wrap.append(versionTable(s.compat.versions));
    box.append(wrap);
  }
  if (s.releases?.length) {
    const ul = el("ul", { className: "releases" });
    for (const r of s.releases) {
      const li = el("li");
      li.append(el("a", { href: r.url }, `${document.body.dataset.app ?? "Version"} ${r.tag.replace(/^v/, "")}`), ` · ${day(r.date)}`);
      ul.append(li);
    }
    $("releaseList").replaceChildren(ul);
  }
}

render();
