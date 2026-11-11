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
// details screens. The markup reuses the details screen's classes (.icefin-details, .icefin-d-btn, .icefin-d-nav) so
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
`;
    function ensureStyle() {
        if (document.getElementById('icefin-settings-base')) return;
        const s = el('style');
        s.id = 'icefin-settings-base';
        s.textContent = BASE;
        document.head.prepend(s);
    }
    const api = () => window.apiPromise;

    function screen(opts) {
        const o = Object.assign({ layout: 'tiles' }, opts || {});
        return {
            async mount(root) {
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
                    () => { if (window.NativeShell && window.NativeShell.openClientSettings) window.NativeShell.openClientSettings(); });
                entry('classic', 'Classic View', 'The standard Jellyfin look, now, for this session. Your theme comes back next time, or from Client settings.',
                    () => api().then((a) => a.theme.setClassic(true, () => { location.hash = '#/home'; })));
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

    T.ui.settings = { screen };
})();
