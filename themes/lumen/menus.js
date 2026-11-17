// Lumen: the sidebar over any screen and quick settings (PLAN 9.53; the "Lumen Screens" canvas: Guide, Main).
// The target's current version keeps its sections in a frosted sidebar floating at the left: collapsed to a small pill
// at the top left while you browse, opened over the page by ◀ from the first column, Back at the top of the home, the
// guide button, a long press of View or F1 (Gate 1, decision 1a). The profile and the clock on top, Search, Home, each
// library, then a "Library" group (Collections, Playlists, Settings) and Now playing while music plays. Quick settings
// is a glass panel at the top right (sleep timer, audio output, switch user, Play on, Watch together, low motion).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinLumen;
    if (!T || !D || !D.columns) return;
    const ui = T.ui;
    const el = D.el;
    const go = (h) => () => T.ctx.navigate(h);

    // the section the page belongs to, for the soft band on its row
    function here() {
        const h = location.hash;
        if (/^#\/search/.test(h)) return 'Search';
        if (/^#\/(home|$)/.test(h) && !/[?&]lm=/.test(h)) return 'Home';
        if (/^#\/mypreferences/.test(h) || /lm=settings/.test(h)) return 'Settings';
        if (/^#\/livetv/.test(h)) return 'Live TV';
        const pid = D.params().get('parentId') || D.params().get('topParentId');
        const v = (D.views || []).find((x) => x.Id === pid);
        return v ? v.Name : '';
    }
    function sideRows() {
        const top = [['Search', 'search', go('#/search')], ['Home', 'home', go('#/home')]];
        const lib = [];
        for (const v of (D.views || [])) {
            const row = [v.Name, D.kindIcon(v.CollectionType), go(D.viewRoute(v))];
            if (v.CollectionType === 'boxsets' || v.CollectionType === 'playlists') lib.push(row); else top.push(row);
        }
        if (!(D.views || []).some((v) => v.CollectionType === 'playlists')) lib.push(['Playlists', 'playlists', go('#/playlists')]);
        lib.push(['Settings', 'settings', go('#/mypreferencesmenu')]);
        return { top, lib };
    }
    function sideRow(text, icon, run, close, cls) {
        const b = D.focusable(el('button', 'lm-sb-row' + (cls ? ' ' + cls : '')));
        b.type = 'button';
        const i = el('span', 'lm-sb-ic');
        if (icon) i.append(D.svg(icon));
        b.append(i, el('span', 'lm-sb-name', text));
        b.addEventListener('click', () => { T.ctx.sound('select'); if (close) close(); setTimeout(run, 0); });
        return b;
    }
    const Sb = { open: false, ctx: null };
    // focus inside the overlay: the engine reads the first .icefin-focused in it, so only one may carry the class
    const ofocus = (host, e) => { if (!e || !e.isConnected) return; host.querySelectorAll('.icefin-focused').forEach((x) => x.classList.remove('icefin-focused')); e.classList.add('icefin-focused'); if (e.focus) e.focus(); };
    const SIDEBAR = {
        mount(host, ctx) {
            Sb.open = true;
            Sb.ctx = ctx;
            try { if (T.ctx.music && T.ctx.music.jingle) T.ctx.music.jingle('menu'); } catch (e) { /* jingles off */ }
            host.classList.add('lm-ov-host');
            const dim = el('div', 'lm-ov-dim');
            dim.addEventListener('click', () => ctx.close());
            const p = ui.material(el('nav', 'lm-sb'), 'bar');
            p.setAttribute('aria-label', 'Sidebar');
            host.append(dim, p);
            const draw = () => {
                p.textContent = '';
                const close = () => ctx.close();
                // the profile and the clock; A on the profile opens quick settings
                const who = D.focusable(el('button', 'lm-sb-who'));
                who.type = 'button';
                const user = D.me || {};
                const av = el('span', 'lm-sb-av', D.initials(user.Name || '?'));
                if (user.PrimaryImageTag) { av.textContent = ''; av.style.backgroundImage = `url("${D.client().getUserImageUrl(user.Id, { type: 'Primary', tag: user.PrimaryImageTag, maxWidth: 96 })}")`; }
                const name = el('span', 'lm-sb-user', user.Name || 'You');
                const srv = el('span', 'lm-sb-srv' + (D.serverUp === false ? ' down' : ''), D.serverName || '');
                const clock = el('span', 'lm-sb-clock', D.time());
                who.append(av, el('span', 'lm-sb-whotx', ''), clock);
                who.querySelector('.lm-sb-whotx').append(name, srv);
                who.setAttribute('aria-label', `${user.Name || 'You'} on ${D.serverName || 'this server'}: quick settings`);
                who.addEventListener('click', () => { T.ctx.sound('select'); D.quickAccess(); });
                p.append(who);
                const { top, lib } = sideRows();
                const at = here();
                const rows = [who];
                for (const [t, ic, run] of top) { const r = sideRow(t, ic, run, close, t === at ? 'cur' : ''); p.append(r); rows.push(r); }
                p.append(el('div', 'lm-sb-hd', 'Library'));
                for (const [t, ic, run] of lib) { const r = sideRow(t, ic, run, close, t === at ? 'cur' : ''); p.append(r); rows.push(r); }
                const np = T.ctx.nowPlaying && T.ctx.nowPlaying();
                const it = np && np.item;
                if (it && (it.MediaType === 'Audio' || it.Type === 'Audio')) {
                    p.append(el('div', 'lm-sb-hd', 'Now playing'));
                    const r = sideRow(`${it.Name}${(it.Artists || [])[0] ? ' · ' + it.Artists[0] : ''}`, 'music', go('#/queue'), close, 'np');
                    const tag = it.AlbumPrimaryImageTag || (it.ImageTags || {}).Primary;
                    if (tag) { const ic = r.querySelector('.lm-sb-ic'); ic.textContent = ''; ic.classList.add('art'); ic.style.backgroundImage = `url("${D.image(it.AlbumPrimaryImageTag ? it.AlbumId : it.Id, 'Primary', tag, 120)}")`; }
                    p.append(r); rows.push(r);
                }
                const first = rows.find((r) => r.classList.contains('cur')) || rows[2] || rows[0];
                ofocus(host, first);
                setTimeout(() => ofocus(host, first), 0);  // after the engine's own pick of the first row
            };
            if (D.views && D.me) draw(); else Promise.all([D.loadViews(), D.loadMe ? D.loadMe() : null]).then(draw, draw);
            D.hints([['OK', 'select'], ['Back', 'close']]);
            if (D.overlayEntry) D.overlayEntry();  // Back (the mouse's too) closes it (kit.js)
        },
        onAction(action) {  // the engine passes the focused element; ▶ closes the sidebar (back to the page)
            if (action === 'right' && Sb.ctx) { Sb.ctx.close(); return true; }
            return false;
        },
        unmount() { Sb.open = false; Sb.ctx = null; if (D.overlayGone) D.overlayGone(); if (D.screenHints) D.screenHints(); else D.hintsOff(); },
        leave(h) { h.classList.add('lm-ov-leave'); return ui.motion.duration(220); }
    };

    // ---- quick settings (top right) ----
    const SLEEP = [0, 15, 30, 60, 90];
    let sleepAt = 0, sleepTimer = null;
    function sleepFor(min) {
        clearTimeout(sleepTimer);
        sleepAt = min ? Date.now() + min * 60000 : 0;
        if (min) sleepTimer = setTimeout(() => { const c = ui.player && ui.player.controls ? ui.player.controls() : null; if (c && c.stop) c.stop(); sleepAt = 0; }, min * 60000);
    }
    const sleepLeft = () => (sleepAt ? `${Math.max(1, Math.round((sleepAt - Date.now()) / 60000))} min` : 'Off');
    function tile(title, value, run, on) {
        const b = D.focusable(el('button', 'lm-qs-tile' + (on ? ' on' : '')));
        b.type = 'button';
        b.append(el('b', '', title), el('span', 'lm-qs-val', value));
        b.addEventListener('click', () => { T.ctx.sound('select'); run(b); });
        return b;
    }
    const QUICK = {
        mount(host, ctx) {
            Sb.open = true;
            host.classList.add('lm-ov-host');
            const dim = el('div', 'lm-ov-dim lm-ov-clear');
            dim.addEventListener('click', () => ctx.close());
            const p = ui.material(el('aside', 'lm-qs'), 'bar');
            p.setAttribute('aria-label', 'Quick settings');
            host.append(dim, p);
            const head = el('div', 'lm-qs-head');
            head.append(el('b', '', 'Quick settings'), el('span', '', D.time()));
            p.append(head);
            const grid = el('div', 'lm-qs-grid');
            const np = T.ctx.nowPlaying && T.ctx.nowPlaying();
            const it = np && np.item;
            const tiles = [];
            const add = (t) => { grid.append(t); tiles.push(t); return t; };
            add(tile('Sleep', sleepLeft(), (b) => { const i = (SLEEP.indexOf(sleepAt ? SLEEP.find((m) => m * 60000 >= sleepAt - Date.now()) || 0 : 0) + 1) % SLEEP.length; sleepFor(SLEEP[i]); b.querySelector('.lm-qs-val').textContent = sleepLeft(); }));
            add(tile('Low motion', ui.motion.level() === 'low' ? 'On' : 'Off', (b) => { ui.motion.cap(ui.motion.level() === 'low' ? 'normal' : 'low'); b.querySelector('.lm-qs-val').textContent = ui.motion.level() === 'low' ? 'On' : 'Off'; }));
            add(tile('Play on…', 'This device', () => { ctx.close(); D.playOn && D.playOn('play', null); }));
            add(tile('Watch together…', 'SyncPlay', () => { ctx.close(); D.playOn && D.playOn('together', null); }));
            if (it) add(tile(it.MediaType === 'Audio' ? 'Now playing' : 'Back to the video', it.Name, () => { ctx.close(); T.ctx.navigate(it.MediaType === 'Audio' ? '#/queue' : '#/video'); }));
            add(tile('Switch user', (D.me && D.me.Name) || 'You', () => { ctx.close(); D.panel.ask({ title: 'Switch user?', path: 'You', text: 'You sign out here and choose who signs in.', choices: [{ label: 'Stay', safe: true }, { label: 'Switch user', run: () => T.ctx.signOut() }] }); }));
            p.append(grid);
            const round = el('div', 'lm-qs-round');
            const rb = (icon, label, run) => { const b = D.focusable(el('button', 'lm-qs-rb')); b.type = 'button'; b.append(D.svg(icon)); b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', () => { T.ctx.sound('select'); ctx.close(); setTimeout(run, 0); }); round.append(b); tiles.push(b); return b; };
            rb('search', 'Search', go('#/search'));
            rb('settings', 'Settings', go('#/mypreferencesmenu'));
            rb('home', 'Classic home', go('#/home?icefin=stock'));
            rb('exit', 'Exit IceFin Player', () => D.exitAsk());
            p.append(round);
            setTimeout(() => ofocus(host, tiles[0]), 0);
            D.hints([['OK', 'select'], ['Back', 'close']]);
            if (D.overlayEntry) D.overlayEntry();
        },
        unmount() { Sb.open = false; ui.overlay.set(SIDEBAR); if (D.overlayGone) D.overlayGone(); if (D.screenHints) D.screenHints(); else D.hintsOff(); },
        leave(h) { h.classList.add('lm-ov-leave', 'lm-ov-corner'); return ui.motion.duration(200); }
    };
    D.quickAccess = () => {
        const open = () => { ui.overlay.set(QUICK); ui.overlay.open(); };
        if (ui.overlay.isOpen()) { ui.overlay.close(); setTimeout(open, ui.motion.duration(240)); } else open();
    };
    D.sidebar = () => { if (D.panel && D.panel.isOpen()) return; ui.overlay.set(SIDEBAR); if (!ui.overlay.isOpen()) ui.overlay.open(); };
    D.sidebarOpen = () => Sb.open;
    ui.overlay.set(SIDEBAR);
    D.guideOverlay = SIDEBAR;
    D.restoreGuide = () => { if (!(D.panel && D.panel.isOpen())) ui.overlay.set(SIDEBAR); };

    // ◀ from the first column of any screen opens the sidebar (the target's): no focusable thing to the left of the
    // focused one, on the same band, in the screen
    D.atLeftEdge = (f) => {
        if (!f || !f.getBoundingClientRect) return false;
        const r = f.getBoundingClientRect();
        const scope = f.closest('#icefin-theme-root') || document.body;
        for (const o of scope.querySelectorAll('[data-icefin-focus]')) {
            if (o === f || !o.offsetParent) continue;
            const q = o.getBoundingClientRect();
            if (!q.width || q.right > r.left + 4 || q.right < 0) continue;
            if (q.bottom > r.top + 4 && q.top < r.bottom - 4) return false;
        }
        return true;
    };
    D.onAction((action, ctx) => {
        if (action !== 'left' || Sb.open || (D.panel && D.panel.isOpen()) || ui.overlay.isOpen()) return false;
        const f = ctx.focused();
        if (!f || f.closest('.lm-kb, .lm-letters, input, textarea') || !D.atLeftEdge(f)) return false;
        ctx.sound('navigate');
        D.sidebar();
        return true;
    });

    // ---- the collapsed sidebar: a small glass pill at the top left on every screen; it opens the sidebar ----
    D.mini = (root, label) => {
        const b = ui.material(el('button', 'lm-mini'), 'bar');
        b.type = 'button';
        b.setAttribute('aria-label', 'Open the sidebar');
        b.append(D.svg('menu'), el('span', 'lm-mini-name', label || here() || 'IceFin Player'));
        b.addEventListener('click', () => { T.ctx.sound('select'); D.sidebar(); });
        root.append(b);
        return b;
    };

    // the now-playing reminder other screens use (np.js, interim.js): Lumen keeps now playing on the sidebar, so the
    // strip is a small glass chip beside the pill while music plays
    D.capsule = (root) => {
        const cap = ui.material(el('button', 'lm-cap'), 'bar');
        cap.type = 'button';
        cap.hidden = true;
        cap.addEventListener('click', () => T.ctx.navigate('#/queue'));
        root.append(cap);
        const draw = () => {
            const np = T.ctx.nowPlaying && T.ctx.nowPlaying();
            const it = np && np.item;
            const audio = it && (it.MediaType === 'Audio' || it.Type === 'Audio');
            cap.hidden = !audio;
            if (audio) cap.textContent = `♪ ${it.Name}`;
        };
        draw();
        const t = setInterval(draw, 1000);
        return { stop: () => clearInterval(t) };
    };
})();
