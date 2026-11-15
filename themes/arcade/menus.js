// Arcade: the home and the two menus (PLAN 9.16, refined in 9.50; the "Arcade Screens" canvas: Main, Home, HomeMore,
// Guide, Dialogs). The home follows the reference (docs/themes/references/arcade.json): the top bar (search, quick
// access, the clock, you), a recent row of capsules led by a wide hero (Continue watching and Next up together, newest
// first), the focused capsule's name and state under it, a centred row of pills choosing a feed (what's new, next up,
// each library's new, favourites, live tv), the chosen feed's cards, and the bottom bar of hints. Back asks to exit.
// The main menu (Gate 1, decision 3a) slides in from the left on the guide button, F1 or a long press of View; quick
// access (now playing, volume, switches, Play on, Watch together) from the right, from the main menu or the top bar.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinArcade;
    if (!T || !D || !D.columns) return;
    const ui = T.ui;
    const E = T.ctx;
    const el = D.el;
    const FIELDS = 'PrimaryImageAspectRatio,ProductionYear,RunTimeTicks,UserData,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,SeriesPrimaryImageTag,SeriesId,DateCreated,PremiereDate,CommunityRating,Genres,ImageTags';
    const tags = (it) => it.ImageTags || {};

    ui.keyboard.enable();

    // ---- images ----
    function portrait(c, it, w) {
        if (it.Type === 'Episode' && it.SeriesPrimaryImageTag) return c.getScaledImageUrl(it.SeriesId, { type: 'Primary', maxWidth: w, tag: it.SeriesPrimaryImageTag });
        if (tags(it).Primary) return c.getScaledImageUrl(it.Id, { type: 'Primary', maxWidth: w, tag: tags(it).Primary });
        return '';
    }
    function wide(c, it, w) {
        if ((it.BackdropImageTags || []).length) return c.getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: w, tag: it.BackdropImageTags[0] });
        if ((it.ParentBackdropImageTags || []).length) return c.getScaledImageUrl(it.ParentBackdropItemId, { type: 'Backdrop', maxWidth: w, tag: it.ParentBackdropImageTags[0] });
        if (tags(it).Thumb) return c.getScaledImageUrl(it.Id, { type: 'Thumb', maxWidth: w, tag: tags(it).Thumb });
        return portrait(c, it, w);
    }
    const label = (it) => (it.Type === 'Episode' && it.SeriesName ? `${it.SeriesName} · ${it.Name}` : it.Name);

    let S = null;
    function capsule(c, it, hero) {
        const cap = el('div', 'ar-cap' + (hero ? ' hero' : ''));
        cap.setAttribute('data-icefin-focus', '');
        cap.tabIndex = -1;
        cap.arcadeItem = it;
        const img = hero ? wide(c, it, 1280) : portrait(c, it, 360);
        if (img) { cap.style.backgroundImage = `url("${img}")`; cap.classList.add('has-art'); }
        else cap.append(D.svg(D.kindIcon(it.Type), 'ar-cap-ic'));
        cap.setAttribute('aria-label', label(it));
        cap.append(el('div', 'ar-cap-name', label(it)));
        const ticks = it.UserData && it.UserData.PlaybackPositionTicks;
        if (ticks && it.RunTimeTicks) { const p = el('div', 'ar-progress'); const b = el('i'); b.style.width = `${Math.min(100, (100 * ticks) / it.RunTimeTicks).toFixed(1)}%`; p.append(b); cap.append(p); }
        cap.addEventListener('click', () => { T.ctx.sound('select'); D.openItem(it, cap); });
        return cap;
    }
    function cardEl(c, it) {
        const card = el('div', 'ar-cap card');
        card.setAttribute('data-icefin-focus', '');
        card.tabIndex = -1;
        card.arcadeItem = it;
        const art = el('div', 'ar-card-art');
        const img = wide(c, it, 640);
        if (img) art.style.backgroundImage = `url("${img}")`;
        else art.append(D.svg(D.kindIcon(it.Type), 'ar-cap-ic'));
        const tx = el('div', 'ar-card-text');
        tx.append(el('b', '', label(it)), el('span', '', status(it)));
        card.append(art, tx);
        card.setAttribute('aria-label', label(it));
        card.addEventListener('click', () => { T.ctx.sound('select'); D.openItem(it, card); });
        return card;
    }
    function status(it) {
        const d = it.UserData || {};
        if (it.Type === 'TvChannel') return it.CurrentProgram ? `${it.CurrentProgram.Name} · until ${D.time(new Date(Date.parse(it.CurrentProgram.EndDate)))}` : 'Live';
        if (d.PlaybackPositionTicks && it.RunTimeTicks) return `Resume · ${Math.max(1, Math.round((it.RunTimeTicks - d.PlaybackPositionTicks) / 600000000))} min left`;
        if (it.Type === 'Episode' && it.ParentIndexNumber != null) return `Next · S${it.ParentIndexNumber} E${it.IndexNumber}`;
        return [it.ProductionYear, it.Type === 'Series' ? 'Series' : null].filter(Boolean).join(' · ') || 'New';
    }
    function showFocused(it) {
        if (!S || !it) return;
        S.name.textContent = label(it);
        S.sub.textContent = status(it);
        const img = wide(S.client, it, 1280);
        S.backdrop.style.backgroundImage = img ? `url("${img}")` : 'none';
    }
    function hintsFor(it) {
        const h = [['OK', it ? (it.UserData && it.UserData.PlaybackPositionTicks ? 'resume' : (it.Type === 'TvChannel' ? 'watch' : 'details')) : 'select']];
        if (it && D.playable(it)) h.push(['▶', 'play']);
        if (it) h.push(['≡', 'options']);
        h.push(['View', 'menu']);
        D.screenHints = () => D.hints(h);
        if (!(D.panel && D.panel.isOpen()) && !Mn.open) D.hints(h);
    }
    function choosePill(k) {
        S.pill = k;
        S.pills.forEach((p, i) => p.classList.toggle('current', i === k));
        const [, items, when] = S.feeds[k];
        S.cardLabel.textContent = when;
        const caps = items.map((it) => cardEl(S.client, it));
        S.shelves[1].track.textContent = '';
        S.shelves[1].track.style.transform = '';
        S.shelves[1].shift = 0;
        S.shelves[1].track.append(...caps);
        S.shelves[1].caps = caps;
        S.shelves[1].index = 0;
        S.root.setAttribute('data-ar-pill', String(k));
    }
    // Focus walks the visible slots; the row scrolls only when the next capsule would leave the screen.
    function focusCap(r, i) {
        const sh = S.shelves[r];
        sh.index = i;
        const cap = sh.caps[i];
        E.focus(cap);
        const view = sh.track.parentElement.offsetWidth, first = sh.caps[0].offsetLeft;
        let shift = sh.shift || 0;
        const left = cap.offsetLeft - first, right = cap.offsetLeft + cap.offsetWidth;
        if (left < shift) shift = left;
        else if (right - shift > view - first) shift = right - (view - first);
        sh.shift = Math.max(0, shift);
        sh.track.style.transform = sh.shift ? `translateX(${-Math.round(sh.shift)}px)` : '';
        const it = r === 0 ? cap.arcadeItem : (S.shelves[0].caps[S.shelves[0].index] || {}).arcadeItem;
        showFocused(it);
        hintsFor(cap.arcadeItem);
        D.memory.set('#/home:arcade', { r, i, pill: S.pill });
    }
    const pin = (view) => view.addEventListener('scroll', () => { if (view.scrollTop || view.scrollLeft) { view.scrollTop = 0; view.scrollLeft = 0; } });

    // ---- the top bar ----
    function topBar(root) {
        const bar = el('nav', 'ar-top');
        bar.append(el('div', 'ar-spacer'));
        const mk = (cls, text, aria, run) => { const b = D.focusable(el('button', 'ar-btn ' + cls, text)); b.type = 'button'; b.setAttribute('aria-label', aria); b.addEventListener('click', () => { T.ctx.sound('select'); run(); }); bar.append(b); return b; };
        const search = mk('ar-search', '', 'Search', () => T.ctx.navigate('#/search'));
        search.append(D.svg('search'));
        const qa = mk('ar-qa-btn', '•••', 'Quick access', () => D.quickAccess());
        const clock = el('div', 'ar-clock');
        const who = mk('ar-who', '', 'You: choose a server', () => T.ctx.selectServer());
        bar.insertBefore(clock, who);
        Promise.resolve(D.client() && D.client().getCurrentUser()).then((u) => {
            if (!u || !who.isConnected) return;
            if (u.PrimaryImageTag) who.style.backgroundImage = `url("${D.client().getUserImageUrl(u.Id, { type: 'Primary', tag: u.PrimaryImageTag, maxWidth: 96 })}")`;
            else who.textContent = D.initials(u.Name);
            who.setAttribute('aria-label', `${u.Name} on ${D.serverName || 'this server'}; choose a server`);
        }, () => {});
        const tick = () => { clock.textContent = D.time(); };
        tick();
        const timer = setInterval(() => { if (!clock.isConnected) clearInterval(timer); else tick(); }, 15000);
        root.append(bar);
        return { bar, items: [search, qa, who] };
    }

    // ---- the home's feeds (Gate 1, decision 8): the pills, each a row of cards ----
    async function feeds(c, uid, views) {
        const get = (p) => Promise.resolve(p).then((x) => (x && (x.Items || x)) || [], () => []);
        const prefs = D.homePrefs ? D.homePrefs() : { hidden: [] };
        const out = [];
        const all = await get(c.getLatestItems({ UserId: uid, Limit: 24, Fields: FIELDS }));
        if (all.length) out.push(["What's new", all, 'Recently added everywhere']);
        const next = await get(c.getNextUpEpisodes({ UserId: uid, Limit: 24, Fields: FIELDS }));
        if (next.length) out.push(['Next up', next, 'The next episode of what you watch']);
        for (const v of (D.orderedViews ? D.orderedViews(views, prefs) : views).filter((x) => !['livetv', 'playlists', 'boxsets', 'folders'].includes(x.CollectionType) && !(prefs.hidden || []).includes(x.Id))) {
            const types = { tvshows: 'Episode', music: 'MusicAlbum' }[v.CollectionType];
            const items = await get(c.getLatestItems(Object.assign({ UserId: uid, ParentId: v.Id, Limit: 24, Fields: FIELDS }, types ? { IncludeItemTypes: types } : {})));
            if (items.length) out.push([v.Name, items, `New in ${v.Name}`]);
        }
        const fav = await get(c.getItems(uid, { Filters: 'IsFavorite', Recursive: true, SortBy: 'SortName', IncludeItemTypes: 'Movie,Series,MusicAlbum,Episode,BoxSet,Playlist', Limit: 40, Fields: FIELDS }));
        if (fav.length) out.push(['Favourites', fav, 'Your favourites']);
        if (views.some((v) => v.CollectionType === 'livetv')) {
            const ch = await get(c.getLiveTvChannels({ UserId: uid, AddCurrentProgram: true, EnableImages: true, Limit: 30 }));
            if (ch.length) out.push(['Live TV', ch, 'On now']);
        }
        return out;
    }

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
        const b = D.focusable(el('button', 'ac-li ac-mm-row'));
        b.type = 'button';
        if (icon) b.append(D.svg(icon, 'ac-mm-ic'));
        b.append(el('span', 'ac-li-name', text));
        b.addEventListener('click', () => { T.ctx.sound('select'); if (close) close(); setTimeout(run, 0); });
        return b;
    }
    const MENU = {
        mount(host, ctx) {
            Mn.open = true;
            try { if (T.ctx.music && T.ctx.music.jingle) T.ctx.music.jingle('menu'); } catch (e) { /* jingles off */ }
            host.classList.add('ac-ov-host');
            const dim = el('div', 'ac-ov-dim');
            dim.addEventListener('click', () => ctx.close());
            const p = el('nav', 'ac-mm');
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
        leave(h) { h.classList.add('ac-ov-leave'); return ui.motion.duration(160); }
    };
    const QUICK = {
        mount(host, ctx) {
            Mn.open = true;
            host.classList.add('ac-ov-host');
            const dim = el('div', 'ac-ov-dim');
            dim.addEventListener('click', () => ctx.close());
            const p = el('aside', 'ac-qa');
            p.setAttribute('aria-label', 'Quick access');
            const rail = el('div', 'ac-qa-rail');
            for (const ic of ['music', 'settings', 'people', 'info']) rail.append(D.svg(ic));
            const body = el('div', 'ac-qa-body');
            p.append(rail, body);
            host.append(dim, p);
            const np = T.ctx.nowPlaying && T.ctx.nowPlaying();
            const it = np && np.item;
            body.append(el('div', 'ac-qa-h', 'Now playing'));
            const now = el('div', 'ac-qa-now');
            const art = el('span', 'ac-qa-art');
            const tx = el('div', 'ac-qa-tx');
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
            body.append(el('div', 'ac-qa-h', 'This player'));
            const sw = (text, on, flip) => {
                const b = panelRow(text, null, () => { flip(); b.querySelector('.ac-switch').classList.toggle('on', on()); });
                const s = el('span', 'ac-switch' + (on() ? ' on' : ''));
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
        leave(h) { h.classList.add('ac-ov-leave', 'ac-ov-right'); return ui.motion.duration(160); }
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
        const cap = el('button', 'ac-cap');
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

    // ---- #/home: the home, Settings (?ac=settings) and the home's own lists (?ac=resume|nextup|favourites) ----
    const LISTS = { resume: 'Continue watching', nextup: 'Next up', favourites: 'Favourites' };
    let H = null;
    D.register('#/home', {
        onAction(action, ctx) {
            if (H && H.C) return H.C.onAction(action);
            if (!S || !S.ready) return action === 'back' ? (D.exitAsk(), true) : false;
            const f = ctx.focused();
            const it = f && f.arcadeItem;
            if (action === 'menu' && it) { if (D.itemMenu) { D.itemMenu(it, {}); return true; } return false; }
            if ((action === 'play_pause' || action === 'playpause') && it && D.playable(it)) { ctx.sound('select'); D.playItem(it, true); return true; }
            const pi = S.pills.indexOf(f);
            if (action === 'step_forward' || action === 'step_backward') {
                if (!S.pills.length) return true;
                const n = Math.max(0, Math.min(S.pills.length - 1, S.pill + (action === 'step_forward' ? 1 : -1)));
                choosePill(n); E.focus(S.pills[n]); ctx.sound('navigate'); return true;
            }
            if (pi >= 0) {
                if (action === 'left' || action === 'right') {
                    const n = pi + (action === 'right' ? 1 : -1);
                    if (n >= 0 && n < S.pills.length) { E.focus(S.pills[n]); choosePill(n); ctx.sound('navigate'); }
                    return true;
                }
                if (action === 'down') { if (S.shelves[1].caps.length) { focusCap(1, 0); ctx.sound('focus'); } return true; }
                if (action === 'up') { focusCap(0, S.shelves[0].index); ctx.sound('focus'); return true; }
                if (action === 'back') { D.exitAsk(); return true; }
                return false;
            }
            const r = S.shelves.findIndex((s) => s.track.contains(f));
            if (r >= 0) {
                const sh = S.shelves[r], i = sh.caps.indexOf(f);
                if (action === 'left' || action === 'right') { const n = i + (action === 'right' ? 1 : -1); if (n >= 0 && n < sh.caps.length) { focusCap(r, n); ctx.sound('focus'); } else ctx.sound('error'); return true; }
                if (action === 'down') { if (r === 0 && S.pills.length) { E.focus(S.pills[S.pill]); hintsFor(null); ctx.sound('focus'); } return true; }
                if (action === 'up') { if (r === 1) E.focus(S.pills[S.pill]); else E.focus(S.top.items[0]); ctx.sound('focus'); return true; }
                if (action === 'back') { if (r === 1) { focusCap(0, S.shelves[0].index); ctx.sound('back'); } else D.exitAsk(); return true; }
                return false;
            }
            if (S.top.items.includes(f)) {
                const i = S.top.items.indexOf(f);
                if (action === 'left' || action === 'right') { const n = i + (action === 'right' ? 1 : -1); if (n >= 0 && n < S.top.items.length) { E.focus(S.top.items[n]); ctx.sound('focus'); } return true; }
                if (action === 'down') { if (S.shelves[0].caps.length) { focusCap(0, S.shelves[0].index); ctx.sound('focus'); } return true; }
                if (action === 'back') { D.exitAsk(); return true; }
                return action === 'up';
            }
            if (action === 'back') { D.exitAsk(); return true; }
            return false;
        },
        onBack() { if (H && H.C) return H.C.onAction('back'); return this.onAction('back', T.ctx); },
        async mount(root) {
            const sub = D.params().get('ac');
            H = { root };
            if (sub === 'settings' || LISTS[sub]) {
                const lvl = sub === 'settings' ? { title: 'Settings', count: false, load: D.settingsEntries, mode: 'list' }
                    : { title: LISTS[sub], count: false, load: async () => { const rows = D.homeRows(await D.loadViews()); const r = rows.find((x) => x.id === sub); const lv = r ? await r.level() : null; return lv ? lv.load() : []; } };
                H.C = D.columns(root, { root: lvl, name: sub === 'settings' ? 'settings' : 'homelist', key: `#/home?ac=${sub}` });
                H.extra = [D.capsule(root)];
                return;
            }
            root.setAttribute('data-ar', 'home');
            root.setAttribute('data-ac-screen', 'home');
            S = { client: T.ctx.apiClient(), root, shelves: [], ready: false, pills: [], feeds: [], pill: 0 };
            const me = S;
            const views = await D.loadViews();
            if (S !== me) return;
            S.client = T.ctx.apiClient();  // a cold start creates the client late: read it after the views
            S.backdrop = el('div', 'ar-backdrop');
            root.append(S.backdrop);
            S.top = topBar(root);
            const body = el('div', 'ar-body');
            S.scroll = el('div', 'ar-scroll');
            body.append(S.scroll);
            root.append(body);
            D.pointerNav(root, () => D.exitAsk());
            H.extra = [];
            if (D.ping) D.ping();
            H.ping = setInterval(() => D.ping && D.ping(), 60000);
            const c = S.client, uid = c.getCurrentUserId();
            const get = (p) => Promise.resolve(p).then((x) => (x && (x.Items || x)) || [], () => []);
            const [resume, nextUp] = await Promise.all([
                get(c.getResumableItems(uid, { Limit: 20, MediaTypes: 'Video', Fields: FIELDS })),
                get(c.getNextUpEpisodes({ UserId: uid, Limit: 20, Fields: FIELDS }))
            ]);
            const f = await feeds(c, uid, views);
            if (S !== me) return;
            // the recent row: what's in progress and up next together, the most recently watched first
            const when = (it) => Date.parse((it.UserData && it.UserData.LastPlayedDate) || it.DateCreated || 0) || 0;
            let recent = resume.concat(nextUp.filter((n) => !resume.some((x) => x.Id === n.Id))).sort((a, b) => when(b) - when(a));
            if (!recent.length && f.length) recent = f[0][1];
            const sec0 = el('section', 'ar-shelf ar-recent');
            const track0 = el('div', 'ar-track');
            const caps0 = recent.slice(0, 20).map((it, i) => capsule(c, it, i === 0));
            track0.append(...caps0);
            S.name = el('div', 'ar-focus-name');
            S.sub = el('div', 'ar-focus-sub');
            sec0.append(track0, S.name, S.sub);
            const pills = el('div', 'ar-pills');
            S.feeds = f;
            S.pills = f.map(([title], k) => {
                const p = D.focusable(el('button', 'ar-pill', title));
                p.type = 'button';
                p.addEventListener('click', () => { choosePill(k); T.ctx.sound('navigate'); });
                pills.append(p);
                return p;
            });
            const sec1 = el('section', 'ar-shelf ar-feed');
            S.cardLabel = el('div', 'ar-card-label');
            const track1 = el('div', 'ar-track ar-cards');
            sec1.append(S.cardLabel, track1);
            S.scroll.append(sec0, pills, sec1);
            [body, S.scroll, sec0, sec1].forEach(pin);
            S.shelves = [{ sec: sec0, track: track0, caps: caps0, index: 0 }, { sec: sec1, track: track1, caps: [], index: 0 }];
            const mem = D.memory.get('#/home:arcade');
            if (f.length) choosePill(mem && mem.pill < f.length ? mem.pill : 0);
            S.ready = true;
            root.setAttribute('data-ar-ready', String(S.shelves.filter((x) => x.caps.length).length));
            if (!caps0.length && !f.length) {
                const empty = el('div', 'ac-empty');
                empty.append(el('div', 'ac-empty-title', 'Nothing here yet'), el('div', 'ac-empty-text', 'Your libraries show here once the server has something in them.'));
                S.scroll.append(empty);
            }
            if (caps0.length) focusCap(0, mem && mem.r === 0 ? Math.min(mem.i, caps0.length - 1) : 0);
            else E.focus(S.top.items[0]);
        },
        unmount() {
            if (H) { if (H.C) H.C.stop(); for (const x of H.extra || []) x.stop(); clearInterval(H.ping); }
            S = null; H = null;
            D.screenHints = null;
            D.hintsOff();
        }
    });
})();
