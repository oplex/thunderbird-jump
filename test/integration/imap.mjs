// Starts a throwaway Dovecot IMAP server (no root needed) for the integration
// tests. Mailboxes live in a plain directory tree (LAYOUT=fs), so the runner
// can check folders created over IMAP by looking at the filesystem.

import { mkdirSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { userInfo } from "node:os";

export const IMAP_USER = "test";
export const IMAP_PASSWORD = "secret";

export function findDovecot() {
  for (const p of [process.env.DOVECOT_BIN, "/usr/sbin/dovecot", "/usr/local/sbin/dovecot"]) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

const idOf = (flag, name) => execFileSync("id", [flag, ...(name ? [name] : [])], { encoding: "utf8" }).trim();

// Dovecot refuses to run its login/mail processes as root. As a normal user
// (e.g. CI) everything runs as that user; as root we use Dovecot's own
// system users ("dovecot" / "dovenull") from the distro package.
function identity() {
  const me = userInfo();
  if (me.uid !== 0) return { internal: me.username, login: me.username, group: idOf("-gn"), uid: me.uid, gid: me.gid };
  return { internal: "dovecot", login: "dovenull", group: idOf("-gn", "dovecot"), uid: Number(idOf("-u", "dovecot")), gid: Number(idOf("-g", "dovecot")) };
}

function config(dir, port, who) {
  const { internal, login, group, uid, gid } = who;
  const mail = join(dir, "mail");
  return `protocols = imap
listen = 127.0.0.1
base_dir = ${dir}/run
state_dir = ${dir}/run
log_path = ${dir}/dovecot.log
ssl = no
disable_plaintext_auth = no
auth_mechanisms = plain login
default_internal_user = ${internal}
default_internal_group = ${group}
default_login_user = ${login}
first_valid_uid = ${uid}
first_valid_gid = ${gid}
mail_location = maildir:${mail}/%u:LAYOUT=fs:INBOX=${mail}/%u/INBOX
passdb {
  driver = static
  args = password=${IMAP_PASSWORD}
}
userdb {
  driver = static
  args = uid=${uid} gid=${gid} home=${mail}/%u
}
service imap-login {
  inet_listener imap {
    address = 127.0.0.1
    port = ${port}
  }
  inet_listener imaps {
    port = 0
  }
  chroot =
}
service anvil {
  chroot =
}
`;
}

// `dir` must be short: Dovecot's unix sockets live under it (108-byte limit).
// `folders` are pre-created mailbox paths such as "Projects/Clients".
export async function startDovecot(bin, dir, folders = []) {
  const port = await freePort();
  const who = identity();
  const home = join(dir, "mail", IMAP_USER);
  for (const f of ["INBOX", ...folders]) mkdirSync(join(home, ...f.split("/")), { recursive: true });
  mkdirSync(join(dir, "run"), { recursive: true });
  if (userInfo().uid === 0) {
    // Let the unprivileged Dovecot users reach the sockets and the mailboxes.
    // (`dir` and its mkdtemp parent only; never touch /tmp itself.)
    for (const p of [dir, join(dir, "..")]) chmodSync(p, 0o755);
    execFileSync("chown", ["-R", `${who.uid}:${who.gid}`, join(dir, "mail")]);
  }
  const conf = join(dir, "dovecot.conf");
  writeFileSync(conf, config(dir, port, who));
  // Dovecot daemonizes; don't wait on the pipes its children inherit.
  execFileSync(bin, ["-c", conf], { stdio: "ignore" });
  return {
    port,
    home,
    hasFolder: (path) => existsSync(join(home, ...path.split("/"))),
    stop: () => {
      try {
        execFileSync(bin, ["-c", conf, "stop"], { stdio: "ignore" });
      } catch {
        // Already stopped.
      }
    },
  };
}
