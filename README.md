<p align="center"><img src="icons/thunderjump.svg" alt="ThunderJump logo" width="112"></p>

# ThunderJump

A Spotlight-style folder jumper for Thunderbird, in the spirit of Nostalgy.
Press a key, type a few letters, hit Enter, and you are in the folder.

**Website:** <https://oplex.github.io/thunderjump/> ·
[Nostalgy alternative: comparison](https://oplex.github.io/thunderjump/nostalgy-alternative.html) ·
[Add to Thunderbird](https://addons.thunderbird.net/thunderbird/addon/thunderjump/)

**Why another one?** Nostalgy and similar add-ons rely on Thunderbird
internals, so every big Thunderbird release can break them, and you wait for an
update that may come weeks later or never. ThunderJump uses only the official
MailExtension APIs. It is small enough to read in an afternoon, and its tests
run inside real Thunderbird builds, from 91 to the newest release. When a new
release changes something, CI shows it right away and the fix is usually a
few lines.

**Safe by default.** Out of the box ThunderJump is read-only: it never moves,
copies, deletes or changes messages, and never renames or deletes folders. It
only changes which folder is shown, and creates a **new folder** when you ask.
Moving messages is an option you turn on yourself, and every move can be
undone.

## Install

1. Check your version under **Help → About Thunderbird**.
2. Download the matching file from the
   [latest release](https://github.com/oplex/thunderjump/releases/latest):
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

The full test suite (43 end-to-end checks in a real, headless Thunderbird,
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
91.13.1 to 157.0.1 passed all checks (see the *Compatibility* workflow under
Actions). On every change, CI also runs 157 (latest release), 153 ESR
(latest ESR), 140.7.1esr, 115.5.1 and 91.13.1.

Also confirmed by hand on a real desktop: the latest Thunderbird release.
Please open an issue with your Thunderbird version if something doesn't work.

Differences on older versions:

- Thunderbird **91–139**: **Shift+Enter** opens the folder in the current
  tab where Thunderbird doesn't let add-ons open new mail tabs (before 121).
- Thunderbird **91–102**: when exporting settings, Thunderbird may ask where
  to save the file.

## Moving messages (optional)

Turn it on in the options (type `:keys` in the palette → *Moving messages*).
Thunderbird asks once for permission to read and move messages.

- **Spotlight style:** select messages and press **`Alt+Shift+M`**. The palette
  shows what you're moving ("Moving 3 messages from Inbox" plus the subjects).
  Type part of a folder name and press Enter. `j1`, `:j name` and `Alt+1…9`
  work as targets too, and folders you often move to are listed first.
- **Type it:** in the palette, `move inv` (or `mv inv`, `:m inv`) switches to
  moving the selected messages and searches `inv` as the target.
- **Into a new folder:** while moving, `clients > Acme {YYYY}` creates the
  folder and moves the messages into it.
- **Copy, tags and suggestions** (each off until you turn it on in the
  options, under *Moving messages*):
  - **Copy:** `Alt+Shift+C`, `copy inv` or right-click → *Copy with
    ThunderJump…*. Copies can't be undone, since that would mean deleting mail.
  - **Tags:** `Alt+Shift+T`, `tag imp` or right-click → *Tag with
    ThunderJump…*. Enter adds the tag, or takes it off if every selected
    message has it. `Ctrl+Z` undoes it.
  - **Suggested folders:** while moving, a *Suggested* list comes first. It
    combines your rules ("sender or subject contains `acme` → *Clients ›
    Acme*"; add them in the options or with `:rule acme = clients acme`) and
    where earlier mail from the same sender went.
- Account roots, saved searches and the folder the messages are already in
  are shown grayed out with the reason; they can't be picked.
- **Right-click style:** right-click the selected messages →
  **Move with ThunderJump…**, or **Move to ▸** your shortcuts and recent
  targets for a one-click move.
- **Ask before each move** (option): Enter first shows "Move 3 messages from
  Inbox to Archive?", and a second Enter moves them.
- **Undo:** **`Ctrl+Z`** in the palette (or the *Undo* row at the top of it),
  **`Alt+Shift+Z`** anywhere, right-click → *Undo last ThunderJump move*, or
  the move history in the options. Moves are logged in the add-on's own
  storage, and undo finds the messages again by their Message-ID.

## ThunderJump Manager

A full page for finding things. Open it with **`Alt+Shift+F`**, the
**🔍 Manager** button at the top of the palette (toolbar button), right-click
on the toolbar button, **Tools → ThunderJump Manager**, or `:manage`.

- **Messages:** type to search by subject or sender (or everything, including
  the body), and filter by date (today, 7 or 30 days, this year, older),
  unread, flagged, attachment and account.
- **Facets:** after each search, counts by **folder**, **sender** and
  **year**. Click one to narrow the results; it becomes a removable chip.
- **Folders:** fuzzy-search every folder; **Open** jumps to it, **Messages
  here** limits the message search to that folder.
- **Bulk move:** tick messages (Shift+click selects a range, **Select all**),
  press **Move to…** (or `m`), and pick the folder the same way as in the
  palette. Or **drag** them onto a folder under *Drop to move* (your
  shortcuts and recent targets) or onto a folder facet; clicking a *Drop to
  move* folder moves the selection too. An **Undo** button appears after
  each move.
- Keys: `/` jumps to the search box, `Esc` clears the selection, double-click
  opens a message.

Searching only reads your mail (Thunderbird asks once for permission to read
messages). Moving uses the same opt-in, undoable moves as the palette.

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

## Right-click a folder

Right-click any folder in the folder pane → **ThunderJump**:

- **Save as j1 … j9**: each slot shows what it points to now (`✓` = this folder)
- **Save as named shortcut…**: opens the palette with `:jj ` ready for a name
- **Remove shortcut …**: only the shortcuts that point to this folder
- **New subfolder…**: opens the palette to type the name (`/` nests, date patterns work)
- **Search messages here**: opens the Manager limited to this folder

## Date patterns in new folder names

Anywhere you create a folder, parts in braces become the date and time:

| Pattern | Today, 7 Mar 2026 14:05 |
| --- | --- |
| `{YYYY}` `{YY}` `{MM}` `{M}` `{MMM}` | `2026` `26` `03` `3` `Mar` |
| `{DD}` `{D}` `{HH}` `{mm}` `{ss}` | `07` `7` `14` `05` `09` |
| `{WW}` `{Q}` | `10` (ISO week) `1` (quarter) |
| `{YYYYMMDD}` `{YYYYMMDDHHMM}` | `20260307` `202603071405` (MM after HH = minutes) |

For example `archive > {YYYY}/{MM}` or `:new Call {YYYY-MM-DD}`. The palette
shows the filled-in name before you press Enter. Text outside braces is never
changed.

## Opening it

| Key | What it does |
| --- | --- |
| `Ctrl+Shift+Space` | Spotlight: a palette centered over the mail window |
| `Alt+Shift+J` | The same palette as a popup from the toolbar button |
| `Alt+Shift+F` | ThunderJump Manager (search mail and folders) |
| `Alt+Shift+M` | Move the selected messages (when moving is on) |
| `Alt+Shift+Z` | Undo the last move |

**Lite mode** (on by default): the spotlight window is made once and kept
minimized between uses, so it opens in about 20 ms instead of about 300 ms.
Turn it off in the options if you'd rather not have the minimized window.

To see and change them, type `:keys` in the palette, click ⚙ in the palette,
right-click the toolbar button → *ThunderJump settings*, or Add-ons Manager →
ThunderJump → Options. Click a box and press the new keys. Function keys work
alone (`F2`); letters need `Ctrl` or `Alt`, because Thunderbird doesn't let
add-ons take plain letter keys like Nostalgy's `g`. You can also give `j1`–`j5` their own
keys there, to jump without opening the palette.

When you jump, the folder pane on the left opens if it was hidden. The parent
folders expand and the pane scrolls to the folder. You can turn this off in
the options.

## Typing in the palette

| Input | Result |
| --- | --- |
| `inv` | Fuzzy-search every folder in every account (recent folders rank higher) |
| *(empty)* | Your shortcuts and recent folders (**Clear** next to a heading empties that list) |
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
| `:move` | Move the selected messages (when moving is on) |
| `move inv` | Move the selected messages, searching `inv` as the target |
| `{YYYY}` … | Date patterns in new folder names (see above) |
| `:undo` | Undo the last move |
| `:s invoice` | Search mail in the current folder (`:sa invoice`: all folders), in the Manager |
| `:manage` | Open the ThunderJump Manager |
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
| `Backspace` (empty input) | Leave create or move mode |
| `Delete` (or the × on hover) | Remove the highlighted item from Shortcuts, Recent or Recently moved to |

After creating a folder it jumps there (you can turn that off in the options).
The options page also lists and deletes shortcuts.

## Permissions

- `accountsRead`: list accounts and folders, show the current folder
- `accountsFolders`: create folders (only when you ask)
- `storage`: keep your shortcuts and recent folders
- `menus`: the right-click items on messages and folders
- `downloads` (optional, asked only if you turn on automatic backup): save
  the backup file to your Downloads folder
- `messagesRead`, `messagesMove` (optional, asked only if you turn on moving):
  see the selected messages, move them, and find them again for undo

## Development

Tests, layout, building and releasing: see [DEVELOPMENT.md](DEVELOPMENT.md).

## License

[MIT](LICENSE) © 2026 oplex.se
