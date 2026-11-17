// Baseline: libraries and lists as stock's TV layout draws them. Movies, Shows and Music are tabbed pages (#/movies,
// #/tv, #/music with ?tab=): a grid tab has stock's icon toolbar (the count, Play All, Shuffle, the view, Sort, Filter),
// the A–Z strip at the right and the grid; Suggestions and Genres are rows. Every other library, a collection, a
// genre's, a studio's or a person's items are #/list (stock's list page: the count, Play All and Shuffle where they
// apply, New for playlists, "Sort by …", Filter). L1 R1 change the tabs; ≡ on the grid opens the item's menu.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const B = window.icefinBaseline;
    if (!T || !B || !B.panel) return;
    const ui = T.ui;
    const el = B.el;
    const c = () => B.client();
    const uid = () => B.uid();
    const PAGE = 100;  // stock's library page size

    // ---- sorting (stock's Sort menu) ----
    const SORTS = { Movie: [['SortName', 'Name'], ['Random', 'Random'], ['CommunityRating,SortName', 'Community Rating'], ['CriticRating,SortName', 'Critics Rating'], ['DateCreated,SortName', 'Date Added'],
        ['DatePlayed,SortName', 'Date Played'], ['OfficialRating,SortName', 'Parental Rating'], ['PlayCount,SortName', 'Play Count'], ['PremiereDate,SortName', 'Release Date'], ['Runtime,SortName', 'Runtime']],
    default: [['SortName', 'Name'], ['Random', 'Random'], ['CommunityRating,SortName', 'Community Rating'], ['DateCreated,SortName', 'Date Added'], ['DatePlayed,SortName', 'Date Played'], ['PremiereDate,SortName', 'Release Date']] };
    const FILTERS = [['IsPlayed', 'Played'], ['IsUnplayed', 'Unplayed'], ['IsResumable', 'Resumable'], ['IsFavorite', 'Favorites']];

    // ---- a grid of items with stock's toolbar and A–Z strip ----
    // o: {query, shape, icons (true: the tab toolbar of icons), playAll, newPlaylist, alpha, title}
    function grid(page, o) {
        const st = { start: 0, sort: o.query.SortBy || 'SortName', order: o.query.SortOrder || 'Ascending', filters: [], letter: null, total: 0, items: [] };
        const wrap = el('div', 'bl-grid-page');
        const bar = el('div', 'bl-toolbar');
        const paging = el('div', 'bl-paging');
        const items = el('div', 'bl-items-grid' + (o.alpha !== false ? ' with-alpha' : ''));
        const bottom = el('div', 'bl-toolbar bl-toolbar-bottom');
        const bottomPaging = el('div', 'bl-paging');
        bottom.append(bottomPaging);
        wrap.append(bar, items, bottom);
        page.append(wrap);
        const ibtn = (icon, title, go) => { const b = B.btn('bl-ibtn', null); b.append(B.icon(icon)); b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', () => { T.ctx.sound('select'); go(b); }); return b; };
        const tbtn = (label, go) => { const b = B.btn('bl-tbtn', label); b.addEventListener('click', () => { T.ctx.sound('select'); go(b); }); return b; };
        const sortLabel = () => { const all = SORTS[o.type] || SORTS.default; const s = all.find((x) => x[0] === st.sort); return s ? s[1] : 'Folders'; };
        const prev = ibtn('arrow_back', 'Previous', () => { st.start = Math.max(0, st.start - PAGE); load(); });
        const next = ibtn('arrow_forward', 'Next', () => { st.start += PAGE; load(); });
        const all = () => st.items;
        const playAll = (shuffle) => { const q = Object.assign({}, query(), { StartIndex: 0, Limit: 300, SortBy: shuffle ? 'Random' : st.sort }); B.items(q).then((r) => { if (r.Items.length) B.playWith({ items: r.Items }); }); };
        const parts = [paging, prev, next];
        if (o.icons) {
            if (o.playAll !== false) parts.push(ibtn('play_arrow', 'Play All', () => playAll(false)), ibtn('shuffle', 'Shuffle', () => playAll(true)));
            parts.push(ibtn('view_comfy', 'Select view', () => B.notice('Poster view')), ibtn('sort_by_alpha', 'Sort', () => sortMenu()), ibtn('filter_alt', 'Filter', () => filterMenu()));
        } else {
            if (o.newPlaylist) { const nb = tbtn('New', () => B.newPlaylist && B.newPlaylist(() => load())); nb.setAttribute('aria-label', 'New playlist'); parts.push(nb); }
            if (o.playAll) parts.push(tbtn('Play All', () => playAll(false)), tbtn('Shuffle', () => playAll(true)));
            const sb = tbtn('', () => sortMenu());
            sb.blSort = true;
            parts.push(sb, tbtn('Filter', () => filterMenu()), ibtn('more_vert', 'More', () => B.notice('Select multiple items with ≡')));
        }
        bar.append(...parts);
        let alphaEl = null;
        if (o.alpha !== false) {
            alphaEl = el('div', 'bl-alpha');
            for (const l of ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']) {
                const b = B.btn('bl-alpha-btn', l);
                b.blHints = [['OK', `from ${l}`], ['Back', '']];
                b.addEventListener('click', () => { st.letter = st.letter === l ? null : l; st.start = 0; T.ctx.sound('select'); load(); });
                alphaEl.append(b);
            }
            page.parentElement.append(alphaEl);  // fixed at the right, outside the scrolling page
        }
        const query = () => {
            const q = Object.assign({ Recursive: true, Fields: B.FIELDS, ImageTypeLimit: 1, EnableImageTypes: 'Primary,Backdrop,Thumb', StartIndex: st.start, Limit: PAGE, EnableTotalRecordCount: true }, o.query, { SortBy: st.sort, SortOrder: st.order });
            if (st.filters.length) q.Filters = st.filters.join(',');
            if (st.letter) { if (st.letter === '#') q.NameLessThan = 'A'; else q.NameStartsWith = st.letter; }
            return q;
        };
        async function load() {
            items.textContent = '';
            let r;
            try { r = o.fetch ? await o.fetch(query()) : await B.items(query()); } catch (e) { console.error('baseline: grid', e); r = { Items: [], TotalRecordCount: 0 }; }
            st.items = r.Items || [];
            st.total = r.TotalRecordCount != null ? r.TotalRecordCount : st.items.length;
            const from = st.total ? st.start + 1 : 0, to = Math.min(st.total, st.start + st.items.length);
            paging.textContent = bottomPaging.textContent = `${from}-${to} of ${st.total}`;
            prev.hidden = st.start === 0;
            next.hidden = st.start + PAGE >= st.total;
            bar.querySelectorAll('.bl-tbtn').forEach((b) => { if (b.blSort) { b.textContent = ''; b.append(document.createTextNode(`Sort by ${sortLabel()}`), B.icon(st.order === 'Ascending' ? 'arrow_upward' : 'arrow_downward', 'bl-tbtn-ic')); } });
            if (alphaEl) alphaEl.querySelectorAll('.bl-alpha-btn').forEach((b) => b.classList.toggle('selected', b.textContent === st.letter));
            for (const it of st.items) items.append(B.card(it, { row: false, shape: o.shape || B.shapeOf(it) }));
            if (!st.items.length) { const e = el('div', 'bl-no-items'); e.append(el('p', '', 'No items found.')); items.append(e); }
            if (!wrap.blArrived) { wrap.blArrived = true; B.arrive(page.closest('.bl-screen'), items.querySelector('.bl-card') || bar.querySelector('[data-icefin-focus]')); }
        }
        function sortMenu() {
            const opts = SORTS[o.type] || SORTS.default;
            B.panel.show({ title: 'Sort By', path: 'Sort', render(body) {
                for (const [v, label] of opts) { const r = B.row(label, { on: v === st.sort, go: () => { st.sort = v; st.start = 0; B.panel.close(); load(); } }); if (v === st.sort) r.classList.add('bl-row-focus-first'); body.append(r); }
                body.append(el('div', 'bl-rule'), B.sec('Sort Order'));
                for (const [v, label] of [['Ascending', 'Ascending'], ['Descending', 'Descending']]) body.append(B.row(label, { on: v === st.order, go: () => { st.order = v; st.start = 0; B.panel.close(); load(); } }));
            } });
        }
        function filterMenu() {
            B.panel.show({ title: 'Filters', path: 'Filter', form: true, render(body) {
                body.append(B.sec('Filters'));
                for (const [v, label] of FILTERS) body.append(B.toggle(label, st.filters.includes(v), (on) => { st.filters = st.filters.filter((x) => x !== v).concat(on ? [v] : []); st.start = 0; load(); }));
            } });
        }
        B.refresher(() => load());
        load();
        return { load, st };
    }

    // ---- rows of suggestions, genres, upcoming ----
    async function rowsOf(page, list) {
        for (const r of list) {
            let items = [];
            try { items = await r.fetch(); } catch (e) { items = []; }
            if (!items.length) continue;
            const row = B.cardRow(r.title, items.map((it) => B.card(it, { row: true, shape: r.shape || B.shapeOf(it) })));
            if (r.go) { const t = row.querySelector('.bl-section-title'); t.classList.add('linked'); t.addEventListener('click', r.go); }
            if (r.reco) row.querySelector('.bl-section-title').setAttribute('data-reco', '');
            page.append(row);
        }
        B.arrive(page.closest('.bl-screen'), page.querySelector('.bl-card'));
        if (!page.querySelector('.bl-card')) { const e = el('div', 'bl-no-items'); e.append(el('p', '', 'No items found.')); page.append(e); B.arrive(page.closest('.bl-screen')); }
        if (page.blEmptyNote && !page.querySelector('.bl-section-title[data-reco]')) { const e = el('div', 'bl-no-items'); e.append(el('p', '', page.blEmptyNote)); page.append(e); }
    }
    const latest = (v, type) => () => Promise.resolve(c().getLatestItems({ UserId: uid(), ParentId: v.Id, Limit: 18, Fields: B.FIELDS, IncludeItemTypes: type, EnableImageTypes: 'Primary,Backdrop,Thumb', ImageTypeLimit: 1 })).then((r) => r || []);
    const resume = (v, media) => () => Promise.resolve(c().getResumableItems(uid(), { ParentId: v.Id, Limit: 12, Fields: B.FIELDS, MediaTypes: media || 'Video', EnableImageTypes: 'Primary,Backdrop,Thumb', ImageTypeLimit: 1, Recursive: true })).then((r) => (r && r.Items) || []);
    const genreRows = async (page, v, types, shape) => {
        let g = null;
        try { g = await Promise.resolve(c().getGenres(uid(), { ParentId: v.Id, SortBy: 'SortName', IncludeItemTypes: types, Recursive: true })); } catch (e) { g = null; }
        const list = ((g && g.Items) || []).map((x) => ({ title: x.Name, shape, go: () => B.go(`#/list?genreId=${x.Id}&parentId=${v.Id}&serverId=${B.sid()}`),
            fetch: () => B.items({ GenreIds: x.Id, ParentId: v.Id, IncludeItemTypes: types, Recursive: true, SortBy: 'Random', Limit: 12 }).then((r) => r.Items) }));
        return rowsOf(page, list);
    };

    // ---- the tabbed libraries ----
    const TABS = {
        movies: [
            ['Movies', (p, v) => grid(p, { icons: true, type: 'Movie', shape: 'portrait', query: { ParentId: v.Id, IncludeItemTypes: 'Movie' } })],
            ['Suggestions', (p, v) => { p.blEmptyNote = 'No movie suggestions are currently available. Start watching and rating your movies, and then come back to view your recommendations.'; return rowsOf(p, [{ title: 'Continue Watching', shape: 'backdrop', fetch: resume(v) }, { title: 'Recently Added Movies', shape: 'portrait', fetch: latest(v, 'Movie') },
                { title: 'Recommended', shape: 'portrait', fetch: () => Promise.resolve(c().getJSON(c().getUrl('Movies/Recommendations', { userId: uid(), parentId: v.Id, categoryLimit: 1, ItemLimit: 12, Fields: B.FIELDS }))).then((r) => ((r || [])[0] || {}).Items || []), reco: true }]); }],
            ['Favorites', (p, v) => grid(p, { icons: true, type: 'Movie', shape: 'portrait', query: { ParentId: v.Id, IncludeItemTypes: 'Movie', Filters: 'IsFavorite' } })],
            ['Collections', (p, v) => grid(p, { icons: true, playAll: false, type: 'BoxSet', shape: 'portrait', query: { IncludeItemTypes: 'BoxSet', Recursive: true } })],
            ['Genres', (p, v) => genreRows(p, v, 'Movie', 'portrait')]
        ],
        tvshows: [
            ['Shows', (p, v) => grid(p, { icons: true, playAll: false, type: 'Series', shape: 'portrait', query: { ParentId: v.Id, IncludeItemTypes: 'Series' } })],
            ['Suggestions', (p, v) => rowsOf(p, [{ title: 'Continue Watching', shape: 'backdrop', fetch: resume(v) }, { title: 'Latest Episodes', shape: 'backdrop', fetch: latest(v, 'Episode') },
                { title: 'Next Up', shape: 'backdrop', fetch: () => Promise.resolve(c().getNextUpEpisodes({ UserId: uid(), ParentId: v.Id, Limit: 24, Fields: B.FIELDS })).then((r) => (r && r.Items) || []) }])],
            ['Upcoming', (p, v) => rowsOf(p, [{ title: 'Upcoming', shape: 'backdrop', fetch: () => Promise.resolve(c().getJSON(c().getUrl('Shows/Upcoming', { UserId: uid(), ParentId: v.Id, Limit: 40, Fields: B.FIELDS }))).then((r) => (r && r.Items) || []) }])],
            ['Genres', (p, v) => genreRows(p, v, 'Series', 'portrait')],
            ['TV Networks', (p, v) => grid(p, { icons: true, playAll: false, shape: 'backdrop', alpha: false, query: { ParentId: v.Id }, fetch: (q) => Promise.resolve(c().getJSON(c().getUrl('Studios', { ParentId: v.Id, UserId: uid(), IncludeItemTypes: 'Series', Recursive: true, SortBy: 'SortName', StartIndex: q.StartIndex, Limit: q.Limit, EnableTotalRecordCount: true }))) })],
            ['Episodes', (p, v) => grid(p, { icons: true, type: 'Episode', shape: 'backdrop', query: { ParentId: v.Id, IncludeItemTypes: 'Episode' } })]
        ],
        music: [
            ['Albums', (p, v) => grid(p, { icons: true, type: 'MusicAlbum', shape: 'square', query: { ParentId: v.Id, IncludeItemTypes: 'MusicAlbum' } })],
            ['Suggestions', (p, v) => rowsOf(p, [{ title: 'Latest Music', shape: 'square', fetch: latest(v, 'MusicAlbum') }, { title: 'Recently Played', shape: 'square', fetch: () => B.items({ ParentId: v.Id, IncludeItemTypes: 'Audio', SortBy: 'DatePlayed', SortOrder: 'Descending', Filters: 'IsPlayed', Recursive: true, Limit: 12 }).then((r) => r.Items) },
                { title: 'Frequently Played', shape: 'square', fetch: () => B.items({ ParentId: v.Id, IncludeItemTypes: 'Audio', SortBy: 'PlayCount', SortOrder: 'Descending', Filters: 'IsPlayed', Recursive: true, Limit: 12 }).then((r) => r.Items) }])],
            ['Album artists', (p, v) => grid(p, { icons: true, playAll: false, shape: 'square', query: { ParentId: v.Id }, fetch: (q) => Promise.resolve(c().getAlbumArtists(uid(), Object.assign({}, q, { ParentId: v.Id }))) })],
            ['Artists', (p, v) => grid(p, { icons: true, playAll: false, shape: 'square', query: { ParentId: v.Id }, fetch: (q) => Promise.resolve(c().getArtists(uid(), Object.assign({}, q, { ParentId: v.Id }))) })],
            ['Playlists', (p, v) => grid(p, { icons: true, shape: 'square', query: { IncludeItemTypes: 'Playlist', MediaTypes: 'Audio', Recursive: true } })],
            ['Songs', (p, v) => grid(p, { icons: true, type: 'Audio', shape: 'square', query: { ParentId: v.Id, IncludeItemTypes: 'Audio' } })],
            ['Genres', (p, v) => genreRows(p, v, 'MusicAlbum', 'square')]
        ]
    };
    const ROUTES = { movies: 'movies', tv: 'tvshows', music: 'music' };
    async function viewFor(type, p) {
        const id = p.get('topParentId') || p.get('parentId');
        const views = await ui.userViews();
        return (id && views.find((v) => v.Id === id)) || views.find((v) => v.CollectionType === type) || { Id: id || '', Name: type, CollectionType: type };
    }
    let L = null;
    for (const [route, type] of Object.entries(ROUTES)) {
        B.register(`#/${route}`, {
            async mount(root) {
                const p = B.params();
                const tab = Math.max(0, Math.min(TABS[type].length - 1, parseInt(p.get('tab') || '0', 10) || 0));
                const me = L = { root, tab, type };
                const page = B.page(root, 'bl-library');
                root.setAttribute('data-bl-screen', `library-${route}`);
                const v = await viewFor(type, p);
                if (L !== me) return;
                const go = (k) => B.go(`#/${route}?topParentId=${v.Id}&collectionType=${type}&tab=${k}`);
                const h = B.header(root, { title: v.Name, tabs: TABS[type].map(([label], k) => ({ label, go: () => go(k) })), at: tab });
                me.go = go;
                B.screenTabs = () => true;
                await TABS[type][tab][1](page, v);
                if (L === me) root.setAttribute('data-bl-ready', '1');
                if (!T.ctx.focused()) B.arrive(root, h.tabEls[tab]);
            },
            unmount() { L = null; B.screenTabs = null; B.hintsOff(); },
            onAction(a) {
                if (!L) return false;
                if (a === 'step_backward' || a === 'step_forward') { const n = L.tab + (a === 'step_forward' ? 1 : -1); if (n < 0 || n >= TABS[L.type].length) { T.ctx.sound('error'); return true; } T.ctx.sound('navigate'); L.go(n); return true; }
                return false;
            }
        });
    }

    // ---- #/list: a folder (a library without tabs, a collection, playlists), a genre's, a studio's, a person's items ----
    let LS = null;
    // jellyfin-web's own route for a home videos and photos library: Baseline draws it as #/list, as stock's TV layout does
    B.register('#/homevideos', {
        mount() { const p = B.params(); location.replace(`#/list?parentId=${p.get('topParentId') || p.get('parentId') || ''}&serverId=${B.sid()}`); },
        unmount() {}
    });
    B.register('#/list', {
        async mount(root) {
            const p = B.params();
            const me = LS = { root };
            const page = B.page(root, 'bl-list');
            root.setAttribute('data-bl-screen', 'list');
            const id = p.get('genreId') || p.get('musicGenreId') || p.get('studioId') || p.get('personId') || p.get('parentId');
            let it = null;
            try { it = id ? await Promise.resolve(c().getItem(uid(), id)) : null; } catch (e) { it = null; }
            if (LS !== me) return;
            const title = p.get('tag') || (it ? it.Name : 'Items');
            B.header(root, { title });
            const q = {};
            let o = { title, query: q, playAll: false };
            if (p.get('genreId')) Object.assign(q, { GenreIds: p.get('genreId'), ParentId: p.get('parentId') || undefined, IncludeItemTypes: p.get('type') || 'Movie,Series,MusicAlbum,MusicVideo,Video,Book' }), o.playAll = true;
            else if (p.get('musicGenreId')) Object.assign(q, { GenreIds: p.get('musicGenreId'), IncludeItemTypes: 'MusicAlbum' }), o.playAll = true;
            else if (p.get('studioId')) Object.assign(q, { StudioIds: p.get('studioId'), IncludeItemTypes: 'Movie,Series' }), o.playAll = true;
            else if (p.get('personId')) Object.assign(q, { PersonIds: p.get('personId'), IncludeItemTypes: 'Movie,Series,Episode' }), o.playAll = true;
            else if (p.get('tag')) Object.assign(q, { Tags: p.get('tag') }), o.playAll = true;
            else {
                Object.assign(q, { ParentId: id, Recursive: false, SortBy: 'IsFolder,SortName' });
                o.newPlaylist = it && it.CollectionType === 'playlists';
                o.playAll = it && ['boxsets', 'music', 'musicvideos', 'homevideos', 'photos'].includes(it.CollectionType) ? false : !!(it && it.CollectionType !== 'playlists' && it.CollectionType !== 'boxsets' && it.CollectionType !== 'books');
            }
            grid(page, o);
            root.setAttribute('data-bl-ready', '1');
        },
        unmount() { LS = null; B.hintsOff(); }
    });

    // a new playlist (stock's "New" on the playlists page)
    B.newPlaylist = (done) => B.panel.show({ title: 'New Playlist', path: 'Playlists', form: true, render(body) {
        const name = B.field('Name', '');
        body.append(name, B.foot(B.button('Create', async () => {
            const n = name.input.value.trim();
            if (!n) { T.ctx.sound('error'); return; }
            try { await c().ajax({ type: 'POST', url: c().getUrl('Playlists', { Name: n, UserId: uid() }), dataType: 'json' }); B.panel.close(); B.notice(`Created ${n}`); if (done) done(); } catch (e) { B.notice('That didn’t work', true); }
        }, true)));
    } });
})();
