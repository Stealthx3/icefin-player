// Tide: entries and levels from the server (PLAN 9.48; the canvas's Home, LibrarySections, Folder, PhotosBooks boards).
// A library's sections are folders in its column (LibrarySections): what to watch first (Continue, Next up), then
// Recently added, Favourites, All, and the library's own groupings (Collections, Genres, Studios or Networks,
// Upcoming; Albums, Artists, Songs, Playlists for music). Every folder opens as a nested column (column.js).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinTide;
    if (!T || !D) return;
    const FIELDS = 'PrimaryImageAspectRatio,ProductionYear,PremiereDate,ChildCount,RecursiveItemCount,AlbumArtist,Artists,UserData,RunTimeTicks,Overview,OfficialRating,CommunityRating,SeriesName,ParentIndexNumber,IndexNumber,BackdropImageTags,ParentBackdropItemId,ParentBackdropImageTags,SeriesId,SeriesPrimaryImageTag,ImageTags,MediaType,CollectionType,DateCreated';
    const c = () => D.client();
    const uid = () => D.uid();
    D.FIELDS = FIELDS;

    // ---- items ----
    const CONTAINER = ['Series', 'Season', 'BoxSet', 'MusicAlbum', 'MusicArtist', 'Playlist', 'PhotoAlbum', 'MusicGenre', 'Folder', 'CollectionFolder'];
    D.playable = (it) => !!it && (!!it.MediaType || CONTAINER.includes(it.Type) || it.Type === 'TvChannel' || it.Type === 'Program');
    D.playItem = (it, resume) => {
        const pos = resume && it.UserData && it.UserData.PlaybackPositionTicks ? it.UserData.PlaybackPositionTicks : 0;
        return T.ctx.play({ ids: [it.Id], serverId: D.sid(), startPositionTicks: pos });
    };
    D.shuffle = (it) => T.ctx.play({ ids: [it.Id], serverId: D.sid(), shuffle: true });
    // Into an item's details; the poster flies from the column into the details' trail (MotionDetails board)
    D.openItem = (it, fromEl) => {
        const t = fromEl && fromEl.querySelector('.td-e-thumb');
        D.flight = t ? { id: it.Id, rect: t.getBoundingClientRect(), art: t.style.backgroundImage } : null;
        if (it.Type === 'Photo') { D.playItem(it); return; }
        if (it.Type === 'TvChannel' || it.Type === 'Program') { D.liveOptions ? D.liveOptions(it) : D.details(it.Id); return; }
        D.details(it.Id);
    };
    const shapeOf = (it) => {
        if (it.Type === 'Episode' || it.Type === 'Video' || it.Type === 'MusicVideo' || it.Type === 'TvChannel' || it.Type === 'Program') return 'wide';
        if (it.Type === 'MusicAlbum' || it.Type === 'Audio' || it.Type === 'Playlist' || it.Type === 'Photo' || it.Type === 'PhotoAlbum') return 'square';
        if (it.Type === 'Person' || it.Type === 'MusicArtist') return 'round';
        if (it.Type === 'Folder' || it.Type === 'CollectionFolder') return 'icon';
        return 'poster';
    };
    D.artOf = (it, w) => {
        const tags = it.ImageTags || {};
        if (shapeOf(it) === 'wide') {
            if (tags.Primary) return D.image(it.Id, 'Primary', tags.Primary, w || 400);
            if (tags.Thumb) return D.image(it.Id, 'Thumb', tags.Thumb, w || 400);
            if (it.SeriesId && it.SeriesThumbImageTag) return D.image(it.SeriesId, 'Thumb', it.SeriesThumbImageTag, w || 400);
            if (it.ParentBackdropItemId && it.ParentBackdropImageTags && it.ParentBackdropImageTags[0]) return D.image(it.ParentBackdropItemId, 'Backdrop', it.ParentBackdropImageTags[0], w || 400);
            return '';
        }
        if (tags.Primary) return D.image(it.Id, 'Primary', tags.Primary, w || 300);
        if (it.AlbumId && it.AlbumPrimaryImageTag) return D.image(it.AlbumId, 'Primary', it.AlbumPrimaryImageTag, w || 300);
        if (it.SeriesId && it.SeriesPrimaryImageTag) return D.image(it.SeriesId, 'Primary', it.SeriesPrimaryImageTag, w || 300);
        return '';
    };
    const year = (it) => it.ProductionYear || (it.PremiereDate ? new Date(it.PremiereDate).getFullYear() : '');
    D.subOf = (it, o) => {
        o = o || {};
        const ud = it.UserData || {};
        if (o.resume && ud.PlaybackPositionTicks) return [it.Type === 'Episode' ? `${it.SeriesName || ''} · S${it.ParentIndexNumber || '?'} · E${it.IndexNumber || '?'}` : '', `${D.left(it)}`, year(it)].filter(Boolean).join(' · ');
        switch (it.Type) {
            case 'Episode': return [o.inSeason ? '' : it.SeriesName, it.ParentIndexNumber != null && !o.inSeason ? `S${it.ParentIndexNumber}` : '', it.IndexNumber != null && !o.inSeason ? `E${it.IndexNumber}` : '', it.RunTimeTicks ? D.ticks(it.RunTimeTicks) : '', ud.Played ? 'watched ✓' : (ud.PlaybackPositionTicks ? D.left(it) : '')].filter(Boolean).join(' · ');
            case 'Series': return [year(it), it.ChildCount ? `${it.ChildCount} seasons` : '', ud.UnplayedItemCount ? `${ud.UnplayedItemCount} new` : ''].filter(Boolean).join(' · ');
            case 'Season': return [it.ChildCount ? `${it.ChildCount} episodes` : '', ud.UnplayedItemCount ? `${ud.UnplayedItemCount} unwatched` : ''].filter(Boolean).join(' · ');
            case 'MusicAlbum': return [it.AlbumArtist, year(it)].filter(Boolean).join(' · ');
            case 'Audio': return [(it.Artists || [])[0] || it.AlbumArtist, it.Album, it.RunTimeTicks ? D.clockTicks(it.RunTimeTicks) : ''].filter(Boolean).join(' · ');
            case 'MusicArtist': return it.ChildCount ? `${it.ChildCount} albums` : '';
            case 'BoxSet': case 'Playlist': case 'Folder': case 'CollectionFolder': case 'PhotoAlbum': { const n = it.ChildCount || it.RecursiveItemCount; return n ? `${n} items` : ''; }
            case 'Person': return o.role || '';
            default: return [year(it), it.RunTimeTicks ? D.ticks(it.RunTimeTicks) : '', it.OfficialRating, ud.Played ? 'watched ✓' : (ud.PlaybackPositionTicks ? D.left(it) : '')].filter(Boolean).join(' · ');
        }
    };
    D.clockTicks = (t) => { const s = Math.round(t / 1e7); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    // An entry for an item. o: {resume, inSeason, role, open (a level instead of details)}
    D.entry = (it, o) => {
        o = o || {};
        const ud = it.UserData || {};
        const e = {
            name: o.name || (it.Type === 'Episode' && o.resume ? (it.SeriesName || it.Name) : it.Name),
            sub: o.sub != null ? o.sub : D.subOf(it, o),
            line: it.Overview ? it.Overview.replace(/\s+/g, ' ').slice(0, 220) : '',
            art: D.artOf(it), shape: shapeOf(it), icon: D.kindIcon(it.Type), item: it,
            initials: (it.Type === 'Person' || it.Type === 'MusicArtist') && !(it.ImageTags && it.ImageTags.Primary) ? it.Name : null,
            progress: ud.PlayedPercentage ? ud.PlayedPercentage / 100 : 0,
            played: !!ud.Played && it.Type !== 'Series' && it.Type !== 'Season',
            letter: it.SortName || it.Name
        };
        if (o.open) e.open = o.open;
        if (it.Type === 'Folder' || it.Type === 'CollectionFolder' || it.Type === 'PhotoAlbum' || (it.IsFolder && ['Folder', 'CollectionFolder'].includes(it.Type))) e.open = () => D.folderLevel(it);
        return e;
    };
    D.items = async (q) => {
        const r = await Promise.resolve(c().getItems(uid(), Object.assign({ Fields: FIELDS, EnableImageTypes: 'Primary,Backdrop,Thumb' }, q)));
        return (r && r.Items) || [];
    };

    // ---- levels ----
    // A list of items, sortable and filterable from the options panel (SortFilter board): q is the getItems query
    D.listLevel = (title, icon, q, o) => {
        o = o || {};
        const lv = {
            title, icon, letters: (q.SortBy || 'SortName').startsWith('SortName'),
            query: Object.assign({ SortBy: 'SortName', SortOrder: 'Ascending', Recursive: true, Limit: 3000 }, q),
            filters: {},
            async load() {
                const query = Object.assign({}, lv.query);
                const f = lv.filters;
                const filt = [];
                if (f.unplayed) filt.push('IsUnplayed');
                if (f.favourites) filt.push('IsFavorite');
                if (filt.length) query.Filters = filt.join(',');
                if (f.genres) query.GenreIds = f.genres;
                if (f.years) query.Years = f.years;
                if (f.studios) query.StudioIds = f.studios;
                lv.letters = query.SortBy.startsWith('SortName') && query.SortOrder === 'Ascending';
                const list = await D.items(query);
                const head = o.head ? o.head(list) : [];
                return head.concat(list.map((it) => D.entry(it, o.entry)));
            },
            empty: o.empty || { icon, title: 'Nothing here yet' },
            sortable: o.sortable !== false,
            countNote: o.countNote
        };
        return lv;
    };
    // Play all and Shuffle at the top of a drill-down's column (checklist 1.3)
    D.playAllHead = (q) => (list) => (list.length ? [
        { name: 'Play all', icon: 'play', shape: 'icon', go: () => T.ctx.play({ items: list.slice(0, 500) }), okLabel: 'play' },
        { name: 'Shuffle', icon: 'shuffle', shape: 'icon', go: () => { const s = list.slice(); for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } T.ctx.play({ items: s.slice(0, 500) }); }, okLabel: 'shuffle' }
    ] : []);
    // A genre, studio or person's items (#/list's keys, checklist 1.3)
    D.dropLevel = (title, icon, q, o) => D.listLevel(title, icon, Object.assign({ IncludeItemTypes: 'Movie,Series,MusicAlbum,MusicVideo,Video,Book' }, q), Object.assign({ head: D.playAllHead(q) }, o || {}));
    D.folderLevel = (it) => D.listLevel(it.Name, D.kindIcon(it.Type), { ParentId: it.Id, Recursive: false, SortBy: 'IsFolder,SortName' }, { sortable: true });
    D.groupLevel = (title, icon, fetch, toLevel) => ({
        title, icon, letters: true,
        async load() {
            const list = await fetch();
            return list.map((g) => ({ name: g.Name, sub: g.ChildCount ? `${g.ChildCount} items` : '', icon, shape: 'icon', letter: g.SortName || g.Name, open: () => toLevel(g) }));
        },
        empty: { icon, title: 'Nothing here yet' }
    });
    const genres = (view, types) => D.groupLevel('Genres', 'genre',
        async () => { const r = await Promise.resolve(c().getGenres(uid(), { ParentId: view.Id, SortBy: 'SortName', IncludeItemTypes: types, Recursive: true })); return (r && r.Items) || []; },
        (g) => D.dropLevel(g.Name, 'genre', { GenreIds: g.Id, ParentId: view.Id, IncludeItemTypes: types }));
    const studios = (view, types, title) => D.groupLevel(title || 'Studios', 'studio',
        async () => { const r = await c().getJSON(c().getUrl('Studios', { ParentId: view.Id, UserId: uid(), SortBy: 'SortName', IncludeItemTypes: types, Recursive: true })); return (r && r.Items) || []; },
        (g) => D.dropLevel(g.Name, 'studio', { StudioIds: g.Id, ParentId: view.Id, IncludeItemTypes: types }));
    const resumeLevel = (view, types, word) => ({
        title: word || 'Continue watching', icon: 'resume', count: true,
        async load() {
            const r = await Promise.resolve(c().getResumableItems(uid(), { ParentId: view.Id, Limit: 60, Fields: FIELDS, MediaTypes: types, EnableImageTypes: 'Primary,Backdrop,Thumb' }));
            return ((r && r.Items) || []).map((it) => Object.assign(D.entry(it, { resume: true }), { okLabel: 'resume', go: () => D.playItem(it, true) }));
        },
        empty: { icon: 'resume', title: 'Nothing to continue', text: 'What you start and leave part way shows here.' }
    });
    const nextUpLevel = (view) => ({
        title: 'Next up', icon: 'episodes',
        async load() {
            const r = await Promise.resolve(c().getNextUpEpisodes({ UserId: uid(), ParentId: view ? view.Id : undefined, Limit: 60, Fields: FIELDS, EnableImageTypes: 'Primary,Backdrop,Thumb' }));
            return ((r && r.Items) || []).map((it) => Object.assign(D.entry(it, { resume: true }), { name: it.SeriesName || it.Name, sub: `S${it.ParentIndexNumber} · E${it.IndexNumber} · ${it.Name}`, okLabel: 'play', go: () => D.playItem(it, true) }));
        },
        empty: { icon: 'episodes', title: 'Nothing up next', text: 'Start a show and its next episode waits here.' }
    });
    const latestLevel = (view, types) => ({
        title: 'Recently added', icon: 'latest', count: true,
        async load() {
            const r = await Promise.resolve(c().getLatestItems({ UserId: uid(), ParentId: view.Id, Limit: 60, Fields: FIELDS, IncludeItemTypes: types, EnableImageTypes: 'Primary,Backdrop,Thumb' }));
            return (r || []).map((it) => D.entry(it));
        },
        empty: { icon: 'latest', title: 'Nothing new' }
    });
    const favLevel = (view, types, all) => D.listLevel('Favourites', 'star', { ParentId: view.Id, IncludeItemTypes: types, Filters: 'IsFavorite' }, {
        empty: { icon: 'star', title: 'No favourites yet', text: '≡ on anything, then Add to favourites, and it will be here.', way: all ? { label: `Go to ${all.title}`, go: () => D.goLevel && D.goLevel(all) } : null }
    });
    const upcomingLevel = (view) => ({
        title: 'Upcoming', icon: 'upcoming',
        async load() {
            const r = await c().getJSON(c().getUrl('Shows/Upcoming', { UserId: uid(), ParentId: view.Id, Limit: 60, Fields: FIELDS }));
            return ((r && r.Items) || []).map((it) => Object.assign(D.entry(it), { name: it.SeriesName || it.Name, sub: [`S${it.ParentIndexNumber} · E${it.IndexNumber}`, it.PremiereDate ? new Date(it.PremiereDate).toLocaleDateString() : ''].filter(Boolean).join(' · ') }));
        },
        empty: { icon: 'upcoming', title: 'Nothing coming up' }
    });
    const folder = (lv) => ({ name: lv.title, icon: lv.icon, shape: 'icon', open: () => lv });
    const PEEK = 3;  // what-to-watch entries shown straight in a library's column before its folders

    // The folders (and the first things to watch) of a library, by its collection type (LibrarySections board)
    D.libraryEntries = async (view, o) => {
        o = o || {};
        const t = view.CollectionType;
        const out = [];
        const peek = async (lv) => { try { const l = await lv.load(); lv.entries = l; return l.slice(0, PEEK); } catch (e) { return []; } };
        if (t === 'movies') {
            const all = D.listLevel('All movies', 'folder', { ParentId: view.Id, IncludeItemTypes: 'Movie' });
            const res = resumeLevel(view, 'Video');
            if (o.peek) out.push(...await peek(res));
            out.push(folder(res), folder(latestLevel(view, 'Movie')), folder(favLevel(view, 'Movie', all)), Object.assign(folder(all), { name: 'All movies' }),
                folder(D.listLevel('Collections', 'collections', { ParentId: view.Id, IncludeItemTypes: 'BoxSet' })), folder(genres(view, 'Movie')), folder(studios(view, 'Movie')));
        } else if (t === 'tvshows') {
            const all = D.listLevel('All shows', 'folder', { ParentId: view.Id, IncludeItemTypes: 'Series' });
            const res = resumeLevel(view, 'Video'), nu = nextUpLevel(view);
            if (o.peek) { out.push(...await peek(res)); out.push(...await peek(nu)); }
            out.push(folder(res), folder(nu), folder(latestLevel(view, 'Episode')), folder(favLevel(view, 'Series', all)), folder(all), folder(genres(view, 'Series')),
                folder(studios(view, 'Series', 'Networks')), folder(upcomingLevel(view)));
        } else if (t === 'music') {
            if (D.nowPlayingEntry) { const np = D.nowPlayingEntry(); if (np) out.push(np); }
            const albums = D.listLevel('Albums', 'album', { ParentId: view.Id, IncludeItemTypes: 'MusicAlbum' });
            out.push(folder(albums),
                folder(D.groupLevel('Artists', 'person', async () => { const r = await Promise.resolve(c().getAlbumArtists({ UserId: uid(), ParentId: view.Id, SortBy: 'SortName', Fields: FIELDS })); return (r && r.Items) || []; },
                    (a) => D.artistLevel(a))),
                folder(D.listLevel('Songs', 'song', { ParentId: view.Id, IncludeItemTypes: 'Audio' }, { head: D.playAllHead() })),
                folder(D.listLevel('Playlists', 'playlists', { IncludeItemTypes: 'Playlist', MediaTypes: 'Audio' }, { head: () => [D.newPlaylistEntry()] })),
                folder(genresMusic(view)), folder(latestLevel(view, 'MusicAlbum')), folder(favLevel(view, 'MusicAlbum,Audio,MusicArtist', albums)));
        } else if (t === 'livetv') {
            if (D.liveEntries) out.push(...D.liveEntries(view));
            else out.push({ name: 'Live TV', icon: 'livetv', shape: 'icon', go: () => T.ctx.navigate('#/livetv') });
        } else if (t === 'boxsets') {
            const lv = D.listLevel('Collections', 'collections', { ParentId: view.Id, IncludeItemTypes: 'BoxSet' });
            return (await lv.load());
        } else if (t === 'playlists') {
            const lv = D.listLevel('Playlists', 'playlists', { ParentId: view.Id, IncludeItemTypes: 'Playlist' }, { head: () => [D.newPlaylistEntry()] });
            return (await lv.load());
        } else if (t === 'homevideos' || t === 'photos') {
            out.push(folder(D.daysLevel(view)), folder(D.folderLevel(view)), folder(favLevel(view, 'Photo,Video')));
        } else if (t === 'books') {
            const all = D.listLevel('All books', 'books', { ParentId: view.Id, IncludeItemTypes: 'Book' });
            out.push(folder(resumeLevel(view, 'Book', 'Continue reading')), folder(all), folder(favLevel(view, 'Book', all)));
        } else if (t === 'musicvideos') {
            const all = D.listLevel('All music videos', 'musicvideos', { ParentId: view.Id, IncludeItemTypes: 'MusicVideo' });
            out.push(folder(all), folder(latestLevel(view, 'MusicVideo')), folder(favLevel(view, 'MusicVideo', all)), folder(genres(view, 'MusicVideo')));
        } else {
            const lv = D.folderLevel(view);
            return (await lv.load());
        }
        return out;
    };
    const genresMusic = (view) => D.groupLevel('Genres', 'genre',
        async () => { const r = await c().getJSON(c().getUrl('MusicGenres', { ParentId: view.Id, UserId: uid(), SortBy: 'SortName' })); return (r && r.Items) || []; },
        (g) => D.dropLevel(g.Name, 'genre', { GenreIds: g.Id, ParentId: view.Id, IncludeItemTypes: 'MusicAlbum' }));
    D.artistLevel = (a) => D.listLevel(a.Name, 'person', { ArtistIds: a.Id, IncludeItemTypes: 'MusicAlbum', SortBy: 'ProductionYear,SortName', SortOrder: 'Descending' }, { head: D.playAllHead() });
    // Photos and home videos grouped by day (PhotosBooks board): days are entries; a day opens its photos and videos
    D.daysLevel = (view) => ({
        title: 'Days', icon: 'schedule',
        async load() {
            const list = await D.items({ ParentId: view.Id, Recursive: true, IncludeItemTypes: 'Photo,Video', SortBy: 'DateCreated,SortName', SortOrder: 'Descending', Limit: 3000 });
            const days = new Map();
            for (const it of list) {
                const d = new Date(it.PremiereDate || it.DateCreated || Date.now());
                const k = d.toDateString();
                if (!days.has(k)) days.set(k, { date: d, items: [] });
                days.get(k).items.push(it);
            }
            return [...days.values()].map((g) => ({
                name: g.date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }), sub: `${g.items.length} ${g.items.length === 1 ? 'item' : 'items'} · ▶ slideshow`,
                art: D.artOf(g.items[0]), shape: 'square',
                open: () => ({ title: g.date.toLocaleDateString(), icon: 'photos', load: async () => g.items.map((it) => Object.assign(D.entry(it), { go: () => T.ctx.play({ items: g.items, startIndex: g.items.indexOf(it) }) })) }),
                play: () => T.ctx.play({ items: g.items })
            }));
        },
        empty: { icon: 'photos', title: 'No photos yet' }
    });
    D.newPlaylistEntry = () => ({
        name: 'New playlist…', icon: 'add', shape: 'icon', okLabel: 'name it',
        go: (C) => D.panel.show({
            title: 'New playlist', path: 'Playlists',
            render(body) {
                const name = D.field('Name', '', { placeholder: '[Road trip]' });
                body.append(name, D.foot(D.button('Create', async () => {
                    const n = name.input.value.trim();
                    if (!n) { T.ctx.sound('error'); T.ctx.focus(name.input); return; }
                    try {
                        await c().ajax({ type: 'POST', url: c().getUrl('Playlists', { Name: n, UserId: uid(), MediaType: 'Audio' }), dataType: 'json' });
                        D.panel.close(); D.notice(`Created ${n}`); if (C && C.reload) C.reload();
                    } catch (e) { D.notice('That didn’t work', true); }
                }, true), D.button('Cancel', () => D.panel.close())));
            }
        })
    });
})();
