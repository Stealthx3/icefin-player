#!/usr/bin/env python3
"""Steam Shortcut Standard v1 §8 step 1 for IceFin Player (D43, PLAN 11.10): no Steam needed.

Runs the vendored helper (packaging/steam/add_to_steam.py) with the app's own config against fake Steam roots and
checks every write with an independent binary VDF parser (the `vdf` package, `pip install vdf`):

  - add into an empty account: one entry, Steam's fields as the standard's §7 table, the five grid images;
  - add into an existing shortcuts.vdf with another game: that game, its play time and its collections unchanged;
  - add twice: one entry, same shortcut ID; refresh: new art copied, the user's own tags kept, shortcuts.vdf untouched;
  - remove: our entry and art gone, the other game renumbered to "0" and its art left alone;
  - Flatpak Steam: the flatpak-spawn --host launch; status; sandbox without --yes (exit 3); no Steam (exit 1);
  - the packaging: helper VERSION is the standard's, the config names the manifest's app ID and the brand-kit name,
    the five images have Steam's sizes, the manifest installs them and grants exactly Steam's three folders.

Run: python3 -I tests/icefin/steam/test_steam_shortcut.py   (CI: icefin-hooks)
"""
import json, os, shutil, struct, subprocess, sys, tempfile, zlib

try:
    import vdf
except ImportError:
    sys.exit('test_steam_shortcut: needs the vdf package (pip install vdf)')

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PKG = os.path.join(REPO, 'packaging', 'steam')
HELPER = os.path.join(PKG, 'add_to_steam.py')
CONFIG = os.path.join(PKG, 'steam-shortcut.json')
MANIFEST = os.path.join(REPO, 'flatpak', 'io.github.stealthx3.IcefinPlayer.yml')
APP_ID = 'io.github.stealthx3.IcefinPlayer'
NAME = 'IceFin Player'
SIZES = {'capsule-600x900.png': (600, 900), 'header-920x430.png': (920, 430), 'hero-3840x1240.png': (3840, 1240),
         'logo-1280x720.png': (1280, 720), 'icon-256.png': (256, 256)}
GRID = ['{id}p.png', '{id}.png', '{id}_hero.png', '{id}_logo.png', '{id}_icon.png']

failures = []


def check(ok, what):
    print(('ok   ' if ok else 'FAIL ') + what)
    if not ok:
        failures.append(what)


def run(*args, env=None, config=CONFIG):
    e = dict(os.environ, **(env or {}))
    if 'FLATPAK_ID' not in (env or {}):
        e.pop('FLATPAK_ID', None)  # outside a sandbox unless a case asks for one
    p = subprocess.run([sys.executable, '-I', HELPER, *args, '--config', config], capture_output=True, text=True, env=e)
    try:
        out = json.loads(p.stdout) if p.stdout.strip() else {}
    except ValueError:
        out = {'raw': p.stdout}
    return p.returncode, out


def load(path):
    return vdf.binary_loads(open(path, 'rb').read())


def sid(exe):
    return (zlib.crc32((exe + NAME).encode()) & 0xffffffff) | 0x80000000


def fake_root(base, flatpak=False, users=('12345',)):
    root = os.path.join(base, 'com.valvesoftware.Steam', 'data', 'Steam') if flatpak else os.path.join(base, 'Steam')
    for u in users:
        os.makedirs(os.path.join(root, 'userdata', u, 'config'))
    os.makedirs(os.path.join(root, 'userdata', '0'))  # Steam's anonymous folder: never written
    return root


OTHER_GAME = {
    'appid': -1234567890, 'AppName': 'Another Game', 'Exe': '"/usr/bin/another-game"', 'StartDir': '"/usr/bin/"',
    'icon': '', 'ShortcutPath': '', 'LaunchOptions': '--their-flag', 'IsHidden': 0, 'AllowDesktopConfig': 1,
    'AllowOverlay': 1, 'OpenVR': 0, 'Devkit': 0, 'DevkitGameID': '', 'DevkitOverrideAppID': 0,
    'LastPlayTime': 1763700000, 'FlatpakAppID': '', 'tags': {'0': 'Favorites', '1': 'Retro'},
}


def packaging_checks():
    import re
    ver = re.search(r"^VERSION = '([^']+)'", open(HELPER).read(), re.M)
    std = re.search(r'Steam Shortcut Standard \(v(\d+)\)', open(os.path.join(REPO, 'docs', 'standards', 'STEAM-SHORTCUT-STANDARD.md')).read())
    check(bool(ver and std and ver.group(1) == std.group(1)), 'helper VERSION matches the standard in docs/standards/')
    cfg = json.load(open(CONFIG))
    check(cfg.get('app_id') == APP_ID and cfg.get('name') == NAME, 'config: the D13 app ID and the brand-kit name')
    check('IceSuite' in cfg.get('tags', []), 'config: the IceSuite collection')
    check(sorted(cfg.get('art', {}).values()) == sorted(SIZES), 'config: the five brand-kit art files')
    for f, size in SIZES.items():
        b = open(os.path.join(PKG, f), 'rb').read(24)
        check(b[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', b[16:24]) == size, f'{f} is a {size[0]}x{size[1]} PNG')
    m = open(MANIFEST).read()
    check(re.search(r'^app-id: ' + re.escape(APP_ID) + r'$', m, re.M) is not None, 'manifest: same app ID as the config')
    fs = re.findall(r'^\s*- (--filesystem=\S+)', m, re.M)
    steam = [a for a in fs if 'steam' in a.lower()]
    check(sorted(steam) == sorted(['--filesystem=~/.steam:rw', '--filesystem=~/.steam/steam:rw',
                                   '--filesystem=~/.var/app/com.valvesoftware.Steam:rw']), "manifest: exactly Steam's three folders")
    check(not any(a.split('=')[1].split(':')[0] in ('home', 'host') for a in fs), 'manifest: no home or host access')
    check('${FLATPAK_ID}-steam' in m and all(f in m for f in SIZES) and 'steam-shortcut.json' in m,
          'manifest: the steam-shortcut module installs the helper, the config and the art')


def main():
    packaging_checks()
    tmp = tempfile.mkdtemp(prefix='icefin-steam-')
    home = os.path.join(tmp, 'home')
    os.makedirs(home)
    env = {'HOME': home}
    try:
        # ---- add into an empty account ----
        root = fake_root(os.path.join(tmp, 'a'))
        cfgdir = os.path.join(root, 'userdata', '12345', 'config')
        code, out = run('add', '--steam-root', root, '--yes', env=env)
        check(code == 0, 'add: exit 0')
        d = load(os.path.join(cfgdir, 'shortcuts.vdf'))
        e = d['shortcuts']['0']
        nid = sid('"/usr/bin/flatpak"')
        check(len(d['shortcuts']) == 1 and e['AppName'] == NAME, 'add: one entry named IceFin Player')
        check(e['Exe'] == '"/usr/bin/flatpak"' and e['StartDir'] == '"/usr/bin/"', 'add: Exe and StartDir for native Steam')
        check(e['LaunchOptions'] == f'run {APP_ID} --fullscreen', 'add: flatpak run with the config launch_args')
        check(e['FlatpakAppID'] == APP_ID and (e['appid'] & 0xffffffff) == nid, 'add: FlatpakAppID and the crc32 shortcut ID')
        check(list(e['tags'].values()) == ['IceSuite'], 'add: the IceSuite collection')
        grid = os.path.join(cfgdir, 'grid')
        check(all(os.path.isfile(os.path.join(grid, g.format(id=nid))) for g in GRID), 'add: the five grid images')
        check(e['icon'] == os.path.join(grid, f'{nid}_icon.png'), 'add: icon points at the grid icon')
        check(open(os.path.join(grid, f'{nid}_hero.png'), 'rb').read() == open(os.path.join(PKG, 'hero-3840x1240.png'), 'rb').read(),
              'add: art copied byte for byte')
        check(not os.path.exists(os.path.join(root, 'userdata', '0', 'config')), 'add: userdata/0 untouched')

        # ---- status ----
        code, out = run('status', '--steam-root', root, env=env)
        r = out.get('results', [{}])
        check(code == 0 and len(r) == 1 and r[0].get('present') is True and r[0].get('user') == '12345', 'status: present for the account')

        # ---- existing shortcuts.vdf with another game ----
        root = fake_root(os.path.join(tmp, 'b'), users=('12345', '67890'))
        for u in ('12345', '67890'):
            c = os.path.join(root, 'userdata', u, 'config')
            with open(os.path.join(c, 'shortcuts.vdf'), 'wb') as f:
                f.write(vdf.binary_dumps({'shortcuts': {'0': dict(OTHER_GAME, tags=dict(OTHER_GAME['tags']))}}))
            os.makedirs(os.path.join(c, 'grid'))
            other_art = os.path.join(c, 'grid', f"{OTHER_GAME['appid'] & 0xffffffff}p.png")
            open(other_art, 'wb').write(b'their art')
        cfgdir = os.path.join(root, 'userdata', '12345', 'config')
        before = open(os.path.join(cfgdir, 'shortcuts.vdf'), 'rb').read()
        code, out = run('add', '--steam-root', root, '--yes', env=env)
        d = load(os.path.join(cfgdir, 'shortcuts.vdf'))
        check(code == 0 and sorted(d['shortcuts']) == ['0', '1'], 'existing: our entry added as "1"')
        check(dict(d['shortcuts']['0']) == OTHER_GAME, 'existing: the other game, its play time and collections unchanged')
        check(d['shortcuts']['1']['AppName'] == NAME, 'existing: our entry is IceFin Player')
        check(open(os.path.join(cfgdir, 'shortcuts.vdf.icesuite-backup'), 'rb').read() == before, 'existing: the old file kept as the backup')
        check(len(out.get('results', [])) == 2 and all(x.get('changed') for x in out['results']), 'existing: both accounts changed')

        # ---- add twice; refresh keeps the user's tags and new art arrives ----
        code, _ = run('add', '--steam-root', root, '--yes', env=env)
        d = load(os.path.join(cfgdir, 'shortcuts.vdf'))
        check(code == 0 and len(d['shortcuts']) == 2, 'add twice: still one IceFin entry')
        # the user puts IceFin in a collection of their own, then an app update brings new art
        ours = dict(d['shortcuts']['1']); ours['tags'] = {'0': 'IceSuite', '1': 'Couch'}
        d['shortcuts']['1'] = ours
        open(os.path.join(cfgdir, 'shortcuts.vdf'), 'wb').write(vdf.binary_dumps(d))
        vdf_before = open(os.path.join(cfgdir, 'shortcuts.vdf'), 'rb').read()
        newpkg = os.path.join(tmp, 'newart')
        shutil.copytree(PKG, newpkg)
        open(os.path.join(newpkg, 'logo-1280x720.png'), 'ab').write(b'new export')
        code, out = run('refresh', '--steam-root', root, env=env, config=os.path.join(newpkg, 'steam-shortcut.json'))
        check(code == 0, 'refresh: exit 0 (no --yes needed)')
        check(open(os.path.join(cfgdir, 'shortcuts.vdf'), 'rb').read() == vdf_before, 'refresh: shortcuts.vdf untouched')
        check(open(os.path.join(cfgdir, 'grid', f'{nid}_logo.png'), 'rb').read().endswith(b'new export'), 'refresh: the new art reached Steam')
        code, _ = run('add', '--steam-root', root, '--yes', env=env)
        d = load(os.path.join(cfgdir, 'shortcuts.vdf'))
        check(list(d['shortcuts']['1']['tags'].values()) == ['IceSuite', 'Couch'], "re-add: the user's own collection kept")

        # ---- remove ----
        code, out = run('remove', '--steam-root', root, '--yes', env=env)
        d = load(os.path.join(cfgdir, 'shortcuts.vdf'))
        check(code == 0 and list(d['shortcuts']) == ['0'] and dict(d['shortcuts']['0']) == OTHER_GAME,
              'remove: only the other game left, unchanged, as "0"')
        check(not any(os.path.exists(os.path.join(cfgdir, 'grid', g.format(id=nid))) for g in GRID), 'remove: our art deleted')
        check(open(os.path.join(cfgdir, 'grid', f"{OTHER_GAME['appid'] & 0xffffffff}p.png"), 'rb').read() == b'their art',
              "remove: the other game's art left alone")
        code, _ = run('refresh', '--steam-root', root, env=env)
        check(code == 1, 'refresh with no shortcut: exit 1, nothing done')

        # ---- Flatpak Steam ----
        root = fake_root(os.path.join(tmp, 'c'), flatpak=True)
        code, out = run('add', '--steam-root', root, '--yes', env=env)
        e = load(os.path.join(root, 'userdata', '12345', 'config', 'shortcuts.vdf'))['shortcuts']['0']
        check(code == 0 and e['Exe'] == '"/usr/bin/flatpak-spawn"' and e['LaunchOptions'] == f'--host flatpak run {APP_ID} --fullscreen',
              'Flatpak Steam: launched through flatpak-spawn --host')
        check(out['results'][0].get('flatpak_steam') is True, 'Flatpak Steam: reported to the app')

        # ---- the safety exits ----
        root = fake_root(os.path.join(tmp, 'd'))
        code, out = run('add', '--steam-root', root, env=dict(env, FLATPAK_ID=APP_ID))
        check(code == 3 and not os.path.exists(os.path.join(root, 'userdata', '12345', 'config', 'shortcuts.vdf')),
              'sandbox without --yes: exit 3, nothing written')
        code, out = run('status', env=env)  # empty home: no Steam anywhere
        check(code == 1 and out == {'steam': False}, 'no Steam: exit 1 with {"steam": false}')
        # discovery: a native install under the fake home (no --steam-root), as the app runs it
        fake_root(os.path.join(home, '.local', 'share'))
        code, out = run('status', env=env)
        check(code == 0 and len(out.get('results', [])) == 1, 'discovery: ~/.local/share/Steam found')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print(f'\n{len(failures)} failed' if failures else '\nall passed')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
