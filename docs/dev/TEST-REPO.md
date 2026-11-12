# Flatpak test repository

The test repository is a signed Flatpak remote (OSTree, `archive-z2`) with alpha and test builds. GitHub Pages serves it from
[Stealthx3/icefin-flatpak-test](https://github.com/Stealthx3/icefin-flatpak-test) at
<https://stealthx3.github.io/icefin-flatpak-test/>. Users add it with `icefin-test.flatpakrepo` (`docs/INSTALL.md`).
It is a stopgap before PLAN 12.1's stable and nightly repositories.

## What is in it
- `repo/`: refs `app/io.github.stealthx3.IcefinPlayer/x86_64/master` and its `.Locale` runtime (no `.Debug`), plus
  appstream. Each commit, and the summary, is signed.
- `icefin-test.flatpakrepo`, `io.github.stealthx3.IcefinPlayer.flatpakref`: Flathub as the runtime repo, and the public key
  embedded (`GPGKey`).
- `index.html` (install page), `README.md`, `icon.svg` (the installed app icon), `icefin-test.gpg`, `.nojekyll`.

## Signing key
"Icefin Player test repository", ed25519, fingerprint `532C A3B2 8FBA 72FC 9C9F 369C 1CD5 3BAD 4D48 EB54`, expires
2028-11-11. The private key lives only in the lab guest at `~/icefin-test-gpg` (`GNUPGHOME`). Losing it means a new
key, and every user re-adding the remote. It has no passphrase, because only the lab uses it; it never goes in a
repository.

## Publishing a new build
In the lab guest, after `flatpak-builder --repo=$HOME/fp-repo …` (`docs/LAB.md`):
```bash
export GNUPGHOME=$HOME/icefin-test-gpg KEY=532CA3B28FBA72FC9C9F369C1CD53BAD4D48EB54
git clone git@github.com:Stealthx3/icefin-flatpak-test.git ~/pub-site   # or pull the copy you have
for r in app/io.github.stealthx3.IcefinPlayer/x86_64/master runtime/io.github.stealthx3.IcefinPlayer.Locale/x86_64/master; do
  flatpak build-commit-from --src-repo=$HOME/fp-repo --gpg-sign=$KEY --gpg-homedir=$GNUPGHOME --subject="<version>" ~/pub-site/repo $r
done
flatpak build-update-repo --gpg-sign=$KEY --gpg-homedir=$GNUPGHOME --title="Icefin Player (test)" \
  --comment="Test builds of Icefin Player" --homepage=https://github.com/Stealthx3/icefin-player --default-branch=master \
  --prune --prune-depth=3 ~/pub-site/repo
```
Then commit and push `~/pub-site` (from the host if the guest has no GitHub credentials). Pages redeploys within a minute,
and `flatpak update` picks the build up. Keep `--prune-depth` small: GitHub Pages sites are limited to 1 GB and files to
100 MB (the largest object today is about 89 MB).
