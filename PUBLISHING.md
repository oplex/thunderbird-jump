# Publishing ThunderJump on addons.thunderbird.net

addons.thunderbird.net (ATN) is Thunderbird's official add-on site. Add-ons
listed there show up when people search in Thunderbird's Add-ons Manager,
and ATN delivers updates itself.

Every GitHub release has two files made for ATN (their self-update URL is
removed, because ATN handles updates):

| File | For |
| --- | --- |
| `thunderjump-<version>-atn.xpi` | Thunderbird 140 and newer |
| `thunderjump-<version>.91-atn-tb91-139.xpi` | Thunderbird 91 – 139 (own version number, `<version>.91`) |

ATN gives each Thunderbird the newest version that fits it, so uploading both
covers every supported version.

## First time (about 20 minutes, then a review)

1. Go to <https://addons.thunderbird.net/developers/> and log in or create an
   account.
2. **Submit a New Add-on** → **On this site** (a listed add-on).
3. Upload `thunderjump-<version>-atn.xpi` from the
   [latest release](https://github.com/oplex/thunderjump/releases/latest).
   The validator may warn about permissions; that is expected.
4. Source code: answer **No**. The add-on is plain, unminified JavaScript with
   no build step, so reviewers can read the uploaded file directly.
5. Fill in the listing (text to paste is below), choose a category and a
   license, and add screenshots.
6. Submit. Listed add-ons get a human review, which can take from a few days
   to a few weeks. You get an email when it's approved.
7. Then **Manage → Upload New Version** with
   `thunderjump-<version>.91-atn-tb91-139.xpi` for Thunderbird 91–139.

## Every new release

1. Release as usual (Actions → *Release* → *Run workflow*, after bumping the
   version in `manifest.json`).
2. Download the two `-atn` files from the new GitHub release.
3. On ATN: **Manage → Upload New Version**, once for each file.

## Listing text

**Name:** ThunderJump

**Summary** (max 250 characters):

> Spotlight-style folder jumper: press a key, type a few letters, Enter.
> Shortcuts (j1, :j name), quick folder creation, optional message moving
> with undo, and a Manager page with faceted search.

**Description:**

> Jump to any folder in any account in a second. Press Ctrl+Shift+Space, type
> part of a folder name and press Enter: the folder opens and the folder pane
> scrolls to it.
>
> - Fuzzy search across all accounts; recent folders first
> - Save shortcuts: :jj1 or :jj work, then j1 or :j work to jump
> - Create folders on the fly: "clients > Acme/2026"
> - Optional: move selected messages (Alt+Shift+M, right-click, or drag and
>   drop in the Manager), with confirm and undo
> - ThunderJump Manager (Alt+Shift+F): search mail and folders with filters
>   and facets (folder, sender, year), move in bulk
> - Rebind every key, export/import settings, automatic backup file
>
> Safe by default: out of the box ThunderJump only reads folders and changes
> which folder is shown. Moving messages is off until you turn it on, and
> every move can be undone.
>
> Works with Thunderbird 91 to the latest release. Tested on every major
> version in real Thunderbird builds.

**Category:** Folders and Filters (or Message and News Reading)

**Support site:** <https://github.com/oplex/thunderjump/issues>

**Homepage:** <https://github.com/oplex/thunderjump>

**Privacy policy** (ATN asks when an add-on can read mail):

> ThunderJump does not collect, send or share any data. It makes no network
> requests. Shortcuts, settings, recent folders and the move history are kept
> in the add-on's own storage inside your Thunderbird profile. Message
> contents are only read when you search in the ThunderJump Manager, and
> only to show the results on your screen.

**Why each permission is needed** (for the review notes):

- `accountsRead`: list accounts and folders for the search
- `accountsFolders`: create folders, only when the user asks
- `storage`: keep shortcuts, settings and move history
- `menus`: the right-click items
- optional `messagesRead`, `messagesMove`: only after the user turns on
  moving or searches messages; used to move the selected messages and to
  undo moves
- optional `downloads`: only for the opt-in automatic backup file

**Screenshots:** the Manager, the palette, and the palette in move mode.
ATN accepts PNG or JPG.

## Notes

- **Name:** Thunderbird's trademark rules don't allow "Thunderbird" in an
  add-on's name, which is one reason the add-on is called ThunderJump. The
  logo is original and doesn't use the Thunderbird bird.
- **License:** choose **MIT License** in the ATN form (see `LICENSE`; the
  file is also included in every `.xpi`).
- **GitHub vs ATN installs:** copies installed from GitHub keep updating from
  GitHub, and copies from ATN update from ATN. To switch, export your
  settings (`:backup`), remove the add-on, install it from ATN, and import
  them.
