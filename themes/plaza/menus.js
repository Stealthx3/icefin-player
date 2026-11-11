// Plaza channel menus (PLAN 9.32): where a channel card's Open leads. Every menu shares one frame: the channel's name in
// a pill and its tabs along the top, the content, and a curved bottom bar with round Back and Home buttons, the focused
// item's name between them and a line of controller hints (shown only while a remote or controller is in use, 9.28).
// Grids page sideways like the home (450 ms), keep their cells at their own size, and fit more columns on wider
// screens; the focused cell glows and shows its name in a pill. Registered on jellyfin-web's own routes for the
// libraries, Live TV and search (#/movies, #/tv, #/music, #/livetv, #/search), so any way there lands here, and on
// #/home?pz=… for Plaza's own (series, resume, nextup, library, items).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const P = window.icefinPlaza;
    const ui = T.ui;
    const el = P.el;
    const SHAPES = {
        poster: { w: 195, h: 293, gx: 33, gy: 66, rows: 2, top: 162 },
        square: { w: 240, h: 240, gx: 33, gy: 75, rows: 2, top: 162 },
        wide: { w: 405, h: 186, gx: 27, gy: 33, rows: 3, top: 168 },
        episode: { w: 390, h: 219, gx: 36, gy: 105, rows: 2, top: 162 },
        result: { w: 240, h: 180, gx: 24, gy: 0, rows: 1, top: 0 }
    };

    // ---- the frame ----
    function frame(root, spec) {
        root.setAttribute('data-pz', 'menu');
        root.setAttribute('data-pz-view', spec.view);
        const m = el('div', 'pz-menu pz-k-' + spec.kind);
        const head = el('div', 'pz-mhead');
        const name = el('div', 'pz-mname', spec.name);
        const tabs = el('div', 'pz-tabs');
        const clock = el('div', 'pz-mclock');
        const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
        tick();
        const timer = setInterval(tick, 15000);
        head.append(name, tabs, clock);
        const body = el('div', 'pz-mbody');
        const barEl = el('div', 'pz-mbar');
        barEl.innerHTML = '<svg class="pz-mbar-svg" viewBox="0 0 1920 210" preserveAspectRatio="none" aria-hidden="true"><path class="pz-bar-fill" d="M0 51 C480 21 1440 21 1920 51 V210 H0 Z"/><path class="pz-bar-shine" d="M0 60 C480 30 1440 30 1920 60"/><path class="pz-bar-line" d="M0 51 C480 21 1440 21 1920 51"/></svg>';
        const round = (cls, label, go) => { const b = P.focusable(el('div', 'pz-mround ' + cls, label)); b.setAttribute('aria-label', label); b.addEventListener('click', go); return b; };
        const back = round('pz-mround-back', 'Back', () => { T.ctx.sound('back'); goBack(); });
        const homeBtn = round('pz-mround-home', 'Home', () => { P.reopen = null; T.ctx.navigate('#/home'); });
        const mid = el('div', 'pz-mmid');
        const focusLine = el('div', 'pz-mfocus');
        const hint = el('div', 'pz-mhints');
        const hintText = el('span', 'pz-mhint-keys');
        hintText.append(...P.hintNodes(spec.hints || 'Ⓐ Select · Ⓑ Back'));
        const pageText = el('span', 'pz-mpage');
        hint.append(hintText, pageText);
        mid.append(focusLine, hint);
        barEl.append(back, mid, homeBtn);
        m.append(head, body, barEl);
        root.append(m);
        let tabEls = [];
        const f = {
            root, body, menu: m, back, home: homeBtn,
            setTabs(list, active, onTab) {
                tabs.textContent = '';
                tabEls = list.map((t) => {
                    const b = P.focusable(el('div', 'pz-tab' + (t.id === active ? ' pz-tab-on' : '') + (t.cls ? ' ' + t.cls : ''), t.label));
                    b.setAttribute('data-pz-tab', t.id);
                    b.addEventListener('click', () => { if (t.go) { t.go(); return; } f.setActive(t.id); onTab(t.id, b); });
                    tabs.append(b);
                    return b;
                });
            },
            setActive(id) { tabEls.forEach((b) => b.classList.toggle('pz-tab-on', b.getAttribute('data-pz-tab') === id)); },
            tab: (id) => tabEls.find((b) => b.getAttribute('data-pz-tab') === id),
            tabs: () => tabEls,
            setName(text) { name.textContent = text; },
            focusText(text) { focusLine.textContent = text || ''; },
            pageText(text) { pageText.textContent = text ? ` · ${text}` : ''; },
            hints(text) { hintText.textContent = ''; hintText.append(...P.hintNodes(text)); },
            stop() { clearInterval(timer); }
        };
        return f;
    }
    function goBack() {
        if (history.length > 1) history.back(); else T.ctx.navigate('#/home');
    }

    // ---- a paged grid of server items ----
    // opts: shape, fetch(start, limit) -> {items, total}, art(item) -> url, caption?(item), name(item), focus(item) -> text,
    // select(item), play?(item), menu?(item), empty: text, onPage?(page, pages), frame
    function pageGrid(host, opts) {
        const sh = SHAPES[opts.shape];
        const g = { page: 0, pages: 1, cache: new Map(), total: null, cells: [], dead: false };
        const box = el('div', 'pz-grid pz-grid-' + opts.shape);
        const pageEl = el('div', 'pz-grid-page');
        const prev = el('div', 'pz-arrow pz-prev pz-hidden'), next = el('div', 'pz-arrow pz-next pz-hidden');
        prev.setAttribute('aria-label', 'Previous page');
        next.setAttribute('aria-label', 'Next page');
        prev.addEventListener('click', () => go(g.page - 1));
        next.addEventListener('click', () => go(g.page + 1));
        box.append(pageEl, prev, next);
        host.append(box);
        const cols = () => P.fit(sh.w, sh.gx, 90, 1);
        const per = () => cols() * sh.rows;
        box.style.setProperty('--pz-cw', String(sh.w));
        box.style.setProperty('--pz-ch', String(sh.h));
        box.style.setProperty('--pz-gx', String(sh.gx));
        box.style.setProperty('--pz-gy', String(sh.gy));
        box.style.setProperty('--pz-top', String(sh.top));
        async function load(p) {
            const key = `${p}:${per()}`;
            if (!g.cache.has(key)) g.cache.set(key, Promise.resolve(opts.fetch(p * per(), per())).then((r) => r || { items: [], total: 0 }, () => ({ items: [], total: 0 })));
            return g.cache.get(key);
        }
        async function draw(p, dir, focusAt) {
            const r = await load(p);
            if (g.dead || !box.isConnected) return;
            g.total = r.total != null ? r.total : (r.items || []).length;
            g.pages = Math.max(1, Math.ceil(g.total / per()));
            g.page = Math.max(0, Math.min(p, g.pages - 1));
            box.style.setProperty('--pz-cols', String(cols()));
            pageEl.textContent = '';
            const items = r.items || [];
            g.cells = items.map((it, i) => cell(it, i));
            g.cells.forEach((c) => pageEl.append(c));
            if (!items.length) pageEl.append(el('div', 'pz-empty', opts.empty || 'Nothing here yet'));
            P.slide(pageEl, dir);
            prev.classList.toggle('pz-hidden', g.page === 0);
            next.classList.toggle('pz-hidden', g.page >= g.pages - 1);
            if (opts.frame) opts.frame.pageText(g.pages > 1 ? `${g.page + 1} / ${g.pages}` : '');
            box.setAttribute('data-pz-grid-page', `${g.page + 1}/${g.pages}`);
            box.setAttribute('data-pz-grid-ready', String(items.length));
            if (focusAt != null && g.cells.length) T.ctx.focus(g.cells[Math.max(0, Math.min(focusAt, g.cells.length - 1))]);
            if (opts.onPage) opts.onPage(g.page, g.pages);
        }
        function cell(it, i) {
            const c = P.focusable(el('div', 'pz-cell'));
            c.plazaItem = it;
            const art = el('div', 'pz-cell-art');
            const url = opts.art ? opts.art(it) : '';
            if (url) P.bg(art, url); else art.append(el('div', 'pz-cell-title', opts.name(it)));
            c.append(art);
            if (opts.decorate) opts.decorate(c, it, art);
            if (opts.caption) c.append(el('div', 'pz-cell-cap', opts.caption(it)));
            c.append(el('div', 'pz-name', opts.name(it)));
            c.addEventListener('icefin-focus', () => { if (opts.frame) opts.frame.focusText(opts.focus ? opts.focus(it) : opts.name(it)); });
            c.addEventListener('click', () => opts.select(it, c));
            c.setAttribute('data-pz-index', String(i));
            return c;
        }
        function go(p, focusAt, dir) {
            if (p < 0 || p >= g.pages || p === g.page) return false;
            T.ctx.sound('navigate');
            draw(p, dir || (p > g.page ? 1 : -1), focusAt != null ? focusAt : 0);
            return true;
        }
        g.ready = draw(0, 0, opts.takeFocus ? 0 : null);
        g.el = box;
        g.focusFirst = () => { if (g.cells[0]) { T.ctx.focus(g.cells[0]); return true; } return false; };
        g.focused = () => { const f = T.ctx.focused(); return g.cells.includes(f) ? f : null; };
        // Left/right past the page's edge turn the page; play/menu act on the focused item.
        g.action = (a) => {
            const f = g.focused();
            if (!f) return false;
            const i = g.cells.indexOf(f), n = cols(), col = i % n, row = Math.floor(i / n);
            if (a === 'left' && col === 0) { go(g.page - 1, row * n + n - 1); return true; }
            if (a === 'right' && (col === n - 1 || i === g.cells.length - 1)) {
                if (g.page < g.pages - 1) { go(g.page + 1, row * n); return true; }
                return col === n - 1 || i === g.cells.length - 1;
            }
            if (a === 'play_pause' && opts.play) { opts.play(f.plazaItem); return true; }
            if (a === 'menu' && opts.menu) { opts.menu(f.plazaItem); return true; }
            return false;
        };
        g.relayout = () => { g.cache.clear(); draw(Math.min(g.page, g.pages - 1), 0, g.focused() ? 0 : null); };
        g.destroy = () => { g.dead = true; box.remove(); };
        return g;
    }
    P.pageGrid = pageGrid;

    // ---- shared item queries ----
    const ITEM_SORTS = [
        { id: 'name', label: 'A–Z', SortBy: 'SortName', SortOrder: 'Ascending' },
        { id: 'added', label: 'Newest', SortBy: 'DateCreated,SortName', SortOrder: 'Descending' },
        { id: 'year', label: 'Year', SortBy: 'ProductionYear,PremiereDate,SortName', SortOrder: 'Descending' },
        { id: 'rating', label: 'Rating', SortBy: 'CommunityRating,SortName', SortOrder: 'Descending' }
    ];
    const itemsQuery = (q) => (start, limit) => P.safe(P.client().getItems(P.uid(), Object.assign({ Recursive: true, Fields: P.FIELDS, StartIndex: start, Limit: limit, EnableTotalRecordCount: true }, q)))
        .then((r) => ({ items: P.items(r), total: r.TotalRecordCount }));
    const namedQuery = (path, q) => (start, limit) => P.get(path, Object.assign({ UserId: P.uid(), SortBy: 'SortName', StartIndex: start, Limit: limit, EnableTotalRecordCount: true }, q))
        .then((r) => ({ items: P.items(r), total: r.TotalRecordCount }));
    const filtered = (parent, type, field, item) => T.ctx.navigate(`#/home?pz=items&parent=${parent || ''}&type=${type}&${field}=${item.Id}&name=${encodeURIComponent(item.Name || '')}`);

    // ---- a library menu: tabs over grids, a sort pill ----
    function libraryMenu(spec) {
        let F = null, grid = null, sort = 0, tab = null;
        const screen = {
            mount(root) {
                ui.pointerFirst(true);
                const p = P.params();
                const parent = spec.parent ? spec.parent(p) : p.get('topParentId') || p.get('id');
                F = frame(root, { view: spec.view, kind: spec.kind(p), name: spec.name(p), hints: spec.hints });
                const tabs = spec.tabs(parent, p).map((t) => Object.assign({}, t));
                if (spec.sortable) tabs.push({ id: 'sort', label: `${ITEM_SORTS[sort].label} ▾`, cls: 'pz-tab-sort', go: () => { sort = (sort + 1) % ITEM_SORTS.length; F.tab('sort').textContent = `${ITEM_SORTS[sort].label} ▾`; show(tab, false); } });
                const show = (id, focusGrid) => {
                    tab = id;
                    const t = tabs.find((x) => x.id === id);
                    if (grid) grid.destroy();
                    F.focusText('');
                    grid = pageGrid(F.body, Object.assign({ frame: F, takeFocus: focusGrid, empty: t.empty }, t.grid(ITEM_SORTS[sort])));
                };
                F.setTabs(tabs, tabs[0].id, (id) => show(id, false));
                if (spec.after) spec.after(F, parent);
                show(tabs[0].id, true);
                screen.relayout = () => { if (grid) grid.relayout(); };
                window.addEventListener('resize', screen.relayout);
            },
            onAction(a, ctx) {
                P.sawAction();
                if (grid && grid.action(a)) return true;
                return common(a, ctx);
            },
            onBack() { goBack(); return true; },
            unmount() { if (F) F.stop(); window.removeEventListener('resize', screen.relayout); ui.pointerFirst(false); if (spec.unmount) spec.unmount(); F = null; grid = null; }
        };
        return screen;
    }
    function common(a, ctx) {
        if (a === 'home') { ctx.navigate('#/home'); return true; }
        if (a === 'search') { ctx.navigate('#/search'); return true; }
        return false;
    }

    const posterGrid = (q, extra) => (s) => Object.assign({ shape: 'poster', fetch: itemsQuery(Object.assign({ SortBy: s.SortBy, SortOrder: s.SortOrder }, q)),
        art: (it) => P.posterArt(it, 400), name: (it) => it.Name, focus: (it) => [it.Name, P.meta(it)].filter(Boolean).join(' · '),
        select: P.open, play: (it) => P.play(it), menu: P.details }, extra || {});
    const nameGrid = (path, q, onPick) => () => ({ shape: 'wide', fetch: namedQuery(path, q),
        art: (it) => P.wideArt(it, 600) || P.posterArt(it, 400), name: (it) => it.Name, focus: (it) => it.Name, select: onPick });

    const MOVIES = libraryMenu({
        view: 'movies', kind: () => 'movies', name: () => 'Movies', sortable: true,
        hints: 'Ⓐ Open · ▶ Play · ≡ Details · ◀▶ Page',
        tabs: (parent) => [
            { id: 'movies', label: 'Movies', grid: posterGrid({ ParentId: parent, IncludeItemTypes: 'Movie' }) },
            { id: 'collections', label: 'Collections', grid: posterGrid({ IncludeItemTypes: 'BoxSet' }), empty: 'No collections yet' },
            { id: 'genres', label: 'Genres', grid: nameGrid('Genres', { ParentId: parent, IncludeItemTypes: 'Movie' }, (g) => filtered(parent, 'Movie', 'genre', g)) },
            { id: 'favourites', label: 'Favourites', grid: posterGrid({ ParentId: parent, IncludeItemTypes: 'Movie', Filters: 'IsFavorite' }), empty: 'No favourite movies yet' }
        ]
    });
    const SHOWS = libraryMenu({
        view: 'tv', kind: () => 'tvshows', name: () => 'Shows', sortable: true,
        hints: 'Ⓐ Open · ▶ Play · ≡ Details · ◀▶ Page',
        tabs: (parent) => [
            { id: 'shows', label: 'Shows', grid: posterGrid({ ParentId: parent, IncludeItemTypes: 'Series' }) },
            { id: 'genres', label: 'Genres', grid: nameGrid('Genres', { ParentId: parent, IncludeItemTypes: 'Series' }, (g) => filtered(parent, 'Series', 'genre', g)) },
            { id: 'networks', label: 'Networks', grid: nameGrid('Studios', { ParentId: parent, IncludeItemTypes: 'Series' }, (s) => filtered(parent, 'Series', 'studio', s)) },
            { id: 'favourites', label: 'Favourites', grid: posterGrid({ ParentId: parent, IncludeItemTypes: 'Series', Filters: 'IsFavorite' }), empty: 'No favourite shows yet' }
        ]
    });

    // Music: albums, artists, songs, playlists and genres, with what is playing in a bar under the grid.
    let nowTimer = null;
    const squareGrid = (q, extra) => (s) => Object.assign(posterGrid(q)(s), { shape: 'square', art: (it) => P.posterArt(it, 400),
        focus: (it) => [it.Name, it.AlbumArtist || (it.Artists || [])[0], it.ProductionYear].filter(Boolean).join(' · ') }, extra || {});
    const MUSIC = libraryMenu({
        view: 'music', kind: () => 'music', name: () => 'Music', sortable: true,
        hints: 'Ⓐ Open · ▶ Play · ≡ Details · ◀▶ Page',
        tabs: (parent) => [
            { id: 'albums', label: 'Albums', grid: squareGrid({ ParentId: parent, IncludeItemTypes: 'MusicAlbum' }) },
            { id: 'artists', label: 'Artists', grid: () => ({ shape: 'square', fetch: namedQuery('Artists/AlbumArtists', { ParentId: parent, Fields: 'PrimaryImageAspectRatio' }),
                art: (it) => P.posterArt(it, 400), name: (it) => it.Name, focus: (it) => it.Name, select: P.details, play: (it) => P.play(it), menu: P.details }) },
            { id: 'songs', label: 'Songs', grid: squareGrid({ ParentId: parent, IncludeItemTypes: 'Audio' }, { select: (it) => P.play(it, true) }) },
            { id: 'playlists', label: 'Playlists', grid: squareGrid({ IncludeItemTypes: 'Playlist', MediaTypes: 'Audio' }), empty: 'No playlists yet' },
            { id: 'genres', label: 'Genres', grid: nameGrid('MusicGenres', { ParentId: parent }, (g) => filtered(parent, 'MusicAlbum', 'genre', g)) }
        ],
        after(F) {
            const np = el('div', 'pz-nowplaying');
            const rec = el('div', 'pz-np-record'), text = el('div', 'pz-np-text'), bar = el('div', 'pz-progress pz-np-bar'), fillEl = el('div');
            bar.append(fillEl);
            const btn = (label, aria, go) => { const b = P.focusable(el('div', 'pz-np-btn', label)); b.setAttribute('aria-label', aria); b.addEventListener('click', go); return b; };
            const pm = () => T.ctx.nowPlaying();
            const ctl = (fn) => { const n = pm(); if (n && n.player) try { fn(n.player); } catch (e) { /* the player went away */ } };
            np.append(rec, text, bar, btn('⏮', 'Previous', () => ctl((p) => p.previousTrack && p.previousTrack())),
                btn('⏯', 'Play or pause', () => ctl((p) => (p.paused && p.paused() ? p.unpause() : p.pause()))), btn('⏭', 'Next', () => ctl((p) => p.nextTrack && p.nextTrack())));
            F.menu.append(np);
            const tick = () => {
                const n = pm();
                const it = n && n.item;
                np.classList.toggle('pz-on', !!(it && it.MediaType === 'Audio'));
                if (!it) return;
                text.textContent = '';
                text.append(el('b', '', it.Name || ''), document.createTextNode(` — ${(it.Artists || [])[0] || it.AlbumArtist || ''}`));
                P.bg(rec, P.posterArt(it, 200));
                try { const pos = n.player.currentTime ? n.player.currentTime() : 0, dur = n.player.duration ? n.player.duration() : 0; fillEl.style.width = dur ? `${Math.min(100, pos / dur * 100)}%` : '0%'; } catch (e) { fillEl.style.width = '0%'; }
            };
            tick();
            nowTimer = setInterval(tick, 1000);
        },
        unmount() { clearInterval(nowTimer); nowTimer = null; }
    });

    // Any other library: its folders and items as they are on disk; folders open in place.
    const LIBRARY = libraryMenu({
        view: 'library', kind: (p) => p.get('kind') || 'folder', name: (p) => p.get('name') || 'Library', sortable: true,
        parent: (p) => p.get('id'),
        hints: 'Ⓐ Open · ▶ Play · ≡ Details · ◀▶ Page',
        tabs: (parent, p) => [
            { id: 'all', label: 'All', grid: posterGrid({ ParentId: parent, Recursive: false }, {
                select: (it) => (it.IsFolder && it.Type !== 'Series' && it.Type !== 'BoxSet' && it.Type !== 'MusicAlbum'
                    ? T.ctx.navigate(`#/home?pz=library&id=${it.Id}&kind=${p.get('kind') || 'folder'}&name=${encodeURIComponent(it.Name || '')}`) : P.open(it)) }) },
            { id: 'favourites', label: 'Favourites', grid: posterGrid({ ParentId: parent, Filters: 'IsFavorite' }), empty: 'No favourites here yet' }
        ]
    });
    // A genre's or a network's items (from a Genres or Networks tab).
    const ITEMS = libraryMenu({
        view: 'items', kind: (p) => ({ Movie: 'movies', Series: 'tvshows', MusicAlbum: 'music' })[p.get('type')] || 'folder', name: (p) => p.get('name') || '', sortable: true,
        parent: (p) => p.get('parent'),
        hints: 'Ⓐ Open · ▶ Play · ≡ Details · ◀▶ Page',
        tabs: (parent, p) => {
            const q = { ParentId: parent || undefined, IncludeItemTypes: p.get('type') };
            if (p.get('genre')) q.GenreIds = p.get('genre');
            if (p.get('studio')) q.StudioIds = p.get('studio');
            const shape = p.get('type') === 'MusicAlbum' ? squareGrid(q) : posterGrid(q);
            return [{ id: 'all', label: p.get('genre') ? 'Genre' : 'Network', grid: shape }];
        }
    });

    // ---- Live TV: channels, the guide, recordings, the schedule ----
    function liveTv() {
        let F = null, grid = null, guide = null, guideEl = null;
        const c = () => P.client(), uid = () => P.uid();
        const playChannel = (ch) => P.play(ch, true);
        const channelCell = (c2, ch) => {
            const now = ch.CurrentProgram;
            c2.classList.add('pz-chan');
            const art = c2.querySelector('.pz-cell-art');
            art.textContent = '';
            art.style.backgroundImage = '';
            const logo = el('div', 'pz-chan-logo');
            const tag = ch.ImageTags && ch.ImageTags.Primary;
            if (tag) P.bg(logo, P.img(ch.Id, 'Primary', tag, 200)); else logo.textContent = ch.Name;
            art.append(logo, el('div', 'pz-chan-no', ch.ChannelNumber ? `CH ${ch.ChannelNumber}` : ''), el('div', 'pz-chan-now', now ? now.Name : ch.Name),
                el('div', 'pz-chan-time', now ? `${P.time(now.StartDate)} – ${P.time(now.EndDate)}` : ''));
            if (now) {
                const s = Date.parse(now.StartDate), e = Date.parse(now.EndDate);
                art.append(P.progressBar(Math.max(0, Math.min(1, (Date.now() - s) / (e - s || 1)))));
            }
        };
        const tabs = {
            channels: () => ({ shape: 'wide', fetch: (start, limit) => P.safe(c().getLiveTvChannels({ UserId: uid(), StartIndex: start, Limit: limit, AddCurrentProgram: true, EnableImages: true, ImageTypeLimit: 1, EnableUserData: false, EnableTotalRecordCount: true }))
                .then((r) => ({ items: P.items(r), total: r.TotalRecordCount })),
            art: () => '', decorate: channelCell, name: (ch) => ch.Name, focus: (ch) => [ch.ChannelNumber ? `CH ${ch.ChannelNumber}` : '', ch.CurrentProgram ? ch.CurrentProgram.Name : ch.Name].filter(Boolean).join(' · '),
            select: playChannel, play: playChannel, menu: P.details, empty: 'This server has no Live TV channels' }),
            recordings: () => ({ shape: 'episode', fetch: (start, limit) => P.safe(c().getLiveTvRecordings({ UserId: uid(), StartIndex: start, Limit: limit, Fields: P.FIELDS, EnableImages: true, EnableTotalRecordCount: true }))
                .then((r) => ({ items: P.items(r), total: r.TotalRecordCount })),
            art: (it) => P.thumbArt(it, 600), caption: (it) => it.Name, name: (it) => it.Name, focus: (it) => [it.Name, it.StartDate ? new Date(it.StartDate).toLocaleDateString() : ''].filter(Boolean).join(' · '),
            select: P.details, play: (it) => P.play(it), menu: P.details, empty: 'No recordings yet' }),
            schedule: () => ({ shape: 'wide', fetch: () => P.safe(c().getLiveTvTimers({})).then((r) => ({ items: P.items(r), total: P.items(r).length })),
            art: () => '', decorate: (c2, t) => { const a = c2.querySelector('.pz-cell-art'); a.textContent = ''; a.append(el('div', 'pz-chan-no', t.ChannelName || ''), el('div', 'pz-chan-now', t.Name || ''), el('div', 'pz-chan-time', t.StartDate ? `${new Date(t.StartDate).toLocaleDateString([], { weekday: 'short' })} ${P.time(t.StartDate)}` : '')); c2.classList.add('pz-chan'); },
            name: (t) => t.Name, focus: (t) => [t.Name, t.ChannelName].filter(Boolean).join(' · '), select: (t) => t.ProgramId && T.ctx.navigate(`#/details?id=${t.ProgramId}&serverId=${P.sid()}`), empty: 'Nothing scheduled to record' })
        };
        async function showGuide(focusIt) {
            guideEl = el('div', 'pz-guide');
            guideEl.style.position = 'absolute';  // the guide keeps an inline position; its box is the stylesheet's
            F.body.append(guideEl);
            F.pageText('');
            const r = await P.safe(c().getLiveTvChannels({ UserId: uid(), EnableImages: true, ImageTypeLimit: 1, Limit: 1000, EnableUserData: false }));
            if (!F || !guideEl.isConnected) return;
            const chans = P.items(r).sort((a, b) => (parseFloat(a.ChannelNumber) || 1e9) - (parseFloat(b.ChannelNumber) || 1e9) || String(a.Name).localeCompare(b.Name));
            F.root.setAttribute('data-pz-guide', String(chans.length));
            if (!chans.length) { guideEl.append(el('div', 'pz-empty', 'This server has no Live TV channels')); return; }
            const iso = (t) => new Date(t).toISOString();
            guide = ui.guideGrid(guideEl, {
                channels: chans.map((ch) => ({ id: ch.Id, name: ch.Name, ch })),
                rows: 7, span: 120, focus: !!focusIt,
                async fetch(ids, a, b) {
                    const res = await P.safe(c().getLiveTvPrograms({ UserId: uid(), ChannelIds: ids.join(','), MinEndDate: iso(a), MaxStartDate: iso(b), EnableImages: false, EnableUserData: false, SortBy: 'StartDate', EnableTotalRecordCount: false, Limit: 2000 }));
                    return P.items(res).map((p) => ({ id: p.Id, channelId: p.ChannelId, start: Date.parse(p.StartDate), end: Date.parse(p.EndDate), title: p.Name, item: p }));
                },
                renderChannel(ch, cell) {
                    const logo = el('div', 'pz-gch-logo');
                    const tag = ch.ch.ImageTags && ch.ch.ImageTags.Primary;
                    if (tag) P.bg(logo, P.img(ch.id, 'Primary', tag, 160));
                    cell.append(logo, el('div', 'pz-gch-no', ch.ch.ChannelNumber ? `CH ${ch.ch.ChannelNumber}` : ch.name));
                },
                renderProgram(p, cell) { cell.append(el('div', 'pz-gp-title', p.title), el('div', 'pz-gp-time', `${P.time(p.start)} – ${P.time(p.end)}`)); },
                emptyLabel: 'No information',
                onFocus(p, ch) { F.focusText(p.gap ? ch.name : `${p.title} · ${ch.ch.ChannelNumber ? 'CH ' + ch.ch.ChannelNumber : ch.name} · ${P.time(p.start)} – ${P.time(p.end)}`); },
                onSelect(p, ch) {
                    if (p.start <= Date.now() && p.end > Date.now()) playChannel(ch.ch);
                    else T.ctx.navigate(`#/details?id=${p.id}&serverId=${P.sid()}`);
                }
            });
        }
        function show(id, focus) {
            if (grid) { grid.destroy(); grid = null; }
            if (guide) { guide.stop(); guide = null; }
            if (guideEl) { guideEl.remove(); guideEl = null; }
            F.focusText('');
            F.root.setAttribute('data-pz-tab', id);
            F.hints(id === 'guide' ? 'Ⓐ Watch · ▲▼ Channels · ◀▶ Time' : 'Ⓐ Select · ≡ Details · ◀▶ Page');
            if (id === 'guide') showGuide(focus);
            else grid = pageGrid(F.body, Object.assign({ frame: F, takeFocus: focus }, tabs[id]()));
        }
        const screen = {
            mount(root) {
                ui.pointerFirst(true);
                F = frame(root, { view: 'livetv', kind: 'livetv', name: 'Live TV' });
                const first = P.params().get('pztab') === 'guide' ? 'guide' : 'channels';
                F.setTabs([{ id: 'channels', label: 'Channels' }, { id: 'guide', label: 'Guide' }, { id: 'recordings', label: 'Recordings' }, { id: 'schedule', label: 'Schedule' }], first, (id) => show(id, false));
                show(first, true);
            },
            onAction(a, ctx) {
                P.sawAction();
                if (grid && grid.action(a)) return true;
                // Up out of the guide's top row goes to the tabs.
                if (guide && a === 'up') { const f = guide.focused(); if (f && f.row === 0) { const t = F.tab('guide'); if (t) { ctx.focus(t); ctx.sound('focus'); } return true; } }
                if (guide && a === 'down' && F.tabs().includes(ctx.focused())) { guide.refocus(); return true; }
                return common(a, ctx);
            },
            onBack() { goBack(); return true; },
            unmount() { if (guide) guide.stop(); if (F) F.stop(); ui.pointerFirst(false); F = null; grid = null; guide = null; guideEl = null; }
        };
        return screen;
    }

    // ---- a series: its seasons as tabs, the season's episodes in a list beside the poster ----
    function series() {
        let F = null, list = null, seriesItem = null;
        const c = () => P.client();
        async function season(s, focusFirst) {
            list.textContent = '';
            const r = await P.get(`Shows/${seriesItem.Id}/Episodes`, { UserId: P.uid(), SeasonId: s.Id, Fields: P.FIELDS });
            if (!F) return;
            const eps = P.items(r);
            F.pageText(`Season ${s.IndexNumber != null ? s.IndexNumber : ''}`.trim());
            eps.forEach((ep) => {
                const row = P.focusable(el('div', 'pz-ep'));
                row.plazaItem = ep;
                const still = el('div', 'pz-ep-still');
                P.bg(still, P.thumbArt(ep, 400));
                const pr = P.progress(ep);
                if (pr > 0 && pr < 1) still.append(P.progressBar(pr));
                const text = el('div', 'pz-ep-text');
                text.append(el('div', 'pz-ep-title', `E${ep.IndexNumber != null ? ep.IndexNumber : '?'} · ${ep.Name}`),
                    el('div', 'pz-ep-meta', [P.runtime(ep.RunTimeTicks), ep.PremiereDate ? new Date(ep.PremiereDate).getFullYear() : '', ep.Overview || ''].filter(Boolean).join(' · ')));
                const played = ep.UserData && ep.UserData.Played;
                const more = P.focusable(el('div', 'pz-ep-more', 'Details'));
                more.addEventListener('click', (e) => { e.stopPropagation(); P.details(ep); });
                row.append(still, text);
                if (played) row.append(el('div', 'pz-ep-done', '✓'));
                const wrap = el('div', 'pz-ep-wrap');
                wrap.append(row, more);
                row.addEventListener('click', () => P.play(ep));
                row.addEventListener('icefin-focus', () => F.focusText([`E${ep.IndexNumber} · ${ep.Name}`, P.left(ep) && pr > 0 ? P.left(ep) : P.runtime(ep.RunTimeTicks)].filter(Boolean).join(' · ')));
                list.append(wrap);
            });
            F.root.setAttribute('data-pz-episodes', String(eps.length));
            if (!eps.length) list.append(el('div', 'pz-empty', 'No episodes in this season'));
            const firstRow = list.querySelector('.pz-ep');
            if (focusFirst && firstRow) {
                const resumeRow = [...list.querySelectorAll('.pz-ep')].find((x) => { const u = x.plazaItem.UserData || {}; return !u.Played; });
                T.ctx.focus(resumeRow || firstRow);
            }
        }
        return {
            async mount(root) {
                ui.pointerFirst(true);
                const id = P.params().get('id');
                F = frame(root, { view: 'series', kind: 'tvshows', name: '', hints: 'Ⓐ Play · ≡ Details · ◀▶ Season' });
                const poster = el('div', 'pz-series-poster');
                list = el('div', 'pz-eps');
                F.body.append(poster, el('div', 'pz-reflect pz-series-reflect'), list);
                seriesItem = await P.safe(c().getItem(P.uid(), id));
                if (!F) return;
                F.setName(seriesItem.Name || '');
                P.bg(poster, P.posterArt(seriesItem, 500));
                const seasons = P.items(await P.get(`Shows/${id}/Seasons`, { UserId: P.uid(), Fields: 'UserData' }));
                if (!F) return;
                const nextUp = P.items(await P.safe(c().getNextUpEpisodes({ UserId: P.uid(), SeriesId: id, Limit: 1 })))[0];
                if (!F) return;
                const start = (nextUp && seasons.find((s) => s.Id === nextUp.SeasonId)) || seasons[0];
                const tabs = seasons.map((s) => ({ id: s.Id, label: s.IndexNumber === 0 ? 'Specials' : s.Name, s }));
                tabs.push({ id: 'details', label: 'Details', cls: 'pz-tab-sort', go: () => P.details(seriesItem) });
                F.setTabs(tabs, start ? start.Id : null, (sid) => { const t = tabs.find((x) => x.id === sid); if (t && t.s) season(t.s, false); });
                F.root.setAttribute('data-pz-seasons', String(seasons.length));
                if (start) await season(start, true); else list.append(el('div', 'pz-empty', 'No seasons yet'));
            },
            onAction(a, ctx) {
                P.sawAction();
                const f = ctx.focused();
                if (f && f.plazaItem && a === 'menu') { P.details(f.plazaItem); return true; }
                if (f && f.plazaItem && a === 'play_pause') { P.play(f.plazaItem); return true; }
                return common(a, ctx);
            },
            onBack() { goBack(); return true; },
            unmount() { if (F) F.stop(); ui.pointerFirst(false); F = null; }
        };
    }

    // ---- Continue Watching: a rack of discs; the chosen one lifts and turns ----
    function resume() {
        let F = null, items = [], index = 0, rack = null, info = null, discs = [];
        function draw() {
            rack.textContent = '';
            discs = [];
            for (let d = -2; d <= 2; d++) {
                const it = items[index + d];
                if (!it) continue;
                const disc = P.disc(it, d === 0 ? 'chosen' : 'rack');
                disc.style.setProperty('--pz-slot', String(d));
                if (d === 0) { P.focusable(disc); disc.classList.add('pz-disc-focus'); }
                disc.addEventListener('click', () => { if (d === 0) P.play(it); else { index += d; draw(); T.ctx.focus(rack.querySelector('.pz-disc-focus')); } });
                const pr = el('div', 'pz-progress pz-rack-progress' + (d === 0 ? ' pz-rack-progress-chosen' : ''));
                const fl = el('div');
                fl.style.width = `${Math.round(P.progress(it) * 100)}%`;
                pr.append(fl);
                pr.style.setProperty('--pz-slot', String(d));
                rack.append(disc, pr);
                discs.push(disc);
            }
            const it = items[index];
            info.textContent = '';
            info.append(el('div', 'pz-big', it.Type === 'Episode' ? it.SeriesName : it.Name),
                el('div', 'pz-meta', [it.Type === 'Episode' ? `${P.episodeCode(it)} · ${it.Name}` : P.meta(it), P.left(it)].filter(Boolean).join(' · ')));
            F.focusText([it.Type === 'Episode' ? it.SeriesName : it.Name, P.left(it)].filter(Boolean).join(' · '));
            F.pageText(`${index + 1} / ${items.length}`);
            F.root.setAttribute('data-pz-disc', String(index));
        }
        return {
            async mount(root) {
                ui.pointerFirst(true);
                F = frame(root, { view: 'resume', kind: 'resume', name: 'Continue Watching', hints: 'Ⓐ Resume · ◀▶ Disc · ≡ Details' });
                F.setTabs([{ id: 'all', label: 'All' }, { id: 'movies', label: 'Movies' }, { id: 'episodes', label: 'Episodes' }], 'all', (id) => load(id, false));
                rack = el('div', 'pz-rack');
                info = el('div', 'pz-info pz-centre-info pz-rack-info');
                const pills = el('div', 'pz-rack-pills');
                const pill = (label, go) => { const b = P.focusable(el('div', 'pz-pill pz-pill-small', label)); b.addEventListener('click', () => { const it = items[index]; if (it) go(it); }); pills.append(b); return b; };
                pill('▶ Resume', (it) => P.play(it)).classList.add('pz-pill-main');
                pill('From start', (it) => P.play(it, true));
                pill('Details', P.details);
                F.body.append(rack, info, pills);
                const load = async (id, focus) => {
                    const q = { Limit: 40, Fields: P.FIELDS, MediaTypes: 'Video' };
                    if (id === 'movies') q.IncludeItemTypes = 'Movie';
                    if (id === 'episodes') q.IncludeItemTypes = 'Episode';
                    const r = await P.safe(P.client().getResumableItems(P.uid(), q));
                    if (!F) return;
                    items = P.items(r);
                    index = 0;
                    F.root.setAttribute('data-pz-ready', String(items.length));
                    if (!items.length) { rack.textContent = ''; info.textContent = ''; info.append(el('div', 'pz-big', 'Nothing in progress')); pills.style.display = 'none'; F.focusText(''); F.pageText(''); return; }
                    pills.style.display = '';
                    draw();
                    if (focus) T.ctx.focus(rack.querySelector('.pz-disc-focus'));
                };
                await load('all', true);
            },
            onAction(a, ctx) {
                P.sawAction();
                const f = ctx.focused();
                if (f && f.classList.contains('pz-disc-focus') && (a === 'left' || a === 'right')) {
                    const n = index + (a === 'right' ? 1 : -1);
                    if (n >= 0 && n < items.length) { index = n; draw(); ctx.focus(rack.querySelector('.pz-disc-focus')); ctx.sound('focus'); }
                    return true;
                }
                if (a === 'menu' && items[index]) { P.details(items[index]); return true; }
                if (a === 'play_pause' && items[index]) { P.play(items[index]); return true; }
                return common(a, ctx);
            },
            onBack() { goBack(); return true; },
            unmount() { if (F) F.stop(); ui.pointerFirst(false); F = null; }
        };
    }

    // ---- Next Up: episode cards ----
    const episodeGrid = (fetch, empty) => () => ({ shape: 'episode', fetch, art: (it) => P.thumbArt(it, 600),
        caption: (it) => `${it.SeriesName || ''} · ${P.episodeCode(it)}`, name: (it) => `${it.SeriesName || ''} · ${P.episodeCode(it)} · ${it.Name}`,
        focus: (it) => `${it.SeriesName || ''} · ${P.episodeCode(it)} · ${it.Name}`, decorate: (c) => c.querySelector('.pz-cell-art').append(el('div', 'pz-play-badge')),
        select: (it) => P.play(it), play: (it) => P.play(it), menu: P.details, empty });
    const NEXTUP = libraryMenu({
        view: 'nextup', kind: () => 'nextup', name: () => 'Next Up',
        hints: 'Ⓐ Play · ≡ Details · ◀▶ Page',
        tabs: () => [
            { id: 'nextup', label: 'Next Up', grid: episodeGrid((start, limit) => P.safe(P.client().getNextUpEpisodes({ UserId: P.uid(), StartIndex: start, Limit: limit, Fields: P.FIELDS, EnableTotalRecordCount: true }))
                .then((r) => ({ items: P.items(r), total: r.TotalRecordCount })), 'Nothing up next') },
            { id: 'upcoming', label: 'Upcoming', grid: episodeGrid(namedQuery('Shows/Upcoming', { Fields: P.FIELDS, SortBy: undefined }), 'Nothing upcoming') },
            { id: 'latest', label: 'Recently added', grid: episodeGrid(itemsQuery({ IncludeItemTypes: 'Episode', SortBy: 'DateCreated', SortOrder: 'Descending' }), 'No new episodes') }
        ]
    });

    // ---- Search: a field, filters, a row of results and a keyboard for the remote ----
    function search() {
        let F = null, input = null, grid = null, filter = 'all', timer = null, onKey = null, lastTerm = null;
        const TYPES = {
            all: { IncludeItemTypes: 'Movie,Series,Episode,MusicAlbum,Audio,MusicArtist,BoxSet,Video,MusicVideo,TvChannel,Playlist', IncludePeople: true },
            movies: { IncludeItemTypes: 'Movie', IncludePeople: false, IncludeArtists: false },
            shows: { IncludeItemTypes: 'Series', IncludePeople: false, IncludeArtists: false },
            episodes: { IncludeItemTypes: 'Episode', IncludePeople: false, IncludeArtists: false },
            music: { IncludeItemTypes: 'MusicAlbum,Audio,MusicArtist', IncludePeople: false, IncludeArtists: true },
            people: { IncludePeople: true, IncludeMedia: false, IncludeArtists: false }
        };
        const hintArt = (h) => (h.PrimaryImageTag ? P.img(h.Id || h.ItemId, 'Primary', h.PrimaryImageTag, 300)
            : h.ThumbImageTag ? P.img(h.ThumbImageItemId, 'Thumb', h.ThumbImageTag, 300) : h.BackdropImageTag ? P.img(h.BackdropImageItemId, 'Backdrop', h.BackdropImageTag, 300) : '');
        const asItem = (h) => ({ Id: h.Id || h.ItemId, Type: h.Type, Name: h.Name });
        function results(focus) {
            const term = input.value.trim();
            lastTerm = term;
            if (grid) grid.destroy();
            F.root.setAttribute('data-pz-term', term);
            if (!term) { grid = null; F.focusText(''); F.pageText(''); resultsBox.textContent = ''; resultsBox.append(el('div', 'pz-empty', 'Type to search your library')); return; }
            resultsBox.textContent = '';
            grid = pageGrid(resultsBox, { frame: F, shape: 'result', takeFocus: focus, empty: 'Nothing found',
                fetch: (start, limit) => P.get('Search/Hints', Object.assign({ UserId: P.uid(), searchTerm: term, StartIndex: start, Limit: limit, IncludeGenres: false, IncludeStudios: false }, TYPES[filter]))
                    .then((r) => ({ items: r.SearchHints || [], total: r.TotalRecordCount })),
                art: hintArt, name: (h) => h.Name, focus: (h) => [h.Name, h.Type === 'Episode' && h.Series ? h.Series : h.Type, h.ProductionYear].filter(Boolean).join(' · '),
                select: (h) => P.open(asItem(h)), menu: (h) => P.details(asItem(h)) });
        }
        let resultsBox = null;
        const type = (ch) => { input.value = ch === '⌫' ? input.value.slice(0, -1) : input.value + ch; changed(); };
        const changed = () => { clearTimeout(timer); timer = setTimeout(() => { if (F && input.value.trim() !== lastTerm) results(false); }, 300); };
        return {
            mount(root) {
                ui.pointerFirst(true);
                F = frame(root, { view: 'search', kind: 'search', name: 'Search', hints: 'Ⓐ Type / Open · ≡ Details' });
                const field = P.focusable(el('div', 'pz-search-field'));
                field.innerHTML = '<svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" stroke-width="7"/><path d="M37 37 L54 54" stroke="currentColor" stroke-width="9" stroke-linecap="round"/></svg>';
                input = el('input', 'pz-search-input');
                input.type = 'search';
                input.setAttribute('aria-label', 'Search');
                input.placeholder = 'Search';
                input.value = P.params().get('query') || '';
                input.addEventListener('input', changed);
                field.append(input);
                field.addEventListener('click', () => input.focus());
                const filters = el('div', 'pz-search-filters');
                const labels = { all: 'All', movies: 'Movies', shows: 'Shows', episodes: 'Episodes', music: 'Music', people: 'People' };
                for (const id of Object.keys(TYPES)) {
                    const b = P.focusable(el('div', 'pz-tab' + (id === filter ? ' pz-tab-on' : ''), labels[id]));
                    b.setAttribute('data-pz-filter', id);
                    b.addEventListener('click', () => { filter = id; filters.querySelectorAll('.pz-tab').forEach((x) => x.classList.toggle('pz-tab-on', x === b)); results(false); });
                    filters.append(b);
                }
                resultsBox = el('div', 'pz-search-results');
                const kb = el('div', 'pz-keys');
                for (const row of ['1234567890', 'qwertyuiop', 'asdfghjkl⌫', 'zxcvbnm ']) {
                    const r = el('div', 'pz-keyrow');
                    for (const ch of row) {
                        const k = P.focusable(el('div', 'pz-key' + (ch === ' ' ? ' pz-key-space' : ch === '⌫' ? ' pz-key-wide' : ''), ch === ' ' ? 'space' : ch));
                        k.setAttribute('data-pz-key', ch);
                        k.addEventListener('click', () => type(ch));
                        r.append(k);
                    }
                    kb.append(r);
                }
                F.body.append(field, filters, resultsBox, kb);
                results(false);
                T.ctx.focus(kb.querySelector('[data-pz-key="a"]'));
                // A physical keyboard types straight into the field, wherever focus is on the screen.
                onKey = (e) => {
                    if (!F || e.ctrlKey || e.metaKey || e.altKey || document.activeElement === input) return;
                    if (e.key && e.key.length === 1) { e.preventDefault(); type(e.key); }
                };
                window.addEventListener('keydown', onKey);
            },
            onAction(a, ctx) {
                P.sawAction();
                // Backspace reaches screens as Back: on the search screen it deletes instead, while there is text.
                const ev = window.event;
                if (a === 'back' && ev && ev.key === 'Backspace' && input.value) { input.value = input.value.slice(0, -1); changed(); return true; }
                if (grid && grid.action(a)) return true;
                if (a === 'search') { ctx.focus(F.body.querySelector('[data-pz-key="a"]')); return true; }
                return common(a, ctx);
            },
            onBack() { goBack(); return true; },
            unmount() { clearTimeout(timer); window.removeEventListener('keydown', onKey); if (F) F.stop(); ui.pointerFirst(false); F = null; grid = null; }
        };
    }

    // The menus on #/home?pz=… (plaza.js asks for them by name) and on jellyfin-web's own routes.
    const VIEWS = { library: () => LIBRARY, items: () => ITEMS, series, resume, nextup: () => NEXTUP };
    P.menus = { screen: (name) => (VIEWS[name] || VIEWS.library)() };
    T.registerScreen('#/movies', MOVIES);
    T.registerScreen('#/tv', SHOWS);
    T.registerScreen('#/music', MUSIC);
    T.registerScreen('#/livetv', liveTv());
    T.registerScreen('#/search', search());
})();
