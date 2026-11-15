// Harbor: the menu over any screen and quick access (PLAN 9.4, refined in 9.52; the "Harbor Screens" canvas: Guide,
// Dialogs). The home (harbor.js) keeps the target's persistent menu down the left; over every other screen, a long press
// of View, the guide button or F1 brings the same menu in from the left (Gate 1, decision 3a), with Quick access (now
// playing, low motion, Play on, Watch together) from the right. Built from Arcade's (the shared modules' menus).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinHarbor;
    if (!T || !D || !D.columns) return;
    const ui = T.ui;
    const el = D.el;

    // ---- the main menu (left) and quick access (right) ----
    const Mn = { open: false };
    function menuRows() {
        const go = (h) => () => T.ctx.navigate(h);
        const rows = [['Home', 'home', go('#/home')], ['Search', 'search', go('#/search')]];
        for (const v of (D.views || [])) rows.push([v.Name, D.kindIcon(v.CollectionType), go(D.viewRoute(v))]);
        rows.push(['Quick access', 'more', () => D.quickAccess()], ['Settings', 'settings', go('#/mypreferencesmenu')],
            ['Switch user', 'people', () => D.panel.ask({ title: 'Switch user?', path: 'You', text: 'You sign out here and choose who signs in.', choices: [{ label: 'Stay', safe: true }, { label: 'Switch user', run: () => T.ctx.signOut() }] })],
            ['Exit Icefin', 'exit', () => D.exitAsk()]);
        return rows;
    }
    function panelRow(text, icon, run, close) {
        const b = D.focusable(el('button', 'hr-li hr-mm-row'));
        b.type = 'button';
        if (icon) b.append(D.svg(icon, 'hr-mm-ic'));
        b.append(el('span', 'hr-li-name', text));
        b.addEventListener('click', () => { T.ctx.sound('select'); if (close) close(); setTimeout(run, 0); });
        return b;
    }
    const MENU = {
        mount(host, ctx) {
            Mn.open = true;
            try { if (T.ctx.music && T.ctx.music.jingle) T.ctx.music.jingle('menu'); } catch (e) { /* jingles off */ }
            host.classList.add('hr-ov-host');
            const dim = el('div', 'hr-ov-dim');
            dim.addEventListener('click', () => ctx.close());
            const p = el('nav', 'hr-mm');
            p.setAttribute('aria-label', 'Main menu');
            host.append(dim, p);
            const draw = () => {
                p.textContent = '';
                const rows = menuRows().map(([t, ic, run]) => panelRow(t, ic, run, () => ctx.close()));
                p.append(...rows);
                const here = rows.findIndex((r) => r.textContent === 'Home');
                setTimeout(() => { if (rows[0] && rows[0].isConnected) T.ctx.focus(rows[Math.max(0, here)]); }, 0);
            };
            if (D.views) draw(); else D.loadViews().then(draw, draw);
            D.hints([['OK', 'select'], ['Back', 'close']]);
        },
        unmount() { Mn.open = false; if (D.screenHints) D.screenHints(); else D.hintsOff(); },
        leave(h) { h.classList.add('hr-ov-leave'); return ui.motion.duration(160); }
    };
    const QUICK = {
        mount(host, ctx) {
            Mn.open = true;
            host.classList.add('hr-ov-host');
            const dim = el('div', 'hr-ov-dim');
            dim.addEventListener('click', () => ctx.close());
            const p = el('aside', 'hr-qa');
            p.setAttribute('aria-label', 'Quick access');
            const rail = el('div', 'hr-qa-rail');
            for (const ic of ['music', 'settings', 'people', 'info']) rail.append(D.svg(ic));
            const body = el('div', 'hr-qa-body');
            p.append(rail, body);
            host.append(dim, p);
            const np = T.ctx.nowPlaying && T.ctx.nowPlaying();
            const it = np && np.item;
            body.append(el('div', 'hr-qa-h', 'Now playing'));
            const now = el('div', 'hr-qa-now');
            const art = el('span', 'hr-qa-art');
            const tx = el('div', 'hr-qa-tx');
            if (it) {
                const tag = it.AlbumPrimaryImageTag || (it.ImageTags || {}).Primary;
                if (tag) art.style.backgroundImage = `url("${D.image(it.AlbumPrimaryImageTag ? it.AlbumId : it.Id, 'Primary', tag, 200)}")`;
                tx.append(el('b', '', it.Name), el('span', '', (it.Artists || [])[0] || it.SeriesName || ''));
            } else tx.append(el('span', '', 'Nothing playing'));
            now.append(art, tx);
            body.append(now);
            const rows = [];
            const add = (b) => { body.append(b); rows.push(b); return b; };
            if (it) {
                add(panelRow(it.MediaType === 'Audio' ? 'Open Now playing' : 'Back to the video', 'play', () => T.ctx.navigate(it.MediaType === 'Audio' ? '#/queue' : '#/video'), () => ctx.close()));
                const P = () => (ui.player && ui.player.controls ? ui.player.controls() : null);
                add(panelRow('Play or pause', 'pause', () => { const c = P(); if (c) c.playPause(); }));
            }
            body.append(el('div', 'hr-qa-h', 'This player'));
            const sw = (text, on, flip) => {
                const b = panelRow(text, null, () => { flip(); b.querySelector('.hr-switch').classList.toggle('on', on()); });
                const s = el('span', 'hr-switch' + (on() ? ' on' : ''));
                s.append(el('i'));
                b.append(s);
                return add(b);
            };
            sw('Low motion', () => ui.motion.level() === 'low', () => ui.motion.cap(ui.motion.level() === 'low' ? 'normal' : 'low'));
            add(panelRow('Play on…', 'cast', () => D.playOn && D.playOn('play', null), () => ctx.close()));
            add(panelRow('Watch together…', 'together', () => D.playOn && D.playOn('together', null), () => ctx.close()));
            add(panelRow('Settings', 'settings', () => T.ctx.navigate('#/mypreferencesmenu'), () => ctx.close()));
            setTimeout(() => { if (rows[0]) T.ctx.focus(rows[0]); }, 0);
            D.hints([['OK', 'select'], ['Back', 'close']]);
        },
        unmount() { Mn.open = false; ui.overlay.set(MENU); if (D.screenHints) D.screenHints(); else D.hintsOff(); },
        leave(h) { h.classList.add('hr-ov-leave', 'hr-ov-right'); return ui.motion.duration(160); }
    };
    D.quickAccess = () => {
        const open = () => { ui.overlay.set(QUICK); ui.overlay.open(); };
        if (ui.overlay.isOpen()) { ui.overlay.close(); setTimeout(open, ui.motion.duration(200)); } else open();
    };
    ui.overlay.set(MENU);
    D.guideOverlay = MENU;
    D.restoreGuide = () => { if (!(D.panel && D.panel.isOpen())) ui.overlay.set(MENU); };

    // the now-playing strip other screens use (np.js, interim.js): Arcade puts now playing in quick access, so the
    // strip is a small reminder in the top bar's place
    D.capsule = (root) => {
        const cap = el('button', 'hr-cap');
        cap.type = 'button';
        cap.hidden = true;
        cap.addEventListener('click', () => D.quickAccess());
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
