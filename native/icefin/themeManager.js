// Icefin: Client Settings -> Theme, the theme manager (PLAN 9.21). Appended to the injected native shell script.
// Replaces the section's plain theme drop-down with: a theme list and a colour scheme list, a preview drawn from the
// chosen theme's own tokens (nothing is applied until Apply), one colour scheme list (this theme's schemes and every other
// theme's, each also in Dark: 9.20, 9.25), Classic View's way back (9.24), Apply and Cancel, Install from file (a theme package
// zip, through the native file chooser), and Remove for themes the user installed. A theme with scripts that the
// user installed shows the trust warning and loads its scripts only once trusted (docs/themes/PACKAGE.md, Trust).
(function () {
    'use strict';
    if (window.icefinThemeManager || !window.apiPromise) return;
    window.icefinThemeManager = true;
    const ID = 'icefin-theme-manager';

    const el = (tag, props, ...kids) => {
        const e = Object.assign(document.createElement(tag), props || {});
        kids.forEach((k) => k != null && e.append(k));
        return e;
    };
    const call = (fn, ...args) => new Promise((r) => fn(...args, r));
    const sourceLabel = { bundled: 'built in', user: 'installed by you', development: 'development' };

    // Its selects become in-page drop-downs with the rest of Client Settings (clientSettings.js, window.icefinDropdown).

    function themeSection(dialog) {
        for (const fs of dialog.querySelectorAll('fieldset')) {
            const h = fs.querySelector(':scope > legend h2');
            if (h && h.textContent.trim().toLowerCase() === 'theme') return fs;
        }
        return null;
    }

    // A small picture of a theme from its tokens: the field, a row of cards with the focused one in the focus colour,
    // a line of text and an accent button.
    function drawPreview(box, t) {
        box.textContent = '';
        if (!t) {
            box.append(el('div', { className: 'icefin-tm-stock', textContent: 'The stock look: no theme' }));
            box.style.cssText = 'display:flex;align-items:center;justify-content:center;opacity:0.7';
            return;
        }
        const c = (k, d) => t['color.' + k] || d;
        box.style.cssText = `background:${c('background', 'Canvas')};color:${c('text', 'CanvasText')};position:relative;overflow:hidden;`
            + `border-radius:0.4em;aspect-ratio:16/9;max-width:30em;width:100%;font-size:0.9em;box-shadow:0 0 0 1px ${c('divider', 'GrayText')}`;
        const radius = t['shape.cardRadius'] || '0.3em';
        box.append(el('div', { textContent: 'Home', style: `position:absolute;left:5%;top:6%;font-size:1.3em;font-weight:600` }));
        const row = el('div', { style: 'position:absolute;left:5%;right:5%;top:24%;display:flex;gap:4%' });
        for (let i = 0; i < 4; i++) {
            const card = el('div', { style: `flex:1;aspect-ratio:2/3;border-radius:${radius};background:${c('surface', 'GrayText')}` });
            card.className = 'icefin-tm-card' + (i === 1 ? ' focused' : '');
            if (i === 1) card.style.boxShadow = `0 0 0 0.18em ${c('focus', 'Highlight')}, 0 0 1.2em 0.2em ${c('focusGlow', 'transparent')}`;
            row.append(card);
        }
        box.append(row);
        box.append(el('div', { textContent: 'Title of the focused item', style: 'position:absolute;left:5%;bottom:15%;font-weight:600' }));
        box.append(el('div', { textContent: '2024 · 1 h 52 min', style: `position:absolute;left:5%;bottom:7%;color:${c('textSecondary', 'inherit')}` }));
        box.append(el('div', { textContent: 'Play', style: `position:absolute;right:5%;bottom:7%;padding:0.3em 1.2em;border-radius:1em;`
            + `background:${c('accent', 'Highlight')};color:${c('onAccent', 'HighlightText')}` }));
    }

    async function attach(api, dialog) {
        const section = themeSection(dialog);
        if (!section || section.querySelector('#' + ID)) return;
        // The plain drop-down from the settings description stays as the fallback; the manager hides it.
        section.querySelectorAll('label.inputContainer').forEach((l) => {
            const t = l.querySelector('.inputLabel');
            if (t && /^Theme:/.test(t.textContent.trim()) && l.querySelector('select')) l.style.display = 'none';
        });
        const box = el('div', { id: ID });
        box.style.marginBottom = '1.8em';
        const legend = section.querySelector(':scope > legend');
        if (legend && legend.nextSibling) section.insertBefore(box, legend.nextSibling); else section.append(box);

        const themeSel = el('select', { className: 'emby-select-withcolor emby-select icefin-tm-theme' });
        // One colour scheme list (9.25): this theme's own schemes, then every other theme's, each also in Dark. A value
        // is "<preset>|<scheme>": the preset is "", a preset of this theme, or "@<theme>[/<preset>]" for another's colours.
        const presetSel = el('select', { className: 'emby-select-withcolor emby-select icefin-tm-preset' });
        const classicRow = el('div', { className: 'icefin-tm-classic', style: 'display:none;margin:0 0 1.2em' });
        const preview = el('div', { className: 'icefin-tm-preview' });
        const about = el('p', { className: 'fieldDescription icefin-tm-about' });
        const trustRow = el('label', { className: 'icefin-tm-trust', style: 'display:none;margin:0.6em 0' });
        const trustBox = el('input', { type: 'checkbox', className: 'icefin-tm-trust-box' });
        const trustText = el('span');
        trustRow.append(trustBox, ' ', trustText);
        const status = el('p', { className: 'fieldDescription icefin-tm-status', role: 'status' });
        const button = (text, cls) => el('button', { className: `raised emby-button ${cls}`, type: 'button', textContent: text, style: 'margin:0.4em 0.6em 0 0' });
        const apply = button('Apply', 'button-submit icefin-tm-apply');
        const cancel = button('Cancel', 'icefin-tm-cancel');
        const install = button('Install from file…', 'icefin-tm-install');
        const remove = button('Remove', 'icefin-tm-remove');
        const field = (text, control) => el('div', { className: 'inputContainer', style: 'display:block;margin-bottom:1em' },
            el('label', { className: 'inputLabel', textContent: text }), control);
        // In-page drop-downs (clientSettings.js), now rather than on its next pass, so they're ready when shown.
        setTimeout(() => { if (window.icefinDropdown) box.querySelectorAll('select').forEach(window.icefinDropdown); }, 0);
        box.append(classicRow, field('Theme: ', themeSel), field('Colour scheme: ', presetSel), preview, about, trustRow,
            el('div', {}, apply, cancel, install, remove), status);

        let themes = [];
        let active = { theme: '', preset: '', scheme: '' };
        const chosen = () => themes.find((t) => t.id === themeSel.value) || null;

        const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
        const hasDark = (t) => !!t && (t.schemes || []).some((sc) => sc.id === 'dark');
        const parse = (v) => { const [p, sc] = String(v || '|').split('|'); return { preset: p || '', scheme: sc || '' }; };
        // want: the value to select ("<preset>|<scheme>"); undefined keeps the current one when the list has it.
        async function refreshPreview(want) {
            const t = chosen();
            const keep = want === undefined ? presetSel.value : want;
            presetSel.textContent = '';
            if (t) {
                const add = (parent, value, label) => parent.append(el('option', { value, textContent: label }));
                const own = el('optgroup', { label: t.name });
                add(own, '|', 'Default');
                if (hasDark(t)) add(own, '|dark', 'Dark');
                (t.presets || []).forEach((p) => {
                    add(own, `${p}|`, cap(p));
                    if (hasDark(t)) add(own, `${p}|dark`, `${cap(p)} (Dark)`);
                });
                presetSel.append(own);
                // Every other theme's colours, its presets and their Dark versions.
                const others = el('optgroup', { label: 'From other themes' });
                themes.filter((o) => o.id !== t.id).forEach((o) => {
                    add(others, `@${o.id}|`, o.name);
                    if (hasDark(o)) add(others, `@${o.id}|dark`, `${o.name} (Dark)`);
                    (o.presets || []).forEach((p) => {
                        add(others, `@${o.id}/${p}|`, `${o.name}: ${cap(p)}`);
                        if (hasDark(o)) add(others, `@${o.id}/${p}|dark`, `${o.name}: ${cap(p)} (Dark)`);
                    });
                });
                if (others.children.length) presetSel.append(others);
            }
            const values = [...presetSel.options].map((o) => o.value);
            presetSel.value = values.includes(keep) ? keep : (values[0] || '');
            presetSel.disabled = !t;
            const pick = parse(presetSel.value);
            drawPreview(preview, t ? await call(api.theme.previewTokens, t.id, pick.preset, pick.scheme) : null);
            about.textContent = t ? `${t.name} ${t.version} · ${sourceLabel[t.source] || t.source}${t.description ? ' · ' + t.description : ''}` : '';
            const needsTrust = !!t && t.source === 'user' && t.hasScripts;
            trustRow.style.display = needsTrust ? 'block' : 'none';
            if (needsTrust) {
                trustText.textContent = 'Allow this theme\'s scripts. ' + await call(api.theme.trustWarning);
                trustBox.checked = !!t.trusted;
            }
            remove.style.display = t && t.source === 'user' ? '' : 'none';
            const changed = themeSel.value !== active.theme || (!!t && presetSel.value !== `${active.preset || ''}|${active.scheme || ''}`)
                || (needsTrust && trustBox.checked !== !!t.trusted);
            apply.disabled = !changed;
            cancel.disabled = !changed;
        }

        async function load(selectId) {
            themes = (await call(api.theme.themes)).filter((t) => t.ok);
            const sel = await call(api.theme.selection);
            active = { theme: sel.theme || '', preset: sel.preset || '', scheme: sel.scheme || '' };
            // Classic View (9.24): the stock look for this session; the way back to the saved theme.
            classicRow.textContent = '';
            if (await call(api.theme.classic)) {
                const saved = themes.find((t) => t.id === active.theme);
                classicRow.append(el('p', { className: 'fieldDescription', textContent: 'Classic View is on for this session: the standard Jellyfin look.' }));
                if (saved) {
                    const back = button(`Back to ${saved.name}`, 'button-submit icefin-tm-unclassic');
                    back.addEventListener('click', () => call(api.theme.setClassic, false).then(() => load()));
                    classicRow.append(back);
                }
                classicRow.style.display = 'block';
            } else {
                classicRow.style.display = 'none';
            }
            themeSel.textContent = '';
            themeSel.append(el('option', { value: '', textContent: 'Off (stock look)' }));
            themes.sort((a, b) => a.name.localeCompare(b.name)).forEach((t) =>
                themeSel.append(el('option', { value: t.id, textContent: t.source === 'bundled' ? t.name : `${t.name} (${sourceLabel[t.source]})` })));
            themeSel.value = selectId != null && themes.some((t) => t.id === selectId) ? selectId : active.theme;
            await refreshPreview(themeSel.value === active.theme ? `${active.preset}|${active.scheme}` : `|${active.scheme}`);
        }

        // Another theme: its Default, in Dark when that's what's on now (Dark is a preference across themes).
        themeSel.addEventListener('change', () => { status.textContent = ''; refreshPreview(themeSel.value === active.theme ? `${active.preset}|${active.scheme}` : `|${active.scheme}`); });
        presetSel.addEventListener('change', () => refreshPreview());
        trustBox.addEventListener('change', () => refreshPreview());
        cancel.addEventListener('click', () => { status.textContent = ''; load(); });
        apply.addEventListener('click', async () => {
            const t = chosen();
            if (t && t.source === 'user' && t.hasScripts && trustBox.checked !== !!t.trusted) await call(api.theme.setTrusted, t.id, trustBox.checked);
            const pick = parse(presetSel.value);
            const ok = await call(api.theme.select, themeSel.value, t ? pick.preset : '', t ? pick.scheme : '');
            if (!ok) {
                const errs = await call(api.theme.lastErrors);
                status.textContent = `Couldn't apply it: ${(errs || []).join('; ') || 'unknown error'}`;
                return load();
            }
            const colours = t && presetSel.value !== '|' ? ` with ${presetSel.selectedOptions[0].textContent}` : '';
            status.textContent = t ? `${t.name}${colours} is on.` : 'The stock look is on.';
            load();
        });
        install.addEventListener('click', () => { status.textContent = 'Choose a theme package…'; api.theme.pickPackage(); });
        remove.addEventListener('click', async () => {
            const t = chosen();
            if (!t) return;
            const r = await call(api.theme.removePackage, t.id);
            status.textContent = r.ok ? `${t.name} was removed.` : `Couldn't remove it: ${r.errors.join('; ')}`;
            if (r.ok) load();
        });
        box.icefinInstalled = (r) => {
            if (r.cancelled) { status.textContent = ''; return; }
            if (!r.ok) { status.textContent = `Couldn't install it: ${(r.errors || []).join('; ')}`; return; }
            status.textContent = `${r.name || r.id} ${r.replaced ? 'was updated' : 'was installed'}. `
                + (r.hasScripts ? 'It has scripts: allow them below to use all of it. ' : '') + 'Apply to switch to it.';
            load(r.id);
        };
        box.icefinReload = () => load(themeSel.value);
        load();
    }

    window.apiPromise.then((api) => {
        if (!api.theme || !api.theme.pickPackage) return;
        const scan = () => document.querySelectorAll('.formDialogHeaderTitle').forEach((t) => {
            if (t.textContent === 'Client Settings') attach(api, t.closest('.dialog'));
        });
        const start = () => new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
        if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
        api.theme.installFinished.connect((r) => { const b = document.getElementById(ID); if (b && b.icefinInstalled) b.icefinInstalled(r); });
        api.theme.classicChanged.connect(() => { const b = document.getElementById(ID); if (b && b.icefinReload) b.icefinReload(); });
        api.theme.packagesChanged.connect(() => { const b = document.getElementById(ID); if (b && b.icefinReload && !b.querySelector('.icefin-tm-status').textContent) b.icefinReload(); });
    });
})();
