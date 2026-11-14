// Media Center: the library screens (PLAN 9.46), from the design canvas's "movie library", "movie library by genre",
// "TV library", "music library", "pictures and home videos", "books" and "playlists and collections" boards: the page
// chrome, a pivot of ways to see the library along the top (sorts, groups, filters), the items in a grid that runs
// sideways in two or three rows with the glass lens on the focused one, its name and facts under the grid, and the
// count at the bottom right. Groups (genres, networks) open as tiles of stacked covers; one of them filters the grid.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    if (!T || !M) return;
    const { el, focusable } = M;
    const PAGE = 60;

    const POSTER = { shape: 'poster', rows: 2 }, SQUARE = { shape: 'square', rows: 3 }, PHOTO = { shape: 'photo', rows: 3 }, WIDE = { shape: 'wide', rows: 3 };
    const sort = (by, order) => ({ SortBy: by, SortOrder: order || 'Ascending' });
    // route -> library kind: the page title, the item types, the layout and the pivot entries.
    const KINDS = {
        '#/movies': { title: 'movie library', types: 'Movie', layout: POSTER, pivots: [
            ['title', sort('SortName')], ['genre', { group: 'genres' }], ['year', sort('ProductionYear,SortName', 'Descending')],
            ['date added', sort('DateCreated,SortName', 'Descending')], ['rating', sort('CommunityRating,SortName', 'Descending')],
            ['collections', { types: 'BoxSet', recursive: true, noParent: true, ...sort('SortName') }], ['favourites', { Filters: 'IsFavorite', ...sort('SortName') }],
            ['not watched', { Filters: 'IsUnplayed', ...sort('SortName') }]] },
        '#/tv': { title: 'tv library', types: 'Series', layout: POSTER, pivots: [
            ['shows', sort('SortName')], ['next up', { nextUp: true }], ['latest', { latest: 'Episode' }], ['genres', { group: 'genres' }],
            ['networks', { group: 'studios' }], ['date added', sort('DateCreated,SortName', 'Descending')], ['favourites', { Filters: 'IsFavorite', ...sort('SortName') }]] },
        '#/music': { title: 'music library', types: 'MusicAlbum', layout: SQUARE, pivots: [
            ['albums', sort('SortName')], ['album artists', { artists: true }], ['genres', { group: 'genres' }],
            ['years', sort('ProductionYear,SortName', 'Descending')], ['date added', sort('DateCreated,SortName', 'Descending')],
            ['playlists', { types: 'Playlist', noParent: true, ...sort('SortName') }], ['favourites', { Filters: 'IsFavorite', ...sort('SortName') }]] },
        '#/homevideos': { title: 'picture library', types: 'Photo,Video', layout: PHOTO, pivots: [
            ['date taken', sort('DateCreated,SortName', 'Descending')], ['folders', { folders: true, ...sort('SortName') }],
            ['videos only', { types: 'Video', ...sort('DateCreated', 'Descending') }], ['favourites', { Filters: 'IsFavorite', ...sort('SortName') }]] },
        '#/books': { title: 'book library', types: 'Book', layout: POSTER, pivots: [
            ['continue reading', { Filters: 'IsResumable', ...sort('DatePlayed', 'Descending') }], ['title', sort('SortName')],
            ['date added', sort('DateCreated,SortName', 'Descending')], ['favourites', { Filters: 'IsFavorite', ...sort('SortName') }]] },
        '#/musicvideos': { title: 'music videos', types: 'MusicVideo', layout: WIDE, pivots: [['title', sort('SortName')], ['date added', sort('DateCreated,SortName', 'Descending')]] },
        '#/playlists': { title: 'playlists', types: 'Playlist', layout: SQUARE, noParent: true, pivots: [['playlists', sort('SortName')], ['date added', sort('DateCreated', 'Descending')]] }
    };

    let L = null;  // the mounted library

    function image(it) {
        const c = M.client(), tags = it.ImageTags || {};
        const wide = L.layout.shape === 'wide' || L.layout.shape === 'photo';
        if (wide && tags.Thumb) return c.getScaledImageUrl(it.Id, { type: 'Thumb', maxHeight: 320, tag: tags.Thumb });
        if (tags.Primary) return c.getScaledImageUrl(it.Id, { type: 'Primary', maxHeight: 420, tag: tags.Primary });
        if (it.AlbumId && it.AlbumPrimaryImageTag) return c.getScaledImageUrl(it.AlbumId, { type: 'Primary', maxHeight: 420, tag: it.AlbumPrimaryImageTag });
        if (it.SeriesId && it.SeriesPrimaryImageTag) return c.getScaledImageUrl(it.SeriesId, { type: 'Primary', maxHeight: 420, tag: it.SeriesPrimaryImageTag });
        return null;
    }
    function facts(it) {
        const run = it.RunTimeTicks ? Math.round(it.RunTimeTicks / 6e8) : 0;
        return [it.Type === 'Episode' && it.SeriesName ? `${it.SeriesName} · S${it.ParentIndexNumber || 0} E${it.IndexNumber || 0}` : '',
            it.AlbumArtist || '', it.ProductionYear || '', it.OfficialRating || '',
            run ? (run >= 60 ? `${Math.floor(run / 60)} hr ${run % 60} min` : `${run} min`) : '',
            it.ChildCount ? `${it.ChildCount} items` : '', it.CommunityRating ? `★ ${it.CommunityRating.toFixed(1)}` : '',
            it.UserData && it.UserData.Played ? 'watched' : ''].filter(Boolean).join(' · ');
    }

    function tile(it, group) {
        const t = focusable(el('div', 'mc-lib-tile' + (group ? ' mc-lib-group' : '')));
        const src = image(it);
        if (group) {
            const stack = el('div', 'mc-lib-stack');
            for (let k = 0; k < 3; k++) { const i = el('i'); if (src && k === 2) i.style.backgroundImage = `url("${src}")`; stack.append(i); }
            t.append(stack, el('div', 'mc-lib-name', it.Name));
        } else {
            const art = el('div', 'mc-lib-art');
            if (src) art.dataset.src = src; else art.append(el('span', 'mc-lib-fallback', it.Name));
            if (it.UserData && it.UserData.PlayedPercentage) { const p = el('i', 'mc-lib-progress'); p.style.width = `${it.UserData.PlayedPercentage}%`; art.append(p); }
            t.append(art);
        }
        t.mcItem = it;
        t.style.setProperty('--mc-col', String(Math.min(12, Math.floor(L.tiles.length / L.layout.rows))));
        t.addEventListener('click', () => {
            T.ctx.sound('select');
            if (group) { L.filter = { name: it.Name, key: L.pivot.group === 'studios' ? 'StudioIds' : 'GenreIds', id: it.Id }; reload(); return; }
            if (it.Type === 'Folder' || it.Type === 'PhotoAlbum') { L.parentId = it.Id; reload(); return; }
            // a picture: the slide show of its folder from it (viewers.js lays it out). jellyfin-web builds the show from
            // the first item's ParentId, so the item carries it (Fields) and goes alone: without it the show is every
            // item on the server.
            if (it.Type === 'Photo' || it.MediaType === 'Photo') { T.ctx.play({ items: [it] }); return; }
            M.details(it.Id);
        });
        if (L.io) L.io.observe(t);
        return t;
    }

    async function fetchPage() {
        const c = M.client(), uid = c.getCurrentUserId(), p = L.pivot;
        const base = { StartIndex: L.tiles.length, Limit: PAGE, Fields: 'PrimaryImageAspectRatio,ChildCount,OfficialRating,CommunityRating,ProductionYear,RunTimeTicks,ParentId',
            ImageTypeLimit: 1, EnableImageTypes: 'Primary,Thumb', EnableUserData: true };
        if (p.nextUp) {
            const r = await c.getNextUpEpisodes({ UserId: uid, ParentId: L.parentId, ...base });
            return { items: r.Items || [], total: r.TotalRecordCount || (r.Items || []).length };
        }
        if (p.latest) {
            if (L.tiles.length) return { items: [], total: L.tiles.length };
            const r = await c.getLatestItems({ userId: uid, parentId: L.parentId, IncludeItemTypes: p.latest, Limit: 40, Fields: base.Fields });
            return { items: r || [], total: (r || []).length };
        }
        if (p.artists) {
            const r = await c.getAlbumArtists(uid, { ParentId: L.parentId, SortBy: 'SortName', ...base });
            return { items: r.Items || [], total: r.TotalRecordCount || 0 };
        }
        if (p.group && !L.filter) {
            const fn = p.group === 'studios' ? 'getStudios' : 'getGenres';
            const r = await c[fn](uid, { ParentId: L.parentId, SortBy: 'SortName', IncludeItemTypes: L.kind.types, ...base });
            return { items: r.Items || [], total: r.TotalRecordCount || 0, group: true };
        }
        const q = Object.assign({}, base, { SortBy: p.SortBy || 'SortName', SortOrder: p.SortOrder || 'Ascending' });
        if (p.Filters) q.Filters = p.Filters;
        const o = L.opts;  // sort and filter (the SortFilter board)
        if (o) {
            if (o.sortBy) { q.SortBy = o.sortBy === 'SortName' ? 'SortName' : `${o.sortBy},SortName`; q.SortOrder = o.order; }
            const f = [q.Filters, o.unwatched && 'IsUnplayed', o.favourites && 'IsFavorite'].filter(Boolean);
            if (f.length) q.Filters = [...new Set(f.join(',').split(','))].join(',');
            if (o.uhd) q.Is4K = true;
            if (o.genre) q.GenreIds = o.genre;
            if (o.year) q.Years = o.year;
        }
        if (!(p.noParent || L.kind.noParent) || p.folders) q.ParentId = L.parentId;
        if (p.folders) q.Recursive = false;
        else { q.IncludeItemTypes = p.types || L.kind.types; q.Recursive = true; }
        if (L.filter) q[L.filter.key] = L.filter.id;
        if (L.fixed) q[L.fixed.key] = L.fixed.id;
        const r = await c.getItems(uid, q);
        return { items: r.Items || [], total: r.TotalRecordCount || 0 };
    }

    async function more() {
        if (!L || L.loading || L.done) return;
        L.loading = true;
        const gen = L.gen;
        try {
            const r = await fetchPage();
            if (!L || L.gen !== gen) return;
            L.total = r.total;
            for (const it of r.items) { const t = tile(it, r.group); L.grid.append(t); L.tiles.push(t); }
            L.done = L.tiles.length >= L.total || !r.items.length;
            if (!L.tiles.length) L.grid.append(el('div', 'mc-lib-empty', 'Nothing here yet.'));
            count();
        } catch (e) {
            console.warn('Media Center: library', e);
            if (L) L.done = true;
        } finally {
            if (L && L.gen === gen) L.loading = false;
        }
    }

    function count() {
        const f = T.ctx.focused();
        const i = L.tiles.indexOf(f);
        L.count.textContent = L.total ? `${i >= 0 ? i + 1 : 0} | ${L.total}` : '';
    }

    function reload() {
        L.gen++;
        L.tiles = [];
        L.total = 0;
        L.done = false;
        L.loading = false;
        L.grid.textContent = '';
        L.grid.style.transform = '';
        L.grid.dataset.group = L.pivot.group && !L.filter ? '1' : '';
        L.grid.style.setProperty('--mc-dir', String(L.dir || 1));
        L.grid.classList.remove('mc-pivot-in');
        void L.grid.offsetWidth;
        L.grid.classList.add('mc-pivot-in');
        L.info.textContent = '';
        L.crumb.textContent = L.filter ? `${L.filter.name} · ` : '';
        more().then(() => { if (L && L.tiles[0]) T.ctx.focus(L.tiles[0]); });
    }

    // The focused tile's column is kept in view: the grid slides left so the lens sits within the first two-thirds.
    function follow(t) {
        const gr = L.grid.getBoundingClientRect(), tr = t.getBoundingClientRect(), view = L.body.getBoundingClientRect();
        const cur = parseFloat((L.grid.style.transform.match(/-?[\d.]+/) || [0])[0]) || 0;
        const left = tr.left - gr.left;
        const target = Math.min(0, Math.max(-(L.grid.scrollWidth - view.width), view.width * 0.3 - left));
        if (left + cur < view.width * 0.05 || left + tr.width + cur > view.width * 0.8) L.grid.style.transform = `translateX(${Math.round(target)}px)`;
        L.caption(t.mcItem);
        count();
        if (L.tiles.length - L.tiles.indexOf(t) < L.layout.rows * 6) more();
    }

    // ---- sort and filter (the SortFilter board, 9.60): a side panel over the library; its choices hold until changed
    // or cleared, across pivots ----
    const SORTS = [['SortName', 'Title'], ['DateCreated', 'Date added'], ['PremiereDate', 'Release date'], ['CommunityRating', 'Rating']];
    async function sortPanel() {
        if (!L || !M.panel) return;
        const c = M.client(), uid = c.getCurrentUserId();
        const o = Object.assign({ sortBy: 'SortName', order: 'Ascending' }, L.opts || {});
        const apply = () => { L.opts = o; L.sortBtn.classList.toggle('on', o.sortBy !== 'SortName' || o.order !== 'Ascending' || !!(o.unwatched || o.favourites || o.uhd || o.genre || o.year)); reload(); };
        let genres = [], years = [];
        try { genres = ((await c.getGenres(uid, { ParentId: L.parentId || undefined, IncludeItemTypes: L.kind.types, SortBy: 'SortName' })).Items || []); } catch (e) { genres = []; }
        try { years = ((await c.getJSON(c.getUrl('Years', { UserId: uid, ParentId: L.parentId || undefined, IncludeItemTypes: L.kind.types, Recursive: true, SortBy: 'SortName', SortOrder: 'Descending' }))).Items || []); } catch (e) { years = []; }
        M.panel.show({
            title: 'sort and filter',
            render(body, panel) {
                const draw = () => {
                    body.textContent = '';
                    body.append(M.sec('sort by'));
                    for (const [id, label] of SORTS) {
                        if (id === o.sortBy) {
                            const order = id === 'SortName' ? [['Ascending', 'A to Z'], ['Descending', 'Z to A']] : [['Descending', 'newest first'], ['Ascending', 'oldest first']];
                            if (id === 'CommunityRating') order[0][1] = 'highest first', order[1][1] = 'lowest first';
                            body.append(M.stepper(label, order, o.order, (v) => { o.order = v; }));
                            body.lastChild.classList.add('mc-sp-on');
                        } else body.append(M.row(label, { go: () => { o.sortBy = id; o.order = id === 'SortName' ? 'Ascending' : 'Descending'; draw(); T.ctx.focus([...body.querySelectorAll('.mc-sp-row')][SORTS.findIndex((x) => x[0] === id)]); } }));
                    }
                    body.append(M.sec('show only'));
                    const tick = (key, label) => {
                        const r = M.row(label, { on: !!o[key] });
                        r.addEventListener('click', () => { o[key] = !o[key]; T.ctx.sound('select'); const at = [...body.querySelectorAll('.mc-sp-row')].indexOf(r); draw(); T.ctx.focus(body.querySelectorAll('.mc-sp-row')[at]); });
                        return r;
                    };
                    body.append(tick('unwatched', 'Not watched'), tick('favourites', 'Favourites'), tick('uhd', '4K'));
                    if (genres.length) body.append(M.stepper('Genre', [['', 'any'], ...genres.map((g) => [g.Id, g.Name])], o.genre || '', (v) => { o.genre = v; }));
                    if (years.length) body.append(M.stepper('Year', [['', 'any'], ...years.map((y) => [String(y.Name), String(y.Name)])], o.year || '', (v) => { o.year = v; }));
                    body.append(M.foot(M.button('Done', () => { panel.close(); apply(); }, true), M.button('Clear', () => { for (const k of Object.keys(o)) delete o[k]; o.sortBy = 'SortName'; o.order = 'Ascending'; panel.close(); apply(); })));
                };
                draw();
            }
        });
    }

    // ---- a drill-down list (the ListPage board, 9.60): a genre, music genre, studio, network or person, from any of
    // jellyfin-web's #/list keys. Its pivots split it by kind or order it; Play all and Shuffle stand apart at the left
    // with what the list is and how much is in it.
    const LIST_KEYS = [['genreId', 'GenreIds', 'genre'], ['musicGenreId', 'GenreIds', 'music genre'], ['studioId', 'StudioIds', 'studio'], ['personId', 'PersonIds', 'person'], ['tag', 'Tags', 'tag']];
    M.listKind = (params) => {
        const k = LIST_KEYS.find(([q]) => params.get(q));
        if (!k) return null;
        const music = k[0] === 'musicGenreId';
        const pivots = music
            ? [['albums', { types: 'MusicAlbum', ...sort('SortName') }], ['songs', { types: 'Audio', ...sort('SortName') }], ['artists', { types: 'MusicArtist', ...sort('SortName') }]]
            : [['all', { types: 'Movie,Series', ...sort('SortName') }], ['movies', { types: 'Movie', ...sort('SortName') }], ['shows', { types: 'Series', ...sort('SortName') }],
                ['episodes', { types: 'Episode', ...sort('SeriesSortName,ParentIndexNumber,IndexNumber') }], ['year', { types: 'Movie,Series', ...sort('ProductionYear,SortName', 'Descending') }]];
        return { kind: { title: '', what: k[2], types: music ? 'MusicAlbum' : 'Movie,Series', layout: music ? SQUARE : POSTER, noParent: true, list: true, pivots },
            fixed: { key: k[1], id: k[0] === 'tag' ? params.get('tag') : params.get(k[0]) } };
    };
    async function listHead(root, fixed, what) {
        const c = M.client(), uid = c.getCurrentUserId();
        const side = el('div', 'mc-lib-side');
        const play = async (shuffle) => {
            try {
                const r = await c.getItems(uid, { Recursive: true, Limit: 300, SortBy: shuffle ? 'Random' : 'SortName', MediaTypes: 'Video,Audio', [fixed.key]: fixed.id });
                const ids = (r.Items || []).filter((x) => !x.IsFolder).map((x) => x.Id);
                if (ids.length) { T.ctx.sound('select'); T.ctx.play({ ids, serverId: M.sid() }); } else T.ctx.sound('error');
            } catch (e) { T.ctx.sound('error'); }
        };
        const about = el('div', 'mc-lib-about', what);
        side.append(M.button ? M.button('Play all', () => play(false)) : el('div'), M.button ? M.button('Shuffle', () => play(true)) : el('div'), about);
        root.append(side);
        // the name (the title) and what is in it
        if (fixed.key !== 'Tags') {
            try { const it = await c.getItem(uid, fixed.id); if (L && L.root === root) L.chrome.head.textContent = (it.Name || '').toLowerCase(); } catch (e) { /* the title stays empty */ }
        } else if (L && L.root === root) L.chrome.head.textContent = String(fixed.id).toLowerCase();
        try {
            const n = async (types) => (await c.getItems(uid, { Recursive: true, Limit: 0, IncludeItemTypes: types, [fixed.key]: fixed.id })).TotalRecordCount || 0;
            const parts = what === 'music genre' ? [[await n('MusicAlbum'), 'album']] : [[await n('Movie'), 'movie'], [await n('Series'), 'show']];
            const line = parts.filter(([x]) => x).map(([x, w]) => `${x} ${w}${x === 1 ? '' : 's'}`).join(' · ');
            about.textContent = '';
            about.append(el('div', '', what.charAt(0).toUpperCase() + what.slice(1)), el('div', '', line));
        } catch (e) { /* the counts are extra */ }
    }

    // The pivot row slides so the picked word stands first (the target's own move); the words before it fade back and
    // never leave the window's left edge.
    function shiftPivot(pivot, p, now) {
        const items = [...pivot.querySelectorAll('.mc-pivot-item:not(.mc-lib-sort)')];
        const k = items.indexOf(p);
        if (k < 0) return;
        const dx = Math.min(p.offsetLeft - items[0].offsetLeft, pivot.getBoundingClientRect().left - innerHeight * 0.02);
        if (now) pivot.classList.add('mc-pivot-still');
        pivot.style.setProperty('--mc-shift', `${-Math.max(0, Math.round(dx))}px`);
        items.forEach((x, i) => x.classList.toggle('mc-pivot-past', i < k));
        if (now) requestAnimationFrame(() => pivot.classList.remove('mc-pivot-still'));
    }

    function screenFor(kindOf) {
        return {
            async mount(root) {
                const params = new URLSearchParams(location.hash.split('?')[1] || '');
                const found = kindOf(params);
                const kind = found.kind;
                const parentId = kind.list ? '' : params.get('topParentId') || params.get('parentId') || '';
                root.setAttribute('data-mc', kind.list ? 'list' : 'library');
                const field = el('div', 'mc-field');
                field.append(el('div', 'mc-ribbon one'), el('div', 'mc-ribbon two'));
                root.append(field);
                const chrome = M.chrome(root, kind.title);
                const pivot = el('div', 'mc-pivot mc-lib-pivot');
                const crumb = el('span', 'mc-lib-crumb');
                const body = el('div', 'mc-lib-body');
                const grid = el('div', `mc-lib-grid mc-lib-${kind.layout.shape}`);
                grid.style.setProperty('--mc-rows', String(kind.layout.rows));
                grid.style.setProperty('--mc-ms', `${T.ui.motion.duration(300)}ms`);
                body.append(grid);
                const info = el('div', 'mc-lib-info');
                const countEl = el('div', 'mc-count');
                root.append(pivot, body, info, countEl);
                L = { root, kind, layout: kind.layout, parentId, pivot: null, filter: null, fixed: found.fixed || null, tiles: [], grid, body, info, count: countEl, crumb, chrome, gen: 0 };
                L.caption = M.caption ? M.caption(info, (e, it) => e.append(el('div', 'mc-lib-info-name', it.Name), el('div', 'mc-lib-info-facts', facts(it))))
                    : (it) => { info.textContent = ''; info.append(el('div', 'mc-lib-info-name', it.Name), el('div', 'mc-lib-info-facts', facts(it))); };
                if (kind.list) listHead(root, found.fixed, kind.what);
                L.io = new IntersectionObserver((entries) => {
                    for (const e of entries) {
                        const a = e.target.querySelector('.mc-lib-art[data-src]');
                        if (!e.isIntersecting || !a) continue;
                        a.style.backgroundImage = `url("${a.dataset.src}")`;
                        delete a.dataset.src;
                        L.io.unobserve(e.target);
                    }
                }, { root: body, rootMargin: '0px 60% 0px 60%' });
                const tab = params.get('tab');
                kind.pivots.forEach(([label, spec], k) => {
                    const p = focusable(el('button', 'mc-pivot-item', label));
                    p.type = 'button';
                    p.addEventListener('click', () => {
                        T.ctx.sound('select');
                        const items = [...pivot.querySelectorAll('.mc-pivot-item:not(.mc-lib-sort)')];
                        const was = items.findIndex((x) => x.classList.contains('on'));
                        items.forEach((x) => x.classList.toggle('on', x === p));
                        L.dir = items.indexOf(p) >= was ? 1 : -1;
                        L.pivot = spec;
                        L.filter = null;
                        shiftPivot(pivot, p);
                        reload();
                    });
                    pivot.append(p);
                    if ((tab != null && String(k) === tab) || (tab == null && k === 0)) { p.classList.add('on'); L.pivot = spec; }
                });
                if (!L.pivot) { L.pivot = kind.pivots[0][1]; pivot.firstChild.classList.add('on'); }
                pivot.prepend(crumb);
                L.sortBtn = focusable(el('button', 'mc-pivot-item mc-lib-sort', 'sort and filter'));
                L.sortBtn.type = 'button';
                L.sortBtn.setAttribute('aria-label', 'Sort and filter');
                L.sortBtn.addEventListener('click', () => { T.ctx.sound('select'); sortPanel(); });
                pivot.append(L.sortBtn);
                requestAnimationFrame(() => { const on = pivot.querySelector('.mc-pivot-item.on'); if (on) shiftPivot(pivot, on, true); });
                root.addEventListener('icefin-focus', (e) => { if (L && L.tiles.includes(e.target)) follow(e.target); });
                await more();
                if (!L || L.root !== root) return;
                const home = M.flyHome ? M.flyHome((id) => L.tiles.find((x) => x.mcItem && x.mcItem.Id === id) || null) : null;
                if (home || L.tiles[0]) T.ctx.focus(home || L.tiles[0]);
                root.setAttribute('data-mc-ready', '1');
            },
            onBack() {
                if (L && L.filter) { L.filter = null; reload(); return true; }
                return false;
            },
            unmount() {
                if (L) { if (L.io) L.io.disconnect(); L.chrome.stop(); }
                L = null;
            }
        };
    }
    for (const route of Object.keys(KINDS)) T.registerScreen(route, screenFor(() => ({ kind: KINDS[route] })));
    // #/list is the wall's (wall.js); a drill-down list goes here
    M.listScreen = screenFor((params) => M.listKind(params));
})();
