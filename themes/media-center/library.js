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
        if (!(p.noParent || L.kind.noParent) || p.folders) q.ParentId = L.parentId;
        if (p.folders) q.Recursive = false;
        else { q.IncludeItemTypes = p.types || L.kind.types; q.Recursive = true; }
        if (L.filter) q[L.filter.key] = L.filter.id;
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
        const it = t.mcItem;
        L.info.textContent = '';
        L.info.append(el('div', 'mc-lib-info-name', it.Name), el('div', 'mc-lib-info-facts', facts(it)));
        count();
        if (L.tiles.length - L.tiles.indexOf(t) < L.layout.rows * 6) more();
    }

    for (const route of Object.keys(KINDS)) {
        T.registerScreen(route, {
            async mount(root) {
                const kind = KINDS[route];
                const params = new URLSearchParams(location.hash.split('?')[1] || '');
                const parentId = params.get('topParentId') || params.get('parentId') || '';
                root.setAttribute('data-mc', 'library');
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
                L = { root, kind, layout: kind.layout, parentId, pivot: null, filter: null, tiles: [], grid, body, info, count: countEl, crumb, chrome, gen: 0 };
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
                        pivot.querySelectorAll('.mc-pivot-item').forEach((x) => x.classList.toggle('on', x === p));
                        L.pivot = spec;
                        L.filter = null;
                        reload();
                    });
                    pivot.append(p);
                    if ((tab != null && String(k) === tab) || (tab == null && k === 0)) { p.classList.add('on'); L.pivot = spec; }
                });
                if (!L.pivot) { L.pivot = kind.pivots[0][1]; pivot.firstChild.classList.add('on'); }
                pivot.prepend(crumb);
                root.addEventListener('icefin-focus', (e) => { if (L && L.tiles.includes(e.target)) follow(e.target); });
                await more();
                if (!L || L.root !== root) return;
                if (L.tiles[0]) T.ctx.focus(L.tiles[0]);
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
        });
    }
})();
