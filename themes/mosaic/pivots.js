// Mosaic: the home and the guide (PLAN 9.9, refined in 9.55; the "Mosaic Screens" canvas: Main, Home, HomeMore,
// Guide, Settings, Dialogs). The home is the target's pivot: one row of lowercase headers (ui.pivot, the current one at
// the grid's left, the ones before it trailing off the left), under it a grid of flat tiles in three sizes (large 2×2,
// wide 2×1, small 1×1) three rows deep, packed column by column and running off the right; the grid slides as focus
// moves. Green tiles are places and actions (a glyph top left, a word bottom left), art tiles are things; Continue
// watching, Next up, Recently added and On now are live tiles. Pivots, by default (Gate 1, decision 8): search, home,
// one per library, live tv, settings. The account top right (you, the server; A on it opens Choose a server), the
// clock under it, the now-playing strip low in the middle while music plays. Back asks "Exit Icefin?".
// The guide (decision 3a) is Mosaic's own: a white panel with its own pivot (home, media, you, settings) over any
// screen, on a long press of View, the guide button or F1; ◀ ▶ or the shoulders change tab, B or View closes it.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinMosaic;
    if (!T || !D || !D.columns) return;
    const ui = T.ui;
    const el = D.el;

    // the art a tile shows: landscape for wide and large tiles, the poster for small ones
    function tileArt(e, wide) {
        const it = e.item;
        if (!it) return e.art || '';
        const c = D.client();
        const tags = it.ImageTags || {};
        if (wide) {
            if ((it.BackdropImageTags || []).length) return c.getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: 900, tag: it.BackdropImageTags[0] });
            if ((it.ParentBackdropImageTags || []).length) return c.getScaledImageUrl(it.ParentBackdropItemId, { type: 'Backdrop', maxWidth: 900, tag: it.ParentBackdropImageTags[0] });
            if (tags.Thumb) return c.getScaledImageUrl(it.Id, { type: 'Thumb', maxWidth: 900, tag: tags.Thumb });
        }
        if (tags.Primary) return c.getScaledImageUrl(it.Id, { type: 'Primary', maxWidth: wide ? 900 : 400, tag: tags.Primary });
        if (it.AlbumPrimaryImageTag) return c.getScaledImageUrl(it.AlbumId, { type: 'Primary', maxWidth: 400, tag: it.AlbumPrimaryImageTag });
        return e.art || '';
    }
    const label = (e) => (e.name || '').toLowerCase();

    let S = null;  // {root, pivot, sections, at} while the home is up

    function hints(e) {
        const h = [];
        if (e) h.push(['OK', e.okLabel || (e.item ? (e.progress > 0 ? 'resume' : 'details') : 'open')]);
        if (e && e.item && D.playable(e.item)) h.push(['▶', e.progress > 0 ? 'resume' : 'play']);
        if (e && (e.item || e.menu)) h.push(['≡', 'options']);
        h.push(['LB RB', 'pivots'], ['View', 'guide']);
        D.screenHints = () => D.hints(h);
        if (!(D.panel && D.panel.isOpen()) && !Gd.open) D.hints(h);
    }

    // One tile: t = {size, entry, live?: [entries], glyph?}. A live tile cycles its entries (ui.liveTile, every 6–9 s,
    // staggered); A opens the one showing.
    function tile(t, k) {
        const e = t.entry || {};
        const c = el('div', `pv-tile pv-${t.size}`);
        c.tabIndex = -1;
        c.setAttribute('data-icefin-focus', '');
        const face = el('div', 'pv-face');
        c.append(face);
        const wide = t.size !== 'small';
        let current = () => e;
        if (t.live && t.live.length) {
            c.classList.add('pv-live', 'pv-art');
            let shown = t.live[0];
            ui.liveTile(face, {
                interval: 6000 + (k % 4) * 900,
                fetch: () => t.live,
                render: (x) => {
                    shown = x;
                    const f = el('div', 'pv-frame');
                    const url = tileArt(x, wide);
                    if (url) f.style.backgroundImage = `url("${url}")`;
                    else f.append(D.svg(x.icon || (x.item ? D.kindIcon(x.item.Type) : 'item'), 'pv-glyph'));
                    const cap = el('div', 'pv-label');
                    cap.append(el('span', '', `${e.name ? `${label(e)}: ` : ''}${x.name || ''}`), el('small', '', x.progress > 0 && x.item ? D.left(x.item) : (x.cellSub || '')));
                    f.append(cap);
                    if (x.progress > 0 && x.progress < 1) { const p = el('i', 'ms-prog'); const b = el('b'); b.style.width = `${Math.round(x.progress * 100)}%`; p.append(b); f.append(p); }
                    return f;
                }
            });
            current = () => shown;
        } else {
            const art = t.glyph ? '' : tileArt(e, wide);
            if (art) { face.style.backgroundImage = `url("${art}")`; c.classList.add('pv-art'); }
            else face.append(D.svg(t.glyph || e.icon || (e.item ? D.kindIcon(e.item.Type) : 'item'), 'pv-glyph'));
            const cap = el('div', 'pv-label');
            cap.append(el('span', '', label(e)));
            face.append(cap);
            if (e.progress > 0 && e.progress < 1) { const p = el('i', 'ms-prog'); const b = el('b'); b.style.width = `${Math.round(e.progress * 100)}%`; p.append(b); face.append(p); }
        }
        c.msEntry = current;
        c.mosaicTile = { size: t.size, label: label(e) };  // tests/icefin/web/theme_mosaic.py reads it
        c.setAttribute('aria-label', [label(e), e.sub].filter(Boolean).join(', '));
        c.addEventListener('click', () => {
            const x = current();
            T.ctx.sound('select');
            if (x.go) x.go(); else if (x.item) D.openItem(x.item, c);
        });
        c.addEventListener('icefin-focus', () => { slide(c); hints(current()); remember(); });
        return c;
    }

    // the grid slides so the focused tile is in view (the target's grids run off the right)
    function slide(c) {
        const grid = c.parentElement;
        if (!grid || !grid.classList.contains('pv-grid')) return;
        const vw = window.innerWidth;
        const x0 = grid.offsetLeft;
        const right = x0 + c.offsetLeft + c.offsetWidth;
        const shift = Math.max(0, right - vw + x0 * 0.6);
        grid.style.transform = `translateX(${-Math.min(shift, Math.max(0, c.offsetLeft))}px)`;
    }

    // ---- the sections ----
    const SIZES = { large: 'large', wide: 'wide', small: 'small' };
    async function levelOf(row) { try { const lv = await row.open(); return ((await lv.load()) || []).filter((x) => !x.synthetic); } catch (e) { return []; } }

    async function sections() {
        const rows = await D.homeEntries();  // the user's order and choices (Settings › Home)
        const views = await D.loadViews();
        const byId = new Map(rows.map((r) => [r.homeRow, r]));
        const out = [];
        // search (the target kept its search pivot first)
        out.push({ id: 'search', title: 'search', tiles: async () => [
            { size: 'large', glyph: 'search', entry: { name: 'Search', okLabel: 'search', go: () => T.ctx.navigate('#/search') } },
            { size: 'wide', glyph: 'heart', entry: { name: 'Favourites', go: () => T.ctx.navigate('#/home?ms=favourites') } }
        ] });
        // home: the live tiles first, then places
        out.push({ id: 'home', title: 'home', tiles: async () => {
            const t = [];
            const resume = byId.get('resume') ? await levelOf(byId.get('resume')) : [];
            const next = byId.get('nextup') ? await levelOf(byId.get('nextup')) : [];
            let latest = [];
            try { const r = await Promise.resolve(D.client().getLatestItems({ UserId: D.uid(), Limit: 12, Fields: D.FIELDS, EnableImageTypes: 'Primary,Backdrop,Thumb' })); latest = (r || []).map((it) => D.entry(it)); } catch (e) { latest = []; }
            if (resume.length) t.push({ size: 'large', live: resume, entry: { name: 'Continue', okLabel: 'resume' } });
            if (latest.length) t.push({ size: 'wide', live: latest, entry: { name: 'Recently added' } });
            if (next.length) t.push({ size: 'wide', live: next, entry: { name: 'Next up', okLabel: 'play' } });
            t.push({ size: 'small', glyph: 'heart', entry: { name: 'Favourites', go: () => T.ctx.navigate('#/home?ms=favourites') } });
            t.push({ size: 'small', glyph: 'playlists', entry: { name: 'Playlists', go: () => T.ctx.navigate('#/playlists') } });
            if (resume.length) t.push({ size: 'small', glyph: 'resume', entry: { name: 'Continue watching', go: () => T.ctx.navigate('#/home?ms=resume') } });
            if (next.length) t.push({ size: 'small', glyph: 'tvshows', entry: { name: 'Next up', go: () => T.ctx.navigate('#/home?ms=nextup') } });
            if (!t.length) t.push({ size: 'large', glyph: 'item', entry: { name: 'Nothing here yet', go: () => T.ctx.navigate('#/search') } });
            return t;
        } });
        // one pivot per library, in the user's order
        for (const r of rows) {
            if (!r.homeRow.startsWith('latest:')) continue;
            const v = views.find((x) => `latest:${x.Id}` === r.homeRow);
            if (!v) continue;
            out.push({ id: r.homeRow, title: v.Name.toLowerCase(), tiles: async () => {
                const list = (await levelOf(r)).filter((x) => !x.libraryOf);
                const t = [];
                if (list.length) t.push({ size: 'large', live: list.slice(0, 8), entry: { name: 'Latest' } });
                t.push({ size: 'small', glyph: D.kindIcon(v.CollectionType), entry: { name: `All ${v.Name}`, okLabel: 'open', go: () => T.ctx.navigate(D.viewRoute(v)) } });
                list.slice(0, 6).forEach((x) => t.push({ size: 'small', entry: x }));
                t.push({ size: 'small', glyph: 'search', entry: { name: 'Search', go: () => T.ctx.navigate('#/search') } });
                return t;
            } });
        }
        if (byId.get('onnow')) {
            out.push({ id: 'onnow', title: 'live tv', tiles: async () => {
                const now = (await levelOf(byId.get('onnow'))).filter((x) => !x.libraryOf);
                const t = [];
                if (now.length) t.push({ size: 'wide', live: now.slice(0, 10), entry: { name: 'On now', okLabel: 'watch' } });
                t.push({ size: 'small', glyph: 'guide', entry: { name: 'Guide', go: () => T.ctx.navigate('#/livetv') } });
                for (const [k, n, g] of [['channels', 'Channels', 'channel'], ['recordings', 'Recordings', 'record'], ['schedule', 'Schedule', 'schedule'], ['series', 'Series', 'tvshows']]) {
                    t.push({ size: 'small', glyph: g, entry: { name: n, go: () => T.ctx.navigate(`#/livetv?ms=${k}`) } });
                }
                return t;
            } });
        }
        out.push({ id: 'settings', title: 'settings', tiles: async () => {
            const list = await D.settingsEntries();
            const icon = { Profile: 'person', 'Quick Connect': 'quick', 'Switch user': 'people', 'Sign out': 'signout', Display: 'display', Home: 'home', Playback: 'play', Subtitles: 'subtitles',
                Controls: 'controls', 'Play on…': 'cast', 'Watch together…': 'together', 'Client settings': 'client', 'Classic view': 'classic', 'Classic home': 'home', Dashboard: 'dashboard', 'Exit Icefin…': 'exit' };
            return list.map((x) => ({ size: 'small', glyph: icon[x.name] || 'settings', entry: Object.assign({}, x, { name: x.name.replace('…', '') }) }));
        } });
        return out;
    }

    function mountSection(sec, body) {
        const view = el('div', 'pv-view');
        const grid = el('div', 'pv-grid');
        view.append(grid);
        body.append(view);
        const put = (tiles) => {
            grid.textContent = '';
            grid.style.transform = '';
            tiles.forEach((t, k) => grid.append(tile(t, k)));
            if (S) S.root.setAttribute('data-pv-tiles', String(tiles.length));
            const mem = D.memory.get('#/home:mosaic');
            const at = mem && mem.section === sec.id ? mem.at : 0;
            const f = grid.children[Math.min(at, grid.children.length - 1)];
            if (f && !(D.panel && D.panel.isOpen()) && !Gd.open) setTimeout(() => { if (f.isConnected) T.ctx.focus(f); }, 0);
        };
        if (sec.cache) { put(sec.cache); return; }
        put([{ size: 'large', glyph: 'item', entry: { name: 'Loading' } }]);
        sec.load = sec.load || sec.tiles();
        sec.load.then((tiles) => { sec.cache = tiles; if (grid.isConnected) put(tiles); }, () => { if (grid.isConnected) put([]); });
    }
    function remember() {
        if (!S || !S.pivot) return;
        const sec = S.sections[S.pivot.index()];
        const f = T.ctx.focused && T.ctx.focused();
        const grid = f && f.parentElement;
        if (!sec || !grid || !grid.classList.contains('pv-grid')) return;
        D.memory.set('#/home:mosaic', { section: sec.id, at: [...grid.children].indexOf(f) });
    }

    function build(secs) {
        S.host.textContent = '';
        S.sections = secs;
        S.pivot = ui.pivot(S.host, secs.map((sec) => ({ title: sec.title, mount: (body) => mountSection(sec, body) })), {
            ms: 320,
            onChange: (i) => { if (S) { S.root.setAttribute('data-pv-section', secs[i].title); remember(); } }
        });
        S.root.setAttribute('data-pv-ready', String(secs.length));
        const mem = D.memory.get('#/home:mosaic');
        const start = Math.max(0, secs.findIndex((s) => s.id === (mem ? mem.section : 'home')));
        if (start) S.pivot.show(start);
    }
    D.homeIndex = () => (S && S.sections ? Math.max(0, S.sections.findIndex((s) => s.id === 'home')) : 0);

    // ---- the account (top right) and the now-playing strip (low in the middle) ----
    function account(root) {
        const box = el('div', 'ms-acct');
        const who = D.focusable(el('button', 'ms-acct-who'));
        who.type = 'button';
        const name = el('span', 'ms-acct-name', '');
        const srv = el('span', 'ms-server', `● ${D.serverName || '…'}`);
        const tx = el('span', 'ms-acct-tx');
        tx.append(name, srv);
        const av = el('span', 'ms-av', '');
        who.append(tx, av);
        who.addEventListener('click', () => { T.ctx.sound('select'); T.ctx.selectServer(); });
        const clock = el('div', 'pv-clock');
        box.append(who);
        root.append(box, clock);
        Promise.resolve(D.client() && D.client().getCurrentUser()).then((u) => {
            if (!u || !box.isConnected) return;
            name.textContent = u.Name;
            who.setAttribute('aria-label', `${u.Name} on ${D.serverName || 'this server'}; choose a server`);
            if (u.PrimaryImageTag) av.style.backgroundImage = `url("${D.client().getUserImageUrl(u.Id, { type: 'Primary', tag: u.PrimaryImageTag, maxWidth: 96 })}")`;
            else av.textContent = D.initials(u.Name);
        }, () => {});
        const tick = () => { clock.textContent = D.time(); };
        tick();
        const t = setInterval(tick, 15000);
        return { stop: () => clearInterval(t) };
    }
    D.capsule = (root) => {
        const cap = el('div', 'ms-cap');
        cap.hidden = true;
        const art = el('span', 'ms-cap-art');
        const what = el('div', 'ms-cap-what');
        const time = el('div', 'ms-cap-time');
        const btns = el('div', 'ms-cap-btns');
        const mk = (lbl, sym, run) => { const b = D.focusable(el('button', 'ms-cap-b', sym)); b.type = 'button'; b.setAttribute('aria-label', lbl); b.addEventListener('click', (ev) => { ev.stopPropagation(); T.ctx.sound('select'); run(); }); btns.append(b); return b; };
        const P = () => (ui.player && ui.player.controls ? ui.player.controls() : null);
        mk('Previous', '⏮', () => { const p = P(); if (p && p.previousItem) p.previousItem(); });
        const pp = mk('Play or pause', '⏯', () => { const p = P(); if (p) p.playPause(); });
        mk('Next', '⏭', () => { const p = P(); if (p && p.nextItem) p.nextItem(); });
        mk('Open Now playing', '♪', () => T.ctx.navigate('#/queue'));
        const bar = el('div', 'ms-cap-bar');
        const fill = el('b');
        bar.append(fill);
        bar.addEventListener('pointerdown', (e) => {
            const p = P(); const s = p && p.state ? p.state() : null;
            if (!s || !s.duration) return;
            const r = bar.getBoundingClientRect();
            p.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * s.duration);
        });
        const mid = el('div', 'ms-cap-mid');
        mid.append(what, bar);
        cap.append(art, mid, time, btns);
        root.append(cap);
        const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
        const draw = () => {
            const np = T.ctx.nowPlaying && T.ctx.nowPlaying();
            const it = np && np.item;
            const audio = it && (it.MediaType === 'Audio' || it.Type === 'Audio');
            cap.hidden = !audio;
            root.classList.toggle('ms-has-cap', !!audio);
            if (!audio) return;
            what.textContent = [it.Name, (it.Artists || [])[0] || it.AlbumArtist].filter(Boolean).join(' · ');
            const tag = it.AlbumPrimaryImageTag || (it.ImageTags || {}).Primary;
            const id = it.AlbumPrimaryImageTag ? it.AlbumId : it.Id;
            art.style.backgroundImage = tag ? `url("${D.image(id, 'Primary', tag, 120)}")` : '';
            const s = P() && P().state ? P().state() : null;
            fill.style.width = s && s.duration ? `${Math.min(100, (s.position / s.duration) * 100)}%` : '0%';
            time.textContent = s && s.duration ? `${fmt(s.position)} / ${fmt(s.duration)}` : '';
            pp.textContent = s && s.paused ? '▶' : '⏸';
        };
        draw();
        const t = setInterval(draw, 1000);
        return { stop: () => clearInterval(t) };
    };

    // ---- the guide: a white panel with its own pivot over any screen (Guide board) ----
    const Gd = { open: false };
    async function tabs() {
        let user = null;
        try { user = await D.client().getCurrentUser(); } catch (e) { user = null; }
        const admin = !!(user && user.Policy && user.Policy.IsAdministrator);
        const go = (h) => () => T.ctx.navigate(h);
        const np = T.ctx.nowPlaying && T.ctx.nowPlaying();
        const home = [['Home', go('#/home')], ['Search', go('#/search')]];
        if (np && np.item) home.push([`Now playing · ${np.item.Name}`, go(np.item.MediaType === 'Audio' ? '#/queue' : '#/video')]);
        home.push(['Continue watching', go('#/home?ms=resume')], ['Next up', go('#/home?ms=nextup')], ['Favourites', go('#/home?ms=favourites')],
            ['Play on…', () => D.playOn && D.playOn('play', null)], ['Watch together…', () => D.playOn && D.playOn('together', null)]);
        await D.loadViews();
        const prefs = D.homePrefs ? D.homePrefs() : { hidden: [] };
        const views = (D.orderedViews ? D.orderedViews(D.views, prefs) : D.views).filter((v) => !(prefs.hidden || []).includes(v.Id));
        const media = views.map((v) => [v.Name, go(D.viewRoute(v))]);
        if (!views.some((v) => v.CollectionType === 'playlists')) media.push(['Playlists', go('#/playlists')]);
        const you = [['Profile', go('#/userprofile')], ['Quick Connect', go('#/quickconnect')],
            ['Switch user', () => D.panel.ask({ title: 'Switch user?', path: 'You', text: 'You sign out here and choose who signs in.', choices: [{ label: 'Stay', safe: true }, { label: 'Switch user', run: () => T.ctx.signOut() }] })],
            ['Switch server', () => T.ctx.selectServer()], ['Sign out…', () => D.signOutAsk(user)]];
        const settings = [['Client Settings', go('#/mypreferencesmenu?pane=client')], ['Display', go('#/mypreferencesdisplay')], ['Home', go('#/mypreferenceshome')], ['Playback', go('#/mypreferencesplayback')],
            ['Subtitles', go('#/mypreferencessubtitles')], ['Controls', go('#/mypreferencescontrols')],
            ['Classic View', () => { if (ui.settings && ui.settings.classic) ui.settings.classic(); else T.ctx.navigate('#/home?icefin=stock'); }]];
        if (admin) settings.push(['Server dashboard', go('#/dashboard')]);
        settings.push(['Exit Icefin…', () => D.exitAsk()]);
        return [{ name: 'home', rows: home }, { name: 'media', rows: media }, { name: 'you', rows: you }, { name: 'settings', rows: settings }];
    }
    const GUIDE = {
        mount(host, ctx) {
            Gd.open = true;
            Gd.ctx = ctx;
            try { if (T.ctx.music && T.ctx.music.jingle) T.ctx.music.jingle('guide'); } catch (e) { /* jingles off */ }
            host.classList.add('ms-gd-host');
            const dim = el('div', 'ms-gd-dim');
            dim.addEventListener('click', () => ctx.close());
            const g = el('div', 'ms-gd');
            g.setAttribute('role', 'dialog');
            g.setAttribute('aria-label', 'Guide');
            host.append(dim, g);
            Gd.g = g;
            Gd.at = Gd.at || 0;
            tabs().then((list) => { if (!Gd.open) return; Gd.list = list; drawGuide(); }, () => {});
            D.hints([['OK', 'select'], ['◀ ▶', 'tabs'], ['Back', 'close']]);
        },
        unmount() { Gd.open = false; Gd.g = null; if (D.screenHints) D.screenHints(); else D.hintsOff(); },
        leave(h) { h.classList.add('ms-gd-leave'); return ui.motion.duration(160); },
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
        const head = el('div', 'ms-gd-tabs');
        Gd.list.forEach((b, k) => {
            const x = el('button', 'ms-gd-tab' + (k === Gd.at ? ' on' : ''), b.name);
            x.type = 'button';
            x.tabIndex = -1;
            x.addEventListener('click', () => { const d = k - Gd.at; Gd.at = k; T.ctx.sound('navigate'); drawGuide(d); });
            head.append(x);
        });
        g.append(head);
        const body = el('div', 'ms-gd-body' + (dir ? (dir > 0 ? ' ms-from-r' : ' ms-from-l') : ''));
        const rows = el('div', 'ms-gd-rows');
        Gd.list[Gd.at].rows.forEach(([lbl, run], k) => {
            const b = D.focusable(el('button', 'ms-li', lbl));
            b.type = 'button';
            b.addEventListener('click', () => { T.ctx.sound('select'); if (Gd.ctx) Gd.ctx.close(); setTimeout(run, 0); });
            rows.append(b);
            if (k === 0) setTimeout(() => T.ctx.focus(b), 0);
        });
        body.append(rows);
        const side = el('div', 'ms-gd-side');
        const np = T.ctx.nowPlaying && T.ctx.nowPlaying();
        if (Gd.at === 0 && np && np.item) {
            const it = np.item;
            const art = el('span', 'ms-gd-art');
            const tag = it.AlbumPrimaryImageTag || (it.ImageTags || {}).Primary;
            if (tag) art.style.backgroundImage = `url("${D.image(it.AlbumPrimaryImageTag ? it.AlbumId : it.Id, 'Primary', tag, 200)}")`;
            const tx = el('div', 'ms-gd-np');
            tx.append(el('b', '', 'now playing'), el('span', '', [it.Name, (it.Artists || [])[0] || it.SeriesName].filter(Boolean).join(' · ')));
            side.append(art, tx);
        }
        const who = el('div', 'ms-gd-who', '');
        Promise.resolve(D.client() && D.client().getCurrentUser()).then((u) => { if (u) who.textContent = `${u.Name} · ${D.serverName || ''} · ${D.time()}`; }, () => {});
        side.append(who);
        body.append(side);
        g.append(body);
        g.setAttribute('data-ms-tab', Gd.list[Gd.at].name);
    }
    ui.overlay.set(GUIDE);
    D.guideOverlay = GUIDE;
    D.restoreGuide = () => { if (!(D.panel && D.panel.isOpen())) ui.overlay.set(GUIDE); };

    // ---- #/home: the pivots, Settings (?ms=settings) and the home's own lists (?ms=resume|nextup|favourites) ----
    const LISTS = { resume: 'Continue watching', nextup: 'Next up', favourites: 'Favourites' };
    let H = null;
    D.register('#/home', {
        onAction(action, ctx) {
            if (H && H.C) return H.C.onAction(action);
            if (!S || !S.pivot) return action === 'back' ? (D.exitAsk(), true) : false;
            if (action === 'back') {
                const h = D.homeIndex();
                if (S.pivot.index() !== h) { S.pivot.show(h); ctx.sound('back'); return true; }
                D.exitAsk(); return true;
            }
            if (action === 'step_forward' || action === 'step_backward') { S.pivot.show(S.pivot.index() + (action === 'step_forward' ? 1 : -1)); ctx.sound('navigate'); return true; }
            const f = ctx.focused();
            if (!f || !f.msEntry) return false;
            const e = f.msEntry();
            if (action === 'menu') { if (e && e.menu) { e.menu(); return true; } if (e && e.item && D.itemMenu) { D.itemMenu(e.item, {}); return true; } return false; }
            if (action === 'play_pause' || action === 'playpause') { if (e && e.item && D.playable(e.item)) { ctx.sound('select'); D.playItem(e.item, true); return true; } return false; }
            return false;
        },
        onBack() { if (H && H.C) return H.C.onAction('back'); return this.onAction('back', T.ctx); },
        mount(root) {
            const p = D.params();
            const sub = p.get('ms');
            H = { root };
            if (sub === 'settings' || LISTS[sub]) {  // Settings and the home's lists: the browse screen
                const lvl = sub === 'settings' ? { title: 'Settings', count: false, load: D.settingsEntries, mode: 'list' }
                    : { title: LISTS[sub], count: false, load: async () => { const rows = D.homeRows(await D.loadViews()); const r = rows.find((x) => x.id === sub); const lv = r ? await r.level() : null; return lv ? lv.load() : []; } };
                H.C = D.columns(root, { root: lvl, name: sub === 'settings' ? 'settings' : 'homelist', key: `#/home?ms=${sub}` });
                H.extra = [D.capsule(root)];
                return;
            }
            root.setAttribute('data-pv', 'home');
            root.setAttribute('data-ms-screen', 'home');
            root.classList.add('pv-home');
            S = { root };
            S.host = el('div', 'pv-host');
            root.append(S.host);
            H.extra = [account(root), D.capsule(root)];
            D.pointerNav(root, () => D.exitAsk());
            root.mosaicBuild = (secs) => build(secs.map((s, i) => ({ id: `t${i}`, title: s.title, tiles: async () => (s.tiles || []).map((x) => ({ size: x.size || 'small', glyph: x.glyph, entry: x.entry || { name: x.label, go: x.go || (() => {}) } })) })));
            if (D.ping) D.ping();
            H.ping = setInterval(() => D.ping && D.ping(), 60000);
            const me = S;
            sections().then((secs) => { if (S === me) build(secs); }, (e) => { console.warn('Mosaic: pivots', e); });
        },
        unmount() {
            if (H) { if (H.C) H.C.stop(); for (const x of H.extra || []) x.stop(); clearInterval(H.ping); }
            if (S) remember();
            S = null; H = null;
            D.screenHints = null;
            D.hintsOff();
        }
    });
})();
