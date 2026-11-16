// Orbit: the home and the guide (PLAN 9.8, refined in 9.56; the "Orbit Screens" canvas: Home, Guide, Music, Dialogs).
// The home is the target's channels: one item flat in front, the rest receding to the right (ui.carousel3d: 370 ms a
// step, no tilt); ▲ ▼ change channel, each keeping its tile; the current channel's title over its front tile and the
// channels above stacked upward, smaller and fainter. The account top right (you, the server and whether it answers;
// A on it opens Choose a server), the clock under it, the music capsule bottom right while music plays, "1 of 8"
// under the front tile, the hints bottom left. Back asks "Exit Icefin?".
// The guide is the target's blades over any screen (a long press of View, the guide button or F1): Media, Library,
// You and Settings; ◀ ▶ (or the shoulders) between blades, B or View closes it.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinOrbit;
    if (!T || !D || !D.columns) return;
    const ui = T.ui;
    const el = D.el;

    // the art a channel tile shows: landscape first (the tile is 4:3), then the poster
    function tileArt(e) {
        const it = e.item;
        if (!it) return e.art || '';
        const c = D.client();
        const tags = it.ImageTags || {};
        if (tags.Thumb) return c.getScaledImageUrl(it.Id, { type: 'Thumb', maxWidth: 720, tag: tags.Thumb });
        if ((it.BackdropImageTags || []).length) return c.getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: 720, tag: it.BackdropImageTags[0] });
        if ((it.ParentBackdropImageTags || []).length) return c.getScaledImageUrl(it.ParentBackdropItemId, { type: 'Backdrop', maxWidth: 720, tag: it.ParentBackdropImageTags[0] });
        return e.art || '';
    }

    let S = null;  // {root, rows:[{el, cells, carousel, entries}], index} while the home is up

    function showCount() {
        if (!S || !S.rows[S.index]) return;
        const row = S.rows[S.index];
        S.count.textContent = `${row.carousel.index() + 1} of ${row.cells.length}`;
        const e = row.entries[row.carousel.index()];
        hints(e);
    }
    function hints(e) {
        const h = [];
        if (e) h.push(['OK', e.okLabel || (e.item ? (e.progress > 0 ? 'resume' : 'details') : 'open')]);
        if (e && e.item && D.playable(e.item)) h.push(['▶', e.progress > 0 ? 'resume' : 'play']);
        if (e && (e.item || e.menu)) h.push(['≡', 'options']);
        h.push(['▲ ▼', 'channels'], ['View', 'guide']);
        D.screenHints = () => D.hints(h);
        if (!(D.panel && D.panel.isOpen()) && !Gd.open) D.hints(h);
    }
    function tile(e) {
        const c = el('div', 'ob-tile');
        c.tabIndex = -1;
        c.orEntry = e;
        const face = el('div', 'ob-face');
        const art = tileArt(e);
        if (e.libraryOf) {  // a library's live tile: its original illustration, alternating with its own picture
            c.classList.add('ob-live');
            const ill = el('div', 'ob-ill');
            ill.append(D.svg(e.icon || 'folder'));
            face.append(ill);
            if (art) { const pic = el('div', 'ob-ill-pic'); pic.style.backgroundImage = `url("${art}")`; face.append(pic); }
        } else if (art) { face.style.backgroundImage = `url("${art}")`; c.classList.add('has-art'); }
        else { const ill = el('div', 'ob-ill'); ill.append(D.svg(e.icon || (e.item ? D.kindIcon(e.item.Type) : 'item'))); face.append(ill); }
        const label = el('div', 'ob-label');
        label.append(el('span', 'ob-label-name', e.name || ''), el('span', 'ob-label-sub', e.progress > 0 && e.item ? D.left(e.item) : (e.cellSub || e.sub || '')));
        face.append(label);
        if (e.progress > 0 && e.progress < 1) { const p = el('i', 'or-prog'); const f = el('b'); f.style.width = `${Math.round(e.progress * 100)}%`; p.append(f); face.append(p); }
        c.append(face, el('div', 'ob-reflect'));
        c.setAttribute('aria-label', [e.name, e.sub].filter(Boolean).join(', '));
        c.addEventListener('click', () => { if (e.go) { T.ctx.sound('select'); e.go(); } else if (e.item) { T.ctx.sound('select'); D.openItem(e.item, c); } });
        c.addEventListener('icefin-focus', () => setTimeout(showCount, 0));
        return c;
    }

    // Fills the channel stack. Also on the screen root as orbitFill, so tests can load their own channels.
    function fill(channels) {
        S.stack.textContent = '';
        const k = window.innerHeight / 1080;
        S.rows = channels.filter((ch) => ch.entries.length).map((ch, i) => {
            const row = el('section', 'ob-channel');
            row.setAttribute('data-ob-channel', String(i));
            row.append(el('div', 'ob-channel-title', ch.title));
            const ring = el('div', 'ob-ring');
            row.append(ring);
            S.stack.append(row);
            // the target's ring: the front tile flat at the left, the next ones further back on the right (scale 0.745,
            // 0.593), no tilt, 370 ms a step. Depth and perspective are px, so they follow the window's height.
            const entries = ch.entries.map((e) => (e.label != null ? { name: e.label, sub: e.sub, art: e.art, go: e.go } : e));
            const carousel = ui.carousel3d(ring, entries, { render: tile, dim: true, spacing: 116.5, depth: Math.round(411 * k), tilt: 0.001, visible: 4, ms: 370,
                perspective: `${Math.round(1200 * k)}px` });
            return { el: row, carousel, entries, cells: [...ring.querySelectorAll('.ob-tile')], last: 0, id: ch.id };
        });
        S.root.setAttribute('data-ob-ready', String(S.rows.length));
        S.index = -1;
        const mem = D.memory.get('#/home:orbit');
        if (S.rows.length) focusChannel(mem ? Math.max(0, S.rows.findIndex((r) => r.id === mem.id)) : 0, mem ? mem.at : 0);
        // live tiles: illustration and picture take turns every 8 s (still in low motion)
        clearInterval(S.liveTimer);
        S.liveTimer = setInterval(() => { if (!S || D.reduced()) return; for (const t of S.root.querySelectorAll('.ob-live')) t.classList.toggle('ob-live-pic'); }, 8000);
    }
    function focusChannel(i, at) {
        i = Math.max(0, Math.min(S.rows.length - 1, i));
        if (S.index >= 0 && S.rows[S.index]) S.rows[S.index].last = S.rows[S.index].carousel.index();
        S.index = i;
        S.rows.forEach((r, k) => {
            r.el.classList.toggle('current', k === i);
            r.el.classList.toggle('near', Math.abs(k - i) === 1);
            r.el.setAttribute('data-ob-rank', k < i ? String(Math.min(i - k, 5)) : k > i ? 'below' : '0');
        });
        const row = S.rows[i];
        S.count.textContent = '';
        S.backdrop.style.transform = `translateY(${-i * 2.2}vh) scale(1.12)`;  // parallax: the backdrop moves a fraction
        S.root.setAttribute('data-ob-index', String(i));
        row.carousel.focus(Math.min(at != null ? at : row.last, row.cells.length - 1));
        showCount();
    }
    function remember() { if (S && S.rows[S.index]) D.memory.set('#/home:orbit', { id: S.rows[S.index].id, at: S.rows[S.index].carousel.index() }); }

    // ---- the account (top right) and the music capsule (bottom right) ----
    function account(root) {
        const box = el('div', 'ob-acct');
        const who = D.focusable(el('button', 'ob-acct-who'));
        who.type = 'button';
        const name = el('span', 'ob-acct-name', '');
        const srv = el('span', 'or-server', `● ${D.serverName || '…'}`);
        const tx = el('span', 'ob-acct-tx');
        tx.append(name, srv);
        const av = el('span', 'ob-av', '');
        who.append(tx, av);
        who.addEventListener('click', () => { T.ctx.sound('select'); T.ctx.selectServer(); });
        const clock = el('div', 'ob-acct-clock');
        box.append(who, clock);
        root.append(box);
        Promise.resolve(D.client() && D.client().getCurrentUser()).then((u) => {
            if (!u || !box.isConnected) return;
            name.textContent = u.Name;
            who.setAttribute('aria-label', `${u.Name} on ${D.serverName || 'this server'}; choose a server`);
            if (u.PrimaryImageTag) { av.style.backgroundImage = `url("${D.client().getUserImageUrl(u.Id, { type: 'Primary', tag: u.PrimaryImageTag, maxWidth: 96 })}")`; }
            else av.textContent = D.initials(u.Name);
        }, () => {});
        const tick = () => { clock.textContent = D.time(); };
        tick();
        const t = setInterval(tick, 15000);
        return { stop: () => clearInterval(t) };
    }
    D.capsule = (root) => {
        const cap = el('div', 'ob-cap');
        cap.hidden = true;
        const art = el('span', 'ob-cap-art');
        const what = el('div', 'ob-cap-what');
        const btns = el('div', 'ob-cap-btns');
        const mk = (label, sym, run) => { const b = D.focusable(el('button', 'ob-cap-b', sym)); b.type = 'button'; b.setAttribute('aria-label', label); b.addEventListener('click', (ev) => { ev.stopPropagation(); T.ctx.sound('select'); run(); }); btns.append(b); return b; };
        const P = () => (ui.player && ui.player.controls ? ui.player.controls() : null);
        mk('Previous', '⏮', () => { const p = P(); if (p && p.previousItem) p.previousItem(); });
        const pp = mk('Play or pause', '⏯', () => { const p = P(); if (p) p.playPause(); });
        mk('Next', '⏭', () => { const p = P(); if (p && p.nextItem) p.nextItem(); });
        const open = D.focusable(el('button', 'ob-cap-b', '♪'));
        open.type = 'button';
        open.setAttribute('aria-label', 'Open Now playing');
        open.addEventListener('click', () => { T.ctx.sound('select'); T.ctx.navigate('#/queue'); });
        btns.append(open);
        const bar = el('div', 'ob-cap-bar');
        const fill = el('b');
        bar.append(fill);
        bar.addEventListener('pointerdown', (e) => {
            const p = P(); const s = p && p.state ? p.state() : null;
            if (!s || !s.duration) return;
            const r = bar.getBoundingClientRect();
            p.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * s.duration);
        });
        cap.append(art, what, btns, bar);
        root.append(cap);
        const draw = () => {
            const np = T.ctx.nowPlaying && T.ctx.nowPlaying();
            const it = np && np.item;
            const audio = it && (it.MediaType === 'Audio' || it.Type === 'Audio');
            cap.hidden = !audio;
            root.classList.toggle('ob-has-cap', !!audio);
            if (!audio) return;
            what.textContent = [it.Name, (it.Artists || [])[0] || it.AlbumArtist].filter(Boolean).join(' · ');
            const tag = it.AlbumPrimaryImageTag || (it.ImageTags || {}).Primary;
            const id = it.AlbumPrimaryImageTag ? it.AlbumId : it.Id;
            art.style.backgroundImage = tag ? `url("${D.image(id, 'Primary', tag, 120)}")` : '';
            const s = P() && P().state ? P().state() : null;
            fill.style.width = s && s.duration ? `${Math.min(100, (s.position / s.duration) * 100)}%` : '0%';
            pp.textContent = s && s.paused ? '▶' : '⏸';
        };
        draw();
        const t = setInterval(draw, 1000);
        return { stop: () => clearInterval(t) };
    };

    // ---- the guide: blades over any screen (Guide board) ----
    const Gd = { open: false };
    async function blades() {
        let user = null;
        try { user = await D.client().getCurrentUser(); } catch (e) { user = null; }
        const admin = !!(user && user.Policy && user.Policy.IsAdministrator);
        const go = (h) => () => T.ctx.navigate(h);
        const np = T.ctx.nowPlaying && T.ctx.nowPlaying();
        const media = [['Home', go('#/home')], ['Search', go('#/search')]];
        if (np && np.item) media.push([`Now playing · ${np.item.Name}`, go(np.item.MediaType === 'Audio' ? '#/queue' : '#/video')]);
        media.push(['Continue watching', go('#/home?or=resume')], ['Next up', go('#/home?or=nextup')], ['Favourites', go('#/home?or=favourites')],
            ['Play on…', () => D.playOn && D.playOn('play', null)], ['Watch together…', () => D.playOn && D.playOn('together', null)]);
        await D.loadViews();
        const prefs = D.homePrefs ? D.homePrefs() : { hidden: [] };
        const views = (D.orderedViews ? D.orderedViews(D.views, prefs) : D.views).filter((v) => !(prefs.hidden || []).includes(v.Id));
        const library = views.map((v) => [v.Name, go(D.viewRoute(v))]);
        if (!views.some((v) => v.CollectionType === 'playlists')) library.push(['Playlists', go('#/playlists')]);
        const you = [['Profile', go('#/userprofile')], ['Quick Connect', go('#/quickconnect')],
            ['Switch user', () => D.panel.ask({ title: 'Switch user?', path: 'You', text: 'You sign out here and choose who signs in.', choices: [{ label: 'Stay', safe: true }, { label: 'Switch user', run: () => T.ctx.signOut() }] })],
            ['Switch server', () => T.ctx.selectServer()], ['Sign out…', () => D.signOutAsk(user)]];
        const settings = [['Client Settings', go('#/mypreferencesmenu?pane=client')], ['Display', go('#/mypreferencesdisplay')], ['Home', go('#/mypreferenceshome')], ['Playback', go('#/mypreferencesplayback')],
            ['Subtitles', go('#/mypreferencessubtitles')], ['Controls', go('#/mypreferencescontrols')],
            ['Classic View', () => { if (ui.settings && ui.settings.classic) ui.settings.classic(); else T.ctx.navigate('#/home?icefin=stock'); }]];
        if (admin) settings.push(['Server dashboard', go('#/dashboard')]);
        settings.push(['Exit IceFin Player…', () => D.exitAsk()]);
        return [{ name: 'Media', rows: media }, { name: 'Library', rows: library }, { name: 'You', rows: you }, { name: 'Settings', rows: settings }];
    }
    const GUIDE = {
        mount(host, ctx) {
            Gd.open = true;
            Gd.ctx = ctx;
            try { if (T.ctx.music && T.ctx.music.jingle) T.ctx.music.jingle('guide'); } catch (e) { /* jingles off */ }
            host.classList.add('ob-guide-host');
            const dim = el('div', 'ob-guide-dim');
            dim.addEventListener('click', () => ctx.close());
            const g = el('div', 'ob-guide');
            g.setAttribute('role', 'dialog');
            g.setAttribute('aria-label', 'Guide');
            host.append(dim, g);
            Gd.g = g;
            Gd.at = Gd.at || 0;
            blades().then((list) => { if (!Gd.open) return; Gd.list = list; drawGuide(); }, () => {});
            D.hints([['OK', 'select'], ['◀ ▶', 'blades'], ['Back', 'close']]);
        },
        unmount() { Gd.open = false; Gd.g = null; if (D.screenHints) D.screenHints(); else D.hintsOff(); },
        leave(h) { h.classList.add('ob-guide-leave'); return ui.motion.duration(200); },
        onAction(a) {
            if (a === 'left' || a === 'right' || a === 'step_backward' || a === 'step_forward') {
                const d = a === 'right' || a === 'step_forward' ? 1 : -1;
                const n = Gd.at + d;
                if (!Gd.list || n < 0 || n >= Gd.list.length) { T.ctx.sound('error'); return true; }
                Gd.at = n; T.ctx.sound('navigate'); drawGuide(d);
                return true;
            }
            return false;
        }
    };
    function drawGuide(dir) {
        const g = Gd.g;
        if (!g || !Gd.list) return;
        g.textContent = '';
        const spine = el('div', 'ob-spine');
        spine.append(el('span', '', Gd.list[Gd.at].name));
        const p = el('div', 'or-p ob-guide-p' + (dir ? (dir > 0 ? ' ob-from-r' : ' ob-from-l') : ''));
        const head = el('div', 'ob-guide-head');
        head.append(el('span', 'ob-guide-user', ''), el('span', 'ob-guide-clock', D.time()));
        Promise.resolve(D.client() && D.client().getCurrentUser()).then((u) => { if (u) head.firstChild.textContent = u.Name; }, () => {});
        p.append(head);
        const rows = el('div', 'ob-guide-rows');
        Gd.list[Gd.at].rows.forEach(([label, run], k) => {
            const b = D.focusable(el('button', 'or-li', label));
            b.type = 'button';
            b.addEventListener('click', () => { T.ctx.sound('select'); if (Gd.ctx) Gd.ctx.close(); setTimeout(run, 0); });
            rows.append(b);
            if (k === 0) setTimeout(() => T.ctx.focus(b), 0);
        });
        p.append(rows);
        const stackR = el('div', 'ob-blades');
        Gd.list.forEach((b, k) => {
            if (k <= Gd.at) return;
            const x = el('button', 'ob-blade');
            x.type = 'button';
            x.tabIndex = -1;
            x.append(el('span', '', b.name));
            x.setAttribute('aria-label', `${b.name} blade`);
            x.addEventListener('click', () => { Gd.at = k; T.ctx.sound('navigate'); drawGuide(1); });
            stackR.append(x);
        });
        const stackL = el('div', 'ob-blades-l');
        Gd.list.forEach((b, k) => {
            if (k >= Gd.at) return;
            const x = el('button', 'ob-blade');
            x.type = 'button';
            x.tabIndex = -1;
            x.append(el('span', '', b.name));
            x.setAttribute('aria-label', `${b.name} blade`);
            x.addEventListener('click', () => { Gd.at = k; T.ctx.sound('navigate'); drawGuide(-1); });
            stackL.append(x);
        });
        g.append(stackL, spine, p, stackR);
        g.setAttribute('data-ob-blade', Gd.list[Gd.at].name);
    }
    ui.overlay.set(GUIDE);
    D.guideOverlay = GUIDE;
    // the panel (panel.js) takes the overlay while it is up; the guide is the overlay again when it closes
    D.restoreGuide = () => { if (!(D.panel && D.panel.isOpen())) ui.overlay.set(GUIDE); };

    // ---- #/home: the channels, Settings (?or=settings) and the home's own lists (?or=resume|nextup|favourites) ----
    const LISTS = { resume: 'Continue watching', nextup: 'Next up', favourites: 'Favourites' };
    let H = null;
    D.register('#/home', {
        onAction(action, ctx) {
            if (H && H.C) return H.C.onAction(action);
            if (!S || !S.rows || !S.rows.length) return action === 'back' ? (D.exitAsk(), true) : false;
            const f = ctx.focused();
            const r = S.rows.findIndex((row) => row.cells.includes(f));
            if (action === 'back') { D.exitAsk(); return true; }
            if (r < 0) { if (action === 'down' || action === 'up' || action === 'left') { focusChannel(S.index); return true; } return false; }
            if (action === 'up' || action === 'down') {
                const n = r + (action === 'down' ? 1 : -1);
                if (n >= 0 && n < S.rows.length) { focusChannel(n); ctx.sound('navigate'); remember(); } else ctx.sound('error');
                return true;
            }
            if (action === 'left' || action === 'right') { setTimeout(remember, 0); return false; }  // the carousel's own moves
            const e = S.rows[r].entries[S.rows[r].carousel.index()];
            if (action === 'menu') { if (e && e.menu) { e.menu(); return true; } if (e && e.item && D.itemMenu) { D.itemMenu(e.item, {}); return true; } return false; }
            if (action === 'play_pause' || action === 'playpause') { if (e && e.item && D.playable(e.item)) { ctx.sound('select'); D.playItem(e.item, true); return true; } return false; }
            return false;
        },
        onBack() { if (H && H.C) return H.C.onAction('back'); D.exitAsk(); return true; },
        mount(root) {
            const p = D.params();
            const sub = p.get('or');
            H = { root };
            if (sub === 'settings' || LISTS[sub]) {  // Settings (Settings board) and the home's lists: the browse screen
                const lvl = sub === 'settings' ? { title: 'Settings', count: false, load: D.settingsEntries, mode: 'list' }
                    : { title: LISTS[sub], count: false, load: async () => { const rows = D.homeRows(await D.loadViews()); const r = rows.find((x) => x.id === sub); const lv = r ? await r.level() : null; return lv ? lv.load() : []; } };
                H.C = D.columns(root, { root: lvl, name: sub === 'settings' ? 'settings' : 'homelist', key: `#/home?or=${sub}` });
                H.extra = [D.capsule(root)];
                return;
            }
            root.setAttribute('data-ob', 'home');
            root.setAttribute('data-or-screen', 'home');
            root.classList.add('ob-home');
            S = { root, rows: [], index: -1 };
            S.backdrop = el('div', 'ob-backdrop');
            const view = el('div', 'ob-view');
            S.stack = el('div', 'ob-stack');
            view.append(S.stack);
            S.count = el('div', 'ob-count');
            root.append(S.backdrop, view, S.count, el('div', 'or-mark'));
            H.extra = [account(root), D.capsule(root)];
            D.pointerNav(root, () => D.exitAsk());
            root.orbitFill = (channels) => fill(channels.map((ch, i) => ({ id: `t${i}`, title: ch.title, entries: ch.tiles || ch.entries || [] })));
            if (D.ping) D.ping();
            clearInterval(H.ping);
            H.ping = setInterval(() => D.ping && D.ping(), 60000);
            const me = S;
            (async () => {
                const rows = await D.homeEntries();
                const levels = await Promise.all(rows.map(async (r) => { try { const lv = await r.open(); const list = (await lv.load()) || []; return { id: r.homeRow, title: (r.name || '').toLowerCase(), entries: list.filter((e) => !e.synthetic) }; } catch (e) { return { id: r.homeRow, title: r.name, entries: [] }; } }));
                if (S !== me) return;
                fill(levels);
            })().catch((e) => { console.warn('Orbit: channels', e); if (S === me) fill([]); });
        },
        unmount() {
            if (H) { if (H.C) H.C.stop(); for (const x of H.extra || []) x.stop(); clearInterval(H.ping); }
            if (S) { remember(); clearInterval(S.liveTimer); }
            S = null; H = null;
            D.screenHints = null;
            D.hintsOff();
        }
    });
})();
