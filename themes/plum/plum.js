// Plum (benchmark theme, PLAN 9.6; its target is named in docs/PLAN.md). Built from the engine's generic capabilities only:
// the top-bar chrome slot holds a slim header with the clock, the side-rail slot holds the menu column, and the screen
// fills the content area with a grid of large tiles for the focused menu entry: three across on Home, four across in
// a library. The theme caps motion low (ui.motion.cap): the focus frame jumps, rows step without gliding. Every other
// route is jellyfin-web's own page, styled by this theme's tokens.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const tags = (it) => it.ImageTags || {};
    const FIELDS = 'PrimaryImageAspectRatio,ProductionYear,RunTimeTicks,UserData';
    const LIBRARY_LIMIT = 300;  // a library grid shows its first 300 items, A–Z; the rest stay a click away in jellyfin-web
    const LOOKAHEAD = 2;        // rows beyond the visible ones whose art is requested

    function libraryHash(client, v) {
        const sid = client.serverId();
        const routes = { movies: 'movies', tvshows: 'tv', music: 'music' };
        return routes[v.CollectionType] ? `#/${routes[v.CollectionType]}?topParentId=${v.Id}&collectionType=${v.CollectionType}&serverId=${sid}` : `#/list?parentId=${v.Id}&serverId=${sid}`;
    }

    // ---- tiles: { kind: 'library' | 'item', label, sub, art, item?, view? } ----
    function artFor(client, it, wide) {
        const t = tags(it);
        if (wide) {
            if (t.Thumb) return client.getScaledImageUrl(it.Id, { type: 'Thumb', maxWidth: 640, tag: t.Thumb });
            if ((it.BackdropImageTags || []).length) return client.getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: 640, tag: it.BackdropImageTags[0] });
            if (it.ParentThumbItemId && it.ParentThumbImageTag) return client.getScaledImageUrl(it.ParentThumbItemId, { type: 'Thumb', maxWidth: 640, tag: it.ParentThumbImageTag });
        }
        return t.Primary ? client.getScaledImageUrl(it.Id, { type: 'Primary', maxHeight: wide ? 360 : 480, tag: t.Primary }) : '';
    }
    const itemTile = (client, it, wide) => ({
        kind: 'item', item: it, art: artFor(client, it, wide),
        label: it.Type === 'Episode' ? (it.SeriesName || it.Name) : it.Name,
        sub: it.Type === 'Episode' ? `S${it.ParentIndexNumber || 0} E${it.IndexNumber || 0} · ${it.Name}` : (it.ProductionYear ? String(it.ProductionYear) : '')
    });

    async function tilesFor(client, section) {
        const uid = client.getCurrentUserId();
        const safe = (p) => Promise.resolve(p).then((r) => (r && (r.Items || r)) || [], () => []);
        if (!section.view) {  // Home: the libraries first, then what's in progress and what's next
            const [resume, next] = await Promise.all([
                safe(client.getResumableItems(uid, { Limit: 12, MediaTypes: 'Video', Fields: FIELDS })),
                safe(client.getNextUpEpisodes({ UserId: uid, Limit: 12, Fields: FIELDS }))]);
            const seen = new Set();
            const items = [...resume, ...next].filter((it) => !seen.has(it.Id) && seen.add(it.Id));
            return { cols: 3, wide: true, tiles: [
                ...S.views.map((v) => ({ kind: 'library', view: v, label: v.Name, sub: 'Library', art: tags(v).Primary ? client.getScaledImageUrl(v.Id, { type: 'Primary', maxWidth: 640, tag: tags(v).Primary }) : '' })),
                ...items.map((it) => itemTile(client, it, true))] };
        }
        const v = section.view;
        const types = { movies: 'Movie', tvshows: 'Series', music: 'MusicAlbum', boxsets: 'BoxSet' }[v.CollectionType];
        const items = await safe(client.getItems(uid, { ParentId: v.Id, Recursive: !!types, IncludeItemTypes: types, SortBy: 'SortName',
            SortOrder: 'Ascending', Limit: LIBRARY_LIMIT, Fields: FIELDS, EnableImageTypes: 'Primary' }));
        return { cols: 4, wide: false, tiles: items.map((it) => itemTile(client, it, false)) };
    }

    // ---- state shared by the screen, its menu and its header ----
    let S = null;  // { client, root, content, menu:[el], views, grid, cells:[el], cols, zone, ... } while the screen is up

    ui.chrome.set('topBar', {
        height: '17.13vh',  // 185 of 1080 lines (docs/themes/references/plum.json)
        mount(bar) {
            const brand = el('div', 'pl-brand', 'icefin');
            S.where = el('span', 'pl-where', 'Home');
            brand.append(S.where);
            bar.append(brand);
            const right = el('div', 'pl-header-right');
            const clock = el('div', 'pl-clock');
            right.append(el('div', 'pl-hint', '✱ for Options'), clock);
            bar.append(right);
            const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
            tick();
            if (S) S.clockTimer = setInterval(tick, 15000);
        }
    });

    // The target's menu: a column of icons that widens with labels while focus is in it (the engine's expanding rail).
    ui.chrome.set('sideRail', {
        width: '24.48vw',
        collapsedWidth: '10.94vw',
        async mount(rail) {
            const list = el('div', 'pl-menu');
            rail.append(list);
            const views = await T.ui.userViews();
            const client = T.ctx.apiClient();  // a cold start creates the client late: read it after userViews
            if (!S) return;
            S.client = client;
            S.views = views;
            const sections = [{ label: 'Home' }, ...views.map((v) => ({ label: v.Name, view: v })),
                { label: 'Search', hash: '#/search' }, { label: 'Settings', hash: '#/mypreferencesmenu' }, { label: 'Classic home', hash: '#/home?icefin=stock' }];
            S.menu = sections.map((s) => {
                const b = el('div', 'pl-menu-item');
                b.setAttribute('data-mark', s.label.charAt(0).toUpperCase());
                b.append(el('span', 'icefin-rail-label', s.label));
                b.setAttribute('data-icefin-focus', '');
                b.tabIndex = -1;
                b.plum = s;
                b.addEventListener('click', () => openSection(s));
                list.append(b);
                return b;
            });
            S.ready();
        }
    });

    function openSection(section) {
        if (!S) return;
        if (section.hash) { location.hash = section.hash; return; }
        if (S.section !== section) { renderSection(section).then(() => enterGrid()); return; }
        enterGrid();
    }

    // ---- the grid ----
    function cell(tile, wide) {
        const c = el('div', 'pl-tile' + (wide ? ' wide' : '') + (tile.kind === 'library' ? ' library' : ''));
        c.setAttribute('data-icefin-focus', '');
        c.tabIndex = -1;
        c.plumTile = tile;
        const art = el('div', 'pl-art');
        if (!tile.art) art.append(el('div', 'pl-art-label', tile.label));
        c.append(art);
        const ud = tile.item && tile.item.UserData;
        if (ud && ud.PlaybackPositionTicks && tile.item.RunTimeTicks) {
            const bar = el('div', 'pl-progress');
            bar.style.setProperty('--p', `${Math.min(100, (100 * ud.PlaybackPositionTicks) / tile.item.RunTimeTicks).toFixed(1)}%`);
            art.append(bar);
        }
        c.append(el('div', 'pl-label', tile.label), el('div', 'pl-sub', tile.sub || ''));
        c.addEventListener('click', () => activate(tile));
        return c;
    }

    let renderGen = 0;
    async function renderSection(section) {
        const gen = ++renderGen;
        S.section = section;
        S.content.setAttribute('data-pl-section', section.label);
        if (S.where) S.where.textContent = section.label;
        S.content.removeAttribute('data-pl-ready');
        if (section.hash) {
            S.grid.textContent = '';
            S.cells = [];
            S.grid.append(el('div', 'pl-empty', section.label === 'Classic home' ? 'The stock home page, with plugin sections' : `Open ${section.label}`));
            if (S.count) S.count.textContent = '';
            S.content.setAttribute('data-pl-ready', '0');
            return;
        }
        const grid = await tilesFor(S.client, section);
        if (!S || gen !== renderGen) return;
        fill(grid);
    }

    // Fills the grid from { cols, wide, tiles }. Also on the content element as plumFill, so tests can load a long grid.
    function fill({ cols, wide, tiles }) {
        S.cols = cols;
        S.grid.textContent = '';
        S.grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        S.grid.classList.toggle('pl-wide', wide);
        S.grid.style.transform = 'none';
        S.cells = tiles.map((t) => { const c = cell(t, wide); S.grid.append(c); return c; });
        S.index = 0;
        S.topRow = 0;
        if (!S.cells.length) S.grid.append(el('div', 'pl-empty', 'Nothing here yet'));
        if (S.count) S.count.textContent = tiles.length ? `1 of ${tiles.length}` : '';
        showInfo(tiles[0]);
        loadArt();
        S.content.setAttribute('data-pl-ready', String(S.cells.length));
        S.content.setAttribute('data-pl-cols', String(cols));
        // Refilled under a focused grid: the old focus is gone with its cell, so it moves to the new grid (or the menu).
        if (S.zone === 'grid') { if (S.cells.length) focusCell(0); else if (S.menu) focusMenu(S.menuIndex); }
    }

    // Art is requested only for the rows on screen plus a short lookahead, so a 300-item library loads like a short one.
    function loadArt() {
        if (!S.cells.length) return;
        const rows = visibleRows();
        const from = Math.max(0, (S.topRow - 1) * S.cols), to = Math.min(S.cells.length, (S.topRow + rows + LOOKAHEAD) * S.cols);
        for (let i = from; i < to; i++) {
            const c = S.cells[i];
            if (c.plumLoaded || !c.plumTile.art) continue;
            c.plumLoaded = true;
            c.firstChild.style.backgroundImage = `url("${c.plumTile.art}")`;
        }
        S.content.setAttribute('data-pl-loaded', String(S.cells.filter((c) => c.plumLoaded).length));
    }
    function rowHeight() {
        if (S.cells.length > S.cols) return S.cells[S.cols].offsetTop - S.cells[0].offsetTop;
        return S.cells[0] ? S.cells[0].offsetHeight : 1;
    }
    const visibleRows = () => Math.max(1, Math.floor(S.gridView.clientHeight / Math.max(1, rowHeight())));

    // Focus moves inside the grid; the grid steps a whole row at a time so the focused row is always fully on screen.
    function focusCell(i) {
        i = Math.max(0, Math.min(S.cells.length - 1, i));
        S.zone = 'grid';
        S.index = i;
        const row = Math.floor(i / S.cols), rows = visibleRows();
        if (row < S.topRow) S.topRow = row;
        else if (row >= S.topRow + rows) S.topRow = row - rows + 1;
        S.grid.style.transform = S.topRow ? `translateY(${-S.topRow * rowHeight()}px)` : 'none';
        S.content.setAttribute('data-pl-top', String(S.topRow));
        loadArt();
        T.ctx.focus(S.cells[i]);
        showInfo(S.cells[i].plumTile);
        S.count.textContent = `${i + 1} of ${S.cells.length}`;
    }

    // The right-hand panel: the focused tile's art, name and summary (where the target shows a featured item).
    function showInfo(tile) {
        if (!S || !tile) return;
        S.infoArt.style.backgroundImage = tile.art ? `url("${tile.art}")` : 'none';
        S.infoTitle.textContent = tile.label || '';
        S.infoSub.textContent = tile.sub || '';
        S.infoText.textContent = (tile.item && tile.item.Overview) || '';
    }

    function enterGrid() {
        if (!S.cells.length) return false;
        focusCell(S.section === S.lastSection ? S.index : 0);
        S.lastSection = S.section;
        return true;
    }

    function focusMenu(i) {
        i = Math.max(0, Math.min(S.menu.length - 1, i));
        S.zone = 'menu';
        S.menuIndex = i;
        T.ctx.focus(S.menu[i]);
        S.menu.forEach((b, k) => b.classList.toggle('current', k === i));
        clearTimeout(S.sectionTimer);
        if (S.section !== S.menu[i].plum) S.sectionTimer = setTimeout(() => renderSection(S.menu[i].plum), ui.motion.duration(250));
    }

    function activate(tile) {
        if (!S) return;
        if (tile.kind === 'library') {
            const k = S.menu.findIndex((b) => b.plum.view && b.plum.view.Id === tile.view.Id);
            if (k >= 0) { focusMenu(k); clearTimeout(S.sectionTimer); renderSection(S.menu[k].plum).then(() => { if (S) enterGrid(); }); }
            return;
        }
        location.hash = `#/details?id=${tile.item.Id}&serverId=${S.client.serverId()}`;
    }

    // ---- the home screen ----
    T.registerScreen('#/home', {
        // The target's navigation: the menu is a column, right enters the grid, the grid moves cell by cell, left from
        // the first column or Back returns to the menu entry the grid belongs to.
        onAction(action, ctx) {
            if (!S || !S.menu) return false;
            const f = ctx.focused();
            const mi = S.menu.indexOf(f);
            if (mi >= 0) {
                if (action === 'up' || action === 'down') { focusMenu(mi + (action === 'down' ? 1 : -1)); ctx.sound('focus'); return true; }
                if (action === 'right') {
                    if (S.section === S.menu[mi].plum && enterGrid()) ctx.sound('focus');
                    return true;
                }
                return action === 'left' || action === 'back';
            }
            const i = S.cells.indexOf(f);
            if (i < 0) return false;
            const col = i % S.cols;
            if (action === 'back' || (action === 'left' && col === 0)) { focusMenu(S.menuIndex); ctx.sound(action === 'back' ? 'back' : 'focus'); return true; }
            const step = { left: -1, right: 1, up: -S.cols, down: S.cols }[action];
            if (step === undefined) return false;
            let n = i + step;
            if (action === 'right' && (col === S.cols - 1 || n >= S.cells.length)) return true;  // the grid's right edge
            if (action === 'down' && n >= S.cells.length) n = Math.floor(i / S.cols) < Math.floor((S.cells.length - 1) / S.cols) ? S.cells.length - 1 : i;
            if (n < 0 || n === i) return true;
            focusCell(n);
            ctx.sound('focus');
            return true;
        },
        mount(root, ctx) {
            root.setAttribute('data-pl', 'home');
            ui.motion.cap('low');
            S = { client: T.ctx.apiClient(), root, menu: null, views: [], cells: [], cols: 3, index: 0, topRow: 0, menuIndex: 0, zone: 'menu' };
            const content = ui.chrome.frame(root, ctx);
            S.content = content;
            content.plumFill = (g) => fill(g);
            S.count = el('div', 'pl-count');
            S.info = el('div', 'pl-info');
            S.infoArt = el('div', 'pl-info-art');
            S.infoTitle = el('div', 'pl-info-title');
            S.infoSub = el('div', 'pl-info-sub');
            S.infoText = el('div', 'pl-info-text');
            S.info.append(S.infoArt, S.infoTitle, S.infoSub, S.infoText);
            content.append(S.count, S.info);
            S.gridView = el('div', 'pl-grid-view');
            S.grid = el('div', 'pl-grid');
            S.gridView.append(S.grid);
            content.append(S.gridView);
            S.ready = () => {
                root.setAttribute('data-pl-menu', String(S.menu.length));
                renderSection(S.menu[0].plum);
                focusMenu(0);
            };
        },
        unmount() {
            if (!S) return;
            clearInterval(S.clockTimer);
            clearTimeout(S.sectionTimer);
            ui.motion.cap('normal');
            S = null;
        }
    });
})();

// Details (PLAN 9.18): the engine's details screen (every feature of the stock page) in this theme's layout; the look
// is in styles.css, "Details".
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.details) T.registerScreen('#/details', T.ui.details.screen({ layout: 'poster' }));
})();

// Player controls (PLAN 9.19): jellyfin-web's own controls (every function kept) in this theme's layout; the look is
// the osd.* tokens in tokens.json.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.osd) T.ui.osd.set({ layout: 'minimal' });
})();
