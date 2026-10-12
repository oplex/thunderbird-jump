/*
 * Lite mode: the spotlight window is made once and kept ready. "Closing"
 * minimizes it; the next open restores it and resets it (background.js sends
 * "palette-wake"), which skips Thunderbird creating a new window each time.
 * Also the palette's top-bar buttons.
 */

export const isLite = (mode, settings) => mode === "window" && !!settings.liteMode;

export async function hideWindow() {
  const win = await browser.windows.getCurrent();
  await browser.windows.update(win.id, { state: "minimized" });
}

// Calls fn(params) with the page parameters for each new open.
export function onWake(fn) {
  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "palette-wake") fn(new URLSearchParams(msg.params));
  });
}

// Manager / settings buttons in the palette's top bar (with the current key).
// run(op) runs the "manager" or "options" action.
export function wireTools(run) {
  document.getElementById("openManager").addEventListener("click", () => run("manager"));
  document.getElementById("openOptions").addEventListener("click", () => run("options"));
  browser.commands.getAll().then((cmds) => {
    const key = cmds.find((c) => c.name === "open-manager")?.shortcut;
    document.getElementById("managerKey").textContent = key ?? "";
  });
}
