#!/usr/bin/env python3
"""theme-contrast.py — colour contrast of every bundled theme, with every preset and every colour scheme (PLAN 9.20).

Resolves tokens the way the engine does (src/icefin/theme/ThemePackage.cpp: base, preset, scheme, the scheme's
override for that preset; "{group.name}" references) and checks WCAG 2 contrast ratios, translucent colours
composited over what they sit on:

  text on background, text on surface ............ 4.5  (body text)
  textSecondary on background ..................... 3.0  (secondary lines: large or bold in every theme)
  onAccent on accent, onFocus on focus ............ 3.0  (button labels, bold)
  focus against background ........................ 3.0  (non-text contrast: the focus must be visible)

Exit 1 on a failure. Known misses in a clone's default colours (its target's own) are listed with a reason in
theme-contrast-allow.json and reported, not failed; only the default scheme can be listed. --report prints every ratio.
CI: icefin-hooks (with theme-lint.sh).
Usage: python3 scripts/icefin/theme-contrast.py [--report] [themes dir ...]
"""
import json, os, re, sys

CHECKS = [("text", "background", 4.5), ("text", "surface", 4.5), ("textSecondary", "background", 3.0),
          ("onAccent", "accent", 3.0), ("onFocus", "focus", 3.0), ("focus", "background", 3.0)]
REF = re.compile(r"^\{([A-Za-z0-9.]+)\}$")


def flatten(obj, prefix=""):
    out = {}
    for k, v in obj.items():
        if k.startswith("$"):
            continue
        key = f"{prefix}{k}"
        if isinstance(v, dict) and "$value" in v:
            out[key] = v["$value"]
        elif isinstance(v, dict):
            out.update(flatten(v, key + "."))
        else:
            out[key] = v
    return out


def resolve(t):
    def get(k, seen=()):
        v = t.get(k)
        m = REF.match(v) if isinstance(v, str) else None
        if not m:
            return v
        if m.group(1) in seen:
            raise ValueError(f"reference cycle at {k}")
        return get(m.group(1), seen + (k,))
    return {k: get(k) for k in t}


def parse(c):
    c = str(c).strip()
    m = re.fullmatch(r"#([0-9a-fA-F]{3,8})", c)
    if m:
        h = m.group(1)
        if len(h) in (3, 4):
            h = "".join(x * 2 for x in h)
        if len(h) not in (6, 8):
            return None
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)
    m = re.fullmatch(r"rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)", c)
    if m:
        return (float(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4)) if m.group(4) else 1.0)
    return None


def over(fg, bg):
    a = fg[3]
    return (fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1.0)


def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def variants(d):
    meta = json.load(open(os.path.join(d, "theme.json")))
    base = flatten(json.load(open(os.path.join(d, "tokens.json")))) if os.path.exists(os.path.join(d, "tokens.json")) else {}
    presets = {k: flatten(v) for k, v in meta.get("presets", {}).items()}
    schemes = meta.get("schemes", {})
    for sc in [""] + sorted(schemes):
        for pr in [""] + sorted(presets):
            t = dict(base)
            t.update(presets.get(pr, {}))
            if sc:
                t.update(flatten(schemes[sc].get("tokens", {})))
                t.update(flatten(schemes[sc].get("presets", {}).get(pr, {})))
            yield meta["id"], pr, sc, resolve(t)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    report = "--report" in sys.argv
    roots = args or [os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "themes")]
    allow = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "theme-contrast-allow.json")))
    fails, known, n = [], [], 0
    for root in roots:
        for name in sorted(os.listdir(root)):
            d = os.path.join(root, name)
            if not os.path.isfile(os.path.join(d, "theme.json")):
                continue
            for tid, pr, sc, t in variants(d):
                n += 1
                label = tid + (f"/{pr}" if pr else "") + (f" ({sc})" if sc else "")
                page = parse(t.get("color.background", ""))
                if not page:
                    fails.append(f"{label}: color.background isn't a colour")
                    continue
                page = over(page, (0, 0, 0, 1)) if page[3] < 1 else page
                row = []
                for fg, bg, need in CHECKS:
                    f, b = parse(t.get(f"color.{fg}", "")), parse(t.get(f"color.{bg}", ""))
                    if not f or not b:
                        continue  # optional token not declared
                    b = over(b, page) if b[3] < 1 else b
                    r = ratio(over(f, b), b)
                    row.append(f"{fg}/{bg} {r:.2f}")
                    if r < need:
                        why = allow.get(tid, {}).get(f"{fg}/{bg}") if not sc else None
                        (known if why else fails).append(f"{label}: {fg} on {bg} is {r:.2f}:1, needs {need}:1" + (f" (known: {why})" if why else ""))
                if report:
                    print(f"{label:28} " + "  ".join(row))
    for f in known:
        print("theme-contrast: " + f)
    for f in fails:
        print("theme-contrast: FAIL " + f)
    print(f"theme-contrast: {'OK' if not fails else 'FAILED'} ({n} theme/preset/scheme combinations, {len(known)} known misses in clone defaults)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
