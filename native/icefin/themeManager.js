// Icefin: Client Settings -> Theme, the theme manager (PLAN 9.21). Appended to the injected native shell script.
// Replaces the section's plain theme drop-down with: a theme list and a colour scheme list, a preview drawn from the
// chosen theme's own tokens (nothing is applied until Apply), a Mode list (Standard or Dark, 9.20), Apply and Cancel, Install from file (a theme package
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

    // Drop-downs (user report 2026-11-11: they didn't show as drop-downs). jellyfin-web's select style removes the
    // native arrow (its own selects get a separate arrow element), and the native pop-up list isn't something a remote
    // or a gamepad drives well. Each select gets a box and a chevron, also when disabled, and opens an in-page list:
    // arrows move, Enter or a click picks, Back or Escape closes it without leaving Client Settings.
    const DD_STYLE = `
.icefin-dd { position: relative; display: block; }
.icefin-dd > select { width: 100%; box-sizing: border-box; padding-right: 2.6em !important; cursor: pointer; appearance: none; -webkit-appearance: none;
  background-color: var(--icefin-color-inputBackground, Field) !important; color: var(--icefin-color-text, FieldText) !important;
  border: 0.1em solid var(--icefin-color-divider, GrayText) !important; border-radius: 0.3em; opacity: 1 !important; }
.icefin-dd > select:disabled { cursor: default; color: var(--icefin-color-textSecondary, GrayText) !important; }
.icefin-dd > select:focus { outline: none; border-color: var(--icefin-color-focus, Highlight) !important; box-shadow: 0 0 0 0.12em var(--icefin-color-focus, Highlight); }
.icefin-dd::after { content: ''; position: absolute; right: 1em; top: 50%; width: 0.55em; height: 0.55em; margin-top: -0.4em; pointer-events: none;
  border-right: 0.15em solid var(--icefin-color-text, FieldText); border-bottom: 0.15em solid var(--icefin-color-text, FieldText); transform: rotate(45deg); }
.icefin-dd.disabled::after { opacity: 0.4; }
.icefin-dd-list { position: fixed; z-index: 10000; max-height: 50vh; overflow-y: auto; box-sizing: border-box; padding: 0.3em 0; border-radius: 0.3em;
  background: var(--icefin-color-surfaceRaised, var(--icefin-color-surface, Canvas)); color: var(--icefin-color-text, CanvasText);
  border: 0.1em solid var(--icefin-color-divider, GrayText); box-shadow: 0 0.8em 2em rgb(var(--icefin-color-background-channel, 0 0 0) / 0.5); scrollbar-width: thin; }
.icefin-dd-option { padding: 0.6em 1em; cursor: pointer; outline: none; }
.icefin-dd-option[aria-selected="true"] { font-weight: 600; }
.icefin-dd-option[aria-selected="true"]::after { content: " ✓"; }
.icefin-dd-option:focus, .icefin-dd-option:hover { background: var(--icefin-color-focus, Highlight); color: var(--icefin-color-onFocus, HighlightText); }
`;
    function ddStyle() {
        if (document.getElementById('icefin-dd-style')) return;
        const st = el('style', { id: 'icefin-dd-style', textContent: DD_STYLE });
        document.head.append(st);
    }
    let ddOpen = null;
    function ddClose(refocus) {
        if (!ddOpen) return;
        const { list, select } = ddOpen;
        ddOpen = null;
        list.remove();
        if (refocus) select.focus({ preventScroll: true });
    }
    function ddPick(select, value) {
        if (select.value !== value) {
            select.value = value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        ddClose(true);
    }
    function ddOpenList(select) {
        if (select.disabled) return;
        ddClose(false);
        const r = select.getBoundingClientRect();
        const list = el('div', { className: 'icefin-dd-list', role: 'listbox' });
        list.style.left = `${r.left}px`;
        list.style.width = `${r.width}px`;
        const below = window.innerHeight - r.bottom, above = r.top;
        if (below >= 200 || below >= above) list.style.top = `${r.bottom + 2}px`; else list.style.bottom = `${window.innerHeight - r.top + 2}px`;
        let current = null;
        [...select.options].forEach((o) => {
            const it = el('div', { className: 'icefin-dd-option', role: 'option', tabIndex: 0, textContent: o.textContent });
            it.dataset.value = o.value;
            if (o.value === select.value) { it.setAttribute('aria-selected', 'true'); current = it; }
            it.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); ddPick(select, o.value); });
            list.append(it);
        });
        const keys = (e) => {
            const items = [...list.children], i = items.indexOf(document.activeElement);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const n = Math.max(0, Math.min(items.length - 1, (i < 0 ? 0 : i) + (e.key === 'ArrowDown' ? 1 : -1)));
                items[n].focus({ preventScroll: true });
                const it = items[n];
                if (it.offsetTop < list.scrollTop) list.scrollTop = it.offsetTop;
                else if (it.offsetTop + it.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = it.offsetTop + it.offsetHeight - list.clientHeight;
            } else if (e.key === 'Enter' || e.key === ' ') {
                if (i >= 0) ddPick(select, items[i].dataset.value);
            } else if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
                ddClose(true);
            } else if (e.key === 'Tab') {
                ddClose(true);
                return;
            } else {
                return;
            }
            e.preventDefault();
            e.stopImmediatePropagation();
        };
        list.addEventListener('keydown', keys, true);
        // jellyfin-web's input layer (remote, gamepad) sends a cancelable "command" event to the focused element.
        list.addEventListener('command', (e) => {
            const c = e.detail && e.detail.command;
            if (c === 'back') { e.preventDefault(); e.stopPropagation(); ddClose(true); }
        });
        document.body.append(list);
        ddOpen = { list, select };
        // Focus without scrolling anything else (scrolling the dialog would close the list), then bring the entry into
        // the list's own view.
        const first = current || list.firstChild;
        first.focus({ preventScroll: true });
        list.scrollTop = Math.max(0, first.offsetTop - list.clientHeight / 2);
    }
    function dropdown(select) {
        ddStyle();
        const wrap = el('div', { className: 'icefin-dd' });
        wrap.append(select);
        const sync = () => wrap.classList.toggle('disabled', select.disabled);
        new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ['disabled'] });
        sync();
        let pressed = false;  // a mouse press handled here; its click that follows is not a second open
        select.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            pressed = true;
            select.focus({ preventScroll: true });
            if (ddOpen && ddOpen.select === select) ddClose(true); else ddOpenList(select);
        });
        select.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ' || (e.key === 'ArrowDown' && e.altKey) || e.key === 'F4') { e.preventDefault(); e.stopPropagation(); ddOpenList(select); }
        });
        // A click that isn't a mouse press (the remote's OK through jellyfin-web, tests) opens it too.
        select.addEventListener('click', (e) => {
            if (pressed) { pressed = false; return; }
            e.preventDefault();
            if (!ddOpen) ddOpenList(select);
        });
        return wrap;
    }
    document.addEventListener('mousedown', (e) => { if (ddOpen && !ddOpen.list.contains(e.target) && e.target !== ddOpen.select) ddClose(false); }, true);
    window.addEventListener('resize', () => ddClose(false));
    document.addEventListener('scroll', (e) => { if (ddOpen && !ddOpen.list.contains(e.target)) ddClose(false); }, true);  // the dialog moved under it

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
        const presetSel = el('select', { className: 'emby-select-withcolor emby-select icefin-tm-preset' });
        const schemeSel = el('select', { className: 'emby-select-withcolor emby-select icefin-tm-scheme' });
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
            el('label', { className: 'inputLabel', textContent: text }), dropdown(control));
        box.append(field('Theme: ', themeSel), field('Colour scheme: ', presetSel), field('Mode: ', schemeSel), preview, about, trustRow,
            el('div', {}, apply, cancel, install, remove), status);

        let themes = [];
        let active = { theme: '', preset: '', scheme: '' };
        const chosen = () => themes.find((t) => t.id === themeSel.value) || null;

        // want: the scheme to select ('' = Default); undefined keeps the current one when the theme has it.
        async function refreshPreview(want) {
            const t = chosen();
            const presets = t ? t.presets || [] : [];
            const keep = want === undefined ? presetSel.value : want;
            presetSel.textContent = '';
            presetSel.append(el('option', { value: '', textContent: 'Default' }));
            presets.forEach((p) => presetSel.append(el('option', { value: p, textContent: p.charAt(0).toUpperCase() + p.slice(1) })));
            presetSel.value = presets.includes(keep) ? keep : '';
            presetSel.disabled = !presets.length;
            // Mode (9.20): Standard or one of the theme's schemes (Dark). It's a preference across themes, so the
            // current choice stays while the list is rebuilt.
            const schemes = t ? t.schemes || [] : [];
            const keepScheme = schemeSel.options.length ? schemeSel.value : active.scheme;
            schemeSel.textContent = '';
            schemeSel.append(el('option', { value: '', textContent: 'Standard' }));
            schemes.forEach((sc) => schemeSel.append(el('option', { value: sc.id, textContent: sc.name })));
            schemeSel.value = schemes.some((sc) => sc.id === keepScheme) ? keepScheme : '';
            schemeSel.disabled = !schemes.length;
            drawPreview(preview, t ? await call(api.theme.previewTokens, t.id, presetSel.value, schemeSel.value) : null);
            about.textContent = t ? `${t.name} ${t.version} · ${sourceLabel[t.source] || t.source}${t.description ? ' · ' + t.description : ''}` : '';
            const needsTrust = !!t && t.source === 'user' && t.hasScripts;
            trustRow.style.display = needsTrust ? 'block' : 'none';
            if (needsTrust) {
                trustText.textContent = 'Allow this theme\'s scripts. ' + await call(api.theme.trustWarning);
                trustBox.checked = !!t.trusted;
            }
            remove.style.display = t && t.source === 'user' ? '' : 'none';
            const changed = themeSel.value !== active.theme || presetSel.value !== (active.preset || '') || schemeSel.value !== (active.scheme || '')
                || (needsTrust && trustBox.checked !== !!t.trusted);
            apply.disabled = !changed;
            cancel.disabled = !changed;
        }

        async function load(selectId) {
            themes = (await call(api.theme.themes)).filter((t) => t.ok);
            const sel = await call(api.theme.selection);
            active = { theme: sel.theme || '', preset: sel.preset || '', scheme: sel.scheme || '' };
            schemeSel.textContent = '';
            themeSel.textContent = '';
            themeSel.append(el('option', { value: '', textContent: 'Off (stock look)' }));
            themes.sort((a, b) => a.name.localeCompare(b.name)).forEach((t) =>
                themeSel.append(el('option', { value: t.id, textContent: t.source === 'bundled' ? t.name : `${t.name} (${sourceLabel[t.source]})` })));
            themeSel.value = selectId != null && themes.some((t) => t.id === selectId) ? selectId : active.theme;
            await refreshPreview(themeSel.value === active.theme ? active.preset : '');
        }

        themeSel.addEventListener('change', () => { status.textContent = ''; refreshPreview(themeSel.value === active.theme ? active.preset : ''); });
        presetSel.addEventListener('change', () => refreshPreview());
        schemeSel.addEventListener('change', () => refreshPreview());
        trustBox.addEventListener('change', () => refreshPreview());
        cancel.addEventListener('click', () => { status.textContent = ''; load(); });
        apply.addEventListener('click', async () => {
            const t = chosen();
            if (t && t.source === 'user' && t.hasScripts && trustBox.checked !== !!t.trusted) await call(api.theme.setTrusted, t.id, trustBox.checked);
            const ok = await call(api.theme.select, themeSel.value, presetSel.value, schemeSel.value);
            if (!ok) {
                const errs = await call(api.theme.lastErrors);
                status.textContent = `Couldn't apply it: ${(errs || []).join('; ') || 'unknown error'}`;
                return load();
            }
            const mode = schemeSel.value ? ` (${schemeSel.selectedOptions[0].textContent})` : '';
            status.textContent = t ? `${t.name}${mode} is on.` : 'The stock look is on.';
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
        api.theme.packagesChanged.connect(() => { const b = document.getElementById(ID); if (b && b.icefinReload && !b.querySelector('.icefin-tm-status').textContent) b.icefinReload(); });
    });
})();
