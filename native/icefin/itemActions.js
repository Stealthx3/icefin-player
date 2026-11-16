// Icefin theme engine: an item's actions and the data behind each of its dialogs (PLAN 9.60). Appended after
// accounts.js; adds T.ui.items.
//
// A theme draws its own item menu and dialogs (checklist 1.5): this is everything in them that isn't look, taken from
// Plaza's menu (9.44) so every theme offers the same actions under the same rules: which actions the user may take
// (their policy: administrators edit, refresh and identify; collection and subtitle management; the item's CanDelete
// and CanDownload), where the menu was opened (a playlist offers Remove from this playlist), and the server calls.
//
//   ui.items.setMenu(fn)            the theme's item menu: fn(item, where) opens it. Without one, More options on the
//                                   engine's details screen opens jellyfin-web's menu on its own page (9.38).
//   ui.items.open(item, where)      opens the item menu (the theme's, else jellyfin-web's)
//   ui.items.menu(ref, where)       -> Promise {item, admin, actions: [{id, label, group, danger, dialog}]}; groups in
//                                   order: play, go, organise, info, manage. dialog: the action opens a dialog the theme
//                                   draws (addToPlaylist, addToCollection, subtitles, mediaInfo, refresh, edit, images,
//                                   identify, removeSubtitles, delete); else it runs with run().
//   ui.items.run(id, item, where)   -> Promise {ok, message, close (the menu closes), navigate (a hash, already followed)}
//   where: {playlist: item, playlistItemId, collection: item, move(), removed()}, all optional
//
//   Dialog data (each -> Promise; failures reject, so a theme shows its own error notice):
//   ui.items.collections(type)      the user's playlists ('Playlist') or collections ('BoxSet'), by name, with ChildCount
//   ui.items.addTo(item, type, target) / ui.items.createWith(item, type, name)  -> {ok, message}
//   ui.items.subtitles: languages [[code, name]], on(item) [names], search(item, code) [results],
//                       download(item, result), external(item) [streams], remove(item, stream)
//   ui.items.mediaInfo(item)        [{title, rows: [{type, text}]}] per version (sync)
//   ui.items.refreshModes           [{id, label, sub}]; ui.items.refresh(item, id)
//   ui.items.details: read(item) (the whole item), save(full), lockFields [[field, label]]
//   ui.items.images: types [[type, label]], list(item, type), remote(item, type), set(item, type, remote),
//                    remove(item, type, index), url(item, type, image, maxWidth)
//   ui.items.identify: kind(item) (null: can't be identified), search(item, name, year), apply(item, match)
//   ui.items.remove(item)           deletes it from the server (the theme confirms first, safe choice focused)
//   ui.items.programme(id), recordDefaults(programId), record(programme, series, {pre, post, keep}), cancelRecording(timerId)
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (!T || !T.ui || !T.ctx || T.ui.items) return;
    const c = () => (T.ctx.apiClient && T.ctx.apiClient()) || window.ApiClient;
    const uid = () => c().getCurrentUserId();
    const sid = () => c().serverId();
    const post = (path, query, body) => c().ajax({ type: 'POST', url: c().getUrl(path, query || undefined), data: body ? JSON.stringify(body) : undefined, contentType: body ? 'application/json' : undefined });
    const del = (path, query) => c().ajax({ type: 'DELETE', url: c().getUrl(path, query || undefined) });
    const getJSON = (path, query) => c().getJSON(c().getUrl(path, query || undefined));

    const PLAYABLE = new Set(['Movie', 'Episode', 'Video', 'MusicVideo', 'Audio', 'Trailer', 'Series', 'Season', 'MusicAlbum', 'MusicArtist', 'BoxSet', 'Playlist']);
    const VIDEO = new Set(['Movie', 'Episode', 'Video', 'MusicVideo', 'Trailer']);
    const AUDIO = new Set(['Audio', 'MusicAlbum', 'MusicArtist', 'Playlist', 'MusicGenre']);
    const IDENTIFY = { Movie: 'Movie', Series: 'Series', MusicAlbum: 'MusicAlbum', MusicArtist: 'MusicArtist', Person: 'Person', BoxSet: 'BoxSet', Book: 'Book', Trailer: 'Trailer', MusicVideo: 'MusicVideo' };
    const GROUPS = ['play', 'go', 'organise', 'info', 'manage'];

    let me = null, meFor = null;
    async function user() {
        if (!me || meFor !== uid()) { meFor = uid(); try { me = await c().getCurrentUser(); } catch (e) { me = {}; } }
        return me;
    }
    let themeMenu = null;
    const streams = (item) => (item.MediaStreams || ((item.MediaSources || [])[0] || {}).MediaStreams || []);
    const external = (item) => streams(item).filter((x) => x.Type === 'Subtitle' && x.IsExternal);

    async function menu(ref, where) {
        where = where || {};
        let item = ref;
        try { item = await c().getItem(uid(), ref.Id); } catch (e) { /* what we have */ }
        const pol = (await user()).Policy || {};
        const admin = !!pol.IsAdministrator;
        const ud = item.UserData || {};
        const actions = [];
        const add = (id, label, group, opts) => actions.push(Object.assign({ id, label, group }, opts || {}));
        const playing = !!(T.ctx.queue && T.ctx.nowPlaying && T.ctx.nowPlaying());
        if (VIDEO.has(item.Type) && ud.PlaybackPositionTicks) add('playFromStart', 'Play from the start', 'play');
        if (where.move) add('move', 'Move in this playlist', 'play');
        if (playing && PLAYABLE.has(item.Type)) { add('playNext', 'Play next', 'play'); add('queue', 'Add to queue', 'play'); }
        if (T.ctx.instantMix && AUDIO.has(item.Type)) add('instantMix', 'Instant mix', 'play');
        if (item.Type === 'Audio' && item.AlbumId) add('goAlbum', 'Go to album', 'go');
        if ((item.Type === 'Audio' || item.Type === 'MusicAlbum') && ((item.AlbumArtists || item.ArtistItems || [])[0] || {}).Id) add('goArtist', 'Go to artist', 'go');
        if (item.Type === 'Episode' && item.SeasonId) add('goSeason', 'Go to season', 'go');
        if ((item.Type === 'Episode' || item.Type === 'Season') && item.SeriesId) add('goSeries', 'Go to series', 'go');
        if (PLAYABLE.has(item.Type)) add('addToPlaylist', 'Add to a playlist', 'organise', { dialog: true });
        if (!['Person', 'Playlist', 'BoxSet', 'Season', 'Audio'].includes(item.Type) && (admin || pol.EnableCollectionManagement)) add('addToCollection', 'Add to a collection', 'organise', { dialog: true });
        if (item.UserData && item.Type !== 'Person' && item.Type !== 'MusicArtist') add(ud.Played ? 'unplayed' : 'played', ud.Played ? 'Mark as not watched' : 'Mark as watched', 'organise');
        if (item.UserData) add(ud.IsFavorite ? 'unfavourite' : 'favourite', ud.IsFavorite ? 'Remove from favourites' : 'Favourite', 'organise');
        if (VIDEO.has(item.Type) && ud.PlaybackPositionTicks) add('unresume', 'Remove from Continue Watching', 'organise');
        if (where.playlist && where.playlistItemId) add('removeFromPlaylist', 'Remove from this playlist', 'organise', { danger: true });
        if (where.collection && (admin || pol.EnableCollectionManagement)) add('removeFromCollection', 'Remove from this collection', 'organise', { danger: true });
        if ((item.MediaSources || []).length) add('mediaInfo', 'Media info', 'info', { dialog: true });
        if (VIDEO.has(item.Type) && (admin || pol.EnableSubtitleManagement)) add('subtitles', 'Find subtitles', 'info', { dialog: true });
        if (admin) add('refresh', 'Refresh metadata', 'manage', { dialog: true });
        if (admin) add('edit', 'Edit details', 'manage', { dialog: true });
        if (admin) add('images', 'Edit images', 'manage', { dialog: true });
        if (admin && IDENTIFY[item.Type]) add('identify', 'Identify', 'manage', { dialog: true });
        if (VIDEO.has(item.Type) && (admin || pol.EnableSubtitleManagement) && external(item).length) add('removeSubtitles', 'Remove subtitles', 'manage', { dialog: true });
        if (VIDEO.has(item.Type) || item.Type === 'Audio') add('copyUrl', 'Copy stream URL', 'manage');
        if (item.CanDownload && !item.IsFolder) add('download', 'Download', 'manage');
        if (item.CanDelete) add('delete', 'Delete', 'manage', { danger: true, dialog: true });
        actions.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
        return { item, admin, actions };
    }

    const done = (message, extra) => Object.assign({ ok: true, message, close: true }, extra || {});
    const go = (id) => { const hash = `#/details?id=${id}&serverId=${sid()}`; T.ctx.navigate(hash); return done('', { navigate: hash }); };
    async function run(id, item, where) {
        where = where || {};
        switch (id) {
        case 'playFromStart': T.ctx.play({ ids: [item.Id], serverId: sid(), startPositionTicks: 0 }); return done('');
        case 'move': if (where.move) where.move(); return done('');
        case 'playNext':
        case 'queue': {
            const ok = await T.ctx.queue({ ids: [item.Id], serverId: sid() }, { next: id === 'playNext' });
            return ok ? done(id === 'playNext' ? 'Plays next' : 'Added to the queue') : { ok: false, message: 'Nothing is playing', close: true };
        }
        case 'instantMix': T.ctx.instantMix(item); return done('');
        case 'goAlbum': return go(item.AlbumId);
        case 'goArtist': return go(((item.AlbumArtists || item.ArtistItems || [])[0] || {}).Id);
        case 'goSeason': return go(item.SeasonId);
        case 'goSeries': return go(item.SeriesId);
        case 'played': await c().markPlayed(uid(), item.Id, new Date()); return done('Marked as watched');
        case 'unplayed': await c().markUnplayed(uid(), item.Id); return done('Marked as not watched');
        case 'favourite': await c().updateFavoriteStatus(uid(), item.Id, true); return done('Added to favourites');
        case 'unfavourite': await c().updateFavoriteStatus(uid(), item.Id, false); return done('Removed from favourites');
        case 'unresume':
            // position back to the start, played state unchanged: it leaves Continue Watching
            await post(`UserItems/${item.Id}/UserData`, { userId: uid() }, { PlaybackPositionTicks: 0 });
            return done('Removed from Continue Watching');
        case 'removeFromPlaylist':
            await del(`Playlists/${where.playlist.Id}/Items`, { entryIds: where.playlistItemId });
            if (where.removed) where.removed();
            return done(`Removed from ${where.playlist.Name}`);
        case 'removeFromCollection':
            await del(`Collections/${where.collection.Id}/Items`, { ids: item.Id });
            if (where.removed) where.removed();
            return done(`Removed from ${where.collection.Name}`);
        case 'copyUrl': {
            const url = c().getUrl(`${item.Type === 'Audio' ? 'Audio' : 'Videos'}/${item.Id}/stream`, { static: true, api_key: c().accessToken() });
            const t = document.createElement('textarea');
            t.value = url;
            t.style.cssText = 'position:fixed;left:-9999px';
            document.body.append(t);
            t.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove();
            return ok ? done('Stream URL copied') : { ok: false, message: 'Couldn’t copy the URL', close: true };
        }
        case 'download': {
            const a = document.createElement('a');
            a.href = c().getUrl(`Items/${item.Id}/Download`, { api_key: c().accessToken() });
            a.download = '';
            document.body.append(a);
            a.click();
            a.remove();
            return done('Downloading');
        }
        default: throw new Error(`items: ${id} is a dialog or unknown`);
        }
    }

    const items = (r) => (r && (r.Items || r)) || [];
    const LANGS = [['eng', 'English'], ['spa', 'Spanish'], ['fre', 'French'], ['ger', 'German'], ['ita', 'Italian'], ['por', 'Portuguese'], ['dut', 'Dutch'], ['swe', 'Swedish'],
        ['nor', 'Norwegian'], ['dan', 'Danish'], ['fin', 'Finnish'], ['pol', 'Polish'], ['rus', 'Russian'], ['jpn', 'Japanese'], ['kor', 'Korean'], ['chi', 'Chinese'], ['ara', 'Arabic'], ['tur', 'Turkish']];

    T.ui.items = {
        setMenu(fn) { themeMenu = typeof fn === 'function' ? fn : null; },
        hasMenu: () => !!themeMenu,
        open(item, where) {
            if (themeMenu) return themeMenu(item, where || {});
            location.assign(`#/details?id=${item.Id}&serverId=${sid()}&icefin=stock&icefinmore=1`);
            return null;
        },
        menu,
        run,
        collections: async (type) => items(await c().getItems(uid(), { IncludeItemTypes: type, Recursive: true, SortBy: 'SortName', Limit: 200, Fields: 'ChildCount,PrimaryImageAspectRatio' })),
        async addTo(item, type, target) {
            if (type === 'Playlist') await post(`Playlists/${target.Id}/Items`, { ids: item.Id, userId: uid() });
            else await post(`Collections/${target.Id}/Items`, { ids: item.Id });
            return { ok: true, message: `Added to ${target.Name}` };
        },
        async createWith(item, type, name) {
            name = (name || '').trim();
            if (!name) return { ok: false, message: `Name the new ${type === 'Playlist' ? 'playlist' : 'collection'} first` };
            if (type === 'Playlist') await post('Playlists', null, { Name: name, Ids: [item.Id], UserId: uid() });
            else await post('Collections', { Name: name, Ids: item.Id });
            return { ok: true, message: `Added to ${name}` };
        },
        subtitles: {
            languages: LANGS,
            on: (item) => [...new Set(streams(item).filter((m) => m.Type === 'Subtitle').map((m) => m.DisplayTitle || m.Language).filter(Boolean))],
            search: async (item, code) => { const r = await getJSON(`Items/${item.Id}/RemoteSearch/Subtitles/${code}`); return Array.isArray(r) ? r : []; },
            download: (item, result) => post(`Items/${item.Id}/RemoteSearch/Subtitles/${encodeURIComponent(result.Id)}`),
            external,
            remove: (item, stream) => del(`Videos/${item.Id}/Subtitles/${stream.Index}`)
        },
        mediaInfo(item) {
            return (item.MediaSources || []).map((src) => ({
                title: [src.Name, src.Container, src.Size ? `${(src.Size / 1e9).toFixed(2)} GB` : '', src.Bitrate ? `${Math.round(src.Bitrate / 1e6)} Mbps` : ''].filter(Boolean).join(' · '),
                rows: (src.MediaStreams || []).map((s) => ({
                    type: s.Type,
                    text: (s.Type === 'Video' ? [s.DisplayTitle || s.Codec, s.Width && `${s.Width}×${s.Height}`, s.VideoRangeType, s.BitRate && `${Math.round(s.BitRate / 1e6)} Mbps`]
                        : s.Type === 'Audio' ? [s.DisplayTitle || s.Codec, s.ChannelLayout, s.SampleRate && `${s.SampleRate / 1000} kHz`]
                            : [s.DisplayTitle || s.Codec, s.IsExternal ? 'external' : '']).filter(Boolean).join(' · ')
                }))
            }));
        },
        refreshModes: [
            { id: 'scan', label: 'Scan for new and updated files', sub: 'Keeps what is there' },
            { id: 'missing', label: 'Search for missing metadata', sub: 'Fills in gaps from the providers' },
            { id: 'replace', label: 'Replace all metadata', sub: 'Everything again from the providers; images kept' },
            { id: 'replaceAll', label: 'Replace all metadata and images', sub: 'Everything again' }
        ],
        refresh(item, id) {
            const mode = id === 'scan' ? 'Default' : 'FullRefresh';
            return post(`Items/${item.Id}/Refresh`, { Recursive: true, MetadataRefreshMode: mode, ImageRefreshMode: mode, ReplaceAllMetadata: id === 'replace' || id === 'replaceAll', ReplaceAllImages: id === 'replaceAll' });
        },
        details: {
            read: (item) => c().getItem(uid(), item.Id),
            save: (full) => post(`Items/${full.Id}`, null, full),
            lockFields: [['Name', 'Title'], ['Overview', 'Overview'], ['Genres', 'Genres'], ['OfficialRating', 'Rating'], ['Cast', 'Cast and crew'], ['Tags', 'Tags'], ['Studios', 'Studios'], ['ProductionLocations', 'Countries']]
        },
        images: {
            types: [['Primary', 'Poster'], ['Backdrop', 'Backdrop'], ['Logo', 'Logo'], ['Thumb', 'Thumb']],
            list: async (item, type) => { const r = await getJSON(`Items/${item.Id}/Images`); return (Array.isArray(r) ? r : []).filter((x) => x.ImageType === type); },
            remote: async (item, type) => ((await getJSON(`Items/${item.Id}/RemoteImages`, { type, limit: 24, includeAllLanguages: false })) || {}).Images || [],
            set: (item, type, remote) => post(`Items/${item.Id}/RemoteImages/Download`, { type, imageUrl: remote.Url, providerName: remote.ProviderName }),
            remove: (item, type, index) => del(`Items/${item.Id}/Images/${type}/${index || 0}`),
            url: (item, type, image, maxWidth) => c().getUrl(`Items/${item.Id}/Images/${type}/${image.ImageIndex || 0}`, { maxWidth: maxWidth || 300, tag: image.ImageTag })
        },
        identify: {
            kind: (item) => IDENTIFY[item.Type] || null,
            async search(item, name, year) {
                const info = { Name: (name || '').trim() };
                if (year) info.Year = Number(year);
                const r = await c().ajax({ type: 'POST', url: c().getUrl(`Items/RemoteSearch/${IDENTIFY[item.Type]}`), data: JSON.stringify({ SearchInfo: info, ItemId: item.Id, IncludeDisabledProviders: true }), contentType: 'application/json', dataType: 'json' });
                return Array.isArray(r) ? r : [];
            },
            apply: (item, match) => post(`Items/RemoteSearch/Apply/${item.Id}`, { ReplaceAllImages: true }, match)
        },
        remove: (item) => c().deleteItem(item.Id),
        programme: (id) => getJSON(`LiveTv/Programs/${id}`, { UserId: uid() }),
        recordDefaults: (programId) => getJSON('LiveTv/Timers/Defaults', { programId }),
        async record(programme, series, opts) {
            const d = await getJSON('LiveTv/Timers/Defaults', { programId: programme.Id });
            if (opts && opts.pre != null) { d.PrePaddingSeconds = opts.pre; d.IsPrePaddingRequired = opts.pre > 0; }
            if (opts && opts.post != null) { d.PostPaddingSeconds = opts.post; d.IsPostPaddingRequired = opts.post > 0; }
            if (series && opts && opts.keep != null) d.KeepUpTo = opts.keep;
            await post(series ? 'LiveTv/SeriesTimers' : 'LiveTv/Timers', null, d);
            return { ok: true, message: series ? 'Recording the series' : 'Recording' };
        },
        cancelRecording: (timerId) => del(`LiveTv/Timers/${timerId}`)
    };
})();
