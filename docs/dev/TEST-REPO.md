# Test repository

Icefin's test builds are published to the shared Icesuite test repository,
[Stealthx3/icesuite-test](https://github.com/Stealthx3/icesuite-test), served by GitHub Pages at
<https://stealthx3.github.io/icesuite-test/>. It holds every Icesuite app in one signed Flatpak remote (`icesuite-test`),
plus an APT repository, an F-Droid repository and Windows pre-releases for apps that ship those. Users add it from
`docs/INSTALL.md`. It is a stopgap before PLAN 12.1's stable and nightly repositories.

Until 2026-11-14 it was `Stealthx3/icefin-flatpak-test`, Flatpak only, at `/icefin-flatpak-test/` with the OSTree repo
at `/repo/`. The objects and signatures moved unchanged to `/flatpak/repo/`; old remotes need one
`flatpak remote-modify --url` (`docs/INSTALL.md`).

## What is in it for Icefin
- `flatpak/repo/`: refs `app/io.github.stealthx3.IcefinPlayer/x86_64/master` and its `.Locale` runtime (no `.Debug`),
  plus the shared appstream. Every commit, and the summary, is signed.
- `flatpak/icesuite-test.flatpakrepo` (the remote, Flathub as the runtime repo, the public key embedded) and
  `flatpak/io.github.stealthx3.IcefinPlayer.flatpakref`.
- Icefin's entry in icesuite-test's `catalog/icefin-player.json` (name, links, notes on the install page, Flatpak app ID,
  `.deb` package name). Change install-page text there, not on the site.

The site lives on icesuite-test's `gh-pages` branch, replaced by one parentless commit per publish; the tooling, catalog
and docs live on its `main` (`docs/PUBLISHING.md` there is the full guide).

## Signing key
"Icefin Player test repository", ed25519, fingerprint `532C A3B2 8FBA 72FC 9C9F 369C 1CD5 3BAD 4D48 EB54`, expires
2028-11-11. It now signs the whole Icesuite test repository (Flatpak and APT). The private key lives only in the lab
guest at `~/icefin-test-gpg` (`GNUPGHOME`). Losing it means a new key, and every user re-adding the remote. It has no
passphrase, because only the lab uses it; it never goes in a repository.

## Publishing a new build
Every build that lands on `main` is published (the user's rule, 2026-11-12), not only alpha releases: after a merge, or
a batch of merges, build the Flatpak in the lab from `main` and publish it. A worktree needs
`git submodule update --init external/mpvqt` before `scripts/lab.sh push`, or the Flatpak build can't find mpvqt's
sources.

In the lab guest, after `flatpak-builder --repo=$HOME/fp-repo …` (`docs/LAB.md`), with icesuite-test's `main` checked
out at `~/icesuite-test` (once: `git clone https://github.com/Stealthx3/icesuite-test.git ~/icesuite-test`):
```bash
export GNUPGHOME=$HOME/icefin-test-gpg
cd ~/icesuite-test && git pull
tools/icesuite.py sync
tools/icesuite.py publish-flatpak --app icefin-player --src-repo ~/fp-repo \
  --version 0.1.0-alpha.2 --commit 2aa81e9 --notes "<one line: what changed>"
tools/icesuite.py push
```
The version and commit appear on the install page and in the commit subject
(`Icefin Player 0.1.0-alpha.2 (2aa81e9)`). `push` force-pushes `gh-pages` with a lease: if another publish landed since
`sync`, it refuses; run `sync --force`, publish again and push. If the guest has no GitHub credentials, run `sync` and
`push` on the host against a copy of `~/icesuite-site` (HTTPS with the `gh` credential helper the main repository uses).

Then check from a host with `flatpak remote-info --user icesuite-test io.github.stealthx3.IcefinPlayer` (or
`icefin-test` on a machine that kept the old remote name). Pages redeploys within a minute and caches files for up to
ten; `flatpak update` picks the build up.

## Limits
GitHub Pages sites are limited to 1 GB and files to 100 MB (Icefin's largest object today is about 89 MB). The tool
refuses to push over its 950 MB budget or any 100 MB file. Icefin's Flatpak at prune depth 3 is about 210 MB of that,
shared with every other Icesuite app; lower `flatpak.prune_depth` in icesuite-test's `config.json` if space runs out.
