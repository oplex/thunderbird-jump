// Self-test cases against a real IMAP account (local Dovecot started by the
// runner). The runner checks the server's mailbox directories afterwards.

import { loadFolders } from "../../src/tb/folders.js";
import { jumpToFolder, currentFolderId } from "../../src/tb/tabs.js";
import { check, assert, waitFor, log, openPalette, type, press, closed } from "./util.js";

export async function imapTests(windowId, accountName) {
  let root;
  const at = async (path) => (await loadFolders()).find((f) => f.segments.join("/") === `${accountName}/${path}`);

  await check("IMAP: account and server folders are listed", async () => {
    root = await waitFor(async () => (await loadFolders()).find((f) => f.isRoot && f.name === accountName), "IMAP account");
    const inbox = await waitFor(() => at("Inbox"), "IMAP Inbox", 60000);
    // Opening the Inbox makes Thunderbird log in and discover the server's folders.
    await jumpToFolder(inbox.id, windowId);
    await waitFor(() => at("Projects/Clients"), "server folder Projects/Clients", 60000);
    log(`imap folders: ${(await loadFolders()).filter((f) => f.accountName === accountName).map((f) => f.segments.slice(1).join("/")).join(", ")}`);
  });

  await check("IMAP: palette search jumps to a server folder", async () => {
    const p = await openPalette(windowId);
    const rows = await type(p, "imap proj clients");
    assert(rows[0]?.includes("Clients") && rows[0].includes(accountName), `first row was ${rows[0]}`);
    press(p, "Enter");
    await closed(p);
    assert((await currentFolderId(windowId)) === (await at("Projects/Clients")).id, "did not jump to IMAP folder");
  });

  await check("IMAP: 'query > A/B' creates nested folders on the server", async () => {
    const p = await openPalette(windowId);
    await type(p, "imap clients > Acme/2026");
    press(p, "Enter");
    await closed(p);
    const made = await waitFor(() => at("Projects/Clients/Acme/2026"), "IMAP Acme/2026", 60000);
    assert((await currentFolderId(windowId)) === made.id, "did not jump to the new IMAP folder");
  });

  await check("IMAP: Ctrl+N creates a top-level folder on the account", async () => {
    const p = await openPalette(windowId);
    await type(p, "test imap");
    const first = p.doc.querySelector("#list li .title")?.textContent;
    assert(first === accountName, `first row was ${first}`);
    press(p, "n", { ctrlKey: true });
    await type(p, "Archive2026");
    press(p, "Enter");
    await closed(p);
    await waitFor(() => at("Archive2026"), "IMAP Archive2026", 60000);
  });

  return root;
}
