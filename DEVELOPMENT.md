# Developing ThunderJump

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

## Layout

```
manifest.json
src/background/   keyboard commands, spotlight window
src/lib/          pure logic: fuzzy matching, input parser, row building
src/tb/           Thunderbird API wrappers: folders, tabs, storage
src/palette/      palette UI: controller, rendering, actions
src/options/      options page
src/manager/      ThunderJump Manager (faceted search, bulk move)
test/             unit tests and the real-Thunderbird integration harness
```

## Publishing on addons.thunderbird.net

See [PUBLISHING.md](PUBLISHING.md). Each release includes ready-made `-atn`
files for it.

## Releasing

```sh
sh scripts/release.sh 1.0.1   # bumps the version, commits, tags v1.0.1, pushes
```

Or bump the version in `manifest.json` on `main` and press **Run workflow** on
the *Release* workflow in the Actions tab; it creates the tag for you.

Either way `.github/workflows/release.yml` runs. It runs the whole CI suite
(including real Thunderbird + IMAP), then publishes a GitHub release with the
`.xpi` and `updates.json`. Installed copies pick up the update through
`update_url` in `manifest.json`.


## Website

`site/` is the GitHub Pages site (<https://oplex.github.io/thunderjump/>).
The *Website* workflow publishes it with the images from `listing/` on every
push that changes them. One-time setup: Settings → Pages → Source: *GitHub
Actions*. The comparison page (`site/nostalgy-alternative.html`) holds dated
figures from addons.thunderbird.net; refresh them when they go stale.
