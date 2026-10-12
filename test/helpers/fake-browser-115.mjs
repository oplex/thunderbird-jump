// In-memory stand-in shaped like Thunderbird 115's MV2 APIs: no folder ids,
// folders are { accountId, path }, accounts list top-level `folders`,
// mailTabs use `id` and `displayedFolder` objects, no mailTabs.create and no
// folders.get. Calls with 121+-style arguments throw, like 115 would.

export function makeFakeBrowser115() {
  const calls = [];
  const storage = {};
  const account = { id: "account1", name: "Old Mail", type: "imap" };
  // path -> { name, type }
  const folders = new Map([
    ["/INBOX", { name: "Inbox", type: "inbox" }],
    ["/INBOX/Clients", { name: "Clients" }],
    ["/INBOX/Clients/Acme", { name: "Acme" }],
    ["/Trash", { name: "Trash", type: "trash" }],
  ]);

  const view = (path, deep) => {
    const f = folders.get(path);
    const out = { accountId: account.id, path, name: f.name, ...(f.type ? { type: f.type } : {}) };
    if (deep) out.subFolders = children(path).map((p) => view(p, true));
    return out;
  };
  const children = (parent) =>
    [...folders.keys()].filter((p) => p.startsWith(parent === "/" ? "/" : parent + "/") && p.slice(parent === "/" ? 1 : parent.length + 1).indexOf("/") === -1 && p !== parent);
  const pathOf = (arg) => {
    if (typeof arg === "string") throw new Error("Type error: Thunderbird 115 expects a MailFolder or MailAccount, not an id");
    if (arg.folders !== undefined || arg.identities !== undefined) return "/"; // MailAccount
    if (!folders.has(arg.path)) throw new Error(`Folder not found: ${arg.path}`);
    return arg.path;
  };

  const tab = { id: 7, windowId: 1, active: true, folderPaneVisible: true, displayedFolder: view("/INBOX") };

  const browser = {
    runtime: { getManifest: () => ({ manifest_version: 2, version: "0.0.0" }), getBrowserInfo: async () => ({ name: "Thunderbird", version: "115.5.1" }) },
    accounts: {
      list: async (deep) => [{ ...account, identities: [], folders: children("/").map((p) => view(p, deep)) }],
      get: async (id, deep) => (id === account.id ? { ...account, identities: [], folders: children("/").map((p) => view(p, deep)) } : null),
    },
    folders: {
      getSubFolders: async (arg, deep) => children(pathOf(arg)).map((p) => view(p, deep)),
      create: async (arg, name) => {
        const parent = pathOf(arg);
        const path = (parent === "/" ? "" : parent) + "/" + name;
        calls.push(["folders.create", parent, name]);
        folders.set(path, { name });
        return view(path);
      },
    },
    mailTabs: {
      query: async (q) => ((q.windowId == null || q.windowId === tab.windowId) && (q.active == null || q.active === tab.active) ? [{ ...tab }] : []),
      get: async () => ({ ...tab }),
      update: async (tabId, props) => {
        if ("displayedFolderId" in props) throw new Error("Unexpected property displayedFolderId");
        if ("folderPaneVisible" in props) tab.folderPaneVisible = props.folderPaneVisible;
        if ("displayedFolder" in props) {
          const df = props.displayedFolder;
          if (typeof df === "string") throw new Error("Type error for displayedFolder: expected MailFolder");
          if (df.path !== "/" && !folders.has(df.path)) throw new Error(`Folder not found: ${df.path}`);
          calls.push(["mailTabs.update", tabId, df.path]);
          tab.displayedFolder = df.path === "/" ? { accountId: account.id, path: "/", name: "Root" } : view(df.path);
        }
      },
    },
    tabs: { update: async () => {} },
    windows: {
      get: async (id) => ({ id, type: "normal" }),
      getCurrent: async () => ({ id: 1, type: "normal" }),
      getLastFocused: async () => ({ id: 1, type: "normal" }),
      update: async () => {},
    },
    storage: {
      local: {
        get: async (k) => (k in storage ? { [k]: structuredClone(storage[k]) } : {}),
        set: async (o) => Object.assign(storage, structuredClone(o)),
      },
    },
  };
  return { browser, calls, tab, folders };
}
