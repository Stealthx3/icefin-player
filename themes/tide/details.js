// Tide: details for every kind of item (PLAN 9.48; the canvas's DetailsMovie, DetailsSeries, DetailsAlbum boards and
// MotionDetails). Opening an item moves its poster to the trail (where it came from) and puts its actions at the fixed
// point as a column, the best one focused (Resume, else Play); chapters, cast, seasons, episodes, tracks, items and the
// filmography open as further columns. The facts sit on the right over the backdrop, faded into the wave. Every
// function of jellyfin-web's page is here: play, resume, from start, trailer, versions, audio and subtitle tracks,
// favourite, played, cast, seasons, episodes, tracks, items, filmography, instant mix, shuffle and the item's options.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinTide;
    if (!T || !D || !D.columnScreen) return;
    D.ownDetails = true;
    const el = D.el;
    const c = () => D.client();
    const uid = () => D.uid();

    const fetchItem = (id) => Promise.resolve(c().getItem(uid(), id));
    const playOpts = (S, extra) => {
        const o = { ids: [S.item.Id], serverId: D.sid() };
        if (S.source) o.mediaSourceId = S.source.Id;
        if (S.audio != null) o.audioStreamIndex = S.audio;
        if (S.subtitle != null) o.subtitleStreamIndex = S.subtitle;
        return Object.assign(o, extra || {});
    };
    const shuffled = (list) => { const s = list.slice(); for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s; };
    async function shuffleOf(it) {
        const kids = await D.items(it.Type === 'MusicArtist' ? { ArtistIds: it.Id, IncludeItemTypes: 'Audio', Limit: 500 } : it.Type === 'Series' ? { ParentId: it.Id, IncludeItemTypes: 'Episode', Limit: 2000 } : { ParentId: it.Id, Limit: 500 });
        if (kids.length) T.ctx.play({ items: shuffled(kids) });
    }
    const streamLabel = (st) => st ? (st.DisplayTitle || [st.Language, st.Codec && st.Codec.toUpperCase(), st.ChannelLayout].filter(Boolean).join(' ')) : '';

    // ---- the root column of an item ----
    async function itemEntries(S, C) {
        const it = S.item;
        const ud = it.UserData || {};
        const out = [];
        const pos = ud.PlaybackPositionTicks || 0;
        const playable = ['Movie', 'Episode', 'Video', 'MusicVideo', 'Trailer', 'Audio', 'Book'].includes(it.Type);
        const reading = it.Type === 'Book';
        if (playable) {
            if (pos) out.push({ name: reading ? 'Continue reading' : 'Resume', sub: `from ${D.clockTicks(pos)}${it.RunTimeTicks ? ` · ${D.left(it)}` : ''}`, progress: ud.PlayedPercentage / 100, icon: 'resume', shape: 'icon', okLabel: reading ? 'read' : 'resume', focusFirst: true, go: () => T.ctx.play(playOpts(S, { startPositionTicks: pos })) });
            out.push({ name: pos ? (reading ? 'From the start' : 'Play from the start') : (reading ? 'Read' : 'Play'), icon: pos ? 'restart' : 'play', shape: 'icon', okLabel: 'play', focusFirst: !pos, go: () => T.ctx.play(playOpts(S, { startPositionTicks: 0 })) });
        }
        if (it.Type === 'Series') {
            let nu = null;
            try { const r = await Promise.resolve(c().getNextUpEpisodes({ UserId: uid(), SeriesId: it.Id, Limit: 1, Fields: D.FIELDS })); nu = r && r.Items && r.Items[0]; } catch (e) { nu = null; }
            if (nu) out.push(Object.assign(D.entry(nu, { resume: true }), { name: `Next up: S${nu.ParentIndexNumber} · E${nu.IndexNumber}`, sub: nu.Name, okLabel: 'play', focusFirst: true, go: () => D.playItem(nu, true) }));
            const seasons = await D.items({ ParentId: it.Id, IncludeItemTypes: 'Season', SortBy: 'SortName', Recursive: false });
            for (const s of seasons) out.push(Object.assign(D.entry(s), { open: () => seasonLevel(s, nu) }));
            out.push({ name: 'Shuffle', icon: 'shuffle', shape: 'icon', go: () => shuffleOf(it) });
        }
        if (it.Type === 'Season') {
            const eps = await episodes(it);
            out.push(...eps);
        }
        if (it.Type === 'MusicAlbum' || it.Type === 'Playlist' || it.Type === 'BoxSet' || it.Type === 'PhotoAlbum' || it.Type === 'Folder' || it.Type === 'MusicArtist' || it.Type === 'MusicGenre') {
            out.push({ name: 'Play all', icon: 'play', shape: 'icon', focusFirst: true, okLabel: 'play', go: () => T.ctx.play({ ids: [it.Id], serverId: D.sid() }) });
            out.push({ name: 'Shuffle', icon: 'shuffle', shape: 'icon', go: () => shuffleOf(it) });
            if (it.Type !== 'BoxSet' && it.Type !== 'PhotoAlbum' && it.Type !== 'Folder') out.push({ name: 'Instant mix', icon: 'mix', shape: 'icon', go: () => T.ctx.instantMix(it) });
        }
        if (it.Type === 'MusicAlbum' || it.Type === 'Playlist' || it.Type === 'BoxSet' || it.Type === 'PhotoAlbum' || it.Type === 'Folder') {
            const kids = await D.items(it.Type === 'MusicAlbum' ? { ParentId: it.Id, SortBy: 'ParentIndexNumber,IndexNumber,SortName', Recursive: true, IncludeItemTypes: 'Audio' }
                : it.Type === 'Playlist' ? { ParentId: it.Id, Recursive: false, SortBy: '' } : { ParentId: it.Id, SortBy: it.Type === 'BoxSet' ? 'ProductionYear,SortName' : 'SortName', Recursive: false });
            const where = it.Type === 'Playlist' ? { playlistId: it.Id } : it.Type === 'BoxSet' ? { collectionId: it.Id } : {};
            kids.forEach((k, n) => {
                const e = D.entry(k, { inSeason: true });
                if (it.Type === 'MusicAlbum') { e.name = `${k.IndexNumber || n + 1}. ${k.Name}`; e.sub = [(k.Artists || []).join(', ') !== it.AlbumArtist ? (k.Artists || []).join(', ') : '', k.RunTimeTicks ? D.clockTicks(k.RunTimeTicks) : ''].filter(Boolean).join(' · '); e.shape = 'icon'; e.icon = 'song'; e.art = ''; }
                if (k.MediaType === 'Audio' || k.Type === 'Photo') e.go = () => T.ctx.play({ items: kids, startIndex: n });
                e.menu = () => D.itemMenu(k, where);
                out.push(e);
            });
        }
        if (it.Type === 'MusicArtist') {
            out.push({ name: 'Albums', icon: 'album', shape: 'icon', open: () => D.listLevel('Albums', 'album', { ArtistIds: it.Id, IncludeItemTypes: 'MusicAlbum', SortBy: 'ProductionYear,SortName', SortOrder: 'Descending' }) });
            out.push({ name: 'Songs', icon: 'song', shape: 'icon', open: () => D.listLevel('Songs', 'song', { ArtistIds: it.Id, IncludeItemTypes: 'Audio' }, { head: D.playAllHead() }) });
            out.push({ name: 'Appears on', icon: 'album', shape: 'icon', open: () => D.listLevel('Appears on', 'album', { ContributingArtistIds: it.Id, IncludeItemTypes: 'MusicAlbum', ExcludeItemIds: it.Id }) });
        }
        if (it.Type === 'Person') {
            out.push({ name: 'Films', icon: 'movies', shape: 'icon', focusFirst: true, open: () => D.listLevel('Films', 'movies', { PersonIds: it.Id, IncludeItemTypes: 'Movie', SortBy: 'ProductionYear,SortName', SortOrder: 'Descending' }) });
            out.push({ name: 'Shows', icon: 'tvshows', shape: 'icon', open: () => D.listLevel('Shows', 'tvshows', { PersonIds: it.Id, IncludeItemTypes: 'Series', SortBy: 'ProductionYear,SortName', SortOrder: 'Descending' }) });
            if (it.Overview) out.push({ name: 'Biography', icon: 'info', shape: 'icon', go: () => D.panel.show({ title: it.Name, path: 'Biography', wide: true, render(b) { b.append(D.note(it.Overview)); } }) });
        }
        // trailers
        if ((it.LocalTrailerCount || 0) > 0) out.push({ name: 'Trailer', icon: 'trailer', shape: 'icon', go: async () => {
            try { const t = await Promise.resolve(c().getLocalTrailers(uid(), it.Id)); if (t && t.length) T.ctx.play({ items: t }); else D.notice('No trailer here', true); } catch (e) { D.notice('No trailer here', true); }
        } });
        // chapters, versions, tracks
        if ((it.Chapters || []).length > 1) out.push({ name: 'Chapters', sub: `${it.Chapters.length}`, icon: 'chapters', shape: 'icon', open: () => chapterLevel(S) });
        const sources = it.MediaSources || [];
        if (sources.length > 1) out.push({ name: 'Version', sub: S.source ? S.source.Name : '', icon: 'versions', shape: 'icon', go: (CC) => pick(S, CC, 'Version', sources.map((s) => [s.Id, s.Name || s.Container]), S.source && S.source.Id, (id) => { S.source = sources.find((s) => s.Id === id); resetTracks(S); }) });
        if (S.source && it.Type !== 'Audio') {
            const audio = (S.source.MediaStreams || []).filter((s) => s.Type === 'Audio');
            const subs = (S.source.MediaStreams || []).filter((s) => s.Type === 'Subtitle');
            if (audio.length) out.push({ name: 'Audio', sub: streamLabel(audio.find((a) => a.Index === S.audio)) || 'default', icon: 'audio', shape: 'icon',
                go: (CC) => pick(S, CC, 'Audio', audio.map((a) => [a.Index, streamLabel(a)]), S.audio, (i) => { S.audio = i; }) });
            if (subs.length || it.Type === 'Movie' || it.Type === 'Episode') out.push({ name: 'Subtitles', sub: S.subtitle == null || S.subtitle < 0 ? 'Off' : streamLabel(subs.find((s) => s.Index === S.subtitle)), icon: 'subtitles', shape: 'icon',
                go: (CC) => pick(S, CC, 'Subtitles', [[-1, 'Off']].concat(subs.map((s) => [s.Index, streamLabel(s)])), S.subtitle == null ? -1 : S.subtitle, (i) => { S.subtitle = i; }) });
        }
        // people, more like this, the series and season of an episode
        if (it.Type === 'Episode' && it.SeriesId) out.push({ name: it.SeriesName || 'The series', sub: 'go to the series', icon: 'tvshows', shape: 'icon', go: () => D.details(it.SeriesId) });
        if ((it.People || []).length) out.push({ name: 'Cast and crew', sub: `${it.People.length}`, icon: 'people', shape: 'icon', open: () => peopleLevel(it) });
        if (['Movie', 'Series', 'MusicAlbum', 'MusicArtist', 'Episode', 'Video', 'MusicVideo', 'Book'].includes(it.Type)) out.push({ name: 'More like this', icon: 'collections', shape: 'icon', open: () => similarLevel(it) });
        if (it.AlbumArtist && it.Type === 'MusicAlbum') out.push({ name: it.AlbumArtist, sub: 'the artist', icon: 'person', shape: 'icon', go: async () => { const a = (it.AlbumArtists || [])[0]; if (a) D.details(a.Id); } });
        // favourite and played, in place (a switch's look)
        if (it.Type !== 'Person' || true) {
            const fav = { name: ud.IsFavorite ? 'Favourite ✓' : 'Add to favourites', icon: 'heart', shape: 'icon', go: async (CC) => {
                const now = !(S.item.UserData || {}).IsFavorite;
                try { await c().updateFavoriteStatus(uid(), it.Id, now); S.item.UserData = Object.assign({}, S.item.UserData, { IsFavorite: now }); fav.name = now ? 'Favourite ✓' : 'Add to favourites'; D.notice(now ? 'Added to favourites' : 'Taken out of favourites'); CC.replaceTop(rootLevel(S)); } catch (e) { D.notice('That didn’t work', true); }
            } };
            out.push(fav);
        }
        if (['Movie', 'Episode', 'Series', 'Season', 'Video', 'MusicVideo', 'Book', 'BoxSet'].includes(it.Type)) out.push({ name: ud.Played ? 'Watched ✓' : 'Mark as watched', icon: 'check', shape: 'icon', go: async (CC) => {
            const now = !(S.item.UserData || {}).Played;
            try { if (now) await c().markPlayed(uid(), it.Id, new Date()); else await c().markUnplayed(uid(), it.Id); S.item.UserData = Object.assign({}, S.item.UserData, { Played: now }); D.notice(now ? 'Marked as watched' : 'Marked as not watched'); CC.replaceTop(rootLevel(S)); } catch (e) { D.notice('That didn’t work', true); }
        } });
        out.push({ name: 'Options…', icon: 'reorder', shape: 'icon', sub: 'add to a playlist, edit, media info, delete', go: () => D.itemMenu(it, {}) });
        // the options of the item itself on ≡, from any of its entries
        for (const e of out) if (!e.menu && !e.item) e.menu = () => D.itemMenu(it, {});
        return out;
    }
    function resetTracks(S) {
        const src = S.source;
        S.audio = src && src.DefaultAudioStreamIndex != null ? src.DefaultAudioStreamIndex : null;
        S.subtitle = src && src.DefaultSubtitleStreamIndex != null ? src.DefaultSubtitleStreamIndex : -1;
    }
    // a picker in the options panel (versions, audio, subtitles): the current one marked
    function pick(S, CC, title, values, at, set) {
        D.panel.show({
            title, path: S.item.Name,
            render(body) {
                for (const [v, label] of values) {
                    const r = D.row(label || String(v), { on: v === at, go: () => { set(v); D.panel.close(); CC.replaceTop(rootLevel(S)); } });
                    if (v === at) r.classList.add('td-row-focus-first');
                    body.append(r);
                }
            }
        });
    }
    async function episodes(season, focusId) {
        const r = await Promise.resolve(c().getEpisodes(season.SeriesId, { UserId: uid(), SeasonId: season.Id, Fields: D.FIELDS }));
        const list = (r && r.Items) || [];
        let first = list.findIndex((e) => e.Id === focusId);
        if (first < 0) first = list.findIndex((e) => !(e.UserData || {}).Played);
        return list.map((ep, k) => Object.assign(D.entry(ep, { inSeason: true }), {
            name: `${ep.IndexNumber != null ? `${ep.IndexNumber} · ` : ''}${ep.Name}`, focusFirst: k === Math.max(0, first), okLabel: 'play',
            go: () => D.playItem(ep, true), open: null, details: () => D.details(ep.Id)
        }));
    }
    const seasonLevel = (s, nu) => ({ title: s.Name, icon: 'episodes', art: D.artOf(s), load: () => episodes(s, nu && nu.SeasonId === s.Id ? nu.Id : null) });
    const chapterLevel = (S) => ({
        title: 'Chapters', icon: 'chapters',
        load: async () => S.item.Chapters.map((ch, k) => ({
            name: ch.Name || `Chapter ${k + 1}`, sub: D.clockTicks(ch.StartPositionTicks), shape: 'wide',
            art: ch.ImageTag ? c().getScaledImageUrl(S.item.Id, { type: 'Chapter', index: k, maxWidth: 400, tag: ch.ImageTag }) : '',
            initials: null, icon: 'chapters', okLabel: 'play from here',
            go: () => T.ctx.play(playOpts(S, { startPositionTicks: ch.StartPositionTicks }))
        }))
    });
    const peopleLevel = (it) => ({
        title: 'Cast and crew', icon: 'people',
        load: async () => (it.People || []).map((p) => ({
            name: p.Name, sub: [p.Role, p.Type !== 'Actor' ? p.Type : ''].filter(Boolean).join(' · '), shape: 'round',
            art: p.PrimaryImageTag ? c().getScaledImageUrl(p.Id, { type: 'Primary', maxWidth: 240, tag: p.PrimaryImageTag }) : '', initials: p.PrimaryImageTag ? null : p.Name,
            icon: 'person', item: { Id: p.Id, Name: p.Name, Type: 'Person' }, go: () => D.details(p.Id)
        }))
    });
    const similarLevel = (it) => ({
        title: 'More like this', icon: 'collections',
        load: async () => { const r = await Promise.resolve(c().getSimilarItems(it.Id, { userId: uid(), limit: 24, fields: D.FIELDS })); return ((r && r.Items) || []).map((x) => D.entry(x)); }
    });

    function rootLevel(S) {
        const it = S.item;
        return {
            title: it.Name, art: D.artOf(it, 300), round: it.Type === 'Person' || it.Type === 'MusicArtist', initials: (it.Type === 'Person' || it.Type === 'MusicArtist') && !(it.ImageTags || {}).Primary ? it.Name : null,
            icon: D.kindIcon(it.Type), count: false, details: true,
            load: (C) => itemEntries(S, C || D.currentColumn)
        };
    }

    // ---- the facts on the right (DetailsMovie board) ----
    function facts(S, host) {
        const it = S.item;
        const box = el('div', 'td-facts');
        box.append(el('div', 'td-facts-title', it.Name));
        const year = it.ProductionYear || '';
        const line1 = [it.Type === 'Episode' ? `${it.SeriesName} · S${it.ParentIndexNumber} · E${it.IndexNumber}` : year, it.RunTimeTicks && it.Type !== 'MusicAlbum' ? D.ticks(it.RunTimeTicks) : '',
            it.OfficialRating, it.CommunityRating ? `★ ${Number(it.CommunityRating).toFixed(1)}` : '', it.CriticRating ? `${it.CriticRating}%` : '',
            it.RunTimeTicks && ['Movie', 'Episode', 'Video'].includes(it.Type) ? `ends at ${D.time(new Date(Date.now() + (it.RunTimeTicks - ((it.UserData || {}).PlaybackPositionTicks || 0)) / 1e4))}` : ''].filter(Boolean).join(' · ');
        if (line1) box.append(el('div', 'td-facts-line', line1));
        const dir = (it.People || []).filter((p) => p.Type === 'Director').map((p) => p.Name).slice(0, 2).join(', ');
        const line2 = [(it.Genres || []).slice(0, 3).join(', '), dir ? `directed by ${dir}` : '', (it.Studios || [])[0] ? it.Studios[0].Name : '', it.AlbumArtist || '',
            it.Type === 'Series' && it.Status ? it.Status : ''].filter(Boolean).join(' · ');
        if (line2) box.append(el('div', 'td-facts-line', line2));
        if ((it.Taglines || [])[0]) box.append(el('div', 'td-facts-tagline', it.Taglines[0]));
        if (it.Overview) box.append(el('div', 'td-facts-overview', it.Overview));
        host.append(box);
        // the backdrop, faded into the wave
        const tag = (it.BackdropImageTags || [])[0];
        const pid = tag ? it.Id : it.ParentBackdropItemId;
        const ptag = tag || (it.ParentBackdropImageTags || [])[0];
        if (pid && ptag) {
            const b = el('div', 'td-details-back');
            b.style.backgroundImage = `url("${c().getScaledImageUrl(pid, { type: 'Backdrop', maxWidth: 1600, tag: ptag })}")`;
            host.prepend(b);
        }
        return box;
    }

    // ---- the screen: #/details?id= ----
    let S = null;
    D.register('#/details', {
        async mount(root) {
            const id = D.params().get('id');
            const me = S = { item: null, C: null, root };
            root.setAttribute('data-td-screen', 'details');
            let it;
            try { it = await fetchItem(id); } catch (e) { it = null; }
            if (S !== me) return;
            if (!it) { T.ctx.navigate('#/home'); return; }
            if (it.Type === 'TvChannel' || it.Type === 'Program') { if (D.programmeScreen) { D.programmeScreen(root, it); return; } }
            me.item = it;
            me.source = (it.MediaSources || [])[0] || null;
            resetTracks(me);
            const flight = D.flight && D.flight.id === it.Id ? D.flight : null;
            D.flight = null;
            me.C = D.columns(root, { root: rootLevel(me), name: 'details', key: `#/details?id=${id}`, backdrops: false, selfInTrail: true,
                onLevel: (lv) => { if (me.facts) me.facts.hidden = !lv.details; } });
            me.facts = facts(me, root);
            root.setAttribute('data-icefin-details-ready', '1');
            // the poster flies from where it was focused into the trail (MotionDetails)
            const slot = root.querySelector('.td-trail-step.near > :first-child');
            if (flight && slot && !D.reduced()) {
                const ghost = el('div', 'td-e-thumb has-art');
                ghost.style.backgroundImage = flight.art;
                Object.assign(ghost.style, { position: 'fixed', left: `${flight.rect.left}px`, top: `${flight.rect.top}px`, width: `${flight.rect.width}px`, height: `${flight.rect.height}px`, transform: 'none' });
                document.body.append(ghost);
                slot.style.opacity = '0';
                D.fly(ghost, slot.getBoundingClientRect(), 360, () => { ghost.remove(); slot.style.opacity = ''; });
            }
        },
        unmount() { if (S && S.C) S.C.stop(); S = null; },
        onAction(a) { return S && S.C ? S.C.onAction(a) : a === 'back' ? false : true; },
        onBack() { return S && S.C ? S.C.onAction('back') : false; }
    });
    D.screenItem = () => (S && S.item) || null;
})();
