// Self-test cases for the entry points: toolbar popup, spotlight window,
// keyboard commands and close-on-blur.

import { currentFolderId, jumpToFolder } from "../../src/tb/tabs.js";
import { saveSettings } from "../../src/tb/store.js";
import { openSpotlight, handleCommand } from "../../src/background/background.js";
import { check, assert, waitFor, sleep, byPath, openPalette, isOpen, closed, type, press } from "./util.js";

const paletteWindows = async () =>
  (await browser.windows.getAll({ populate: true })).filter((w) => w.tabs?.some((t) => t.url?.includes("palette.html")));

export async function uiTests(windowId, root) {
  await check("keyboard commands are registered with their default keys", async () => {
    const cmds = Object.fromEntries((await browser.commands.getAll()).map((c) => [c.name, c.shortcut]));
    assert(cmds["open-spotlight"] === "Ctrl+Shift+Space", `open-spotlight = ${cmds["open-spotlight"]}`);
    assert(cmds._execute_action === "Alt+Shift+J", `_execute_action = ${cmds._execute_action}`);
    for (const n of [1, 2, 3, 4, 5]) assert(`jump-${n}` in cmds, `jump-${n} missing`);
  });

  await check("jump-1 command jumps to shortcut 1", async () => {
    await jumpToFolder((await byPath(`${root.name}/Trash`)).id, windowId);
    await handleCommand("jump-1");
    const acme = await byPath(`${root.name}/JumpTest/Clients/Acme`);
    assert((await currentFolderId(windowId)) === acme.id, "jump-1 did not jump");
  });

  await check("spotlight command opens one centered palette window", async () => {
    await handleCommand("open-spotlight");
    const [win] = await waitFor(async () => {
      const w = await paletteWindows();
      return w.length === 1 && w;
    }, "spotlight window");
    await openSpotlight();
    await sleep(500);
    assert((await paletteWindows()).length === 1, "second spotlight window opened");
    const main = await browser.windows.get(windowId);
    const centre = win.left + win.width / 2;
    assert(Math.abs(centre - (main.left + main.width / 2)) < 40, `not centred: ${win.left},${win.width} in ${main.left},${main.width}`);
    await browser.windows.remove(win.id);
  });

  await check("spotlight closes when it loses focus (closeOnBlur)", async () => {
    await saveSettings({ closeOnBlur: true });
    try {
      const p = await openPalette(windowId);
      await browser.windows.update(p.win.id, { focused: true });
      await sleep(300);
      assert(await isOpen(p), "closed too early");
      // Headless has no window manager, so deliver the blur the WM would send.
      p.view.dispatchEvent(new p.view.FocusEvent("blur"));
      await closed(p);
    } finally {
      await saveSettings({ closeOnBlur: false });
    }
  });

  await check("toolbar popup page also works standalone", async () => {
    const win = await browser.windows.create({ type: "popup", url: browser.runtime.getURL("src/palette/palette.html") });
    const view = await waitFor(() => browser.extension.getViews({ windowId: win.id })[0], "popup view");
    await waitFor(() => view.document.querySelector("#list li"), "popup rows");
    assert(view.document.body.classList.contains("popup"), "popup mode class missing");
    await browser.windows.remove(win.id);
  });

  await check(":keys in the palette opens the options page, which lists shortcuts", async () => {
    const p = await openPalette(windowId);
    await type(p, ":keys");
    press(p, "Enter");
    await closed(p);
    const view = await waitFor(
      () => browser.extension.getViews().find((v) => v.location.pathname.endsWith("options.html")),
      "options view",
    );
    await waitFor(() => view.document.querySelector("#shortcuts td.name")?.textContent === "j1", "j1 row in options");
    view.close();
  });
}
