<p align="center"><img src="icons/thunderjump.svg" alt="ThunderJump logo" width="112"></p>

# ThunderJump

A Spotlight-style folder jumper for Thunderbird, in the spirit of Nostalgy.
Press a key, type a few letters, hit Enter, and you are in the folder.

**Why another one?** Nostalgy and similar add-ons rely on Thunderbird
internals, so every big Thunderbird release can break them, and you wait for an
update that may come weeks later or never. ThunderJump uses only the official
MailExtension APIs. It is small enough to read in an afternoon, and its tests
run inside real Thunderbird builds, from 91 to the newest release. When a new
release changes something, CI shows it right away and the fix is usually a
few lines.

**Read-only by design.** It never moves, copies, deletes or changes messages,
and never renames or deletes folders. It only changes which folder is shown.
The one thing it writes is a **new folder**, and only when you ask for one.

## Install

1. Check your version under **Help → About Thunderbird**.
2. Download the matching file from the
   [latest release](https://github.com/oplex/thunderbird-jump/releases/latest):
   - Thunderbird **140 or newer**: `thunderjump-<version>.xpi`
   - Thunderbird **91 – 139**: `thunderjump-<version>-tb91-139.xpi`
3. In Thunderbird open **Add-ons and Themes** (Tools menu, or `Ctrl+Shift+A`).
4. Click ⚙ → **Install Add-on From File…** and choose the `.xpi`.
   (Or drag the `.xpi` onto the Add-ons page.)

That's it. Thunderbird checks this repo's releases for new versions and
updates the add-on by itself, like any add-on from the official store. When
you upgrade Thunderbird past 139, the next update check moves you to the 140+
build automatically.

Both files work on 32- and 64-bit Thunderbird, on Windows, macOS and Linux.

## Compatibility

The full test suite (34 end-to-end checks in a real, headless Thunderbird,
including an IMAP account) runs on every change for five key versions (below),
and every week on **the newest release of every major version from 91 up**
(`.github/workflows/compat.yml`), so new Thunderbird releases are tested as
soon as they come out.

| Thunderbird | File to install | Status |
| --- | --- | --- |
| 140 – 157 (incl. 140 ESR, 153 ESR, latest release) | `thunderjump-<version>.xpi` | ✅ all versions pass the full suite |
| 91 – 139 (incl. 91, 102, 115, 128 ESR) | `thunderjump-<version>-tb91-139.xpi` | ✅ all versions pass the full suite |
| 78 and older | – | ❌ not supported (missing APIs the add-on needs) |

Last full run: October 2026, the newest release of all 35 major versions from
91.13.1 to 157.0.1 passed 34/34 (see the *Compatibility* workflow under
Actions). On every change, CI also runs 157 (latest release), 153 ESR
(latest ESR), 140.7.1esr, 115.5.1 and 91.13.1.

Also confirmed by hand on a real desktop: the latest Thunderbird release.
Please open an issue with your Thunderbird version if something doesn't work.

Differences on older versions:

- Thunderbird **91–139**: **Shift+Enter** opens the folder in the current
  tab where Thunderbird doesn't let add-ons open new mail tabs (before 121).
- Thunderbird **91–102**: when exporting settings, Thunderbird may ask where
  to save the file.

## Backup and moving to another computer

Open the options (type `:backup` in the palette):

- **Export settings…** saves a `.json` file with your saved shortcuts
  (`j1`, `:j name`), settings, recent folders and key bindings.
- **Import settings…** restores such a file. Shortcuts are merged in. If the
  folder IDs differ (another computer, or a new profile), shortcuts are
  matched by folder path.
- **Automatic backup** (off by default) keeps
  `thunderjump-backup.json` in your Downloads folder up to date whenever
  something changes. It asks for permission to save files the first time.

Thunderbird deletes an add-on's settings when you remove it, and it gives the
add-on no chance to ask first. The backup file is not deleted, though. When
you install the add-on again, a welcome page opens with a **Restore from
backup…** button.

## Opening it

| Key | What it does |
| --- | --- |
| `Ctrl+Shift+Space` | Spotlight: a palette centered over the mail window |
| `Alt+Shift+J` | The same palette as a popup from the toolbar button |

To change them, type `:keys` in the palette (or open the add-on's options).
Click a box and press the new keys. You can also give `j1`–`j5` their own
keys there, to jump without opening the palette.

When you jump, the folder pane on the left opens if it was hidden. The parent
folders expand and the pane scrolls to the folder. You can turn this off in
the options.

## Typing in the palette

| Input | Result |
| --- | --- |
| `inv` | Fuzzy-search every folder in every account (recent folders rank higher) |
| *(empty)* | Your shortcuts and recent folders |
| *(while searching)* | An exact name match first, then matching recent folders, then the rest |
| `j1`, `j2` … | Jump to numbered shortcut 1, 2 … |
| `:j name` | Jump to the shortcut called `name` (`:j` or `:jl` lists them all) |
| `:jj1`, `:jj name` | Save the **current** folder as shortcut `1` / `name` |
| `:jj name = query` | Save a searched folder as shortcut `name` |
| `:jd name` | Delete a shortcut |
| `:new A/B` | Create `A`, then `B` inside it, in the current folder |
| `clients > Acme/2026` | Find the parent folder `clients`, create `Acme/2026` inside it |
| `> Projects` | Create `Projects` at the top level of an account |
| `:keys` | Change keyboard shortcuts and settings |
| `:backup` | Export / import settings, automatic backup |
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
- `downloads` (optional, asked only if you turn on automatic backup): save
  the backup file to your Downloads folder

## Development

```sh
npm test              # unit tests (Node 22, fake Thunderbird APIs)
npm run test:tb       # end-to-end inside real headless Thunderbird (140.7.1esr by default)
npm run lint          # web-ext lint (Firefox-only API warnings are expected)
npm run check-lines   # every file must stay under 300 lines
npm run build         # dist/thunderjump-<version>.xpi and -tb91-139.xpi
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
`sh scripts/fetch-thunderbird.sh latest-release` (or `latest-esr`, `115.5.1`,
…). On Thunderbird 91–139 the runner automatically tests the Manifest V2
build. `sh scripts/list-thunderbird-versions.sh` prints every version the
weekly compatibility run covers.

`src/tb/compat.js` holds the differences between Thunderbird versions (no
folder ids before 121, different tab and folder fields, missing calls in
older releases), and `scripts/manifest-mv2.mjs` derives the 91–139 build's
manifest from `manifest.json`.

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

### Releasing

```sh
sh scripts/release.sh 1.0.1   # bumps the version, commits, tags v1.0.1, pushes
```

Or bump the version in `manifest.json` on `main` and press **Run workflow** on
the *Release* workflow in the Actions tab; it creates the tag for you.

Either way `.github/workflows/release.yml` runs. It runs the whole CI suite
(including real Thunderbird + IMAP), then publishes a GitHub release with the
`.xpi` and `updates.json`. Installed copies pick up the update through
`update_url` in `manifest.json`.
