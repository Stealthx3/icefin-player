#!/usr/bin/env python3
"""setup.py — configure the lab Jellyfin servers (PLAN 1.7). Python 3 stdlib only; run inside a lab guest.

Usage: python3 setup.py servers.json
For each server: wait for it, run the first-start wizard with a throwaway admin account (random password
saved to ~/jf/creds.json, never printed), create Movies/Shows/Music libraries on /media, add the plugin
repositories, install every regression plugin that has a build for the server's ABI, restart, and write
~/jf/status.json with what is installed, active, or unavailable. Idempotent.
"""
import io, json, os, secrets, sys, time, urllib.error, urllib.parse, urllib.request, zipfile

HOME = os.path.expanduser("~/jf")
CREDS = os.path.join(HOME, "creds.json")
CLIENT = 'MediaBrowser Client="icefin-lab-setup", Device="lab", DeviceId="icefin-lab-setup", Version="1"'


def ver_tuple(v):
    return tuple(int(x) for x in v.split(".") if x.isdigit())


class Server:
    def __init__(self, cfg):
        self.name, self.base, self.abi = cfg["name"], f"http://127.0.0.1:{cfg['port']}", cfg["abi"]
        self.token = None

    def call(self, method, path, body=None, raw=False, timeout=60):
        hdr = {"Authorization": CLIENT + (f', Token="{self.token}"' if self.token else ""), "Accept": "application/json"}
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            hdr["Content-Type"] = "application/json"
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=hdr)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            out = r.read()
        if raw:
            return out
        return json.loads(out) if out else None

    def wait(self, secs=300):
        end = time.time() + secs
        while time.time() < end:
            try:
                info = self.call("GET", "/System/Info/Public", timeout=5)
                if info and info.get("Version"):
                    return info
            except Exception:
                pass
            time.sleep(3)
        raise SystemExit(f"setup: {self.name} did not come up in {secs}s")


def creds():
    try:
        return json.load(open(CREDS))
    except FileNotFoundError:
        return {}


def wizard(s, c):
    info = s.wait()
    if not info.get("StartupWizardCompleted"):
        s.call("POST", "/Startup/Configuration", {"UICulture": "en-US", "MetadataCountryCode": "US", "PreferredMetadataLanguage": "en"})
        s.call("GET", "/Startup/User")
        s.call("POST", "/Startup/User", {"Name": c["user"], "Password": c["password"]})
        try:
            s.call("POST", "/Startup/RemoteAccess", {"EnableRemoteAccess": True, "EnableAutomaticPortMapping": False})
        except urllib.error.HTTPError:
            pass  # optional step; absent on some versions
        s.call("POST", "/Startup/Complete")
    auth = s.call("POST", "/Users/AuthenticateByName", {"Username": c["user"], "Pw": c["password"]})
    s.token = auth["AccessToken"]
    return s.call("GET", "/System/Info")["Version"]


def libraries(s):
    have = {f["Name"] for f in s.call("GET", "/Library/VirtualFolders")}
    for name, ctype, path in (("Movies", "movies", "/media/movies"), ("Shows", "tvshows", "/media/shows"), ("Music", "music", "/media/music")):
        if name in have:
            continue
        q = urllib.parse.urlencode({"name": name, "collectionType": ctype, "paths": path, "refreshLibrary": "false"})
        s.call("POST", f"/Library/VirtualFolders?{q}", {"LibraryOptions": {"EnableTrickplayImageExtraction": True, "EnableLyricsDownload": False}})


def repositories(s, repos):
    cur = s.call("GET", "/Repositories") or []
    urls = {r["Url"] for r in cur}
    new = cur + [dict(r, Enabled=True) for r in repos if r["Url"] not in urls]
    if len(new) != len(cur):
        s.call("POST", "/Repositories", new)


def installed(s):
    return {p["Name"]: p for p in s.call("GET", "/Plugins")}


def github_release(s, repo, name):
    """Fallback for plugins whose repo manifest the server cannot read: newest release zip for this ABI branch."""
    major = ".".join(s.abi.split(".")[:1]) if s.abi.startswith("12") else s.abi  # tags look like 12.0/v.. or 10.11/v..
    prefix = "12.0/" if s.abi.startswith("12") else f"{major}/"
    rels = json.load(urllib.request.urlopen(f"https://api.github.com/repos/{repo}/releases?per_page=30", timeout=30))
    for r in rels:
        if r["tag_name"].startswith(prefix) and not r.get("prerelease"):
            for a in r["assets"]:
                if a["name"].endswith(".zip"):
                    return r["tag_name"], a["browser_download_url"]
    return None, None


def install_from_zip(srv_name, plugin, url, tag):
    """Unpack a release zip into the server's plugin folder (the server loads it on restart)."""
    dest = os.path.join(HOME, srv_name, "config", "data", "plugins", f"{plugin}_{tag.split('/v')[-1]}")
    if os.path.isdir(dest):
        return
    blob = urllib.request.urlopen(url, timeout=120).read()
    os.makedirs(dest, exist_ok=True)
    zipfile.ZipFile(io.BytesIO(blob)).extractall(dest)


def plugins(s, wanted):
    pkgs = {p["name"]: p for p in s.call("GET", "/Packages", timeout=120)}
    have = installed(s)
    result = {}
    for w in wanted:
        n = w["name"]
        if n in have or w.get("installed_as") in have:
            result[n] = "installed"
            continue
        p = pkgs.get(n)
        vers = [v for v in (p or {}).get("versions", []) if ver_tuple(v.get("targetAbi", "0"))[:2] <= ver_tuple(s.abi)[:2]
                and ver_tuple(v.get("targetAbi", "0"))[:1] == ver_tuple(s.abi)[:1]]
        if vers:
            v = max(vers, key=lambda v: ver_tuple(v["version"]))
            q = urllib.parse.urlencode({"assemblyGuid": p["guid"], "version": v["version"], "repositoryUrl": v.get("repositoryUrl", "")})
            try:
                s.call("POST", f"/Packages/Installed/{urllib.parse.quote(n)}?{q}")
                result[n] = f"queued {v['version']}"
            except urllib.error.HTTPError as e:
                result[n] = f"install error HTTP {e.code}"
        elif w.get("github"):
            try:
                tag, url = github_release(s, w["github"], n)
                if url:
                    install_from_zip(s.name, n, url, tag)
                    result[n] = f"queued {tag} (GitHub release)"
                else:
                    result[n] = f"unavailable for {s.abi}"
            except Exception as e:  # noqa: BLE001 — report, keep going
                result[n] = f"github fallback failed: {e}"
        else:
            result[n] = f"unavailable for {s.abi}"
    return result


def main():
    cfg = json.load(open(sys.argv[1]))
    c = creds()
    status = {}
    for sc in cfg["servers"]:
        s = Server(sc)
        if sc["name"] not in c:
            c[sc["name"]] = {"user": "icefin", "password": secrets.token_urlsafe(18)}
            os.makedirs(HOME, exist_ok=True)
            with open(CREDS, "w") as f:
                json.dump(c, f, indent=1)
            os.chmod(CREDS, 0o600)
        version = wizard(s, c[sc["name"]])
        libraries(s)
        repositories(s, cfg["repositories"])
        res = plugins(s, cfg["plugins"])
        if any(v.startswith("queued") for v in res.values()):
            s.call("POST", "/System/Restart")
            time.sleep(10)
            wizard(s, c[sc["name"]])
        have = installed(s)
        final = {}
        for w in cfg["plugins"]:
            p = have.get(w["name"]) or have.get(w.get("installed_as", ""))
            final[w["name"]] = f"{p['Version']} {p.get('Status', '?')}" if p else res.get(w["name"], "missing")
        s.call("POST", "/Library/Refresh")
        status[sc["name"]] = {"version": version, "url": s.base, "plugins": final}
        bad = [k for k, v in final.items() if "Active" not in v]
        print(f"setup: {sc['name']} Jellyfin {version}: {len(final) - len(bad)}/{len(final)} plugins active"
              + (f"; not active: {', '.join(f'{k} ({final[k]})' for k in bad)}" if bad else ""))
    with open(os.path.join(HOME, "status.json"), "w") as f:
        json.dump(status, f, indent=1)


if __name__ == "__main__":
    main()
