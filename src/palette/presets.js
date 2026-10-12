// Palette opened from a folder's right-click menu: name a shortcut for that
// folder (?setFor=<id>) or create a subfolder inside it (?createIn=<id>).

import { pathLabel } from "../tb/folders.js";

export function presetFromMenu(params, state, input, setStatus) {
  const setFor = params.get("setFor");
  const createIn = params.get("createIn");
  if (setFor && state.byId.has(setFor)) {
    state.setTargetId = setFor;
    input.value = ":jj ";
    setStatus(`Name a shortcut for ${pathLabel(state.byId.get(setFor))}`);
  } else if (createIn && state.byId.has(createIn)) {
    state.createParentId = createIn;
    input.placeholder = "New folder name (use / to nest)…";
    setStatus(`Creating inside ${pathLabel(state.byId.get(createIn))}`);
  }
}
