// Tide: the home (PLAN 9.48; the canvas's Home, HomeSettings, HomeMusic, ExitPanel, You and HomeOrder boards).
// The cross bar: Settings first, then the user's libraries in their order (Settings › Home), then Search. Each
// library's column starts with what to watch (Continue, Next up), then its folders. The server's status sits under the
// clock; Back on the home with nothing open asks to close, Cancel focused.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinTide;
    if (!T || !D || !D.columnScreen) return;
    const ui = T.ui;
    const el = D.el;

    // ---- Settings › Home: the user's order and choices, per user on this device ----
    const prefKey = () => `icefin.tide.home.${D.uid()}`;
    D.homePrefs = () => {
        let p = null;
        try { p = JSON.parse(localStorage.getItem(prefKey()) || 'null'); } catch (e) { p = null; }
        return Object.assign({ order: [], hidden: [], peek: true }, p || {});
    };
    D.saveHomePrefs = (p) => { try { localStorage.setItem(prefKey(), JSON.stringify(p)); } catch (e) { /* private window */ } };
    D.orderedViews = (views, prefs) => {
        const order = prefs.order || [];
        return views.slice().sort((a, b) => {
            const ia = order.indexOf(a.Id), ib = order.indexOf(b.Id);
            return (ia < 0 ? 1e6 + views.indexOf(a) : ia) - (ib < 0 ? 1e6 + views.indexOf(b) : ib);
        });
    };

    // ---- the Settings column (HomeSettings, You boards) ----
    const go = (hash) => () => T.ctx.navigate(hash);
    D.youLevel = (user) => ({
        title: user ? user.Name : 'You', initials: user && !user.PrimaryImageTag ? user.Name : null,
        art: user && user.PrimaryImageTag ? D.client().getUserImageUrl(user.Id, { tag: user.PrimaryImageTag, type: 'Primary', maxWidth: 200 }) : '', round: true,
        load: async () => [
            { name: 'Profile', sub: 'picture, password, PIN', icon: 'person', shape: 'icon', go: go('#/userprofile') },
            { name: 'Display', sub: 'language, dates, theme of the pages', icon: 'display', shape: 'icon', go: go('#/mypreferencesdisplay') },
            { name: 'Home screen', sub: 'what the cross bar shows, and in what order', icon: 'home', shape: 'icon', go: go('#/mypreferenceshome') },
            { name: 'Playback', sub: 'quality, audio, skipping intros', icon: 'play', shape: 'icon', go: go('#/mypreferencesplayback') },
            { name: 'Subtitles', sub: 'language, look, burning in', icon: 'subtitles', shape: 'icon', go: go('#/mypreferencessubtitles') },
            { name: 'Controls', sub: 'remote and pad', icon: 'controls', shape: 'icon', go: go('#/mypreferencescontrols') },
            { name: 'Quick Connect', sub: 'sign in another device', icon: 'quick', shape: 'icon', go: go('#/quickconnect') },
            { name: 'Switch user', icon: 'people', shape: 'icon', go: () => D.panel.ask({ title: 'Switch user?', path: 'You', text: 'You sign out here and choose who signs in.', choices: [{ label: 'Stay', safe: true }, { label: 'Switch user', run: () => T.ctx.signOut() }] }) },
            { name: 'Switch server', icon: 'server', shape: 'icon', go: () => T.ctx.selectServer() },
            { name: 'Sign out', icon: 'signout', shape: 'icon', go: () => D.panel.ask({ title: 'Sign out?', path: user ? `${user.Name} on ${D.serverName || 'this server'}` : '', choices: [{ label: 'Stay signed in', safe: true }, { label: 'Sign out', run: () => T.ctx.signOut() }] }) }
        ]
    });
    D.settingsEntries = async () => {
        const c = D.client();
        let user = null;
        try { user = await c.getCurrentUser(); } catch (e) { user = null; }
        const admin = !!(user && user.Policy && user.Policy.IsAdministrator);
        const you = D.youLevel(user);
        const out = [
            { name: user ? user.Name : 'You', sub: 'profile, your settings, Quick Connect, sign out', initials: you.initials, art: you.art, shape: 'round', icon: 'person', open: () => you },
            { name: 'Display', sub: 'language, dates, the pages’ look', icon: 'display', shape: 'icon', go: go('#/mypreferencesdisplay') },
            { name: 'Home screen', sub: 'what the cross bar shows, and in what order', icon: 'home', shape: 'icon', go: go('#/mypreferenceshome') },
            { name: 'Playback', sub: 'quality, audio and subtitle choices, skipping intros', icon: 'play', shape: 'icon', go: go('#/mypreferencesplayback') },
            { name: 'Subtitles', sub: 'language, size, look', icon: 'subtitles', shape: 'icon', go: go('#/mypreferencessubtitles') },
            { name: 'Controls', sub: 'remote and pad', icon: 'controls', shape: 'icon', go: go('#/mypreferencescontrols') },
            { name: 'Client settings', sub: 'theme, audio output, display, updates', icon: 'client', shape: 'icon', go: go('#/mypreferencesmenu') },
            { name: 'Play on…', sub: 'send what plays to another device', icon: 'cast', shape: 'icon', go: () => D.playOn && D.playOn('play', null) },
            { name: 'Watch together…', sub: 'join or start a group', icon: 'together', shape: 'icon', go: () => D.playOn && D.playOn('together', null) },
            { name: `Server: ${D.serverName || 'this server'}`, sub: `${D.serverUp === false ? '○ not answering' : '● online'} · choose another`, icon: 'server', shape: 'icon', go: () => T.ctx.selectServer() },
            { name: 'Classic view', sub: 'jellyfin-web’s own pages, until you come back', icon: 'classic', shape: 'icon', go: () => { if (ui.settings && ui.settings.classic) ui.settings.classic(); else T.ctx.navigate('#/home?icefin=stock'); } },
            { name: 'Classic home', sub: 'jellyfin-web’s home, once', icon: 'home', shape: 'icon', go: go('#/home?icefin=stock') }
        ];
        if (admin) out.push({ name: 'Server dashboard', sub: 'administration (jellyfin-web’s)', icon: 'dashboard', shape: 'icon', go: go('#/dashboard') });
        out.push({ name: 'Exit Icefin', icon: 'exit', shape: 'icon', go: () => D.exitAsk() });
        return out;
    };

    // ---- the exit question (ExitPanel board) ----
    D.exitAsk = () => D.panel.ask({ title: 'Exit Icefin?', path: 'Icefin', choices: [{ label: 'Cancel', safe: true }, { label: 'Exit', run: () => T.ctx.exit() }] });

    // ---- the server's status: pinged every 60 s ----
    async function ping() {
        const c = D.client();
        if (!c) return;
        try {
            const info = await c.getPublicSystemInfo();
            D.serverName = (info && info.ServerName) || D.serverName;
            D.serverUp = true;
        } catch (e) { D.serverUp = false; }
        const s = document.querySelector('.td-server');
        if (s) { s.textContent = `${D.serverUp ? '●' : '○'} ${D.serverName || 'server'}`; s.classList.toggle('down', !D.serverUp); s.setAttribute('aria-label', `${D.serverName || 'Server'}: ${D.serverUp ? 'online' : 'not answering'}; choose a server`); }
    }

    // ---- the cross bar ----
    let timer = 0;
    D.columnScreen('#/home', {
        name: 'home',
        key: () => '#/home',
        root() {
            const bar = [{ label: 'Settings', icon: 'settings', count: false, load: D.settingsEntries }];
            const R = { bar, at: 1, deferred: true, onBack: () => { D.exitAsk(); return true; } };
            // the libraries arrive after mount (ui.userViews waits for the session)
            R.loadViews = async () => {
                const views = await ui.userViews();
                const prefs = D.homePrefs();
                for (const v of D.orderedViews(views, prefs)) {
                    if ((prefs.hidden || []).includes(v.Id)) continue;
                    bar.push({ label: v.Name, icon: D.kindIcon(v.CollectionType), view: v, count: false, load: () => D.libraryEntries(v, { peek: prefs.peek !== false }) });
                }
                bar.push({ label: 'Search', icon: 'search', count: false, load: async () => [{ name: 'Search', sub: 'films, shows, music and people', icon: 'search', shape: 'icon', go: go('#/search') }] });
            };
            return R;
        },
        async mounted(C, root) {
            const r = C.S.stack[0];
            const box = root.querySelector('.td-clock');
            const srv = el('button', 'td-server', '● …');
            srv.type = 'button';
            srv.addEventListener('click', () => { T.ctx.sound('select'); T.ctx.selectServer(); });
            box.insertBefore(srv, box.querySelector('.td-clock-extra'));
            ping();
            clearInterval(timer);
            timer = setInterval(ping, 60000);
            if (r.loadViews && r.bar.length === 1) {
                C.rootEl.setAttribute('data-td-loading', '1');
                await r.loadViews();
                r.loadViews = null;
                C.S.barIndex = Math.min(r.at || 1, r.bar.length - 1);  // the first library, as the home opens on its media
                C.redraw('first');
            }
        },
        unmounted() { clearInterval(timer); }
    });
})();
