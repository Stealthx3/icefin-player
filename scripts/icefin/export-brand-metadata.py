#!/usr/bin/env python3
"""Export Icefin Player's project metadata for the IceSuite art kit (marketing materials and READMEs).

Reads the repo's sources of truth and writes PROJECT-METADATA.md and project-metadata.json into a folder,
normally the art kit's brand folder:

    python3 -I scripts/icefin/export-brand-metadata.py /path/to/Personal/Projects/IceSuite/IceFin-Player/brand

Sources: src/icefin/meta/<app id>.metainfo.xml (name, summary, description, releases, URLs, license),
src/icefin/meta/<app id>.desktop (generic name, keywords, categories), themes/*/theme.json (bundled themes),
README.md (goals, feature list, relationship and credits text), src/icefin/VERSION;
themes-later/*/theme.json (themes held back for a later update, D36).
Run it again whenever one of those changes; never edit the exported files by hand.
"""
import datetime, json, pathlib, re, sys, xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
APP_ID = re.search(r'set\(ICEFIN_APP_ID\s+(\S+)\)', (ROOT / 'src/icefin/IcefinBranding.cmake').read_text()).group(1)


def text(el):
    return ' '.join(''.join(el.itertext()).split()) if el is not None else ''


def metainfo():
    t = ET.parse(ROOT / f'src/icefin/meta/{APP_ID}.metainfo.xml').getroot()
    rel = [{'version': r.get('version'), 'date': r.get('date'), 'type': r.get('type'),
            'url': text(r.find('url')), 'notes': text(r.find('description'))} for r in t.iter('release')]
    return {
        'name': text(t.find('name')),
        'summary': text(t.find('summary')),
        'description': [text(p) for p in t.find('description').findall('p')],
        'developer': text(t.find('developer/name')),
        'license': text(t.find('project_license')),
        'urls': {u.get('type'): text(u) for u in t.findall('url')},
        'categories': [text(c) for c in t.findall('categories/category')],
        'controls': [text(c) for c in t.findall('supports/control')],
        'binary': text(t.find('provides/binary')),
        'releases': rel,
    }


def desktop():
    d = {}
    for line in (ROOT / f'src/icefin/meta/{APP_ID}.desktop').read_text().splitlines():
        if line.startswith('['):
            if d:
                break
            continue
        if '=' in line:
            k, v = line.split('=', 1)
            d[k] = v
    return {'generic_name': d.get('GenericName', ''), 'comment': d.get('Comment', ''),
            'keywords': [k for k in d.get('Keywords', '').split(';') if k]}


def themes():
    """Built-in themes (themes/) and the ones held back for a later update (themes-later/, D36)."""
    out = []
    for folder, stage in (('themes', 'built-in'), ('themes-later', 'later update')):
        for f in sorted((ROOT / folder).glob('*/theme.json')):
            j = json.loads(f.read_text())
            out.append({'id': j.get('id'), 'name': j.get('name'), 'version': j.get('version'), 'stage': stage,
                        'description': j.get('description', '')})
    return out


def readme_section(title):
    md = (ROOT / 'README.md').read_text()
    m = re.search(rf'^## {re.escape(title)}\n(.*?)(?=^## )', md, re.S | re.M)
    body = m.group(1).strip() if m else ''
    return re.sub(r'<picture>.*?</picture>\s*', '', body)  # drop the inline feature icons


def first_paragraph():
    md = (ROOT / 'README.md').read_text()
    for block in md.split('\n\n'):
        b = block.strip()
        if b and not b.startswith(('<', '[', '#', '>')):
            return ' '.join(b.split())
    return ''


def main():
    dest = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.').expanduser()
    mi, de = metainfo(), desktop()
    data = {
        'generated': datetime.date.today().isoformat(),
        'generated_from': 'icefin-player repo: scripts/icefin/export-brand-metadata.py',
        'app_id': APP_ID,
        'version': (ROOT / 'src/icefin/VERSION').read_text().strip(),
        **mi,
        **de,
        'readme_intro': first_paragraph(),
        'themes': themes(),
    }
    dest.mkdir(parents=True, exist_ok=True)
    (dest / 'project-metadata.json').write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')

    latest = mi['releases'][0] if mi['releases'] else None
    L = [
        f"# {mi['name']}: project metadata",
        '',
        f"Exported {data['generated']} from the `icefin-player` repo by `scripts/icefin/export-brand-metadata.py`. "
        'Use this for marketing materials and READMEs. Don\'t edit it here: change the repo (AppStream metainfo, '
        'desktop entry, theme packages or README) and export again. The same data is in `project-metadata.json`.',
        '',
        '## Identity',
        '',
        '| Field | Value |',
        '| --- | --- |',
        f"| Name (as shipped) | {mi['name']} |",
        f"| App ID | `{APP_ID}` |",
        f"| Command | `{mi['binary']}` |",
        f"| Version | {data['version']}" + (f" (latest release {latest['version']}, {latest['date']})" if latest else '') + ' |',
        f"| Summary | {mi['summary']} |",
        f"| Generic name | {de['generic_name']} |",
        f"| Developer | {mi['developer']} |",
        f"| License | {mi['license']} |",
        f"| Categories | {', '.join(mi['categories'])} |",
        f"| Keywords | {', '.join(de['keywords'])} |",
        f"| Input | {', '.join(mi['controls'])} |",
    ] + [f"| URL ({k}) | {v} |" for k, v in mi['urls'].items()] + [
        '',
        '## Description (AppStream, as shipped)',
        '',
    ] + [p + '\n' for p in mi['description']] + [
        '## README introduction',
        '',
        data['readme_intro'],
        '',
        '## Goals (README)',
        '',
        readme_section('Goals'),
        '',
        '## Features (README)',
        '',
        readme_section('Planned features'),
        '',
        f"## Themes ({len(data['themes'])}, from the theme packages; staged releases, D36)",
        '',
        '| Theme | Version | Ships | Description |',
        '| --- | --- | --- | --- |',
    ] + [f"| {t['name']} | {t['version']} | {t['stage']} | {t['description']} |" for t in data['themes']] + [
        '',
        '## Relationship to Jellyfin and credits (README; use this wording)',
        '',
        readme_section('Relationship to Jellyfin'),
        '',
        readme_section('Credits'),
        '',
        '## Releases (AppStream)',
        '',
        '| Version | Date | Notes |',
        '| --- | --- | --- |',
    ] + [f"| {r['version']} | {r['date']} | {r['notes']} |" for r in mi['releases']] + ['']
    (dest / 'PROJECT-METADATA.md').write_text('\n'.join(L))
    print(f'wrote {dest}/PROJECT-METADATA.md and project-metadata.json')


if __name__ == '__main__':
    main()
