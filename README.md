# Thunderbird Jump

A Spotlight-style folder jumper for Thunderbird, in the spirit of Nostalgy.
Press a key, type a few letters, hit Enter, and you are in the folder.

**Why another one?** Nostalgy and similar add-ons rely on Thunderbird
internals, so every big Thunderbird release can break them, and you wait for an
update that may come weeks later or never. Thunderbird Jump uses only the
official MailExtension APIs. It is small enough to read in an afternoon, and
its tests run inside real Thunderbird ESR builds. When a new release changes
something, CI shows it right away and the fix is usually a few lines.

**Read-only by design.** It never moves, copies, deletes or changes messages,
and never renames or deletes folders. It only changes which folder is shown.
The one thing it writes is a **new folder**, and only when you ask for one.

Needs Thunderbird **140 ESR** or newer (Manifest V3). Tested against
140.7.1esr and the latest 140.x ESR.

## Opening it

| Key | What it does |
| --- | --- |
| `Ctrl+Shift+Space` | Spotlight: a palette centered over the mail window |
| `Alt+Shift+J` | The same palette as a popup from the toolbar button |

You can change these, and give `j1`–`j5` their own keys, under
Add-ons Manager → ⚙ → **Manage Extension Shortcuts**.

## Typing in the palette

| Input | Result |
| --- | --- |
| `inv` | Fuzzy-search every folder in every account (recent folders rank higher) |
| *(empty)* | Your shortcuts and recent folders |
| `j1`, `j2` … | Jump to numbered shortcut 1, 2 … |
| `:j name` | Jump to the shortcut called `name` (`:j` or `:jl` lists them all) |
| `:jj1`, `:jj name` | Save the **current** folder as shortcut `1` / `name` |
| `:jj name = query` | Save a searched folder as shortcut `name` |
| `:jd name` | Delete a shortcut |
| `:new A/B` | Create `A`, then `B` inside it, in the current folder |
| `clients > Acme/2026` | Find the parent folder `clients`, create `Acme/2026` inside it |
| `> Projects` | Create `Projects` at the top level of an account |
| `?` | Help |

Folders that already exist along a path are reused, so `> A/B` never makes
duplicates.

## Keys

| Key | Action |
| --- | --- |
| `Enter` | Run the highlighted row (jump / save / create) |
| `Shift+Enter` | Open the folder in a new tab |
| `Ctrl+N` or `Ctrl+Enter` | Create a subfolder inside the highlighted folder |
| `Alt+1` … `Alt+9` | Jump straight to shortcut 1 … 9 |
| `↑ ↓`, `Tab`, `Ctrl+J/K` | Move the selection |
| `Esc` | Leave create mode, or close |

After creating a folder it jumps there (you can turn that off in the options).
The options page also lists and deletes shortcuts.

## Permissions

- `accountsRead`: list accounts and folders, show the current folder
- `accountsFolders`: create folders (only when you ask)
- `storage`: keep your shortcuts and recent folders

## Development

```sh
npm test              # unit tests (Node 22, fake Thunderbird APIs)
npm run test:tb       # end-to-end inside real headless Thunderbird 140.7.1esr
npm run lint          # web-ext lint (Firefox-only API warnings are expected)
npm run check-lines   # every file must stay under 300 lines
npm run build         # dist/thunderbird-jump-<version>.xpi
```

`npm run test:tb` downloads Thunderbird into `.thunderbird/` (see
`scripts/fetch-thunderbird.sh`). It then starts it headless with a throwaway
profile and a Local Folders account, and runs `test/integration/selftest.js`
inside the add-on. That test types into the real palette, presses keys, and
checks the folders that were created and the folder that ends up shown.
If Dovecot is installed (`apt install dovecot-imapd`), it also starts a
throwaway IMAP server and checks jumping and folder creation on a real IMAP
account, including that the new mailboxes exist on the server. CI always
runs the IMAP part. To use
a different build, pass `TB_BIN=/path/to/thunderbird`, or run
`sh scripts/fetch-thunderbird.sh latest-esr`.

### Layout

```
manifest.json
src/background/   keyboard commands, spotlight window
src/lib/          pure logic: fuzzy matching, input parser, row building
src/tb/           Thunderbird API wrappers: folders, tabs, storage
src/palette/      palette UI: controller, rendering, actions
src/options/      options page
test/             unit tests and the real-Thunderbird integration harness
```

Install a build: Add-ons Manager → ⚙ → **Install Add-on From File…** →
choose the `.xpi` from `dist/`. It is unsigned, so in release Thunderbird you
may need `xpinstall.signatures.required = false`, or load it temporarily from
Debug Add-ons.
