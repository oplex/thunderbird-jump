// Self-test cases for moving messages: palette move mode, confirm, undo
// (Ctrl+Z, :undo row, key command), with real messages in Local Folders.

import { createFolderPath } from "../../src/tb/folders.js";
import { jumpToFolder, findMailTab } from "../../src/tb/tabs.js";
import { saveSettings } from "../../src/tb/store.js";
import { listAll, lastUndoableMove } from "../../src/tb/messages.js";
import { queryFolder, tabIdOf, legacyRef, hasFolderIds, messageFolderArg } from "../../src/tb/compat.js";
import { handleCommand } from "../../src/background/background.js";
import { check, assert, waitFor, byPath, openPalette, type, press, closed, statusText, chrome } from "./util.js";
import { importModule } from "./pane-scripts.js";

const subjectsIn = async (folderId) =>
  (await listAll(await browser.messages.query(queryFolder(folderId)))).map((m) => m.subject).sort();

// Local Folders path of a folder entry, e.g. "/JumpTest/MoveSrc".
async function pathOf(entry) {
  if (!hasFolderIds()) return legacyRef(entry.id).path;
  return (await browser.folders.get(entry.id)).path;
}

const MAIL_SERVICES = importModule("MailServices").replace(/gre\/modules/g, "/modules");

// Put real messages into a Local Folders folder the way Thunderbird imports
// .eml files (copy service), so they behave like normal mail.
async function seed(entry, subjects) {
  const raws = subjects.map(
    (s, i) =>
      `From: Ann <ann@example.com>\r\nTo: me@example.com\r\nSubject: ${s}\r\n` +
      `Message-ID: <${s.replace(/\W/g, "")}@thunderjump.test>\r\nDate: Thu, 01 Oct 2026 10:00:0${i} +0000\r\n\r\nBody of ${s}\r\n`,
  );
  if (browser.messages.import) {
    // Thunderbird 106+: the official way to add a message to a folder.
    for (const [i, raw] of raws.entries()) {
      await browser.messages.import(new File([raw], `seed-${i}.eml`, { type: "message/rfc822" }), messageFolderArg(entry.id));
    }
    return;
  }
  const uri = "mailbox://nobody@Local%20Folders" + (await pathOf(entry)).split("/").map(encodeURIComponent).join("/");
  for (const [i, raw] of raws.entries()) {
    await chrome(
      `const { MailServices } = ${MAIL_SERVICES};
       const folder = MailServices.folderLookup.getFolderForURL(arguments[0]);
       const file = Services.dirsvc.get("TmpD", Ci.nsIFile);
       file.append("tj-seed-" + arguments[2] + ".eml");
       return (async () => {
         await IOUtils.writeUTF8(file.path, arguments[1]);
         await new Promise((resolve, reject) => {
           MailServices.copy.copyFileMessage(file, folder, null, false, 0, "", {
             QueryInterface: ChromeUtils.generateQI(["nsIMsgCopyServiceListener"]),
             OnStartCopy() {}, OnProgress() {}, SetMessageKey() {}, GetMessageId() {},
             OnStopCopy(status) { Components.isSuccessCode(status) ? resolve() : reject(new Error("copy failed " + status)); },
           }, null);
         });
         return folder.getTotalMessages(false);
       })();`,
      [uri, raw, i],
    );
  }
}


// Select messages by subject in the mail tab (API on 115+, UI before).
export async function select(windowId, folderId, subjects) {
  const ids = (await listAll(await browser.messages.query(queryFolder(folderId)))).filter((m) => subjects.includes(m.subject)).map((m) => m.id);
  const tab = await findMailTab(windowId);
  if (browser.mailTabs.setSelectedMessages) return browser.mailTabs.setSelectedMessages(tabIdOf(tab), ids);
  await chrome(
    `const win = Services.wm.getMostRecentWindow("mail:3pane");
     const hdrs = [];
     for (const hdr of win.gFolderDisplay.displayedFolder.messages) if (arguments[0].includes(hdr.mime2DecodedSubject)) hdrs.push(hdr);
     win.gFolderDisplay.selectMessages(hdrs);
     return hdrs.length;`,
    [subjects],
  );
}

async function openMovePalette(windowId) {
  const p = await openPalette(windowId, "move");
  await waitFor(() => !p.doc.getElementById("selection").hidden, "selection banner");
  return p;
}

export async function moveTests(windowId, root) {
  let src, dst;
  const subjects = ["TJ move A", "TJ move B", "TJ move C"];

  await check("moving: set up folders and messages", async () => {
    assert(await browser.permissions.contains({ permissions: ["messagesRead", "messagesMove"] }), "test build lacks message permissions");
    await createFolderPath(root, "JumpTest/MoveSrc");
    await createFolderPath(root, "JumpTest/MoveDst");
    src = await byPath(`${root.name}/JumpTest/MoveSrc`);
    dst = await byPath(`${root.name}/JumpTest/MoveDst`);
    await seed(src, subjects);
    await jumpToFolder(src.id, windowId);
    await waitFor(async () => (await subjectsIn(src.id)).length === 3, "3 seeded messages");
  });

  await check("moving: palette shows the selection and moves it", async () => {
    await select(windowId, src.id, ["TJ move A", "TJ move B"]);
    const p = await openMovePalette(windowId);
    const banner = p.doc.getElementById("selection").textContent;
    assert(/Moving 2 messages from MoveSrc/.test(banner) && banner.includes("TJ move A"), `banner: ${banner}`);
    const rows = await type(p, "movedst");
    assert(rows[0]?.includes("MoveDst"), `first row ${rows[0]}`);
    press(p, "Enter");
    await closed(p);
    await waitFor(async () => (await subjectsIn(dst.id)).length === 2, "2 messages in MoveDst");
    assert((await subjectsIn(src.id)).join() === "TJ move C", "source should keep only C");
  });

  await check("moving: Ctrl+Z in the palette undoes the move", async () => {
    const p = await openPalette(windowId);
    const rows = await type(p, "");
    assert(/Undo: moved 2 messages/.test(rows[0] ?? ""), `first row ${rows[0]}`);
    press(p, "z", { ctrlKey: true });
    await statusText(p, "Moved 2 messages back");
    await waitFor(async () => (await subjectsIn(src.id)).length === 3, "all 3 back in MoveSrc");
    press(p, "Escape");
    await closed(p);
  });

  await check("moving: confirm-each-move asks first, then moves", async () => {
    await saveSettings({ confirmMove: true });
    try {
      await select(windowId, src.id, ["TJ move C"]);
      const p = await openMovePalette(windowId);
      await type(p, "movedst");
      press(p, "Enter");
      await waitFor(() => /Move 1 message from MoveSrc to MoveDst\?/.test(p.doc.querySelector("#list li.item")?.textContent ?? ""), "confirm row");
      assert((await subjectsIn(dst.id)).length === 0, "moved before confirming");
      press(p, "Enter");
      await closed(p);
      await waitFor(async () => (await subjectsIn(dst.id)).join() === "TJ move C", "C in MoveDst");
    } finally {
      await saveSettings({ confirmMove: false });
    }
  });

  await check("moving: the undo key command moves it back", async () => {
    assert(await lastUndoableMove(), "nothing to undo");
    await handleCommand("undo-move");
    await waitFor(async () => (await subjectsIn(src.id)).length === 3, "C back in MoveSrc");
    assert(!(await lastUndoableMove()), "move still marked undoable");
  });
}
