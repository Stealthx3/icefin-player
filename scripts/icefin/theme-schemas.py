#!/usr/bin/env python3
"""theme-schemas.py: check every theme package in the repo against the shared JSON schemas (PLAN 8.5).

Packages: themes/* (built in) and tests/icefin/themes/* (fixtures). Exit 1 on a schema error.
Needs python3-jsonschema (CI: icefin-hooks installs it).
"""
import glob, json, os, sys

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCHEMAS = os.path.join(ROOT, "docs", "themes", "schema")
theme_s = json.load(open(os.path.join(SCHEMAS, "theme.schema.json")))
tokens_s = json.load(open(os.path.join(SCHEMAS, "tokens.schema.json")))
reg = Registry().with_resources([(s["$id"], Resource.from_contents(s)) for s in (theme_s, tokens_s)]) \
    .with_resource("tokens.schema.json", Resource.from_contents(tokens_s))
bad = 0
pkgs = sorted(glob.glob(os.path.join(ROOT, "themes", "*", "theme.json")) + glob.glob(os.path.join(ROOT, "tests", "icefin", "themes", "*", "theme.json")))
for meta in pkgs:
    d = os.path.dirname(meta)
    for name, schema in (("theme.json", theme_s), ("tokens.json", tokens_s)):
        errs = sorted(Draft202012Validator(schema, registry=reg).iter_errors(json.load(open(os.path.join(d, name)))), key=str)
        for e in errs:
            print(f"theme-schemas: {os.path.relpath(d, ROOT)}/{name}: {'/'.join(map(str, e.path)) or '(root)'}: {e.message}")
            bad = 1
print(f"theme-schemas: {'FAILED' if bad else 'OK'} ({len(pkgs)} packages)")
sys.exit(bad)
