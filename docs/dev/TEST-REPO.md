# Flatpak test repository

Icefin's test builds are published to the **Icesuite test repository**,
[Stealthx3/icesuite-test](https://github.com/Stealthx3/icesuite-test), served by GitHub Pages at
<https://stealthx3.github.io/icesuite-test/>. It serves every Icesuite app in several formats (Flatpak, `.deb`, and
later Android and Windows) from one place; users add each platform's remote once (`docs/INSTALL.md`). It started as
`icefin-flatpak-test`, a Flatpak-only remote for Icefin; the move is described in its `docs/MIGRATION.md`. It is a
stopgap before PLAN 12.1's stable and nightly repositories.

## What is in it
- `main`: the publisher (`tools/icesuite.py`), the app catalog (`catalog/icefin-player.json`), `config.json`, icons and
  the public key (`keys/icesuite-test.gpg`).
- `gh-pages`: the generated site, replaced by **one parentless commit** on every publish, so build objects never pile up
  in history. The Flatpak repository is `flatpak/repo/` (refs `app/io.github.stealthx3.IcefinPlayer/x86_64/master` and
  its `.Locale`, each commit and the summary signed), with `flatpak/icesuite-test.flatpakrepo` and
  `flatpak/io.github.stealthx3.IcefinPlayer.flatpakref`.

## Signing key
"Icefin Player test repository", ed25519, fingerprint `532C A3B2 8FBA 72FC 9C9F 369C 1CD5 3BAD 4D48 EB54`, expires
2028-11-11 (kept from the Flatpak-only days, so existing installs keep trusting it). The private key lives only in the
lab guest at `~/icefin-test-gpg` (`GNUPGHOME`). Losing it means a new key, and every user re-adding the remote. It has
no passphrase, because only the lab uses it; it never goes in a repository.

## Publishing a new build
Every build that lands on `main` is published here (the user's rule, 2026-11-12), not only alpha releases: after a
merge, or a batch of merges, build the Flatpak in the lab from `main` and publish it, with the version and the commit
it was built from. A worktree needs `git submodule update --init external/mpvqt` before `scripts/lab.sh push`, or the
Flatpak build can't find mpvqt's sources. The full guide is the repository's `docs/PUBLISHING.md`.

In the lab guest, after `flatpak-builder --repo=$HOME/fp-repo …` (`docs/LAB.md`):
```bash
export GNUPGHOME=$HOME/icefin-test-gpg ICESUITE_SITE=$HOME/icesuite-site
git clone https://github.com/Stealthx3/icesuite-test.git ~/icesuite-test   # once; later: git -C ~/icesuite-test pull
cd ~/icesuite-test
tools/icesuite.py sync
tools/icesuite.py publish-flatpak --app icefin-player --src-repo ~/fp-repo --version 0.1.0-alpha.3 --commit abc1234
tools/icesuite.py check
```
`publish-flatpak` copies the app and its `.Locale`, signs each commit, updates the summary and the shared appstream,
and keeps the last three commits of each ref (`flatpak update --commit=` can roll back).

The guest has no GitHub credentials: push from the host. Copy the guest's `~/icesuite-site` to the host
(`scripts/lab.sh pull /home/lab/icesuite-site/ <folder>`), then, from a checkout of the repository's `main`:
```bash
tools/icesuite.py --site <folder> push
```
`push` commits the site as one parentless commit and force-pushes `gh-pages` with a lease: if someone published since
the `sync`, it refuses instead of overwriting their build (`sync --force`, publish again, push). Pages redeploys in about
a minute, but clients can see the new build up to 10 minutes late (Pages' cache). Check from a host with
`flatpak remote-info --user icefin-test io.github.stealthx3.IcefinPlayer` (or `icesuite-test`, the name new installs
use). The site must stay under 950 MB with no file of 100 MB or more; `check` warns first.
