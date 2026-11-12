// Plaza's own item menu and its dialogs (PLAN 9.44, the walk's mock-ups; no jellyfin-web left but the dashboard):
// More options on the details page, and ≡ on any item in Plaza's grids, open a Plaza card over a dimmed screen (the
// engine's modal overlay, so the remote stays inside it on any screen). Each action talks to the server through the
// theme script API's client: play from the start, add to a playlist or a collection, mark played, favourite, find
// subtitles, media info, refresh metadata, edit details, identify, download and delete. What a user may do follows
// their policy and the item (administrators edit, refresh and identify; CanDelete, CanDownload).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const P = window.icefinPlaza;
    if (!T || !T.ui || !T.ui.overlay || !P) return;
    const ui = T.ui;
    const el = P.el;
    const KIND = { Movie: 'movies', BoxSet: 'boxsets', Series: 'tvshows', Season: 'tvshows', Episode: 'tvshows', MusicAlbum: 'music', MusicArtist: 'music', Audio: 'music',
        Playlist: 'playlists', Person: 'folder', Photo: 'photos', Video: 'homevideos', Book: 'books' };
    const PLAYABLE = new Set(['Movie', 'Episode', 'Video', 'MusicVideo', 'Audio', 'Trailer', 'Series', 'Season', 'MusicAlbum', 'MusicArtist', 'BoxSet', 'Playlist']);
    const VIDEO = new Set(['Movie', 'Episode', 'Video', 'MusicVideo', 'Trailer']);
    const IDENTIFY = { Movie: 'Movie', Series: 'Series', MusicAlbum: 'MusicAlbum', MusicArtist: 'MusicArtist', Person: 'Person', BoxSet: 'BoxSet', Book: 'Book', Trailer: 'Trailer', MusicVideo: 'MusicVideo' };
    const c = () => P.client();
    const uid = () => P.uid();
    const post = (path, query, body) => c().ajax({ type: 'POST', url: c().getUrl(path, query), data: body ? JSON.stringify(body) : undefined, contentType: body ? 'application/json' : undefined });
    const getJSON = (path, query) => c().getJSON(c().getUrl(path, query));
    let me = null;
    const user = async () => { if (!me) { try { me = await c().getCurrentUser(); } catch (e) { me = {}; } } return me; };

    // ---- a notice: a pill above the bar for a few seconds ----
    P.toast = (text, bad) => {
        const t = el('div', 'pz-toast' + (bad ? ' pz-toast-bad' : ''), text);
        document.body.append(t);
        setTimeout(() => t.classList.add('pz-toast-out'), 2600);
        setTimeout(() => t.remove(), 3100);
        T.ctx.sound(bad ? 'error' : 'select');
    };

    // ---- a Plaza card over everything (the engine's modal overlay) ----
    // spec: {title, kind, wide, danger, render(body, sheet)}; sheet.show(spec) replaces the card, sheet.close() closes.
    let host = null;
    const sheet = {
        show(spec) {
            if (!host) {
                ui.overlay.set({ mount(h) { host = h; draw(spec); }, unmount() { host = null; } });
                ui.overlay.open();
            } else draw(spec);
        },
        close() { ui.overlay.close(); }
    };
    P.sheet = sheet;
    function draw(spec) {
        host.textContent = '';
        host.className = 'pz-sheet-host';
        const dim = el('div', 'pz-sheet-dim');
        dim.addEventListener('click', () => sheet.close());
        const card = el('div', 'pz-sheet-card pz-k-' + (spec.kind || 'folder') + (spec.wide ? ' pz-sheet-wide' : '') + (spec.danger ? ' pz-sheet-danger' : ''));
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-label', spec.title);
        card.append(el('div', 'pz-dlg-tab pz-sheet-tab', spec.title));
        const body = el('div', 'pz-sheet-body');
        card.append(body);
        host.append(dim, card);
        // focus the first thing in the card, once it has loaded (some cards fetch their lists first)
        const focusFirst = () => { if (!card.isConnected || body.querySelector('.icefin-focused')) return; const f = body.querySelector('[data-icefin-focus]'); if (f) T.ctx.focus(f); };
        Promise.resolve(spec.render(body, sheet)).then(focusFirst, focusFirst);
        focusFirst();
    }
    // building blocks
    const row = (label, opts = {}) => {
        const r = P.focusable(el('div', 'pz-sheet-row' + (opts.danger ? ' pz-sheet-row-danger' : '') + (opts.on ? ' pz-sheet-row-on' : '')));
        r.append(el('span', 'pz-sheet-row-label', label));
        if (opts.sub) r.append(el('span', 'pz-sheet-row-sub', opts.sub));
        if (opts.art) { const a = el('span', 'pz-sheet-row-art'); P.bg(a, opts.art); r.prepend(a); }
        if (opts.go) r.addEventListener('click', opts.go);
        return r;
    };
    const button = (label, go, main) => { const b = P.focusable(el('div', 'pz-tab pz-sheet-btn' + (main ? ' pz-tab-on' : ''), label)); b.addEventListener('click', go); return b; };
    const field = (label, value, opts = {}) => {
        const l = el('label', 'pz-field');
        const i = el(opts.multiline ? 'textarea' : 'input', 'pz-input' + (opts.multiline ? ' pz-textarea' : ''));
        if (!opts.multiline) i.type = opts.type || 'text';
        i.value = value == null ? '' : String(value);
        if (opts.placeholder) i.placeholder = opts.placeholder;
        P.focusable(i);
        l.append(el('span', 'pz-field-label', label), i);
        l.input = i;
        return l;
    };
    const note = (text) => el('div', 'pz-sheet-note', text);
    const foot = (...buttons) => { const f = el('div', 'pz-panel-foot pz-sheet-foot'); f.append(...buttons); return f; };
    const kindOf = (it) => KIND[it.Type] || 'folder';
    const busy = (body, text) => { body.textContent = ''; body.append(note(text || 'One moment…')); };

    // ---- the menu ----
    const AUDIO = new Set(['Audio', 'MusicAlbum', 'MusicArtist', 'Playlist', 'MusicGenre']);
    const del = (path, query) => c().ajax({ type: 'DELETE', url: c().getUrl(path, query) });
    // where: the context the menu opened in: {playlist, playlistItemId, collection, move()} (9.44)
    P.itemMenu = async (ref, where) => {
        where = where || {};
        let item = ref;
        try { item = await c().getItem(uid(), ref.Id); } catch (e) { /* use what we have */ }
        const u = await user();
        const pol = u.Policy || {};
        const admin = !!pol.IsAdministrator;
        const ud = item.UserData || {};
        const rows = [];
        const add = (label, go, opts) => rows.push(row(label, Object.assign({ go }, opts || {})));
        if (VIDEO.has(item.Type) && ud.PlaybackPositionTicks) add('Play from the start', () => { sheet.close(); T.ctx.play({ ids: [item.Id], serverId: P.sid(), startPositionTicks: 0 }); });
        if (where.move) add('Move in this playlist', () => { sheet.close(); where.move(); });
        // the queue, while something plays
        if (T.ctx.queue && T.ctx.nowPlaying() && PLAYABLE.has(item.Type)) {
            add('▶ Play next', () => queue(item, true));
            add('Add to queue', () => queue(item, false));
        }
        if (T.ctx.instantMix && AUDIO.has(item.Type)) add('Instant mix', () => { sheet.close(); T.ctx.instantMix(item); });
        // go to what it belongs to
        const goto = (label, id) => { if (id) add(label, () => { sheet.close(); T.ctx.navigate(`#/details?id=${id}&serverId=${P.sid()}`); }); };
        if (item.Type === 'Audio') goto('Go to album', item.AlbumId);
        if (item.Type === 'Audio' || item.Type === 'MusicAlbum') goto('Go to artist', ((item.AlbumArtists || item.ArtistItems || [])[0] || {}).Id);
        if (item.Type === 'Episode') goto('Go to season', item.SeasonId);
        if (item.Type === 'Episode' || item.Type === 'Season') goto('Go to series', item.SeriesId);
        if (PLAYABLE.has(item.Type)) add('Add to a playlist', () => addTo(item, 'Playlist'));
        if (!['Person', 'Playlist', 'BoxSet', 'Season', 'Audio'].includes(item.Type) && (admin || pol.EnableCollectionManagement)) add('Add to a collection', () => addTo(item, 'BoxSet'));
        if (item.UserData && item.Type !== 'Person' && item.Type !== 'MusicArtist') add(ud.Played ? 'Mark as not watched' : '✓ Mark as watched', () => played(item, !ud.Played));
        if (item.UserData) add(ud.IsFavorite ? '★ Remove from favourites' : '★ Favourite', () => favourite(item, !ud.IsFavorite));
        if (VIDEO.has(item.Type) && ud.PlaybackPositionTicks) add('Remove from Continue Watching', () => unresume(item));
        if (where.playlist && where.playlistItemId) add('Remove from this playlist', () => removeFrom(item, where), { danger: true });
        if (where.collection && (admin || pol.EnableCollectionManagement)) add('Remove from this collection', () => removeFrom(item, where), { danger: true });
        if (VIDEO.has(item.Type) && (admin || pol.EnableSubtitleManagement)) add('Find subtitles', () => findSubtitles(item));
        if ((item.MediaSources || []).length) add('Media info', () => mediaInfo(item));
        if (admin) add('Refresh metadata', () => refresh(item));
        if (admin) add('Edit details', () => editDetails(item));
        if (admin) add('Edit images', () => editImages(item));
        if (VIDEO.has(item.Type) && (admin || pol.EnableSubtitleManagement) && externalSubs(item).length) add('Remove subtitles', () => removeSubtitles(item));
        if (VIDEO.has(item.Type) || item.Type === 'Audio') add('Copy stream URL', () => copyUrl(item));
        if (admin && IDENTIFY[item.Type]) add('Identify', () => identify(item));
        if (item.CanDownload && !item.IsFolder) add('Download', () => download(item));
        if (item.CanDelete) add('Delete…', () => remove(item), { danger: true });
        if (!rows.length) { P.toast('Nothing to do with this item', true); return; }
        sheet.show({
            title: item.Name || 'Item', kind: kindOf(item), wide: rows.length > 6,
            render(body) {
                const list = el('div', 'pz-sheet-rows' + (rows.length > 6 ? ' pz-sheet-cols' : ''));
                list.append(...rows);
                body.append(list);
            }
        });
    };

    // ---- the actions ----
    async function queue(item, next) {
        const ok = await T.ctx.queue({ ids: [item.Id], serverId: P.sid() }, { next });
        sheet.close();
        P.toast(ok ? (next ? 'Plays next' : 'Added to the queue') : 'Nothing is playing', !ok);
    }
    async function unresume(item) {
        // position back to the start, played state unchanged: it leaves Continue Watching
        try { await post(`UserItems/${item.Id}/UserData`, { userId: uid() }, { PlaybackPositionTicks: 0 }); sheet.close(); P.toast('Removed from Continue Watching'); }
        catch (e) { P.toast('That didn’t work', true); }
    }
    async function removeFrom(item, where) {
        try {
            if (where.playlist) await del(`Playlists/${where.playlist.Id}/Items`, { entryIds: where.playlistItemId });
            else await del(`Collections/${where.collection.Id}/Items`, { ids: item.Id });
            sheet.close();
            P.toast(`Removed from ${(where.playlist || where.collection).Name}`);
            if (where.removed) where.removed();
        } catch (e) { P.toast('That didn’t work', true); }
    }
    const externalSubs = (item) => ((item.MediaSources || [])[0] || {}).MediaStreams ? item.MediaSources[0].MediaStreams.filter((x) => x.Type === 'Subtitle' && x.IsExternal) : [];
    function removeSubtitles(item) {
        sheet.show({
            title: 'Remove subtitles', kind: kindOf(item),
            render(body) {
                const list = el('div', 'pz-sheet-rows');
                for (const st of externalSubs(item)) list.append(row(st.DisplayTitle || st.Language || `Subtitles ${st.Index}`, { sub: st.Path ? st.Path.split('/').pop() : '', go: async () => {
                    try { await del(`Videos/${item.Id}/Subtitles/${st.Index}`); sheet.close(); P.toast('Subtitles removed'); } catch (e) { P.toast('That didn’t work', true); }
                } }));
                body.append(note('Pick the subtitles to remove from the server.'), list, foot(button('Cancel', () => sheet.close())));
            }
        });
    }
    function copyUrl(item) {
        const kind = item.Type === 'Audio' ? 'Audio' : 'Videos';
        const url = c().getUrl(`${kind}/${item.Id}/stream`, { static: true, api_key: c().accessToken() });
        const t = el('textarea');
        t.value = url;
        t.style.cssText = 'position:fixed;left:-9999px';
        document.body.append(t);
        t.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        t.remove();
        sheet.close();
        P.toast(ok ? 'Stream URL copied' : 'Couldn’t copy the URL', !ok);
    }
    // images: what the item has (delete any), and the providers' for its main ones
    function editImages(item, type) {
        sheet.show({
            title: 'Edit images', kind: kindOf(item), wide: true,
            async render(body) {
                const tabs = el('div', 'pz-panel-pills');
                for (const t of ['Primary', 'Backdrop', 'Logo', 'Thumb']) { const b = button(t === 'Primary' ? 'Poster' : t, () => editImages(item, t), t === (type || 'Primary')); tabs.append(b); }
                const have = el('div', 'pz-sheet-images');
                const found = el('div', 'pz-sheet-images pz-sheet-scroll');
                body.append(tabs, el('div', 'pz-panel-label', 'On the server'), have, el('div', 'pz-panel-label', 'From the providers'), found, foot(button('Close', () => sheet.close())));
                const t = type || 'Primary';
                const imgs = (await P.safe(getJSON(`Items/${item.Id}/Images`))) || [];
                for (const im of (Array.isArray(imgs) ? imgs : []).filter((x) => x.ImageType === t)) {
                    const cell = P.focusable(el('div', 'pz-sheet-image'));
                    P.bg(cell, c().getUrl(`Items/${item.Id}/Images/${t}/${im.ImageIndex || 0}`, { maxWidth: 300, tag: im.ImageTag }));
                    cell.append(el('span', 'pz-sheet-image-label', 'Delete'));
                    cell.addEventListener('click', async () => { try { await del(`Items/${item.Id}/Images/${t}/${im.ImageIndex || 0}`); P.toast('Image deleted'); editImages(item, t); } catch (e) { P.toast('That didn’t work', true); } });
                    have.append(cell);
                }
                if (!have.childElementCount) have.append(note('None yet.'));
                found.append(note('Searching…'));
                const r = await P.safe(getJSON(`Items/${item.Id}/RemoteImages`, { type: t, limit: 24, includeAllLanguages: false }));
                found.textContent = '';
                for (const im of (r.Images || []).slice(0, 24)) {
                    const cell = P.focusable(el('div', 'pz-sheet-image'));
                    P.bg(cell, im.ThumbnailUrl || im.Url);
                    cell.append(el('span', 'pz-sheet-image-label', [im.ProviderName, im.Width && `${im.Width}×${im.Height}`].filter(Boolean).join(' · ')));
                    cell.addEventListener('click', async () => {
                        try { await post(`Items/${item.Id}/RemoteImages/Download`, { type: t, imageUrl: im.Url, providerName: im.ProviderName }); P.toast('Image set'); editImages(item, t); }
                        catch (e) { P.toast('That didn’t work', true); }
                    });
                    found.append(cell);
                }
                if (!found.childElementCount) found.append(note('The providers have none.'));
            }
        });
    }

    // ---- a Live TV programme, from the guide (9.44): watch it, record it or its series ----
    P.programmeCard = async (programId, channel) => {
        let pr = null;
        try { pr = await c().getJSON(c().getUrl(`LiveTv/Programs/${programId}`, { UserId: uid() })); } catch (e) { pr = null; }
        if (!pr) { P.toast('No details for this programme', true); return; }
        const now = Date.now(), on = Date.parse(pr.StartDate) <= now && Date.parse(pr.EndDate) > now;
        sheet.show({
            title: [channel && channel.ChannelNumber ? `CH ${channel.ChannelNumber}` : (pr.ChannelName || ''), P.time(pr.StartDate)].filter(Boolean).join(' · '), kind: 'livetv', wide: true,
            render(body) {
                const top = el('div', 'pz-sheet-prog');
                const pic = el('div', 'pz-sheet-prog-art');
                P.bg(pic, P.thumbArt(pr, 600) || (channel && P.thumbArt(channel, 600)));
                const info = el('div', 'pz-sheet-prog-info');
                info.append(el('div', 'pz-kicker', `${on ? 'ON NOW' : 'ON LATER'} · ${P.time(pr.StartDate)} – ${P.time(pr.EndDate)}`), el('div', 'pz-sheet-question', pr.Name || ''),
                    note([pr.EpisodeTitle, pr.IndexNumber != null && pr.ParentIndexNumber != null ? `S${pr.ParentIndexNumber} E${pr.IndexNumber}` : '', (pr.Genres || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ')),
                    note(pr.Overview || ''));
                top.append(pic, info);
                const actions = el('div', 'pz-panel-foot');
                if (on || channel) actions.append(button('Watch', () => { sheet.close(); P.play(channel || { Id: pr.ChannelId }, true); }, on));
                if (pr.TimerId) actions.append(button('Cancel the recording', async () => { try { await del(`LiveTv/Timers/${pr.TimerId}`); sheet.close(); P.toast('Recording cancelled'); } catch (e) { P.toast('That didn’t work', true); } }));
                else actions.append(button('Record', () => record(pr, false), !on));
                if (pr.IsSeries && !pr.SeriesTimerId) actions.append(button('Record the series', () => record(pr, true)));
                body.append(top, actions);
            }
        });
    };
    async function record(pr, series) {
        try {
            const d = await c().getJSON(c().getUrl('LiveTv/Timers/Defaults', { programId: pr.Id }));
            if (series) await post('LiveTv/SeriesTimers', null, d); else await post('LiveTv/Timers', null, d);
            sheet.close();
            P.toast(series ? 'Recording the series' : 'Recording');
        } catch (e) { P.toast('That didn’t work', true); }
    }
    async function played(item, on) {
        try { if (on) await c().markPlayed(uid(), item.Id, new Date()); else await c().markUnplayed(uid(), item.Id); sheet.close(); P.toast(on ? 'Marked as watched' : 'Marked as not watched'); }
        catch (e) { P.toast('That didn’t work', true); }
    }
    async function favourite(item, on) {
        try { await c().updateFavoriteStatus(uid(), item.Id, on); sheet.close(); P.toast(on ? 'Added to favourites' : 'Removed from favourites'); }
        catch (e) { P.toast('That didn’t work', true); }
    }
    // add to a playlist (Playlist) or a collection (BoxSet): the existing ones, or a new one by name
    async function addTo(item, type) {
        const word = type === 'Playlist' ? 'playlist' : 'collection';
        sheet.show({
            title: `Add to a ${word}`, kind: type === 'Playlist' ? 'playlists' : 'boxsets', wide: true,
            async render(body) {
                busy(body);
                const r = await P.safe(c().getItems(uid(), { IncludeItemTypes: type, Recursive: true, SortBy: 'SortName', Limit: 200, Fields: 'ChildCount' }));
                body.textContent = '';
                const list = el('div', 'pz-sheet-rows pz-sheet-cols pz-sheet-scroll');
                for (const x of P.items(r)) list.append(row(x.Name, { sub: x.ChildCount != null ? P.count(x.ChildCount, 'item') : '', art: P.posterArt(x, 120), go: () => put(x) }));
                if (!list.childElementCount) list.append(note(`No ${word}s yet: name a new one below.`));
                const name = field(`Or a new ${word}, named`, '', { placeholder: type === 'Playlist' ? 'Road trip' : 'Favourites of 2026' });
                body.append(list, name, foot(button('Add', () => make(name.input.value), true), button('Cancel', () => sheet.close())));
            }
        });
        const ids = [item.Id];
        async function put(target) {
            try {
                if (type === 'Playlist') await post(`Playlists/${target.Id}/Items`, { ids: ids.join(','), userId: uid() });
                else await post(`Collections/${target.Id}/Items`, { ids: ids.join(',') });
                sheet.close();
                P.toast(`Added to ${target.Name}`);
            } catch (e) { P.toast('That didn’t work', true); }
        }
        async function make(name) {
            name = (name || '').trim();
            if (!name) { P.toast(`Name the new ${word} first`, true); return; }
            try {
                if (type === 'Playlist') await post('Playlists', null, { Name: name, Ids: ids, UserId: uid() });
                else await post('Collections', { Name: name, Ids: ids.join(',') });
                sheet.close();
                P.toast(`Added to ${name}`);
            } catch (e) { P.toast('That didn’t work', true); }
        }
    }
    // subtitles from the server's providers, in a language
    const LANGS = [['eng', 'English'], ['spa', 'Spanish'], ['fre', 'French'], ['ger', 'German'], ['ita', 'Italian'], ['por', 'Portuguese'], ['dut', 'Dutch'], ['swe', 'Swedish'],
        ['nor', 'Norwegian'], ['dan', 'Danish'], ['fin', 'Finnish'], ['pol', 'Polish'], ['rus', 'Russian'], ['jpn', 'Japanese'], ['kor', 'Korean'], ['chi', 'Chinese'], ['ara', 'Arabic'], ['tur', 'Turkish']];
    function findSubtitles(item, langIndex) {
        let li = langIndex || 0;
        sheet.show({
            title: 'Find subtitles', kind: kindOf(item), wide: true,
            async render(body) {
                const step = P.focusable(el('div', 'pz-stepper'));
                const val = el('span', 'pz-stepper-val', LANGS[li][1]);
                step.append(el('span', 'pz-stepper-arrow pz-l'), val, el('span', 'pz-stepper-arrow pz-r'));
                step.addEventListener('click', () => findSubtitles(item, (li + 1) % LANGS.length));
                const results = el('div', 'pz-sheet-rows pz-sheet-scroll');
                body.append(el('div', 'pz-panel-label', `Language (Ⓐ for the next one), for ${item.Name}`), step, results, foot(button('Close', () => sheet.close())));
                results.append(note('Searching…'));
                const r = await P.safe(getJSON(`Items/${item.Id}/RemoteSearch/Subtitles/${LANGS[li][0]}`));
                results.textContent = '';
                const list = Array.isArray(r) ? r : [];
                if (!list.length) { results.append(note('Nothing found in this language. Ⓐ on the language tries the next one.')); return; }
                for (const s of list.slice(0, 30)) {
                    const sub = [s.ProviderName, s.Format, s.CommunityRating ? `★ ${Number(s.CommunityRating).toFixed(1)}` : '', s.DownloadCount ? `${s.DownloadCount} downloads` : '', s.IsHashMatch ? 'exact match' : ''].filter(Boolean).join(' · ');
                    results.append(row(s.Name || s.Id, { sub, go: async () => {
                        try { await post(`Items/${item.Id}/RemoteSearch/Subtitles/${encodeURIComponent(s.Id)}`); sheet.close(); P.toast('Downloading the subtitles'); }
                        catch (e) { P.toast('That didn’t work', true); }
                    } }));
                }
            },
        });
    }
    function mediaInfo(item) {
        sheet.show({
            title: 'Media info', kind: kindOf(item), wide: true,
            render(body) {
                const list = el('div', 'pz-sheet-info pz-sheet-scroll');
                for (const src of item.MediaSources || []) {
                    list.append(el('div', 'pz-sheet-info-head', [src.Name, src.Container, src.Size ? `${(src.Size / 1e9).toFixed(2)} GB` : '', src.Bitrate ? `${Math.round(src.Bitrate / 1e6)} Mbps` : ''].filter(Boolean).join(' · ')));
                    for (const s of src.MediaStreams || []) {
                        const parts = s.Type === 'Video' ? [s.DisplayTitle || s.Codec, s.Width && `${s.Width}×${s.Height}`, s.VideoRangeType, s.BitRate && `${Math.round(s.BitRate / 1e6)} Mbps`]
                            : s.Type === 'Audio' ? [s.DisplayTitle || s.Codec, s.ChannelLayout, s.SampleRate && `${s.SampleRate / 1000} kHz`]
                                : [s.DisplayTitle || s.Codec, s.IsExternal ? 'external' : ''];
                        list.append(el('div', 'pz-sheet-info-row', `${s.Type}: ${parts.filter(Boolean).join(' · ')}`));
                    }
                }
                body.append(list, foot(button('Close', () => sheet.close(), true)));
            }
        });
    }
    function refresh(item) {
        const go = async (mode, all, images) => {
            try {
                await post(`Items/${item.Id}/Refresh`, { Recursive: true, MetadataRefreshMode: mode, ImageRefreshMode: mode, ReplaceAllMetadata: !!all, ReplaceAllImages: !!images });
                sheet.close();
                P.toast('Refreshing; it updates when the server is done');
            } catch (e) { P.toast('That didn’t work', true); }
        };
        sheet.show({
            title: 'Refresh metadata', kind: kindOf(item),
            render(body) {
                const list = el('div', 'pz-sheet-rows');
                list.append(row('Scan for new and updated files', { sub: 'Keeps what is there', go: () => go('Default') }),
                    row('Search for missing metadata', { sub: 'Fills in gaps from the providers', go: () => go('FullRefresh') }),
                    row('Replace all metadata', { sub: 'Everything again from the providers; images kept', go: () => go('FullRefresh', true) }),
                    row('Replace all metadata and images', { sub: 'Everything again', go: () => go('FullRefresh', true, true) }));
                body.append(list, foot(button('Cancel', () => sheet.close())));
            }
        });
    }
    function editDetails(item) {
        sheet.show({
            title: 'Edit details', kind: kindOf(item), wide: true,
            render(body) {
                const f = {
                    Name: field('Title', item.Name), ForcedSortName: field('Sort title', item.ForcedSortName || item.SortName), OriginalTitle: field('Original title', item.OriginalTitle),
                    ProductionYear: field('Year', item.ProductionYear, { type: 'number' }), OfficialRating: field('Rating', item.OfficialRating), CommunityRating: field('Community rating', item.CommunityRating, { type: 'number' }),
                    Genres: field('Genres, separated by commas', (item.Genres || []).join(', ')), Tags: field('Tags, separated by commas', (item.Tags || []).join(', ')),
                    Overview: field('Overview', item.Overview, { multiline: true })
                };
                const grid = el('div', 'pz-sheet-form pz-sheet-scroll');
                grid.append(...Object.values(f));
                body.append(grid, foot(button('Save', save, true), button('Cancel', () => sheet.close())));
                async function save() {
                    try {
                        const full = await c().getItem(uid(), item.Id);
                        const v = (k) => f[k].input.value.trim();
                        Object.assign(full, { Name: v('Name'), ForcedSortName: v('ForcedSortName'), OriginalTitle: v('OriginalTitle'), OfficialRating: v('OfficialRating'), Overview: f.Overview.input.value,
                            ProductionYear: v('ProductionYear') ? Number(v('ProductionYear')) : null, CommunityRating: v('CommunityRating') ? Number(v('CommunityRating')) : null,
                            Genres: v('Genres').split(',').map((x) => x.trim()).filter(Boolean), Tags: v('Tags').split(',').map((x) => x.trim()).filter(Boolean) });
                        await post(`Items/${item.Id}`, null, full);
                        sheet.close();
                        P.toast('Saved');
                    } catch (e) { P.toast('That didn’t work', true); }
                }
            }
        });
    }
    function identify(item) {
        sheet.show({
            title: 'Identify', kind: kindOf(item), wide: true,
            render(body) {
                const name = field('Name', item.Name);
                const year = field('Year', item.ProductionYear, { type: 'number' });
                const results = el('div', 'pz-sheet-rows pz-sheet-scroll');
                const search = async () => {
                    results.textContent = '';
                    results.append(note('Searching…'));
                    const info = { Name: name.input.value.trim() };
                    if (year.input.value) info.Year = Number(year.input.value);
                    let r = [];
                    try { r = await c().ajax({ type: 'POST', url: c().getUrl(`Items/RemoteSearch/${IDENTIFY[item.Type]}`), data: JSON.stringify({ SearchInfo: info, ItemId: item.Id, IncludeDisabledProviders: true }), contentType: 'application/json', dataType: 'json' }); } catch (e) { r = []; }
                    results.textContent = '';
                    if (!r || !r.length) { results.append(note('No matches. Change the name or year and search again.')); return; }
                    for (const m of r.slice(0, 20)) {
                        results.append(row(m.Name, { sub: [m.ProductionYear, m.SearchProviderName].filter(Boolean).join(' · '), art: m.ImageUrl || '', go: async () => {
                            try { await post(`Items/RemoteSearch/Apply/${item.Id}`, { ReplaceAllImages: true }, m); sheet.close(); P.toast(`Identified as ${m.Name}; the details follow shortly`); }
                            catch (e) { P.toast('That didn’t work', true); }
                        } }));
                    }
                    const f = results.querySelector('[data-icefin-focus]');
                    if (f) T.ctx.focus(f);
                };
                const fields = el('div', 'pz-sheet-inline');
                fields.append(name, year, button('Search', search, true));
                body.append(fields, results, foot(button('Cancel', () => sheet.close())));
                search();
            }
        });
    }
    function download(item) {
        const a = el('a');
        a.href = c().getUrl(`Items/${item.Id}/Download`, { api_key: c().accessToken() });
        a.download = '';
        document.body.append(a);
        a.click();
        a.remove();
        sheet.close();
        P.toast('Downloading');
    }
    function remove(item) {
        sheet.show({
            title: 'Delete', kind: kindOf(item), danger: true,
            render(body) {
                body.append(el('div', 'pz-sheet-question', `Delete ${item.Name}?`),
                    note('It goes from the server and its files from the disk, for everyone. This can’t be undone.'),
                    foot(button('Keep it', () => sheet.close(), true), button('Delete', async () => {
                        try { await c().deleteItem(item.Id); sheet.close(); P.toast(`Deleted ${item.Name}`); if (/^#\/details/.test(location.hash)) history.back(); }
                        catch (e) { P.toast('That didn’t work', true); }
                    })));
            }
        });
    }

})();
