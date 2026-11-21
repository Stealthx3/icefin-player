# Steam Shortcut Standard (v1)

> **Instruction to Claude:** If this file is in a project that ships a Linux desktop app as a Flatpak (every
> IceSuite client: IceBreaker, IceFin Player and any later one), the app must be able to **add itself to
> Steam with its full art kit**, so nobody sets the capsule, hero, logo and icon by hand. Run the pre-work
> process in §3, build what §4–§6 describe and keep it working for the rest of the project. Nobody has to
> ask again. If the project has no desktop app (a server, a plugin, a web theme), log "Steam Shortcut
> Standard: not applicable" in `docs/DECISIONS.md` and stop.

---

## 1. What it is

Flatpak has no install scripts, and a sandboxed app cannot see Steam's folders unless its manifest grants
it. So the art cannot arrive "with the installer". It arrives with the **app**: the Flatpak carries its
Steam art, and the app offers **Add to Steam**, which writes the shortcut and copies the art into Steam.

| Part | Where it lives | What it does |
| --- | --- | --- |
| Art kit | `packaging/steam/*.png` in the app repo, installed to `/app/share/<APP_ID>/steam/` | The five Steam images, exported from the IceSuite brand kit (§4) |
| Config | `packaging/steam/steam-shortcut.json` | App ID, display name, tags, art file names (§4) |
| Helper | `packaging/steam/add_to_steam.py`, installed as `/app/bin/<APP_ID>-steam` | Adds, refreshes and removes the shortcut; vendored from `tools/steam-shortcut/` in ai-assets |
| Permissions | the Flatpak manifest's `finish-args` | Lets the sandbox reach Steam's `userdata/` (§5) |
| App UI | the app's first-run screen and settings | Offers Add, Update art and Remove, and asks the user to close Steam first (§6) |

## 2. Scope

- **Covers:** Flatpak apps on Linux desktops and Steam Deck, with native Steam or Steam itself installed
  as a Flatpak (`com.valvesoftware.Steam`).
- **Doesn't cover (v1):** Windows (the IceSuite manager may reuse the same steps later), Snap or AppImage
  builds, and adding apps from Steam's side (Decky plugins, Steam ROM Manager).
- **Art only comes from the brand kit.** The images are the exports in
  `IceSuite/<Project>/brand/deployment/steam/`. They are generated from the SVG masters and are never
  redrawn or hand-edited in the app repo. A new look means a new brand-kit export, copied over.

## 3. Pre-work process (what Claude does, once per project)

1. **Check the project is in scope** (§2). If not, log it as not applicable and stop.
2. **Read the app's identity:** the Flatpak app ID (reverse DNS; IceFin Player's is `io.github.stealthx3.IcefinPlayer`, its D13), the
   display name as the brand kit spells it, and the command the app's `.desktop` file runs. If the app ID
   is still undecided (`APPID` in the brand kit), ask the owner. It sets the config, the install path and
   the shortcut's launch options.
3. **Copy the art kit** from the project's `brand/deployment/steam/` into `packaging/steam/` (§4).
4. **Vendor the helper:** copy `tools/steam-shortcut/add_to_steam.py` from ai-assets into
   `packaging/steam/`, unchanged. Its `VERSION` must match this standard's version.
5. **Write `packaging/steam/steam-shortcut.json`** (§4).
6. **Wire the manifest:** add the install module and the `finish-args` (§5), with the Flathub
   justification in the submission notes.
7. **Build the UI** (§6), using whatever toolkit the app already uses. It calls the helper and reads its JSON.
8. **Test** (§8) and run the done checklist (§10).
9. **Log** the adoption, the app ID used and any owner decision in `docs/DECISIONS.md`. Add this
   standard to `docs/standards/` and name it in `CLAUDE.md`.

## 4. Art kit and config

Copy these five files from the brand kit. Steam's grid names are fixed; the helper renames on copy.

| Brand kit file | Size | Steam grid file | Where Steam shows it |
| --- | --- | --- | --- |
| `capsule-600x900.png` | 600×900 | `<id>p.png` | Library grid (portrait capsule) |
| `header-920x430.png` | 920×430 | `<id>.png` | Recent games, Big Picture, wide tiles |
| `hero-3840x1240.png` | 3840×1240 | `<id>_hero.png` | Banner behind the game page (no text, S-021) |
| `logo-1280x720.png` | 1280×720 | `<id>_logo.png` | Transparent logo over the hero |
| `icon-256.png` | 256×256 | `<id>_icon.png` | Library list icon; the shortcut's `icon` field points at it |

`<id>` is the shortcut ID the helper computes (§7). Keep the brand kit's file names in the repo so a
fresh export can be copied over without renaming.

`packaging/steam/steam-shortcut.json`:

```json
{
  "app_id": "io.github.stealthx3.IcefinPlayer",
  "name": "IceFin Player",
  "launch_args": "",
  "tags": ["IceSuite"],
  "art": {
    "capsule": "capsule-600x900.png",
    "header": "header-920x430.png",
    "hero": "hero-3840x1240.png",
    "logo": "logo-1280x720.png",
    "icon": "icon-256.png"
  }
}
```

- `app_id` and `name` are required. `name` is the brand-kit spelling (IceSuite casing, S-002).
- `launch_args` is added after `flatpak run <app_id>`. Use it for a Game Mode flag if the app has one
  (e.g. `--fullscreen`); otherwise leave it empty.
- `tags` become Steam collections. Always include `IceSuite`, so the suite's apps group together.
- Art paths are relative to the config file.

## 5. Packaging

Install the helper, the config and the art in one module (Flatpak manifest, YAML):

```yaml
modules:
  - name: steam-shortcut
    buildsystem: simple
    build-commands:
      - install -Dm755 add_to_steam.py ${FLATPAK_DEST}/bin/${FLATPAK_ID}-steam
      - install -Dm644 -t ${FLATPAK_DEST}/share/${FLATPAK_ID}/steam steam-shortcut.json
          capsule-600x900.png header-920x430.png hero-3840x1240.png logo-1280x720.png icon-256.png
    sources:
      - type: dir
        path: packaging/steam
```

Grant only Steam's folders, never `home`:

```yaml
finish-args:
  - --filesystem=~/.steam:rw
  - --filesystem=~/.steam/steam:rw
  - --filesystem=~/.var/app/com.valvesoftware.Steam:rw
```

- These are the same three paths Heroic Games Launcher uses on Flathub for its "Add to Steam"
  feature, which is the precedent to cite in the submission. Justification text: "Writes this app's
  own non-Steam shortcut and its library artwork into Steam's userdata, on the user's request only."
- The helper needs `python3`. The freedesktop, GNOME and KDE runtimes ship it. Confirm with
  `flatpak run --command=python3 <runtime>//<branch> --version`. If the app's runtime lacks it, port the
  helper to the app's language using §7 as the spec, and keep the same commands and JSON output.
- If the owner doesn't want the permission in the default manifest, ship everything else and document
  the opt-in: `flatpak override --user --filesystem=~/.steam:rw <APP_ID>` (same three paths). The UI
  then shows "Steam folder not reachable" with that command instead of the Add button (§6).

## 6. App behaviour

| When | What the app does |
| --- | --- |
| First run | If `status` finds Steam and no shortcut, offer **Add to Steam** once. "Not now" is remembered; the offer never comes back by itself. |
| Settings | Always show the state from `status`: **Add to Steam** / **Update art** / **Remove from Steam**. |
| Add or Remove | Ask the user to quit Steam completely (including the tray icon) and confirm. Then run the helper with `--yes`. |
| After Add or Remove | Say "Start Steam to see it", and list the Steam installs and accounts the helper changed. |
| Every app start | Run `refresh` silently. It only re-copies art for an existing shortcut, so an app update that brings new art reaches Steam with no prompt. It never touches `shortcuts.vdf` and is safe while Steam runs. |
| Flatpak Steam found | Before adding, tell the user that Steam (Flatpak) needs permission to start other Flatpak apps, and show the one-line command (§7). |
| Steam not found | Hide the setting, or show "Steam not found" with the opt-in override if §5's permission isn't granted. |

Rules:

- **Never write without consent.** Add and Remove happen only after a user click. Refresh is the only
  silent operation, and only for a shortcut the user already added.
- **Steam must be closed for Add and Remove.** A running Steam rewrites `shortcuts.vdf` from memory, which
  drops the change. Inside the sandbox the helper can't see host processes, so the UI's confirmation is
  the check. Without `--yes` the helper refuses (exit 3).
- **Uninstalling the Flatpak can't remove the shortcut** (Flatpak has no uninstall hooks). The app's README
  says so: use **Remove from Steam** before uninstalling, or delete the shortcut in Steam.
- **Show results, not internals.** The helper prints JSON for the app to read. The user sees plain
  sentences, never paths or shortcut IDs.

Helper commands (the app runs `/app/bin/<APP_ID>-steam`):

```bash
"${FLATPAK_ID}-steam" status  --config "/app/share/${FLATPAK_ID}/steam/steam-shortcut.json"
"${FLATPAK_ID}-steam" add     --config "/app/share/${FLATPAK_ID}/steam/steam-shortcut.json" --yes
"${FLATPAK_ID}-steam" refresh --config "/app/share/${FLATPAK_ID}/steam/steam-shortcut.json"
"${FLATPAK_ID}-steam" remove  --config "/app/share/${FLATPAK_ID}/steam/steam-shortcut.json" --yes
```

Exit codes: `0` done, `1` nothing to do (no Steam found, or no shortcut to refresh), `2` config error,
`3` Steam may be running and `--yes` was not given.

## 7. Steam reference (what the helper does)

The spec for porting the helper or checking it.

**Steam installs searched**, in order; duplicates through symlinks are merged:

| Path | Install |
| --- | --- |
| `~/.steam/steam` | Native Steam (usually a symlink to `~/.local/share/Steam`) |
| `~/.local/share/Steam` | Native Steam |
| `~/.var/app/com.valvesoftware.Steam/.local/share/Steam` | Steam as a Flatpak |
| `~/.var/app/com.valvesoftware.Steam/data/Steam` | Steam as a Flatpak (older layout) |

**Per account:** every numeric folder in `userdata/` except `0` (or the one passed with `--user`).
Inside it:

- `config/shortcuts.vdf`: the non-Steam shortcuts, in **binary VDF**. Type bytes: `0x00` map, `0x01`
  NUL-terminated string, `0x02` little-endian int32, `0x08` end of map. Keys are NUL-terminated. The file
  is the map `shortcuts`, whose entries are maps keyed `"0"`, `"1"`, … in order.
- `config/grid/`: the art, named by shortcut ID (§4).

**Shortcut entry written:**

| Key | Native Steam | Flatpak Steam |
| --- | --- | --- |
| `appid` | shortcut ID, as a signed int32 | same |
| `AppName` | config `name` | same |
| `Exe` | `"/usr/bin/flatpak"` (with the quotes) | `"/usr/bin/flatpak-spawn"` |
| `StartDir` | `"/usr/bin/"` | same |
| `LaunchOptions` | `run <app_id> <launch_args>` | `--host flatpak run <app_id> <launch_args>` |
| `icon` | full path of `grid/<id>_icon.png` | same |
| `FlatpakAppID` | config `app_id` | same |
| `tags` | config tags, added to any the user already set | same |

The other keys (`IsHidden`, `AllowOverlay`, `LastPlayTime` and so on) are given Steam's defaults on a new
entry and left alone on an existing one.

- **Shortcut ID:** `crc32(Exe + AppName) | 0x80000000`, as an unsigned 32-bit number in grid file names.
  An existing entry keeps its ID, so the user's play time, collections and art stay attached.
- **Finding our entry:** an entry whose `FlatpakAppID` equals the config `app_id`, or whose `appid` equals
  the computed ID. Key names are compared without case (older Steam wrote `appname`, `exe`), and an
  update never leaves two spellings of one key.
- **Writes are safe:** the old file is kept as `shortcuts.vdf.icesuite-backup` (one rolling copy), and
  the new one is written to a temporary file and renamed into place.
- **Flatpak Steam** runs inside its own sandbox, so it can only start the app through `flatpak-spawn
  --host`, which needs this permission on Steam:
  `flatpak override --user --talk-name=org.freedesktop.Flatpak com.valvesoftware.Steam`.
  The app shows this command; it never runs it.

## 8. Testing

1. **Automated, no Steam needed.** Build a fake Steam root and check add, refresh, remove and status
   against an independent VDF parser (the `vdf` Python package):

```bash
set -euo pipefail
root="$(mktemp -d)/Steam"
mkdir -p "$root/userdata/12345/config"
cfg="packaging/steam/steam-shortcut.json"
python3 packaging/steam/add_to_steam.py add --config "$cfg" --steam-root "$root" --yes
python3 -c "import vdf,sys; d=vdf.binary_loads(open(sys.argv[1],'rb').read()); print(d['shortcuts']['0']['AppName'])" \
  "$root/userdata/12345/config/shortcuts.vdf"
ls "$root/userdata/12345/config/grid"
python3 packaging/steam/add_to_steam.py remove --config "$cfg" --steam-root "$root" --yes
```

   Also test an existing `shortcuts.vdf` with another game in it: that entry, its play time and its
   collections must come through unchanged.
2. **Real Steam, in the VM lab** (VM-LAB-STANDARD): a Linux guest with native Steam, then with Flatpak
   Steam. Add the app, start Steam, and check the library tile, page hero, logo, list icon, the
   `IceSuite` collection and that **Play** launches the app.
3. **Steam Deck or Game Mode:** check the shortcut in Game Mode, and that the controller layout and
   overlay work.
4. **Re-add and update:** Add twice gives one entry. A new art export plus an app start updates the art
   with no prompt.

## 9. Don'ts

- Don't write into Steam at install time, on first launch without a click, or while the user says Steam
  is open.
- Don't ask for `--filesystem=home` or `host`. Only the three Steam paths in §5.
- Don't run `flatpak override` or any permission change for the user. Show the command.
- Don't redraw, resize or recompress the art in the app repo. Copy the brand-kit exports.
- Don't add a second entry for the same app, and don't touch other shortcuts or their art.
- Don't edit Steam's other config files (`localconfig.vdf`, `config.vdf`, collections in the cloud).
- Don't fetch art from the network (SteamGridDB or anything else). The art ships in the Flatpak.

## 10. Done checklist

- [ ] App ID decided and used in the config, manifest and install path.
- [ ] Five art files copied from the brand kit's `deployment/steam/`, names unchanged.
- [ ] Helper vendored unchanged, `VERSION` matching this standard.
- [ ] Manifest installs helper, config and art; `finish-args` has exactly the three Steam paths, with the
      Flathub justification written.
- [ ] UI: first-run offer (once), settings states, close-Steam confirmation, Flatpak Steam notice, silent
      refresh on start.
- [ ] Automated test (§8 step 1) passes, including the existing-game case.
- [ ] Checked in real Steam: native and Flatpak; Game Mode where the app is meant for it.
- [ ] README says how to add the app to Steam and to remove it before uninstalling.
- [ ] `docs/DECISIONS.md` logs the adoption; this file is in `docs/standards/` and named in `CLAUDE.md`.
