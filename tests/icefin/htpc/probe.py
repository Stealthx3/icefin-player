#!/usr/bin/env python3
"""probe.py — read what the HTPC is actually sending to the TV and receiver (HTPC tier, docs/LAB.md).

Python 3 stdlib only (stock Bazzite), no root. Run through `scripts/icefin/htpc.sh probe [section...]`.
Sections (default: all):
  host   OS image, kernel, which session is on screen (Plasma, GNOME, Gamescope), the session environment
  gpu    GPUs and drivers; Vulkan devices when vulkaninfo is installed
  drm    per connector: connected, current mode and refresh, Colorspace, HDR_OUTPUT_METADATA (EOTF,
         mastering luminance, MaxCLL/MaxFALL), max bpc. This is the signal the kernel programs, not what
         the compositor intends, so it answers "did HDR10/HLG actually go out?"
  audio  per card: ELD from the TV/receiver, playback substreams that are open (format, rate, channels)
         and the IEC958 channel-status "non-audio" bit on HDMI outputs, which is set when a bitstream
         (AC-3, E-AC-3, DTS, TrueHD) is passed through rather than PCM
Prints one JSON object.
"""
import ctypes, ctypes.util, glob, json, os, re, shutil, subprocess, sys


def sh(*cmd, timeout=10):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except Exception:
        return ""


def read(path):
    try:
        with open(path, errors="replace") as f:
            return f.read()
    except OSError:
        return None


# ---------------------------------------------------------------- host

def procs():
    names = set()
    for d in glob.glob("/proc/[0-9]*/comm"):
        c = read(d)
        if c:
            names.add(c.strip())
    return names


def host():
    osr = dict(re.findall(r'^(\w+)="?([^"\n]*)"?$', read("/etc/os-release") or "", re.M))
    img = {}
    try:
        img = json.load(open("/usr/share/ublue-os/image-info.json"))
    except Exception:
        pass
    p = procs()
    on_screen = [n for n, keys in (("gamescope", ("gamescope", "gamescope-wl")), ("plasma", ("kwin_wayland", "kwin_x11")),
                                   ("gnome", ("gnome-shell",))) if p & set(keys)]
    env = {}
    for line in sh("systemctl", "--user", "show-environment").splitlines():
        k, _, v = line.partition("=")
        if k in ("WAYLAND_DISPLAY", "DISPLAY", "XDG_CURRENT_DESKTOP", "XDG_SESSION_TYPE", "DESKTOP_SESSION"):
            env[k] = v
    return {"os": {k: osr.get(k) for k in ("ID", "NAME", "VERSION", "VARIANT_ID", "OSTREE_VERSION")},
            "image": {k: img.get(k) for k in ("image-name", "image-flavor", "image-tag", "fedora-version") if k in img},
            "kernel": os.uname().release, "sessions_running": on_screen, "steam": "steam" in p, "session_env": env,
            "tools": {t: bool(shutil.which(t)) for t in ("flatpak", "amixer", "vulkaninfo", "kscreen-doctor", "gnome-randr",
                                                        "steamos-session-select", "moonlight", "sunshine", "distrobox")}}


# ---------------------------------------------------------------- gpu

PCI_VENDORS = {"0x1002": "AMD", "0x8086": "Intel", "0x10de": "NVIDIA", "0x1af4": "virtio", "0x1b36": "QEMU", "0x1234": "QEMU"}


def gpu():
    cards = []
    for c in sorted(glob.glob("/sys/class/drm/card[0-9]")):
        dev = os.path.join(c, "device")
        drv = os.path.basename(os.path.realpath(os.path.join(dev, "driver"))) if os.path.exists(os.path.join(dev, "driver")) else None
        vend = (read(os.path.join(dev, "vendor")) or "").strip()
        cards.append({"card": os.path.basename(c), "vendor": PCI_VENDORS.get(vend, vend), "device": (read(os.path.join(dev, "device")) or "").strip(),
                      "driver": drv})
    vk = []
    if shutil.which("vulkaninfo"):
        out = sh("vulkaninfo", "--summary", timeout=20)
        vk = [{"name": n.strip(), "driver": d.strip()} for n, d in
              zip(re.findall(r"deviceName\s*=\s*(.*)", out), re.findall(r"driverName\s*=\s*(.*)", out))]
    return {"cards": cards, "vulkan": vk}


# ---------------------------------------------------------------- drm (libdrm through ctypes)

class ModeInfo(ctypes.Structure):
    _fields_ = [("clock", ctypes.c_uint32)] + [(n, ctypes.c_uint16) for n in
               ("hdisplay", "hsync_start", "hsync_end", "htotal", "hskew", "vdisplay", "vsync_start", "vsync_end", "vtotal", "vscan")] + \
               [("vrefresh", ctypes.c_uint32), ("flags", ctypes.c_uint32), ("type", ctypes.c_uint32), ("name", ctypes.c_char * 32)]


class Res(ctypes.Structure):
    _fields_ = [("count_fbs", ctypes.c_int), ("fbs", ctypes.POINTER(ctypes.c_uint32)),
                ("count_crtcs", ctypes.c_int), ("crtcs", ctypes.POINTER(ctypes.c_uint32)),
                ("count_connectors", ctypes.c_int), ("connectors", ctypes.POINTER(ctypes.c_uint32)),
                ("count_encoders", ctypes.c_int), ("encoders", ctypes.POINTER(ctypes.c_uint32)),
                ("min_width", ctypes.c_uint32), ("max_width", ctypes.c_uint32), ("min_height", ctypes.c_uint32), ("max_height", ctypes.c_uint32)]


class Connector(ctypes.Structure):
    _fields_ = [("connector_id", ctypes.c_uint32), ("encoder_id", ctypes.c_uint32), ("connector_type", ctypes.c_uint32),
                ("connector_type_id", ctypes.c_uint32), ("connection", ctypes.c_int), ("mmWidth", ctypes.c_uint32),
                ("mmHeight", ctypes.c_uint32), ("subpixel", ctypes.c_int), ("count_modes", ctypes.c_int),
                ("modes", ctypes.POINTER(ModeInfo)), ("count_props", ctypes.c_int), ("props", ctypes.POINTER(ctypes.c_uint32)),
                ("prop_values", ctypes.POINTER(ctypes.c_uint64)), ("count_encoders", ctypes.c_int),
                ("encoders", ctypes.POINTER(ctypes.c_uint32))]


class Encoder(ctypes.Structure):
    _fields_ = [("encoder_id", ctypes.c_uint32), ("encoder_type", ctypes.c_uint32), ("crtc_id", ctypes.c_uint32),
                ("possible_crtcs", ctypes.c_uint32), ("possible_clones", ctypes.c_uint32)]


class Crtc(ctypes.Structure):
    _fields_ = [("crtc_id", ctypes.c_uint32), ("buffer_id", ctypes.c_uint32), ("x", ctypes.c_uint32), ("y", ctypes.c_uint32),
                ("width", ctypes.c_uint32), ("height", ctypes.c_uint32), ("mode_valid", ctypes.c_int), ("mode", ModeInfo),
                ("gamma_size", ctypes.c_int)]


class PropEnum(ctypes.Structure):
    _fields_ = [("value", ctypes.c_uint64), ("name", ctypes.c_char * 32)]


class Prop(ctypes.Structure):
    _fields_ = [("prop_id", ctypes.c_uint32), ("flags", ctypes.c_uint32), ("name", ctypes.c_char * 32),
                ("count_values", ctypes.c_int), ("values", ctypes.POINTER(ctypes.c_uint64)),
                ("count_enums", ctypes.c_int), ("enums", ctypes.POINTER(PropEnum)),
                ("count_blobs", ctypes.c_int), ("blob_ids", ctypes.POINTER(ctypes.c_uint32))]


class Blob(ctypes.Structure):
    _fields_ = [("id", ctypes.c_uint32), ("length", ctypes.c_uint32), ("data", ctypes.c_void_p)]


CONN_TYPES = {0: "Unknown", 1: "VGA", 2: "DVI-I", 3: "DVI-D", 4: "DVI-A", 5: "Composite", 6: "SVIDEO", 7: "LVDS", 8: "Component",
              9: "DIN", 10: "DP", 11: "HDMI-A", 12: "HDMI-B", 13: "TV", 14: "eDP", 15: "Virtual", 16: "DSI", 17: "DPI",
              18: "Writeback", 19: "SPI", 20: "USB"}
EOTF = {0: "SDR (traditional gamma)", 1: "HDR (traditional gamma)", 2: "PQ / SMPTE ST 2084 (HDR10)", 3: "HLG"}
DRM_MODE_PROP_BLOB, DRM_MODE_PROP_ENUM, DRM_MODE_PROP_RANGE = 1 << 4, 1 << 3, 1 << 1
DRM_CLIENT_CAP_UNIVERSAL_PLANES, DRM_CLIENT_CAP_ATOMIC = 2, 3


def _drm():
    name = ctypes.util.find_library("drm") or "libdrm.so.2"
    lib = ctypes.CDLL(name)
    for fn, res, args in (("drmModeGetResources", ctypes.POINTER(Res), [ctypes.c_int]),
                          ("drmModeFreeResources", None, [ctypes.POINTER(Res)]),
                          ("drmModeGetConnector", ctypes.POINTER(Connector), [ctypes.c_int, ctypes.c_uint32]),
                          ("drmModeFreeConnector", None, [ctypes.POINTER(Connector)]),
                          ("drmModeGetEncoder", ctypes.POINTER(Encoder), [ctypes.c_int, ctypes.c_uint32]),
                          ("drmModeFreeEncoder", None, [ctypes.POINTER(Encoder)]),
                          ("drmModeGetCrtc", ctypes.POINTER(Crtc), [ctypes.c_int, ctypes.c_uint32]),
                          ("drmModeFreeCrtc", None, [ctypes.POINTER(Crtc)]),
                          ("drmModeGetProperty", ctypes.POINTER(Prop), [ctypes.c_int, ctypes.c_uint32]),
                          ("drmModeFreeProperty", None, [ctypes.POINTER(Prop)]),
                          ("drmModeGetPropertyBlob", ctypes.POINTER(Blob), [ctypes.c_int, ctypes.c_uint32]),
                          ("drmModeFreePropertyBlob", None, [ctypes.POINTER(Blob)]),
                          ("drmSetClientCap", ctypes.c_int, [ctypes.c_int, ctypes.c_uint64, ctypes.c_uint64])):
        f = getattr(lib, fn)
        f.restype, f.argtypes = res, args
    return lib


def _hdr_metadata(raw):
    """struct hdr_output_metadata { u32 metadata_type; struct hdr_metadata_infoframe { u8 eotf; u8 metadata_type;
    {u16 x, y} display_primaries[3]; {u16 x, y} white_point; u16 max_display_mastering_luminance;
    u16 min_display_mastering_luminance; u16 max_cll; u16 max_fall; } }"""
    import struct
    if len(raw) < 30:
        return {"raw_len": len(raw)}
    (_, eotf, _mt), rest = struct.unpack_from("<IBB", raw, 0), struct.unpack_from("<12H", raw, 6)
    prim = [(rest[i] / 50000, rest[i + 1] / 50000) for i in (0, 2, 4)]
    return {"eotf": EOTF.get(eotf, eotf), "eotf_id": eotf,
            "primaries": [[round(x, 4), round(y, 4)] for x, y in prim], "white_point": [round(rest[6] / 50000, 4), round(rest[7] / 50000, 4)],
            "max_mastering_nits": rest[8], "min_mastering_nits": rest[9] / 10000, "max_cll": rest[10], "max_fall": rest[11]}


def _mode(m):
    hz = m.clock * 1000 / (m.htotal * m.vtotal) if m.htotal and m.vtotal else m.vrefresh
    return {"size": f"{m.hdisplay}x{m.vdisplay}", "refresh_hz": round(hz, 3), "name": m.name.decode(errors="replace"),
            "interlaced": bool(m.flags & 0x10)}


def drm():
    try:
        lib = _drm()
    except OSError as e:
        return {"error": f"libdrm not found: {e}"}
    out = []
    for node in sorted(glob.glob("/dev/dri/card[0-9]*")):
        try:
            fd = os.open(node, os.O_RDWR | os.O_CLOEXEC)
        except OSError as e:
            out.append({"node": node, "error": str(e)})
            continue
        try:
            lib.drmSetClientCap(fd, DRM_CLIENT_CAP_UNIVERSAL_PLANES, 1)
            lib.drmSetClientCap(fd, DRM_CLIENT_CAP_ATOMIC, 1)  # exposes the atomic-only connector properties
            res = lib.drmModeGetResources(fd)
            if not res:
                out.append({"node": node, "error": "not a KMS device"})
                continue
            conns = []
            for i in range(res.contents.count_connectors):
                c = lib.drmModeGetConnector(fd, res.contents.connectors[i])
                if not c:
                    continue
                cc = c.contents
                item = {"name": f"{CONN_TYPES.get(cc.connector_type, cc.connector_type)}-{cc.connector_type_id}",
                        "connected": cc.connection == 1, "props": {}}
                crtc_id = 0
                for j in range(cc.count_props):
                    p = lib.drmModeGetProperty(fd, cc.props[j])
                    if not p:
                        continue
                    pc, val = p.contents, cc.prop_values[j]
                    pname = pc.name.decode(errors="replace")
                    if pname == "CRTC_ID":
                        crtc_id = val
                    elif pname == "HDR_OUTPUT_METADATA":
                        if val:
                            b = lib.drmModeGetPropertyBlob(fd, val)
                            if b:
                                item["hdr_output_metadata"] = _hdr_metadata(ctypes.string_at(b.contents.data, b.contents.length))
                                lib.drmModeFreePropertyBlob(b)
                        else:
                            item["hdr_output_metadata"] = None  # SDR: no HDR infoframe
                    elif pc.flags & DRM_MODE_PROP_ENUM and pname in ("Colorspace", "Broadcast RGB", "content type", "Content Protection",
                                                                    "link-status", "scaling mode"):
                        names = {pc.enums[k].value: pc.enums[k].name.decode(errors="replace") for k in range(pc.count_enums)}
                        item["props"][pname] = names.get(val, val)
                    elif pname in ("max bpc", "vrr_capable", "non-desktop"):
                        item["props"][pname] = val
                    lib.drmModeFreeProperty(p)
                if not crtc_id and cc.encoder_id:
                    e = lib.drmModeGetEncoder(fd, cc.encoder_id)
                    if e:
                        crtc_id = e.contents.crtc_id
                        lib.drmModeFreeEncoder(e)
                if crtc_id:
                    cr = lib.drmModeGetCrtc(fd, crtc_id)
                    if cr:
                        if cr.contents.mode_valid:
                            item["mode"] = _mode(cr.contents.mode)
                        lib.drmModeFreeCrtc(cr)
                if item["connected"]:
                    item["modes_offered"] = len({(cc.modes[k].hdisplay, cc.modes[k].vdisplay, cc.modes[k].vrefresh) for k in range(cc.count_modes)})
                conns.append(item)
                lib.drmModeFreeConnector(c)
            lib.drmModeFreeResources(res)
            out.append({"node": node, "connectors": conns})
        finally:
            os.close(fd)
    return out


# ---------------------------------------------------------------- audio

def parse_eld(text):
    kv = dict(re.findall(r"^(\S+)\s+(.*)$", text, re.M))
    sads = []
    for m in re.finditer(r"^sad(\d+)_coding_type\s+\[0x[0-9a-f]+\]\s*(.*)$", text, re.M):
        n = m.group(1)
        sads.append({"codec": m.group(2).strip(), "channels": kv.get(f"sad{n}_channels"), "rates": kv.get(f"sad{n}_rates")})
    return {"present": kv.get("monitor_present") == "1", "valid": kv.get("eld_valid") == "1", "monitor": kv.get("monitor_name"),
            "connection": kv.get("connection_type"), "sads": sads}


def iec958_status(card):
    """First channel-status byte per 'IEC958 Playback Default' control; bit 1 set = non-audio (bitstream)."""
    out = []
    if not shutil.which("amixer"):
        return None
    for line in sh("amixer", "-c", str(card), "controls").splitlines():
        if "IEC958 Playback Default" not in line:
            continue
        m = re.search(r"numid=(\d+).*index=(\d+)", line)
        if not m:
            continue
        val = sh("amixer", "-c", str(card), "cget", f"numid={m.group(1)}")
        v = re.search(r": values=(0x[0-9a-f]+)", val) or re.search(r"values=(0x[0-9a-f]+)", val)
        if v:
            b0 = int(v.group(1), 16)
            out.append({"index": int(m.group(2)), "status_byte0": f"0x{b0:02x}", "non_audio": bool(b0 & 0x02)})
    return out


def audio():
    cards = []
    for d in sorted(glob.glob("/proc/asound/card[0-9]*")):
        n = int(re.sub(r"\D", "", os.path.basename(d)))
        card = {"card": n, "id": (read(os.path.join(d, "id")) or "").strip(), "elds": {}, "playing": []}
        for e in sorted(glob.glob(os.path.join(d, "eld#*"))):
            card["elds"][os.path.basename(e)] = parse_eld(read(e) or "")
        for st in sorted(glob.glob(os.path.join(d, "pcm*p", "sub*", "status"))):
            s = read(st) or ""
            if "state:" not in s:
                continue  # closed
            hw = dict(re.findall(r"^(\w+):\s*(.*)$", read(os.path.join(os.path.dirname(st), "hw_params")) or "", re.M))
            card["playing"].append({"pcm": st.split("/")[-3], "state": re.search(r"state:\s*(\S+)", s).group(1),
                                    "owner_pid": (re.search(r"owner_pid\s*:\s*(\d+)", s) or [None, None])[1],
                                    "format": hw.get("format"), "rate": hw.get("rate"), "channels": hw.get("channels")})
        card["iec958"] = iec958_status(n)
        cards.append(card)
    return {"cards": cards}


SECTIONS = {"host": host, "gpu": gpu, "drm": drm, "audio": audio}

if __name__ == "__main__":
    want = sys.argv[1:] or list(SECTIONS)
    bad = [w for w in want if w not in SECTIONS]
    if bad:
        raise SystemExit(f"probe: unknown section(s) {bad}; choose from {list(SECTIONS)}")
    result = {}
    for w in want:
        try:
            result[w] = SECTIONS[w]()
        except Exception as e:  # noqa: BLE001 — one failing section must not hide the others
            result[w] = {"error": f"{type(e).__name__}: {e}"}
    json.dump(result, sys.stdout, indent=1)
    print()
