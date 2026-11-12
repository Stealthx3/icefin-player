// Icefin theme engine: the themed settings area (PLAN 9.24). Appended after detailsScreen.js.
//
//   T.registerScreen('#/mypreferencesmenu', T.ui.settings.screen({ layout: 'tiles' | 'list' }))
//
// Every theme's settings area has the same three entries, so none can drop one:
//   - Client settings: this player's settings (theme, video, audio, controllers...), the Client Settings dialog in the
//     theme's colours;
//   - Classic View: the standard Jellyfin web client straight away, for this session (the saved theme comes back at the
//     next start, or from Client Settings -> Theme);
//   - Server Settings: the server's dashboard, as jellyfin-web's own page; shown to administrators only.
// Under them, the user's own profile and preferences (jellyfin-web's page). Back and Home at the top, as on the
// details screens.
//
// Client settings is a themed page of its own (#/mypreferencesmenu?pane=client, user feedback on the first alpha): the
// real Client Settings dialog (nativeshell.js, with every Icefin section added to it: theme manager, Hardware, Audio
// test, Controllers) is built as usual and moved into the screen, beside a list of its sections. Everything in it takes
// focus from the remote or a controller: arrows move by position, OK toggles, opens a drop-down or presses, and a
// drop-down's list follows the arrows. While a theme with a settings area is up, any way of opening Client Settings
// (jellyfin-web's menus included) leads here; Classic View and Baseline keep the dialog. The markup reuses the details screen's classes (.icefin-details, .icefin-d-btn, .icefin-d-nav) so
// a theme's button and focus styles apply as they are; .icefin-settings and .icefin-s-* lay it out.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (!T || !T._engine || !T.ui || T.ui.settings) return;
    const FOCUS = '[data-icefin-focus]';
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const focusable = (e) => { e.setAttribute('data-icefin-focus', ''); e.tabIndex = -1; return e; };

    const BASE = `
.icefin-settings { position: absolute; inset: 0; overflow: clip; color: var(--icefin-color-text); font-size: 2.4vh; background: transparent; }
.icefin-settings .icefin-s-body { position: absolute; inset: 12vh 8vw 6vh; display: flex; flex-direction: column; gap: 3vh; }
.icefin-settings .icefin-s-title { font-size: 2.6em; font-weight: 300; margin: 0; }
.icefin-settings .icefin-s-entries { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2vw; }
.icefin-settings[data-hub="list"] .icefin-s-entries { grid-template-columns: minmax(0, 46vw); gap: 1.2vh; }
.icefin-settings .icefin-s-entry.icefin-d-btn { display: block; white-space: normal; padding: 1.6em 1.8em; min-height: 8em; box-sizing: border-box; }
.icefin-settings[data-hub="list"] .icefin-s-entry.icefin-d-btn { min-height: 0; padding: 1em 1.4em; }
.icefin-settings .icefin-s-name { font-size: 1.35em; font-weight: 600; display: block; }
.icefin-settings .icefin-s-desc { display: block; margin-top: 0.5em; opacity: 0.8; font-size: 0.9em; line-height: 1.4; }
.icefin-settings .icefin-s-more { display: flex; gap: 1em; flex-wrap: wrap; }
.icefin-settings .icefin-s-note { color: var(--icefin-color-textSecondary); }
.icefin-settings .icefin-cs-page { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(12em, 22%) minmax(0, 1fr); gap: 2vw; }
.icefin-settings .icefin-cs-rail { display: flex; flex-direction: column; gap: 0.8vh; overflow-y: auto; scrollbar-width: none; padding: 0.4em; }
.icefin-settings .icefin-cs-rail .icefin-d-btn { text-align: left; white-space: normal; text-transform: capitalize; }
.icefin-settings .icefin-cs-rail .icefin-d-btn.icefin-cs-here { box-shadow: inset 0.25em 0 0 var(--icefin-color-accent); }
.icefin-settings .icefin-cs-host { min-height: 0; position: relative; }
.icefin-settings .icefin-cs-host > .dialog { position: absolute !important; inset: 0 !important; margin: 0 !important; width: auto !important; height: auto !important;
  max-width: none !important; max-height: none !important; transform: none !important; animation: none !important; box-shadow: none !important;
  border-radius: var(--icefin-shape-cardRadius, 0.6em); background: var(--icefin-color-surface); color: var(--icefin-color-text); display: flex; flex-direction: column; }
.icefin-settings .icefin-cs-host > .dialog > .formDialogHeader { display: none; }
.icefin-settings .icefin-cs-host .formDialogContent { position: relative !important; inset: auto !important; flex: 1; min-height: 0; margin: 0 !important;
  padding: 2vh 2vw 6vh !important; overflow-y: auto; scrollbar-width: thin; scroll-behavior: auto !important; }
.icefin-settings .icefin-cs-host .formDialogFooter { display: none !important; }
/* Instant scrolling: a drop-down closes on a page scroll, and a smooth scroll after a focus move outlasted the OK press. */
.icefin-settings .icefin-cs-host .smoothScrollY { scroll-behavior: auto !important; }
.icefin-settings .icefin-cs-host .icefin-focused { outline: 0.18em solid var(--icefin-color-focus); outline-offset: 0.18em; border-radius: 0.3em; }
.icefin-settings .icefin-cs-host .icefin-dd-option:focus { outline: 0.15em solid var(--icefin-color-focus); outline-offset: -0.15em; }
`;
    function ensureStyle() {
        if (document.getElementById('icefin-settings-base')) return;
        const s = el('style');
        s.id = 'icefin-settings-base';
        s.textContent = BASE;
        document.head.prepend(s);
    }
    const api = () => window.apiPromise;
    const pane = () => new URLSearchParams(location.hash.split('?')[1] || '').get('pane');

    // Client Settings while a theme has a settings area: the themed page. The dialog itself is still built by
    // nativeshell (openNative), then moved into that page.
    let openNative = null;
    const themedSettings = () => { const a = T.active(); return !!(a && !T.stoodDown() && T.screens().includes('#/mypreferencesmenu')); };
    function wrapNativeShell() {
        const ns = window.NativeShell;
        if (!ns || typeof ns.openClientSettings !== 'function' || ns.openClientSettings.icefinThemed) return;
        openNative = ns.openClientSettings.bind(ns);
        const wrapped = () => { if (themedSettings()) T.ctx.navigate('#/mypreferencesmenu?pane=client'); else openNative(); };
        wrapped.icefinThemed = true;
        ns.openClientSettings = wrapped;
    }
    wrapNativeShell();
    if (!openNative) document.addEventListener('DOMContentLoaded', wrapNativeShell);

    const isText = (e) => e && ((e.tagName === 'INPUT' && /^(text|search|password|email|url|tel|number|)$/i.test(e.type || '')) || e.tagName === 'TEXTAREA');
    const CONTROLS = 'select, input:not([type=hidden]), textarea, button, a[href], [role="button"], [tabindex="0"]';

    // The themed Client Settings page: the real dialog in a host beside a list of its sections.
    async function clientPane(root, body, state) {
        body.append(el('h1', 'icefin-s-title', 'Client settings'));
        const page = el('div', 'icefin-cs-page');
        const rail = el('div', 'icefin-cs-rail');
        rail.setAttribute('role', 'navigation');
        const host = el('div', 'icefin-cs-host');
        page.append(rail, host);
        body.append(page);
        const title = () => [...document.querySelectorAll('.formDialogHeaderTitle')].find((t) => t.textContent === 'Client Settings');
        const before = title();
        if (before) { const c = before.closest('.dialogContainer'); (c || before.closest('.dialog')).remove(); }
        if (!openNative) wrapNativeShell();
        if (!openNative) { host.append(el('p', 'icefin-s-note', 'Client Settings is not available here.')); return; }
        openNative();
        let dialog = null;
        for (let i = 0; i < 100 && !dialog && state.up; i++) { const t = title(); dialog = t && t.closest('.dialog'); if (!dialog) await new Promise((r) => setTimeout(r, 50)); }
        if (!dialog || !state.up) { if (dialog) (dialog.closest('.dialogContainer') || dialog).remove(); return; }
        const container = dialog.closest('.dialogContainer');
        host.append(dialog);
        if (container) container.remove();
        state.dialog = dialog;
        const content = dialog.querySelector('.formDialogContent') || dialog;
        // Sections and controls change as Icefin's sections arrive and nativeshell re-renders a section: refresh both.
        const refresh = () => {
            for (const c of content.querySelectorAll(CONTROLS)) {
                if (c.closest('.icefin-dd-list') || c.closest('.formDialogFooter') || c.disabled) continue;
                if (c.tagName === 'INPUT' && c.type === 'checkbox' && c.offsetParent === null) continue;
                if (!c.hasAttribute('data-icefin-focus')) focusable(c);
            }
            const sections = [...content.querySelectorAll('fieldset')].filter((f) => f.querySelector(':scope > legend h2') && f.offsetParent !== null);
            const names = sections.map((f) => f.querySelector(':scope > legend h2').textContent.trim());
            if (rail.dataset.names === names.join('|')) return;
            rail.dataset.names = names.join('|');
            const had = rail.contains(T.ctx.focused());
            rail.textContent = '';
            sections.forEach((f, i) => {
                const b = focusable(el('div', 'icefin-d-btn', names[i]));
                b.dataset.section = names[i];
                b.addEventListener('click', () => {
                    f.scrollIntoView({ block: 'start' });
                    const first = [...f.querySelectorAll(FOCUS)].find((c) => c.offsetParent !== null);
                    if (first) T.ctx.focus(first);
                });
                rail.append(b);
            });
            if (had && rail.firstChild) T.ctx.focus(rail.firstChild);
        };
        let timer = null;
        state.observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(refresh, 120); });
        state.observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'disabled'] });
        // The section in view is marked in the list.
        content.addEventListener('scroll', () => {
            const top = content.getBoundingClientRect().top + 8;
            let here = null;
            for (const f of content.querySelectorAll('fieldset')) { const h = f.querySelector(':scope > legend h2'); if (h && f.getBoundingClientRect().top <= top + 40) here = h.textContent.trim(); }
            for (const b of rail.children) b.classList.toggle('icefin-cs-here', b.dataset.section === here);
        }, { passive: true });
        refresh();
        if (rail.firstChild) T.ctx.focus(rail.firstChild);
        root.setAttribute('data-icefin-client-settings', String(rail.children.length));
    }

    function screen(opts) {
        const o = Object.assign({ layout: 'tiles' }, opts || {});
        const state = { up: false };
        const openList = () => document.querySelector('#icefin-theme-root .icefin-dd-list');
        return {
            // The themed Client Settings page drives the dialog's drop-downs from the remote: while a list is open,
            // the arrows, OK and Back go to it as the keys it already understands.
            onAction(action) {
                if (pane() !== 'client') return false;
                const dd = window.icefinDropdown;
                if (dd && dd.isOpen && dd.isOpen() && openList()) {
                    const key = { up: 'ArrowUp', down: 'ArrowDown', enter: 'Enter', select: 'Enter', back: 'Escape' }[action];
                    if (key) dd.key(key);
                    return true;
                }
                // Backspace in a text field deletes: the screen leaves it to the field.
                const ev = window.event;
                if (action === 'back' && ev && ev.key === 'Backspace' && isText(document.activeElement)) return false;
                return false;
            },
            onBack() {
                if (pane() !== 'client') return false;
                const ev = window.event;
                if (ev && ev.key === 'Backspace' && isText(document.activeElement)) return false;
                if (history.length > 1) history.back(); else T.ctx.navigate('#/mypreferencesmenu');
                return true;
            },
            unmount() {
                state.up = false;
                if (state.observer) state.observer.disconnect();
                if (state.dialog) state.dialog.remove();
                state.dialog = null;
                state.observer = null;
            },
            async mount(root) {
                state.up = true;
                if (T.ui.details && T.ui.details.ensureStyle) T.ui.details.ensureStyle();  // the shared buttons, Back and Home
                ensureStyle();
                const wrap = el('div', 'icefin-details icefin-settings');
                wrap.dataset.hub = o.layout === 'list' ? 'list' : 'tiles';
                const nav = el('div', 'icefin-d-nav');
                const navBtn = (action, label, go) => {
                    const b = focusable(el('div', 'icefin-d-btn icefin-d-navbtn', label));
                    b.dataset.action = action;
                    b.addEventListener('click', go);
                    nav.append(b);
                };
                navBtn('back', '‹ Back', () => { if (history.length > 1) history.back(); else T.ctx.navigate('#/home'); });
                navBtn('home', 'Home', () => T.ctx.navigate('#/home'));
                const body = el('div', 'icefin-s-body');
                if (pane() === 'client') {
                    wrap.append(nav, body);
                    root.append(wrap);
                    root.setAttribute('data-icefin-settings', 'client');
                    await clientPane(root, body, state);
                    return;
                }
                body.append(el('h1', 'icefin-s-title', 'Settings'));
                const entries = el('div', 'icefin-s-entries');
                const entry = (id, name, desc, go) => {
                    const e = focusable(el('div', 'icefin-d-btn icefin-s-entry'));
                    e.dataset.entry = id;
                    e.append(el('span', 'icefin-s-name', name), el('span', 'icefin-s-desc', desc));
                    e.addEventListener('click', go);
                    entries.append(e);
                    return e;
                };
                entry('client', 'Client settings', 'This player: theme and colours, video, audio, subtitles and controllers.',
                    () => T.ctx.navigate('#/mypreferencesmenu?pane=client'));
                entry('classic', 'Classic View', 'The standard Jellyfin look, now, for this session. Your theme comes back next time, or from Client settings.',
                    () => classic());
                body.append(entries);
                const more = el('div', 'icefin-s-more');
                const link = (id, label, hash) => {
                    const b = focusable(el('div', 'icefin-d-btn', label));
                    b.dataset.action = id;
                    b.addEventListener('click', () => T.ctx.navigate(hash));
                    more.append(b);
                };
                link('profile', 'Your profile and preferences', '#/mypreferencesmenu?icefin=stock');
                body.append(more);
                wrap.append(nav, body);
                root.append(wrap);
                root.setAttribute('data-icefin-settings', '');
                // Server Settings: administrators only (the dashboard is theirs).
                const client = T.ctx.apiClient();
                try {
                    const user = client && await client.getCurrentUser();
                    if (user && user.Policy && user.Policy.IsAdministrator && root.contains(wrap)) {
                        const s = entry('server', 'Server Settings', "The server's dashboard: libraries, users, playback, plugins and the rest.",
                            () => T.ctx.navigate('#/dashboard'));
                        entries.append(s);
                    }
                } catch (e) { /* not signed in yet: no dashboard entry */ }
                if (!root.contains(wrap)) return;
                const first = wrap.querySelector('.icefin-s-entry');
                if (first) T.ctx.focus(first);
                root.setAttribute('data-icefin-settings-ready', String(entries.children.length));
            }
        };
    }

    // Classic View on its own, for a theme that draws its own settings area around the same entries (9.46): the stock
    // look now, for this session; the saved theme comes back at the next start or from Client Settings -> Theme.
    const classic = () => api().then((a) => new Promise((resolve) => a.theme.setClassic(true, () => { location.hash = '#/home'; resolve(true); })));

    T.ui.settings = { screen, classic };
})();
