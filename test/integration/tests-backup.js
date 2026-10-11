// Self-test cases for export / import, the automatic backup file and the
// first-run welcome page.

import { DOWNLOAD_DIR } from "./config.js";
import { getShortcut, getSettings, saveSettings, setShortcut, deleteShortcut } from "../../src/tb/store.js";
import { check, assert, waitFor, sleep, byPath, chrome } from "./util.js";

const readFile = (name) =>
  chrome(`return IOUtils.readUTF8(PathUtils.join(arguments[0], arguments[1])).catch(() => null);`, [DOWNLOAD_DIR, name]);
const listFiles = () =>
  chrome(`return (async () => (await IOUtils.getChildren(arguments[0]).catch(() => [])).map((p) => PathUtils.filename(p)))();`, [DOWNLOAD_DIR]);
const shortcutKeyOf = async (name) => (await browser.commands.getAll()).find((c) => c.name === name).shortcut;

async function optionsView() {
  const find = () => browser.extension.getViews().find((v) => v.location.pathname.endsWith("options.html"));
  if (!find()) await browser.runtime.openOptionsPage();
  const view = await waitFor(find, "options view");
  await waitFor(() => view.document.getElementById("exportBackup"), "options loaded");
  return view;
}

// Hand a file to an <input type=file> the way a file picker would.
function pickFile(view, inputId, name, text) {
  const dt = new view.DataTransfer();
  dt.items.add(new view.File([text], name, { type: "application/json" }));
  const input = view.document.getElementById(inputId);
  input.files = dt.files;
  input.dispatchEvent(new view.Event("change", { bubbles: true }));
}

export async function welcomeTest() {
  await check("fresh install opens the options page with a welcome note", async () => {
    const view = await waitFor(
      () => browser.extension.getViews().find((v) => v.location.pathname.endsWith("options.html")),
      "welcome options page",
    );
    await waitFor(() => view.document.getElementById("welcome")?.hidden === false, "welcome visible");
    view.document.getElementById("welcomeDismiss").click();
    await waitFor(async () => !(await browser.storage.local.get("showWelcome")).showWelcome, "welcome dismissed");
    view.close();
  });
}

export async function backupTests(root) {
  let exported = null;

  await check("Export writes a backup file with shortcuts, settings and keys", async () => {
    await browser.commands.update({ name: "jump-2", shortcut: "Alt+Ctrl+L" });
    const view = await optionsView();
    const before = new Set(await listFiles());
    view.document.getElementById("exportBackup").click();
    const name = await waitFor(async () => (await listFiles()).find((f) => !before.has(f) && /^thunderbird-jump-backup-.*\.json$/.test(f)), "exported file");
    exported = JSON.parse(await waitFor(() => readFile(name), "file contents"));
    assert(exported.app === "thunderbird-jump", "wrong app tag");
    assert(exported.shortcuts["1"]?.folderId, "shortcut j1 missing from export");
    assert(exported.keys["jump-2"] === "Alt+Ctrl+L", `keys: ${JSON.stringify(exported.keys)}`);
    assert(typeof exported.settings.revealFolderPane === "boolean", "settings missing");
    view.close();
  });

  await check("Import restores deleted shortcuts and changed keys", async () => {
    assert(exported, "needs the export test");
    await deleteShortcut("1");
    await browser.commands.reset("jump-2");
    const view = await optionsView();
    pickFile(view, "importBackup", "backup.json", JSON.stringify(exported));
    await waitFor(() => /Restored/.test(view.document.getElementById("backupStatus").textContent), "import status");
    assert((await getShortcut("1"))?.folderId === exported.shortcuts["1"].folderId, "j1 not restored");
    assert((await shortcutKeyOf("jump-2")) === "Alt+Ctrl+L", "key not restored");
    await waitFor(() => view.document.querySelector("#shortcuts td.name")?.textContent === "j1", "list refreshed");
    pickFile(view, "importBackup", "nope.json", '{"hello":1}');
    await waitFor(() => /not a Thunderbird Jump backup/.test(view.document.getElementById("backupStatus").textContent), "rejects other files");
    await browser.commands.reset("jump-2");
    view.close();
  });

  await check("Import matches shortcuts by folder path when folder ids differ", async () => {
    const beta = await byPath(`${root.name}/JumpTest/Clients/Beta`);
    const file = { ...exported, shortcuts: { moved: { name: "moved", folderId: "account99://gone", label: beta.segments.join(" › ") } }, keys: {} };
    const view = await optionsView();
    pickFile(view, "importBackup", "other-pc.json", JSON.stringify(file));
    await waitFor(() => /Matched by folder path: moved/.test(view.document.getElementById("backupStatus").textContent), "remap status");
    assert((await getShortcut("moved"))?.folderId === beta.id, "not remapped to Beta");
    await deleteShortcut("moved");
    view.close();
  });

  await check("Automatic backup rewrites the file after a change and hides it from downloads", async () => {
    // Granting needs a real click on Thunderbird's permission prompt; grant it directly.
    await chrome(
      `return (async () => {
        const { ExtensionPermissions } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");
        const ext = WebExtensionPolicy.getByID(arguments[0]).extension;
        await ExtensionPermissions.add(arguments[0], { permissions: ["downloads"], origins: [] }, ext);
        return true;
      })();`,
      [browser.runtime.id],
    );
    assert(await browser.permissions.contains({ permissions: ["downloads"] }), "permission not granted");
    await saveSettings({ autoBackup: true });
    await setShortcut("auto", (await byPath(`${root.name}/Trash`)).id, "Local Folders › Trash");
    const text = await waitFor(async () => {
      const t = await readFile("thunderbird-jump-backup.json");
      return t && JSON.parse(t).shortcuts.auto ? t : null;
    }, "auto-backup file with the new shortcut", 15000);
    assert(JSON.parse(text).settings.autoBackup === true, "settings in file");
    // The manual export stays in the downloads list like any download; the
    // automatic one is removed from the list (the file itself stays).
    await waitFor(async () => (await browser.downloads.search({ filenameRegex: "thunderbird-jump-backup\\.json$" })).length === 0, "auto-backup removed from downloads list", 5000);
    assert((await browser.storage.local.get("lastBackup")).lastBackup, "lastBackup not recorded");

    // Next change overwrites the same file (no "(1)" copies).
    await deleteShortcut("auto");
    await waitFor(async () => !JSON.parse((await readFile("thunderbird-jump-backup.json")) ?? "{}").shortcuts?.auto, "file updated", 15000);
    await sleep(300);
    const copies = (await listFiles()).filter((f) => f.startsWith("thunderbird-jump-backup") && !/\d{4}-\d\d-\d\d/.test(f));
    assert(copies.length === 1, `backup copies: ${copies}`);
    assert((await getSettings()).autoBackup, "autoBackup setting lost");
  });
}
