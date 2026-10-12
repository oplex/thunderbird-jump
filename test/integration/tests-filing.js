// Self-test cases for copying, tagging (with undo) and suggested folders,
// in real Thunderbird. Runs after tests-quick.js; "TJ move A/B/C" are in
// JumpTest/MoveSrc. Turns the extras on and off again.

import { saveSettings } from "../../src/tb/store.js";
import { listAll } from "../../src/tb/messages.js";
import { queryFolder } from "../../src/tb/compat.js";
import { handleCommand } from "../../src/background/background.js";
import { select } from "./tests-moves.js";
import { check, assert, waitFor, byPath, openPalette, type, press, closed } from "./util.js";

const inFolder = async (folderId) => listAll(await browser.messages.query(queryFolder(folderId)));
const subjectsIn = async (folderId) => (await inFolder(folderId)).map((m) => m.subject).sort();

export async function filingTests(windowId, root) {
  const src = await byPath(`${root.name}/JumpTest/MoveSrc`);
  const dst = await byPath(`${root.name}/JumpTest/MoveDst`);
  await saveSettings({ copyEnabled: true, tagsEnabled: true, suggestEnabled: true });

  await check("copy: “copy movedst” copies the selection and keeps the original", async () => {
    await select(windowId, src.id, ["TJ move B"]);
    const p = await openPalette(windowId);
    await type(p, "copy movedst");
    await waitFor(() => p.doc.getElementById("selection").textContent.startsWith("Copying 1 message"), "copy banner");
    await waitFor(() => p.doc.querySelector("#list li.item")?.textContent.includes("MoveDst"), "MoveDst first");
    press(p, "Enter");
    await closed(p);
    await waitFor(async () => (await subjectsIn(dst.id)).includes("TJ move B"), "copy in MoveDst");
    assert((await subjectsIn(src.id)).includes("TJ move B"), "original gone");
  });

  await check("tags: tag the selection “Important”, then undo restores the tags", async () => {
    await select(windowId, src.id, ["TJ move C"]);
    const p = await openPalette(windowId, "tag");
    await waitFor(() => p.doc.getElementById("selection").textContent.startsWith("Tagging 1 message"), "tag banner");
    const rows = await type(p, "importa");
    assert(rows[0]?.startsWith("🏷Important") || rows[0]?.includes("Important"), `row: ${rows[0]}`);
    press(p, "Enter");
    await closed(p);
    const tagsOfC = async () => (await inFolder(src.id)).find((m) => m.subject === "TJ move C")?.tags ?? [];
    await waitFor(async () => (await tagsOfC()).includes("$label1"), "tag set");
    await handleCommand("undo-move");
    await waitFor(async () => !(await tagsOfC()).includes("$label1"), "tag removed by undo");
  });

  await check("rules: “:rule …” makes the folder the first suggestion when moving", async () => {
    let p = await openPalette(windowId);
    await type(p, ":rule TJ move = movedst");
    await waitFor(() => p.doc.querySelector("#list li.item")?.textContent.includes("MoveDst"), "rule row");
    press(p, "Enter");
    await waitFor(() => p.doc.getElementById("status").textContent.includes("Rule saved"), "rule saved");
    press(p, "Escape");
    await closed(p);
    await select(windowId, src.id, ["TJ move A"]);
    p = await openPalette(windowId, "move");
    await waitFor(() => p.doc.querySelector("#list li.header")?.textContent === "Suggested", "Suggested heading");
    const first = p.doc.querySelector("#list li.item").textContent;
    assert(first.includes("MoveDst") && first.includes("rule"), `first: ${first}`);
    press(p, "Escape");
    await closed(p);
  });

  await saveSettings({ copyEnabled: false, tagsEnabled: false, suggestEnabled: false });
}
