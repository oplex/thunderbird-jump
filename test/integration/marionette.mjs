// Tiny Marionette client: just enough to run a chrome-privileged script in
// Thunderbird (used to store the test IMAP password in the login manager).
// Wire format: "<byte length>:<json>", commands are [0, id, name, params].

import { connect } from "node:net";

export async function marionette(port, { timeoutMs = 60000, stepMs = 30000 } = {}) {
  const socket = await connectWithRetry(port, timeoutMs);
  let buf = Buffer.alloc(0);
  const waiting = [];
  socket.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      const colon = buf.indexOf(":");
      if (colon === -1) break;
      const len = Number(buf.subarray(0, colon).toString());
      if (buf.length < colon + 1 + len) break;
      const msg = JSON.parse(buf.subarray(colon + 1, colon + 1 + len).toString());
      buf = buf.subarray(colon + 1 + len);
      waiting.shift()?.(msg);
    }
  });
  // Each reply must arrive within `stepMs`, so a stuck handshake fails loudly.
  const next = (what, ms = stepMs) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`no reply to ${what}`)), ms);
      waiting.push((msg) => {
        clearTimeout(t);
        resolve(msg);
      });
    });

  await next("hello");
  let id = 0;
  async function send(name, params = {}, ms = stepMs) {
    const reply = next(name, ms);
    const body = Buffer.from(JSON.stringify([0, ++id, name, params]));
    socket.write(`${body.length}:`);
    socket.write(body);
    const [, , error, result] = await reply;
    if (error) throw new Error(`${name}: ${error.message ?? JSON.stringify(error)}`);
    return result;
  }

  // NewSession answers only once Thunderbird has fully started, which takes
  // much longer on a busy CI runner.
  await send("WebDriver:NewSession", { capabilities: {} }, Math.max(stepMs, 120000));
  await send("Marionette:SetContext", { value: "chrome" });
  return {
    // Runs `script` (a function body) with chrome privileges; returns its value.
    exec: async (script, args = []) => (await send("WebDriver:ExecuteScript", { script, args, sandbox: "system" }))?.value,
    close: () => socket.destroy(),
  };
}

async function connectWithRetry(port, timeoutMs) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await new Promise((resolve, reject) => {
        const s = connect(port, "127.0.0.1", () => resolve(s));
        s.once("error", reject);
      });
    } catch (e) {
      if (Date.now() > end) throw e;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

// Store a password for an IMAP server so Thunderbird never prompts.
export async function storeImapLogin(m, { host, user, password }) {
  return m.exec(
    `const [host, user, password] = arguments;
     return (async () => {
       const info = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
       info.init("imap://" + host, null, "imap://" + host, user, password, "", "");
       if (Services.logins.addLoginAsync) await Services.logins.addLoginAsync(info);
       else Services.logins.addLogin(info); // Thunderbird 102 and older
       return 1;
     })();`,
    [host, user, password],
  );
}
