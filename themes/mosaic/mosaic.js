// Mosaic (benchmark theme, PLAN 9.9; its target is named in docs/PLAN.md). Built from the engine's generic
// capabilities only: bold pivot headers across the top that slide with their sections (ui.pivot), each section a grid
// of flat tiles in three sizes (large 2×2, wide 2×1, small 1×1) laid out in columns, and live tiles cycling content
// (ui.liveTile). Typography carries the design: large lowercase headers, flat colour, no shadows. Every other route is
// jellyfin-web's own page, styled by this theme's tokens.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const tags = (it) => it.ImageTags || {};
    const FIELDS = 'PrimaryImageAspectRatio,ProductionYear,RunTimeTicks,UserData';
    const safe = (p) => Promise.resolve(p).then((r) => (r && (r.Items || r)) || [], () => []);

    function libraryHash(client, v) {
        const sid = client.serverId();
        const routes = { movies: 'movies', tvshows: 'tv', music: 'music' };
        return routes[v.CollectionType] ? `#/${routes[v.CollectionType]}?topParentId=${v.Id}&collectionType=${v.CollectionType}&serverId=${sid}` : `#/list?parentId=${v.Id}&serverId=${sid}`;
    }
    const details = (client, it) => { location.hash = `#/details?id=${it.Id}&serverId=${client.serverId()}`; };
    function wideArt(client, it) {
        if ((it.BackdropImageTags || []).length) return client.getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: 900, tag: it.BackdropImageTags[0] });
        if ((it.ParentBackdropImageTags || []).length) return client.getScaledImageUrl(it.ParentBackdropItemId, { type: 'Backdrop', maxWidth: 900, tag: it.ParentBackdropImageTags[0] });
        if (tags(it).Thumb) return client.getScaledImageUrl(it.Id, { type: 'Thumb', maxWidth: 900, tag: tags(it).Thumb });
        return tags(it).Primary ? client.getScaledImageUrl(it.Id, { type: 'Primary', maxWidth: 900, tag: tags(it).Primary }) : '';
    }
    const poster = (client, it) => (tags(it).Primary ? client.getScaledImageUrl(it.Id, { type: 'Primary', maxHeight: 400, tag: tags(it).Primary }) : '');
    const title = (it) => (it.Type === 'Episode' ? `${it.SeriesName || ''}: ${it.Name}` : it.Name);

    // ---- tiles: { size: 'large' | 'wide' | 'small', label, art?, live?: { fetch, art(item) }, go(item?) } ----
    function tile(t) {
        const c = el('div', `pv-tile pv-${t.size}`);
        c.setAttribute('data-icefin-focus', '');
        c.tabIndex = -1;
        c.mosaicTile = t;
        const face = el('div', 'pv-face');
        c.append(face, el('div', 'pv-label', t.label));
        if (t.live) {
            c.classList.add('pv-live');
            ui.liveTile(face, {
                interval: 4500,
                fetch: async () => { const items = await t.live.fetch(); t.items = items; c.classList.toggle('pv-empty', !items.length); return items.length ? items : [null]; },
                render: (it) => {
                    const f = el('div', 'pv-frame');
                    const url = it ? t.live.art(it) : '';
                    if (url) f.style.backgroundImage = `url("${url}")`;
                    if (it) f.append(el('div', 'pv-caption', title(it)));
                    f.mosaicItem = it;
                    return f;
                }
            });
        } else if (t.art) {
            face.style.backgroundImage = `url("${t.art}")`;
            c.classList.add('pv-art');
        } else {
            face.append(el('div', 'pv-glyph', t.glyph || t.label.charAt(0)));
        }
        c.addEventListener('click', () => {
            const f = face.querySelector('.pv-frame');
            t.go(f ? f.mosaicItem : null);
        });
        return c;
    }

    function sectionsFor(client, views) {
        const uid = client.getCurrentUserId();
        const home = {
            title: 'home',
            tiles: [
                { size: 'large', label: 'continue', live: { fetch: () => safe(client.getResumableItems(uid, { Limit: 8, MediaTypes: 'Video', Fields: FIELDS })), art: (it) => wideArt(client, it) },
                    go: (it) => (it ? details(client, it) : (location.hash = '#/home?icefin=stock')) },
                { size: 'wide', label: 'next up', live: { fetch: () => safe(client.getNextUpEpisodes({ UserId: uid, Limit: 8, Fields: FIELDS })), art: (it) => wideArt(client, it) },
                    go: (it) => (it ? details(client, it) : (location.hash = '#/home?icefin=stock')) },
                ...views.slice(0, 4).map((v) => ({ size: 'small', label: v.Name.toLowerCase(), go: () => { location.hash = libraryHash(client, v); } })),
                { size: 'wide', label: 'recently added', live: { fetch: () => safe(client.getLatestItems({ userId: uid, Limit: 10, Fields: FIELDS })), art: (it) => wideArt(client, it) },
                    go: (it) => (it ? details(client, it) : null) },
                { size: 'small', label: 'search', glyph: '⌕', go: () => { location.hash = '#/search'; } }
            ]
        };
        const libs = views.map((v) => ({
            title: v.Name.toLowerCase(),
            load: async () => {
                const latest = await safe(client.getLatestItems({ userId: uid, parentId: v.Id, Limit: 7, Fields: FIELDS }));
                return [
                    { size: 'large', label: 'latest', live: { fetch: async () => latest, art: (it) => wideArt(client, it) }, go: (it) => (it ? details(client, it) : (location.hash = libraryHash(client, v))) },
                    ...latest.slice(0, 6).map((it) => ({ size: 'small', label: it.Name, art: poster(client, it), go: () => details(client, it) })),
                    { size: 'wide', label: `all ${v.Name.toLowerCase()}`, glyph: '≡', go: () => { location.hash = libraryHash(client, v); } }
                ];
            }
        }));
        const settings = {
            title: 'settings',
            tiles: [
                { size: 'wide', label: 'preferences', glyph: '⚙', go: () => { location.hash = '#/mypreferencesmenu'; } },
                { size: 'small', label: 'search', glyph: '⌕', go: () => { location.hash = '#/search'; } },
                { size: 'small', label: 'classic home', glyph: '⌂', go: () => { location.hash = '#/home?icefin=stock'; } }
            ]
        };
        return [home, ...libs, settings];
    }

    let S = null;

    // Mounts one section's tiles into the pivot body. A library section loads its tiles once and keeps them.
    function mountSection(sec, body) {
        const grid = el('div', 'pv-grid');
        body.append(grid);
        const put = (tiles) => { grid.textContent = ''; tiles.forEach((t) => grid.append(tile(t))); if (S) S.root.setAttribute('data-pv-tiles', String(tiles.length)); };
        if (sec.tiles) { put(sec.tiles); return; }
        put([{ size: 'large', label: 'loading', glyph: '…', go: () => {} }]);
        (sec.cache || (sec.cache = sec.load())).then((tiles) => {
            if (!grid.isConnected) return;
            sec.tiles = tiles;
            put(tiles);
            const first = grid.querySelector('.pv-tile');
            if (first) T.ctx.focus(first);
        });
    }

    function build(sections) {
        S.host.textContent = '';
        S.sections = sections;
        S.pivot = ui.pivot(S.host, sections.map((sec) => ({ title: sec.title, mount: (body) => mountSection(sec, body) })), {
            ms: 320,
            onChange: (i) => { if (S) S.root.setAttribute('data-pv-section', sections[i].title); }
        });
        S.root.setAttribute('data-pv-ready', String(sections.length));
    }

    T.registerScreen('#/home', {
        // Arrows move between tiles by the engine's beam-first rule (mixed sizes); at a section's edge pivot moves to
        // the neighbouring section, headers with it. Back on a section other than home returns to home.
        onAction(action, ctx) {
            if (!S || !S.pivot) return false;
            if (action === 'back' && S.pivot.index() !== 0) { S.pivot.show(0); ctx.sound('back'); return true; }
            return false;
        },
        mount(root) {
            root.setAttribute('data-pv', 'home');
            S = { root };
            const clock = el('div', 'pv-clock');
            const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
            tick();
            S.clockTimer = setInterval(tick, 15000);
            S.host = el('div', 'pv-host');
            root.append(clock, S.host);
            root.mosaicBuild = (sections) => build(sections);
            const client = T.ctx.apiClient();
            ui.userViews().then((views) => { if (S) build(sectionsFor(client, views)); });
        },
        unmount() {
            if (!S) return;
            clearInterval(S.clockTimer);
            S = null;
        }
    });
})();

// Details (PLAN 9.18): the engine's details screen (every feature of the stock page) in this theme's layout; the look
// is in styles.css, "Details".
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.details) T.registerScreen('#/details', T.ui.details.screen({ layout: 'panel' }));
})();

// Player controls (PLAN 9.19): jellyfin-web's own controls (every function kept) in this theme's layout; the look is
// the osd.* tokens in tokens.json.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.osd) T.ui.osd.set({ layout: 'bar' });
})();

// Settings (PLAN 9.24): the engine's settings area (Client settings, Classic View, Server Settings) in this theme's look.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.settings) T.registerScreen('#/mypreferencesmenu', T.ui.settings.screen({ layout: 'tiles' }));
})();
