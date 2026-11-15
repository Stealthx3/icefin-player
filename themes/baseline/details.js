// Baseline: details as stock's TV layout draws them (#/details): the poster at the left (25vw), the ribbon at 32.45vw
// (the name, the info line, the buttons: Play, Replay, Download, Trailer, Instant Mix, Shuffle, Played, Favorite, More),
// the track selects (Version, Video, Audio, Subtitles), the item's facts and overview, the item's own lists (Next Up,
// Seasons, Episodes, tracks, a person's or a collection's items, a channel's programmes), then the full-width rows
// (Collections, Cast & Crew, More Like This). Focus lands on Play (Resume first), as stock's does.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const B = window.icefinBaseline;
    if (!T || !B || !B.panel) return;
    const el = B.el;
    const c = () => B.client();
    const uid = () => B.uid();

    const fetchItem = (id) => Promise.resolve(c().getItem(uid(), id));
    const streamLabel = (s) => (s ? (s.DisplayTitle || [s.Language, s.Codec && s.Codec.toUpperCase()].filter(Boolean).join(' ')) : '');
    const detailBtn = (icon, title, go, o) => {
        const b = B.btn('bl-dbtn' + (o && o.cls ? ` ${o.cls}` : ''), null);
        b.append(B.icon(icon, 'bl-dbtn-ic'));
        b.title = title; b.setAttribute('aria-label', title);
        if (title === 'More') b.dataset.action = 'more';  // the item's menu, as the engine's details mark theirs
        b.blHints = [['OK', title.toLowerCase()], ['≡', 'more'], ['Back', '']];
        b.addEventListener('click', () => { T.ctx.sound('select'); go(b); });
        return b;
    };
    const misc = (it) => {
        const out = [];
        if (it.Type === 'Episode' && it.PremiereDate) out.push(new Date(it.PremiereDate).toLocaleDateString());
        else if (it.ProductionYear) out.push(String(it.ProductionYear) + (it.Type === 'Series' && it.Status === 'Continuing' ? '-Present' : ''));
        if (it.Type === 'MusicAlbum' || it.Type === 'Playlist') { if (it.ChildCount) out.push(`${it.ChildCount} tracks`); }
        if (it.RunTimeTicks && it.Type !== 'Series') out.push(B.ticks(it.RunTimeTicks));
        if (it.OfficialRating) out.push(it.OfficialRating);
        if (it.CommunityRating) out.push(`★ ${Number(it.CommunityRating).toFixed(1)}`);
        if (it.CriticRating) out.push(`${it.CriticRating}%`);
        if (it.RunTimeTicks && ['Movie', 'Episode', 'Video', 'MusicVideo'].includes(it.Type)) out.push(`Ends at ${B.time(new Date(Date.now() + (it.RunTimeTicks - ((it.UserData || {}).PlaybackPositionTicks || 0)) / 1e4))}`);
        return out;
    };

    // a select of stock's track selection (label at the left, the value; OK opens the choices as an action sheet)
    function select(label, values, at, set, disabled) {
        const row = el('div', 'bl-trackrow');
        row.append(el('div', 'bl-tracklabel', label));
        const cur = values.find((v) => v[0] === at) || values[0];
        const b = disabled ? el('div', 'bl-trackvalue disabled', cur ? cur[1] : '') : B.btn('bl-trackvalue', cur ? cur[1] : '');
        b.setAttribute('aria-label', `${label}: ${cur ? cur[1] : ''}`);
        if (!disabled) {
            b.append(B.icon('keyboard_arrow_down', 'bl-trackarrow'));
            b.blHints = [['OK', 'choose'], ['Back', '']];
            b.addEventListener('click', () => B.panel.show({ title: label, path: label, render(body) {
                for (const [v, text] of values) { const r = B.row(text, { on: v === at, go: () => { B.panel.close(); set(v); } }); if (v === at) r.classList.add('bl-row-focus-first'); body.append(r); }
            } }));
        }
        row.append(b);
        return row;
    }

    let S = null;
    async function draw(me) {
        const it = me.item;
        const root = me.root;
        const page = B.page(root, 'bl-details');
        B.header(root, {});
        const wrap = el('div', 'bl-detail-wrap');
        page.append(wrap);
        // the poster
        const ratio = it.PrimaryImageAspectRatio || 0.6667;
        const shape = !(it.ImageTags || {}).Primary ? 'square' : (ratio > 1.3 ? 'backdrop' : (ratio > 0.85 ? 'square' : 'portrait'));
        const poster = el('div', `bl-detail-poster shape-${shape}`);
        const pimg = el('div', 'bl-detail-poster-img');
        const tag = (it.ImageTags || {}).Primary;
        if (tag) pimg.style.backgroundImage = `url("${B.image(it.Id, 'Primary', tag, 640)}")`;
        else pimg.append(B.icon(B.kindIcon(it.Type), 'bl-detail-poster-ic'));
        poster.append(pimg);
        wrap.append(poster);
        // the ribbon
        const ribbon = el('div', 'bl-ribbon');
        const name = el('h1', 'bl-item-name', it.Type === 'Episode' || it.Type === 'Season' ? (it.SeriesName || it.Name) : (it.Type === 'TvChannel' && it.ChannelNumber ? `${it.ChannelNumber} ${it.Name}` : it.Name));
        ribbon.append(name);
        if (it.Type === 'Season') ribbon.append(el('h3', 'bl-item-sub', it.Name));
        if (it.Type === 'Episode') ribbon.append(el('h3', 'bl-item-sub', `${it.ParentIndexNumber != null ? `S${it.ParentIndexNumber}:E${it.IndexNumber} - ` : ''}${it.Name}`));
        if (it.Type === 'MusicAlbum' && it.AlbumArtist) ribbon.append(el('h3', 'bl-item-sub', it.AlbumArtist));
        const mi = el('div', 'bl-misc');
        for (const x of misc(it)) mi.append(el('div', 'bl-misc-item', x));
        ribbon.append(mi);
        const btns = el('div', 'bl-dbtns');
        const ud = it.UserData || {};
        const playable = !['Person', 'MusicArtist', 'Studio', 'Genre'].includes(it.Type);
        const opts = (extra) => { const o = { ids: [it.Id], serverId: B.sid() }; if (me.source) o.mediaSourceId = me.source.Id; if (me.audio != null) o.audioStreamIndex = me.audio; if (me.subtitle != null) o.subtitleStreamIndex = me.subtitle; return Object.assign(o, extra || {}); };
        let first = null;
        if (playable) {
            const resume = ud.PlaybackPositionTicks > 0;
            first = detailBtn(resume ? 'play_arrow' : 'play_arrow', resume ? 'Resume' : 'Play', () => T.ctx.play(opts({ startPositionTicks: resume ? ud.PlaybackPositionTicks : 0 })), { cls: 'main' });
            btns.append(first);
            if (resume) btns.append(detailBtn('replay', 'Play from the beginning', () => T.ctx.play(opts({ startPositionTicks: 0 }))));
        }
        if (it.CanDownload && ['Book', 'Movie', 'Episode', 'Video', 'Audio'].includes(it.Type) && it.Type === 'Book') btns.append(detailBtn('get_app', 'Download', () => T.ui.items.run('download', it, {}).catch(() => {})));
        if ((it.LocalTrailerCount || 0) > 0 || (it.RemoteTrailers || []).length) btns.append(detailBtn('theaters', 'Trailer', async () => { try { const t = await Promise.resolve(c().getLocalTrailers(uid(), it.Id)); if (t && t.length) T.ctx.play({ items: t }); } catch (e) { B.notice('No trailer', true); } }));
        if (it.Type === 'MusicAlbum' || it.Type === 'MusicArtist' || it.Type === 'Audio') btns.append(detailBtn('explore', 'Instant Mix', () => T.ctx.instantMix(it)));
        if (['Series', 'Season', 'MusicAlbum', 'Playlist', 'BoxSet', 'MusicArtist'].includes(it.Type)) btns.append(detailBtn('shuffle', 'Shuffle', () => T.ctx.play({ ids: [it.Id], serverId: B.sid(), shuffle: true })));
        if (['Movie', 'Episode', 'Series', 'Season', 'Video', 'MusicVideo', 'Book', 'BoxSet'].includes(it.Type) || (it.Type !== 'Person' && it.Type !== 'TvChannel' && it.Type !== 'MusicAlbum' && it.Type !== 'Playlist' && it.Type !== 'MusicArtist')) {
            const played = detailBtn('check', ud.Played ? 'Watched' : 'Mark played', async (b) => {
                const now = !(me.item.UserData || {}).Played;
                try { if (now) await c().markPlayed(uid(), it.Id, new Date()); else await c().markUnplayed(uid(), it.Id); me.item.UserData = Object.assign({}, me.item.UserData, { Played: now }); b.classList.toggle('on-played', now); } catch (e) { B.notice('That didn’t work', true); }
            }, { cls: ud.Played ? 'on-played' : '' });
            btns.append(played);
        }
        btns.append(detailBtn('favorite', ud.IsFavorite ? 'Favorite' : 'Add to favorites', async (b) => {
            const now = !(me.item.UserData || {}).IsFavorite;
            try { await c().updateFavoriteStatus(uid(), it.Id, now); me.item.UserData = Object.assign({}, me.item.UserData, { IsFavorite: now }); b.classList.toggle('on-fav', now); } catch (e) { B.notice('That didn’t work', true); }
        }, { cls: ud.IsFavorite ? 'on-fav' : '' }));
        btns.append(detailBtn('more_vert', 'More', () => B.itemMenu && B.itemMenu(it, {})));
        btns.querySelectorAll('.bl-dbtn').forEach((b) => { b.blItemFor = it; });
        ribbon.append(btns);
        wrap.append(ribbon);
        // the primary content: track selects, facts, overview, the item's own lists
        const prim = el('div', 'bl-detail-primary');
        wrap.append(prim);
        const src = me.source;
        if (src && ['Movie', 'Episode', 'Video', 'MusicVideo', 'Trailer'].includes(it.Type)) {
            const ts = el('div', 'bl-tracks');
            const sources = it.MediaSources || [];
            if (sources.length > 1) ts.append(select('Version', sources.map((s) => [s.Id, s.Name || s.Container]), src.Id, (v) => { me.source = sources.find((s) => s.Id === v); me.audio = me.subtitle = null; redraw(); }));
            const vid = (src.MediaStreams || []).filter((s) => s.Type === 'Video');
            if (vid.length) ts.append(select('Video', vid.map((s) => [s.Index, streamLabel(s)]), vid[0].Index, () => {}, vid.length < 2));
            const aud = (src.MediaStreams || []).filter((s) => s.Type === 'Audio');
            if (aud.length) ts.append(select('Audio', aud.map((s) => [s.Index, streamLabel(s)]), me.audio != null ? me.audio : src.DefaultAudioStreamIndex, (v) => { me.audio = v; redraw(); }, aud.length < 2));
            const subs = (src.MediaStreams || []).filter((s) => s.Type === 'Subtitle');
            if (subs.length) ts.append(select('Subtitles', [[-1, 'Off']].concat(subs.map((s) => [s.Index, streamLabel(s)])), me.subtitle != null ? me.subtitle : (src.DefaultSubtitleStreamIndex != null ? src.DefaultSubtitleStreamIndex : -1), (v) => { me.subtitle = v; redraw(); }));
            prim.append(ts);
        }
        const group = (label, links) => { if (!links.length) return; const g = el('div', 'bl-group'); g.append(el('div', 'bl-tracklabel', label)); const v = el('div', 'bl-group-value'); links.forEach((l, k) => { if (k) v.append(document.createTextNode(', ')); const a = el('span', 'bl-link', l[0]); if (l[1]) a.addEventListener('click', () => B.go(l[1])); v.append(a); }); g.append(v); prim.append(g); };
        group('Genres', (it.GenreItems || []).map((g) => [g.Name, `#/list?genreId=${g.Id}&serverId=${B.sid()}`]));
        group('Director', (it.People || []).filter((p) => p.Type === 'Director').map((p) => [p.Name, `#/details?id=${p.Id}&serverId=${B.sid()}`]));
        group('Writers', (it.People || []).filter((p) => p.Type === 'Writer').map((p) => [p.Name, `#/details?id=${p.Id}&serverId=${B.sid()}`]));
        if (it.Type === 'Book' || it.Type === 'Audio') group('Author', (it.AlbumArtists || it.ArtistItems || []).map((a) => [a.Name, `#/details?id=${a.Id}&serverId=${B.sid()}`]));
        group('Studios', (it.Studios || []).map((s) => [s.Name, `#/list?studioId=${s.Id}&serverId=${B.sid()}`]));
        if ((it.Tags || []).length) { const t = el('div', 'bl-tags'); t.append(document.createTextNode('Tags: ')); it.Tags.forEach((x, k) => { if (k) t.append(document.createTextNode(', ')); t.append(el('span', 'bl-link accent', x)); }); prim.append(t); }
        if ((it.Taglines || [])[0]) prim.append(el('h3', 'bl-tagline', it.Taglines[0]));
        if (it.Overview) prim.append(el('p', 'bl-overview', it.Overview));
        await ownLists(me, prim);
        if (S !== me) return;
        // the full-width rows
        wrap.style.minHeight = `${poster.offsetHeight + 16}px`;  // the full-width rows start under the poster
        await fullRows(me, page);
        if (S !== me) return;
        B.arrive(root, first || btns.querySelector('.bl-dbtn'));
        root.setAttribute('data-icefin-details-ready', '1');
        root.setAttribute('data-bl-ready', '1');
        function redraw() { const f = document.activeElement; root.textContent = ''; draw(me); }
    }

    // ---- the item's own lists, inside the primary column ----
    const listRow = (o) => {
        const b = B.btn('bl-listitem' + (o.image ? ' with-image' : ''), null);
        if (o.index != null) b.append(el('div', 'bl-li-index', String(o.index)));
        if (o.image !== undefined) { const im = el('div', 'bl-li-image' + (o.large ? ' large' : '')); if (o.image) im.style.backgroundImage = `url("${o.image}")`; else { im.classList.add('blank'); im.append(B.icon(o.icon || 'music_note')); } b.append(im); }
        const body = el('div', 'bl-li-body');
        body.append(el('div', 'bl-li-title', o.title));
        if (o.sub) body.append(el('div', 'bl-li-sub', o.sub));
        if (o.overview) body.append(el('div', 'bl-li-overview', o.overview));
        b.append(body);
        if (o.aside) b.append(el('div', 'bl-li-aside', o.aside));
        if (o.item) b.blItem = o.item;
        b.addEventListener('click', () => { T.ctx.sound('select'); o.go(); });
        return b;
    };
    async function ownLists(me, prim) {
        const it = me.item;
        const sec = (title) => { const s = el('div', 'bl-detail-section'); if (title) s.append(el('h2', 'bl-section-title inner', title)); prim.append(s); return s; };
        if (it.Type === 'Series') {
            let nu = null;
            try { const r = await Promise.resolve(c().getNextUpEpisodes({ UserId: uid(), SeriesId: it.Id, Limit: 1, Fields: B.FIELDS })); nu = r && r.Items && r.Items[0]; } catch (e) { nu = null; }
            if (nu) { const s = sec('Next Up'); const row = el('div', 'bl-inner-row'); row.append(B.card(nu, { row: true, shape: 'backdrop', lines: [`S${nu.ParentIndexNumber}:E${nu.IndexNumber} - ${nu.Name}`], center: false })); s.append(row); }
            const seasons = (await B.items({ ParentId: it.Id, IncludeItemTypes: 'Season', Recursive: false, SortBy: 'SortName' })).Items;
            if (seasons.length > 1 || (seasons[0] && seasons[0].IndexNumber !== 1)) { const s = sec('Seasons'); const row = el('div', 'bl-inner-row'); seasons.forEach((x) => row.append(B.card(x, { row: true, shape: 'portrait' }))); s.append(row); }
            else if (seasons[0]) { const s = sec(seasons[0].Name); await episodesInto(s, seasons[0]); }
        } else if (it.Type === 'Season') {
            await episodesInto(sec(null), it);
        } else if (it.Type === 'MusicAlbum' || it.Type === 'Playlist') {
            const kids = it.Type === 'MusicAlbum' ? (await B.items({ ParentId: it.Id, IncludeItemTypes: 'Audio', Recursive: true, SortBy: 'ParentIndexNumber,IndexNumber,SortName' })).Items
                : (await B.items({ ParentId: it.Id, Recursive: false })).Items;
            const s = sec(null);
            kids.forEach((k, n) => s.append(listRow({ index: it.Type === 'MusicAlbum' ? (k.IndexNumber || n + 1) : null, image: it.Type === 'Playlist' ? B.artOf(k, 'square', 120) : undefined, icon: 'music_note',
                title: k.Name, aside: k.RunTimeTicks ? B.clockTicks(k.RunTimeTicks) : '', item: k, go: () => T.ctx.play({ items: kids, startIndex: n }) })));
        } else if (it.Type === 'MusicArtist') {
            const albums = (await B.items({ ArtistIds: it.Id, IncludeItemTypes: 'MusicAlbum', Recursive: true, SortBy: 'ProductionYear,SortName', SortOrder: 'Descending' })).Items;
            if (albums.length) { const s = sec('Albums'); const row = el('div', 'bl-inner-row'); albums.forEach((x) => row.append(B.card(x, { row: true, shape: 'square' }))); s.append(row); }
        } else if (it.Type === 'Person') {
            for (const [type, title, shape] of [['Movie', 'Movies', 'portrait'], ['Series', 'Shows', 'portrait'], ['Episode', 'Episodes', 'backdrop'], ['MusicAlbum', 'Albums', 'square'], ['Book', 'Books', 'portrait']]) {
                const r = await B.items({ PersonIds: it.Id, IncludeItemTypes: type, Recursive: true, SortBy: 'ProductionYear,SortName', SortOrder: 'Descending', Limit: 50 });
                const list = type === 'MusicAlbum' ? (await B.items({ ArtistIds: it.Id, IncludeItemTypes: 'MusicAlbum', Recursive: true, Limit: 50 })).Items : r.Items;
                const s = sec(title);
                if (!list.length) { s.classList.add('empty'); continue; }
                const row = el('div', 'bl-inner-row'); list.forEach((x) => row.append(B.card(x, { row: true, shape }))); s.append(row);
            }
            prim.querySelectorAll('.bl-detail-section.empty').forEach((x) => { if (!x.nextElementSibling || !x.nextElementSibling.querySelector('.bl-card')) x.remove(); });
        } else if (it.Type === 'BoxSet') {
            const kids = (await B.items({ ParentId: it.Id, SortBy: 'ProductionYear,SortName', Recursive: false })).Items;
            if (kids.length) { const s = sec('Movies'); const row = el('div', 'bl-inner-row'); kids.forEach((x) => row.append(B.card(x, { row: true, shape: 'portrait' }))); s.append(row); }
        } else if (it.Type === 'TvChannel') {
            let r = null;
            try { r = await Promise.resolve(c().getLiveTvPrograms({ UserId: uid(), ChannelIds: it.Id, MinEndDate: new Date().toISOString(), MaxStartDate: new Date(Date.now() + 2 * 864e5).toISOString(), SortBy: 'StartDate', Limit: 40 })); } catch (e) { r = null; }
            let day = null;
            const s = sec(null);
            for (const p of (r && r.Items) || []) {
                const d = new Date(p.StartDate);
                const k = d.toDateString();
                if (k !== day) { day = k; s.append(el('h2', 'bl-day', d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }))); }
                s.append(listRow({ title: B.time(d), sub: p.Name, item: p, go: () => B.liveOptions ? B.liveOptions(p) : B.details(p) }));
            }
        } else if (it.Type === 'PhotoAlbum' || it.Type === 'Folder') {
            const kids = (await B.items({ ParentId: it.Id, Recursive: false, SortBy: 'SortName' })).Items;
            const s = sec(null); const g = el('div', 'bl-items-grid inner'); kids.forEach((x) => g.append(B.card(x, { row: false, shape: B.shapeOf(x) }))); s.append(g);
        }
    }
    async function episodesInto(s, season) {
        const r = await Promise.resolve(c().getEpisodes(season.SeriesId, { UserId: uid(), SeasonId: season.Id, Fields: B.FIELDS }));
        const eps = (r && r.Items) || [];
        eps.forEach((ep) => s.append(listRow({ image: B.artOf(ep, 'backdrop', 480), large: true, icon: 'tv', title: `${ep.IndexNumber != null ? `${ep.IndexNumber}. ` : ''}${ep.Name}`, sub: misc(ep).filter((x) => !/^\d{4}$/.test(x)).join('   '),
            overview: ep.Overview || '', item: ep, go: () => B.details(ep) })));
    }
    async function fullRows(me, page) {
        const it = me.item;
        const add = (title, items, shape) => { if (items.length) page.append(B.cardRow(title, items.map((x) => B.card(x, { row: true, shape: shape || B.shapeOf(x) })))); };
        if (['Movie', 'Series', 'Video'].includes(it.Type)) {
            // the collections this item is in (stock's Collections row)
            try {
                const sets = (await B.items({ IncludeItemTypes: 'BoxSet', Recursive: true, Limit: 40 })).Items;
                const hits = [];
                for (const bs of sets) { const r = await B.items({ ParentId: bs.Id, Ids: it.Id, Recursive: false, Limit: 1, Fields: 'Id' }); if (r.Items.length) hits.push(bs); }
                add('Collections', hits, 'portrait');
            } catch (e) { /* none */ }
        }
        const people = (it.People || []).map((p) => ({ Id: p.Id, Name: p.Name, Type: 'Person', ImageTags: p.PrimaryImageTag ? { Primary: p.PrimaryImageTag } : {}, Role: p.Role }));
        if (people.length) page.append(B.cardRow('Cast & Crew', people.map((p) => B.card(p, { row: true, shape: 'portrait', lines: [p.Name, p.Role || ''] }))));
        if (['Movie', 'Series', 'MusicAlbum', 'MusicArtist', 'Book', 'Video', 'MusicVideo', 'Episode'].includes(it.Type)) {
            let r = null;
            try { r = await Promise.resolve(c().getSimilarItems(it.Type === 'Episode' ? it.SeriesId : it.Id, { userId: uid(), limit: 12, fields: B.FIELDS })); } catch (e) { r = null; }
            add('More Like This', (r && r.Items) || []);
        }
    }

    B.ownDetails = true;
    B.register('#/details', {
        async mount(root) {
            const id = B.params().get('id');
            const me = S = { root, item: null };
            root.setAttribute('data-bl-screen', 'details');
            let it = null;
            try { it = await fetchItem(id); } catch (e) { it = null; }
            if (S !== me) return;
            if (!it) { B.go('#/home'); return; }
            me.item = it;
            me.source = (it.MediaSources || [])[0] || null;
            B.screenTabs = null;
            B.refresher(async () => { if (S !== me) return; try { me.item = await fetchItem(id); } catch (e) { return; } root.textContent = ''; draw(me); });
            await draw(me);
        },
        unmount() { S = null; B.hintsOff(); },
        onAction(a, ctx) {
            if (a === 'menu' && S && S.item) { const f = ctx.focused(); if (!(f && f.blItem)) { B.itemMenu && B.itemMenu(S.item, {}); return true; } }
            return false;
        }
    });
    B.screenItem = () => (S && S.item) || null;
})();
