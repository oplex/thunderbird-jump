// Minimal in-memory stand-in for the Thunderbird WebExtension APIs the add-on
// uses, modelled on the Thunderbird 140 MV3 schemas (MailTab.tabId,
// displayedFolderId, folder-id-only folders.create/getSubFolders).
// Every mutating call is recorded in `calls` so tests can assert that only
// allowed write operations happen.

export function makeFakeBrowser() {
  let nextId = 1;
  const folders = new Map();
  const calls = [];
  const storage = {};
  const session = {};

  function mk(accountId, name, parentId, extra = {}) {
    const id = `f${nextId++}`;
    const f = { id, accountId, name, parentId, children: [], specialUse: [], ...extra };
    folders.set(id, f);
    if (parentId) folders.get(parentId).children.push(id);
    return f;
  }

  const view = (f, deep) => ({
    id: f.id,
    accountId: f.accountId,
    name: f.name,
    isRoot: !f.parentId,
    specialUse: f.specialUse,
    ...(deep ? { subFolders: f.children.map((c) => view(folders.get(c), true)) } : {}),
  });

  const accounts = [{ id: "account1", name: "Work Mail" }];
  const root = mk("account1", "Root", null);
  accounts[0].root = root.id;
  const inbox = mk("account1", "Inbox", root.id, { specialUse: ["inbox"] });
  const clients = mk("account1", "Clients", inbox.id);
  mk("account1", "Acme", clients.id);

  const tabs = [{ tabId: 7, windowId: 1, active: true, folderPaneVisible: true, displayedFolder: view(inbox) }];
  // MV3 only accepts MailFolderIds here (an account's root folder id, not its account id).
  const resolve = (ref) => {
    const f = folders.get(ref);
    if (!f) throw new Error(`Invalid MailFolderId ${ref}`);
    return f;
  };

  const browser = {
    accounts: {
      get: async (id) => {
        const a = accounts.find((x) => x.id === id);
        return a && { id: a.id, name: a.name, rootFolder: view(folders.get(a.root)) };
      },
      list: async (deep) => accounts.map((a) => ({ id: a.id, name: a.name, rootFolder: view(folders.get(a.root), deep) })),
    },
    folders: {
      get: async (ref) => {
        const f = resolve(ref);
        const names = [];
        for (let x = f; x.parentId; x = folders.get(x.parentId)) names.unshift(x.name);
        return { ...view(f), path: "/" + names.join("/") };
      },
      getSubFolders: async (ref, deep) => resolve(ref).children.map((c) => view(folders.get(c), deep)),
      create: async (ref, name) => {
        calls.push(["folders.create", ref, name]);
        const parent = resolve(ref);
        return view(mk(parent.accountId, name, parent.id));
      },
    },
    mailTabs: {
      query: async (q) => tabs.filter((t) => (q.windowId == null || t.windowId === q.windowId) && (q.active == null || t.active === q.active)),
      get: async (tabId) => ({ ...tabs.find((t) => t.tabId === tabId) }),
      update: async (tabId, props) => {
        const tab = tabs.find((t) => t.tabId === tabId);
        if ("folderPaneVisible" in props) {
          calls.push(["mailTabs.update", tabId, { folderPaneVisible: props.folderPaneVisible }]);
          tab.folderPaneVisible = props.folderPaneVisible;
        }
        if ("displayedFolderId" in props) {
          calls.push(["mailTabs.update", tabId, props.displayedFolderId]);
          tab.displayedFolder = view(folders.get(props.displayedFolderId));
        }
      },
      create: async (props) => calls.push(["mailTabs.create", props.displayedFolderId]),
    },
    tabs: { update: async (id, p) => calls.push(["tabs.update", id, p]) },
    windows: {
      get: async (id) => ({ id, type: "normal", left: 0, top: 0, width: 1200, height: 800 }),
      getCurrent: async () => ({ id: 1, type: "normal" }),
      getLastFocused: async () => ({ id: 1, type: "normal" }),
      update: async () => {},
    },
    storage: {
      local: {
        get: async (k) => (k in storage ? { [k]: structuredClone(storage[k]) } : {}),
        set: async (o) => Object.assign(storage, structuredClone(o)),
      },
      session: {
        get: async (k) => (k in session ? { [k]: session[k] } : {}),
        set: async (o) => Object.assign(session, o),
        remove: async (k) => delete session[k],
      },
    },
  };

  return { browser, calls, storage, ids: { root: root.id, inbox: inbox.id, clients: clients.id } };
}
