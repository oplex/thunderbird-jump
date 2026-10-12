// Adds messages to a fake browser from fake-browser.mjs: messages.move/copy/
// update/query/continueList, tags, mailTabs.getSelectedMessages and permissions. Like real
// Thunderbird, a moved message gets a NEW id; lists come in pages of 2 so
// continueList is exercised.

const PAGE = 2;

export function addMessages(fake, { granted = true } = {}) {
  let nextId = 100;
  const messages = new Map(); // id -> { headerMessageId, subject, author, folderId, date }
  const lists = new Map();
  let nextList = 1;
  let selection = [];
  const perms = new Set(granted ? ["messagesRead", "messagesMove"] : []);

  const view = (id) => {
    const m = messages.get(id);
    return { id, headerMessageId: m.headerMessageId, subject: m.subject, author: m.author, date: m.date, read: false, flagged: false, tags: [...(m.tags ?? [])], folder: { id: m.folderId, accountId: "account1", name: "" } };
  };
  const page = (ids) => {
    const views = ids.map(view);
    const first = views.slice(0, PAGE);
    const rest = views.slice(PAGE);
    if (!rest.length) return { id: null, messages: first };
    const listId = `list${nextList++}`;
    lists.set(listId, rest);
    return { id: listId, messages: first };
  };

  const b = fake.browser;
  b.permissions = {
    contains: async ({ permissions }) => permissions.every((p) => perms.has(p)),
    request: async ({ permissions }) => (permissions.forEach((p) => perms.add(p)), true),
    remove: async ({ permissions }) => (permissions.forEach((p) => perms.delete(p)), true),
  };
  b.messages = {
    continueList: async (listId) => {
      const rest = lists.get(listId) ?? [];
      lists.delete(listId);
      const next = rest.slice(PAGE);
      if (!next.length) return { id: null, messages: rest };
      const id = `list${nextList++}`;
      lists.set(id, next);
      return { id, messages: rest.slice(0, PAGE) };
    },
    move: async (ids, folderId) => {
      if (!perms.has("messagesMove")) throw new Error("Missing messagesMove permission");
      if (typeof folderId !== "string") throw new Error("MV3 messages.move takes a folder id");
      fake.calls.push(["messages.move", [...ids], folderId]);
      for (const id of ids) {
        const m = messages.get(id);
        if (!m) throw new Error(`No message ${id}`);
        messages.delete(id);
        messages.set(nextId++, { ...m, folderId }); // new id, like Thunderbird
      }
    },
    copy: async (ids, folderId) => {
      if (!perms.has("messagesMove")) throw new Error("Missing messagesMove permission");
      for (const id of ids) messages.set(nextId++, { ...messages.get(id), folderId });
    },
    update: async (id, props) => {
      if (!messages.has(id)) throw new Error(`No message ${id}`);
      Object.assign(messages.get(id), props);
    },
    listTags: async () => [
      { key: "$label1", tag: "Important", color: "#FF0000" },
      { key: "$label4", tag: "To Do", color: "#3333FF" },
    ],
    query: async (q) => {
      const ids = [...messages.keys()].filter((id) => {
        const m = messages.get(id);
        return (q.folderId == null || m.folderId === q.folderId) && (q.headerMessageId == null || m.headerMessageId === q.headerMessageId);
      });
      return page(ids);
    },
  };
  b.mailTabs.getSelectedMessages = async () => page(selection.filter((id) => messages.has(id)));

  return {
    add(folderId, subject, headerMessageId = `<${subject.replace(/\W/g, "")}@test>`, author = "Ann <ann@example.com>") {
      const id = nextId++;
      messages.set(id, { headerMessageId, subject, author, folderId, date: "2026-10-01T10:00:00Z", tags: [] });
      return id;
    },
    select(ids) {
      selection = ids;
    },
    tagsOf: (subject) => [...messages.values()].find((m) => m.subject === subject)?.tags,
    folderOf: (subject) => [...messages.values()].find((m) => m.subject === subject)?.folderId,
    inFolder: (folderId) => [...messages.values()].filter((m) => m.folderId === folderId).map((m) => m.subject).sort(),
    perms,
  };
}
