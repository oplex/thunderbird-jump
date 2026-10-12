// Self-test cases for the ThunderJump Manager page: search, facets, folder
// scope, bulk move through the picker, and undo from the toast.
// Runs after tests-moves.js, which put "TJ move A/B/C" into JumpTest/MoveSrc.

import { openManager } from "../../src/tb/tabs.js";
import { listAll } from "../../src/tb/messages.js";
import { queryFolder } from "../../src/tb/compat.js";
import { check, assert, waitFor, byPath, openPalette, closed } from "./util.js";

const subjectsIn = async (folderId) =>
  (await listAll(await browser.messages.query(queryFolder(folderId)))).map((m) => m.subject).sort();

async function managerView() {
  await openManager();
  const view = await waitFor(() => browser.extension.getViews().find((v) => v.location.pathname.endsWith("manager.html")), "manager page");
  await waitFor(() => view.document.getElementById("accounts")?.children.length, "manager loaded");
  return view;
}

function typeInto(view, id, text) {
  const input = view.document.getElementById(id);
  input.value = text;
  input.dispatchEvent(new view.Event("input"));
}

const rows = (view) => [...view.document.querySelectorAll("#rows tr")];

export async function managerTests(windowId, root) {
  const src = await byPath(`${root.name}/JumpTest/MoveSrc`);
  const dst = await byPath(`${root.name}/JumpTest/MoveDst`);
  let view;

  await check("manager: the palette's Manager button shows its key (Alt+Shift+F) and opens it", async () => {
    const p = await openPalette(windowId);
    await waitFor(() => p.doc.getElementById("managerKey").textContent === "Alt+Shift+F", "key on the button");
    p.doc.getElementById("openManager").click();
    await closed(p);
    const v = await waitFor(() => browser.extension.getViews().find((x) => x.location.pathname.endsWith("manager.html")), "manager page");
    v.close();
  });

  await check("manager: search finds messages, with folder and sender facets", async () => {
    view = await managerView();
    typeInto(view, "q", "TJ move");
    await waitFor(() => rows(view).length === 3, "3 results");
    const folderFacet = view.document.querySelector("#facetFolder li")?.textContent ?? "";
    assert(folderFacet.includes("MoveSrc") && folderFacet.endsWith("3"), `folder facet: ${folderFacet}`);
    const sender = view.document.querySelector("#facetSender li")?.textContent ?? "";
    assert(sender.startsWith("Ann"), `sender facet: ${sender}`);
  });

  await check("manager: clicking a facet narrows results to a chip; removing it widens again", async () => {
    view.document.querySelector("#facetYear li").click();
    await waitFor(() => view.document.querySelectorAll("#chips .chip").length === 1, "year chip");
    assert(rows(view).length === 3, "year chip should keep all 3");
    view.document.querySelector("#chips .chip button").click();
    await waitFor(() => !view.document.querySelector("#chips .chip"), "chip removed");
  });

  await check("manager: Folders tab finds folders and scopes the message search", async () => {
    view.document.getElementById("tabFolders").click();
    typeInto(view, "q", "movedst");
    await waitFor(() => view.document.querySelector("#foldersView li")?.textContent.includes("MoveDst"), "MoveDst listed");
    typeInto(view, "q", "movesrc");
    await waitFor(() => view.document.querySelector("#foldersView li")?.textContent.includes("MoveSrc"), "MoveSrc listed");
    const here = [...view.document.querySelectorAll("#foldersView li")[0].querySelectorAll("button")].find((b) => b.textContent === "Messages here");
    here.click();
    typeInto(view, "q", "");
    await waitFor(() => rows(view).length === 3 && view.document.querySelector("#chips .chip")?.textContent.includes("MoveSrc"), "scoped to MoveSrc");
    view.document.querySelector("#chips .chip button").click();
  });

  await check("manager: select two, Move to… picker, then Undo from the toast", async () => {
    typeInto(view, "q", "TJ move");
    await waitFor(() => rows(view).length === 3, "3 results");
    const [a, b] = rows(view);
    a.click();
    b.dispatchEvent(new view.MouseEvent("click", { bubbles: true, shiftKey: true }));
    await waitFor(() => view.document.getElementById("selCount").textContent === "2 selected", "2 selected");
    view.document.getElementById("moveTo").click();
    await waitFor(() => !view.document.getElementById("picker").hidden, "picker open");
    typeInto(view, "pickerInput", "movedst");
    await waitFor(() => view.document.querySelector("#pickerList li.on")?.textContent.includes("MoveDst"), "MoveDst highlighted");
    view.document.getElementById("pickerInput").dispatchEvent(new view.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitFor(() => /Moved 2 messages to MoveDst/.test(view.document.getElementById("toastText").textContent), "move toast");
    await waitFor(async () => (await subjectsIn(dst.id)).length === 2, "2 in MoveDst");
    view.document.getElementById("toastUndo").click();
    await waitFor(() => /Moved 2 messages back/.test(view.document.getElementById("toastText").textContent), "undo toast");
    await waitFor(() => view.document.querySelector("#quickTargets li"), "drop targets refreshed");
    await waitFor(async () => (await subjectsIn(src.id)).length === 3, "all back in MoveSrc");
  });

  await check("manager: drag a message onto a “Drop to move” target, then undo", async () => {
    typeInto(view, "q", "TJ move A");
    await waitFor(() => rows(view).length === 1 && rows(view)[0].textContent.includes("TJ move A"), "A as the only result");
    const target = await waitFor(() => view.document.querySelector(`#quickTargets li[data-folder-id="${CSS.escape(dst.id)}"]`), "MoveDst as drop target");
    const dt = new view.DataTransfer();
    const fire = (node, type) => node.dispatchEvent(new view.DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    fire(rows(view)[0], "dragstart");
    fire(target, "dragover");
    assert(target.classList.contains("drop"), "target not highlighted while dragging");
    fire(target, "drop");
    await waitFor(() => /Moved 1 message to MoveDst/.test(view.document.getElementById("toastText").textContent), "drop toast");
    await waitFor(async () => (await subjectsIn(dst.id)).join() === "TJ move A", "A in MoveDst");
    view.document.getElementById("toastUndo").click();
    await waitFor(async () => (await subjectsIn(src.id)).length === 3, "A back in MoveSrc");
  });

  await check("manager: clicking a “Drop to move” target moves the selection", async () => {
    typeInto(view, "q", "TJ move B");
    await waitFor(() => rows(view).length === 1 && rows(view)[0].textContent.includes("TJ move B"), "B as the only result");
    rows(view)[0].click();
    await waitFor(() => view.document.getElementById("selCount").textContent === "1 selected", "selected");
    view.document.querySelector(`#quickTargets li[data-folder-id="${CSS.escape(dst.id)}"]`).click();
    await waitFor(async () => (await subjectsIn(dst.id)).join() === "TJ move B", "B in MoveDst").catch((e) => {
      throw new Error(`${e.message}; toast: ${view.document.getElementById("toastText").textContent}; sel: ${view.document.getElementById("selCount").textContent}`);
    });
    view.document.getElementById("toastUndo").click();
    await waitFor(async () => (await subjectsIn(src.id)).length === 3, "B back in MoveSrc");
    view.close();
  });
}
