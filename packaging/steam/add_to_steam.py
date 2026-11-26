#!/usr/bin/env python3
"""add_to_steam.py (Steam Shortcut Standard v1): add, update or remove a Flatpak app's Steam shortcut and art.

Standard library only, Python 3.8+. Runs inside the app's Flatpak sandbox (the freedesktop, GNOME and KDE
runtimes all ship python3) or on the host.

  add_to_steam.py add     --config /app/share/<APP_ID>/steam/steam-shortcut.json [--user ID] [--yes]
  add_to_steam.py refresh --config ...      # re-copy the art where the shortcut already exists (art only, safe while Steam runs)
  add_to_steam.py remove  --config ...
  add_to_steam.py status  --config ...      # print JSON: Steam installs, users, shortcut present
  add_to_steam.py ... --steam-root DIR      # use one Steam install instead of searching (tests)

Exit codes: 0 done, 1 nothing to do (no Steam, or refresh with no shortcut), 2 usage/config error,
3 Steam appears to be running and --yes was not given.
"""
import argparse, json, os, shutil, struct, sys, time, zlib

VERSION = '1'
FLATPAK_STEAM = 'com.valvesoftware.Steam'

# ------------------------------------------------------------------ binary VDF (shortcuts.vdf)
# Types: 0x00 map, 0x01 string, 0x02 int32 (LE), 0x08 end of map. Keys and strings are NUL-terminated UTF-8.

def _cstr(buf, i):
    j = buf.index(b'\x00', i)
    return buf[i:j].decode('utf-8', 'replace'), j + 1

def _parse_map(buf, i):
    out = {}
    while True:
        t = buf[i]; i += 1
        if t == 0x08:
            return out, i
        key, i = _cstr(buf, i)
        if t == 0x00:
            out[key], i = _parse_map(buf, i)
        elif t == 0x01:
            out[key], i = _cstr(buf, i)
        elif t == 0x02:
            out[key] = struct.unpack_from('<i', buf, i)[0]; i += 4
        elif t == 0x07:          # uint64, rare; keep as int
            out[key] = struct.unpack_from('<Q', buf, i)[0]; i += 8
        else:
            raise ValueError(f'unknown VDF type 0x{t:02x} at byte {i - 1}')

def vdf_load(buf):
    if not buf:
        return {'shortcuts': {}}
    out, i = _parse_map(buf, 0)
    return out

def _dump_map(d):
    b = bytearray()
    for k, v in d.items():
        kb = k.encode() + b'\x00'
        if isinstance(v, dict):
            b += b'\x00' + kb + _dump_map(v)
        elif isinstance(v, bool) or isinstance(v, int):
            v = int(v)
            if v > 0x7fffffff and v <= 0xffffffff:
                v -= 1 << 32
            b += b'\x02' + kb + struct.pack('<i', v)
        else:
            b += b'\x01' + kb + str(v).encode() + b'\x00'
    return bytes(b) + b'\x08'

def vdf_dump(d):
    return _dump_map(d)

# ------------------------------------------------------------------ Steam discovery

def steam_roots(home):
    cands = [os.path.join(home, '.steam', 'steam'), os.path.join(home, '.local', 'share', 'Steam'),
             os.path.join(home, '.var', 'app', FLATPAK_STEAM, '.local', 'share', 'Steam'),
             os.path.join(home, '.var', 'app', FLATPAK_STEAM, 'data', 'Steam')]
    seen, out = set(), []
    for c in cands:
        if os.path.isdir(os.path.join(c, 'userdata')):
            r = os.path.realpath(c)
            if r not in seen:
                seen.add(r); out.append((c, FLATPAK_STEAM in c))
    return out

def steam_users(root):
    ud = os.path.join(root, 'userdata')
    return sorted(u for u in os.listdir(ud) if u.isdigit() and u != '0' and os.path.isdir(os.path.join(ud, u)))

def steam_running(home):
    """Best effort. Inside a Flatpak sandbox host processes are invisible, so this can only say 'unknown'."""
    if os.environ.get('FLATPAK_ID') or os.path.exists('/.flatpak-info'):
        return None
    for pidfile in (os.path.join(home, '.steam', 'steam.pid'),
                    os.path.join(home, '.var', 'app', FLATPAK_STEAM, '.steam', 'steam.pid')):
        try:
            pid = int(open(pidfile).read().strip())
            if os.path.exists(f'/proc/{pid}'):
                return True
        except (OSError, ValueError):
            pass
    return False

# ------------------------------------------------------------------ shortcut identity

def shortcut_id(exe, name):
    """Steam's non-Steam shortcut ID: crc32(exe + name) with the top bit set. Grid files use this number."""
    return (zlib.crc32((exe + name).encode()) & 0xffffffff) | 0x80000000

def launch_fields(cfg, flatpak_steam):
    app = cfg['app_id']
    args = cfg.get('launch_args', '').strip()
    if flatpak_steam:   # Steam is itself a Flatpak: it must reach the host's flatpak (needs org.freedesktop.Flatpak on Steam)
        exe, opts = '"/usr/bin/flatpak-spawn"', f'--host flatpak run {app} {args}'.strip()
    else:
        exe, opts = '"/usr/bin/flatpak"', f'run {app} {args}'.strip()
    return exe, '"/usr/bin/"', opts

ART = {   # config key -> Steam grid file name pattern
    'capsule': '{id}p.png',      # 600x900 portrait library capsule
    'header': '{id}.png',        # 920x430 wide capsule (recent games, Big Picture)
    'hero': '{id}_hero.png',     # 3840x1240 banner behind the game page
    'logo': '{id}_logo.png',     # 1280x720 transparent logo over the hero
    'icon': '{id}_icon.png',     # 256 icon; also referenced from the shortcut's "icon" field
}

# ------------------------------------------------------------------ operations

def load_cfg(path):
    cfg = json.load(open(path))
    for k in ('app_id', 'name'):
        if not cfg.get(k):
            raise SystemExit(f'config: missing "{k}"')
    base = os.path.dirname(os.path.abspath(path))
    cfg['art'] = {k: os.path.join(base, v) for k, v in cfg.get('art', {}).items()}
    for k, p in cfg['art'].items():
        if k not in ART:
            raise SystemExit(f'config: unknown art key "{k}" (use {", ".join(ART)})')
        if not os.path.isfile(p):
            raise SystemExit(f'config: art file missing: {p}')
    return cfg

def find_entry(shortcuts, cfg, sid):
    for k, e in shortcuts.items():
        low = {kk.lower(): vv for kk, vv in e.items()}
        if low.get('flatpakappid') == cfg['app_id']:
            return k
        if (low.get('appid', 0) & 0xffffffff) == sid:
            return k
    return None

def write_atomic(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'wb') as f:
        f.write(data)
    os.replace(tmp, path)

def apply(op, cfg, root, flatpak_steam, user):
    cfgdir = os.path.join(root, 'userdata', user, 'config')
    os.makedirs(cfgdir, exist_ok=True)
    vdf_path = os.path.join(cfgdir, 'shortcuts.vdf')
    raw = open(vdf_path, 'rb').read() if os.path.exists(vdf_path) else b''
    data = vdf_load(raw)
    shortcuts = data.setdefault('shortcuts', {})
    exe, start, opts = launch_fields(cfg, flatpak_steam)
    sid = shortcut_id(exe, cfg['name'])
    key = find_entry(shortcuts, cfg, sid)
    grid = os.path.join(cfgdir, 'grid')

    if op == 'status':
        return {'user': user, 'present': key is not None, 'shortcut_id': sid}
    if op == 'refresh':
        if key is None:
            return {'user': user, 'changed': False, 'reason': 'no shortcut'}
        sid = shortcuts[key].get('appid', sid) & 0xffffffff
        os.makedirs(grid, exist_ok=True)
        for k, src in cfg['art'].items():
            shutil.copyfile(src, os.path.join(grid, ART[k].format(id=sid)))
        return {'user': user, 'changed': True, 'shortcut_id': sid, 'art_only': True}

    if op == 'remove':
        if key is None:
            return {'user': user, 'changed': False}
        old = shortcuts.pop(key)
        oid = old.get('appid', sid) & 0xffffffff
        data['shortcuts'] = {str(i): v for i, v in enumerate(shortcuts.values())}
        backup(vdf_path, raw); write_atomic(vdf_path, vdf_dump(data))
        for pat in ART.values():
            p = os.path.join(grid, pat.format(id=oid))
            if os.path.exists(p):
                os.remove(p)
        return {'user': user, 'changed': True, 'removed': oid}

    # add or refresh: copy art, then write the entry (existing entries keep the user's own tags and play time)
    os.makedirs(grid, exist_ok=True)
    if key is not None:
        sid = shortcuts[key].get('appid', sid) & 0xffffffff
    for k, src in cfg['art'].items():
        shutil.copyfile(src, os.path.join(grid, ART[k].format(id=sid)))
    icon = os.path.join(grid, ART['icon'].format(id=sid)) if 'icon' in cfg['art'] else ''
    entry = shortcuts[key] if key is not None else {}
    fields = {'appid': sid, 'AppName': cfg['name'], 'Exe': exe, 'StartDir': start, 'icon': icon,
                  'ShortcutPath': '', 'LaunchOptions': opts, 'FlatpakAppID': cfg['app_id']}
    for k in [k for k in entry if k.lower() in {f.lower() for f in fields} and k not in fields]:
        del entry[k]             # older Steam wrote some keys in lower case; never leave two spellings
    entry.update(fields)
    for k, v in (('IsHidden', 0), ('AllowDesktopConfig', 1), ('AllowOverlay', 1), ('OpenVR', 0),
                 ('Devkit', 0), ('DevkitGameID', ''), ('DevkitOverrideAppID', 0), ('LastPlayTime', 0)):
        entry.setdefault(k, v)
    tags = entry.setdefault('tags', {})
    for t in cfg.get('tags', []):
        if t not in tags.values():
            tags[str(len(tags))] = t
    if key is None:
        shortcuts[str(len(shortcuts))] = entry
    backup(vdf_path, raw); write_atomic(vdf_path, vdf_dump(data))
    return {'user': user, 'changed': True, 'shortcut_id': sid, 'added': key is None}

def backup(path, raw):
    if raw:
        write_atomic(path + '.icesuite-backup', raw)   # one rolling backup, the state before our last write

def main(argv=None):
    ap = argparse.ArgumentParser(description='Steam Shortcut Standard v1 helper')
    ap.add_argument('op', choices=['add', 'refresh', 'remove', 'status'])
    ap.add_argument('--config', required=True)
    ap.add_argument('--user', help='Steam userdata ID (default: every user on this machine)')
    ap.add_argument('--steam-root', help='one Steam install to use instead of searching')
    ap.add_argument('--yes', action='store_true', help='the user has confirmed Steam is closed')
    a = ap.parse_args(argv)
    try:
        cfg = load_cfg(a.config)
    except (OSError, ValueError) as e:
        print(f'config: {e}', file=sys.stderr); return 2
    home = os.path.expanduser('~')
    roots = [(a.steam_root, FLATPAK_STEAM in a.steam_root)] if a.steam_root else steam_roots(home)
    if not roots:
        print(json.dumps({'steam': False})); return 1
    if a.op in ('add', 'remove') and not a.yes:
        running = steam_running(home)
        if running is not False:
            print(json.dumps({'steam_running': running, 'need': 'close Steam, then rerun with --yes'})); return 3
    results = []
    for root, fp in roots:
        for u in ([a.user] if a.user else steam_users(root)):
            r = apply(a.op, cfg, root, fp, u); r['steam'] = root; r['flatpak_steam'] = fp; results.append(r)
    print(json.dumps({'version': VERSION, 'op': a.op, 'results': results}, indent=1))
    return 0 if any(r.get('changed') or r.get('present') for r in results) or a.op == 'status' else 1

if __name__ == '__main__':
    sys.exit(main())
