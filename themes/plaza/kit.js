// Plaza kit (PLAN 9.32): helpers shared by Plaza's scripts (art.js, plaza.js, menus.js), which load in that order after
// this one. Everything sits on window.icefinPlaza, rebuilt each time the theme loads. Server calls go through the
// theme script API's client (ctx.apiClient()).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const P = window.icefinPlaza = {};

    P.el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    // A focusable element: the engine moves focus between [data-icefin-focus] by position.
    P.focusable = (e) => { e.setAttribute('data-icefin-focus', ''); e.tabIndex = -1; return e; };
    P.client = () => T.ctx.apiClient();
    P.uid = () => { const c = P.client(); return c ? c.getCurrentUserId() : ''; };
    P.sid = () => { const c = P.client(); return c ? c.serverId() : ''; };
    P.safe = (p) => Promise.resolve(p).then((r) => r || {}, () => ({}));
    P.items = (r) => (r && (r.Items || (Array.isArray(r) ? r : null))) || [];
    P.get = (path, query) => { const c = P.client(); return P.safe(c.getJSON(c.getUrl(path, query))); };
    P.FIELDS = 'PrimaryImageAspectRatio,ProductionYear,RunTimeTicks,UserData,Overview,OfficialRating,CommunityRating,ChildCount,SeriesInfo,Genres';

    // The query of the current route ("#/home?pz=series&id=…").
    P.params = () => new URLSearchParams((location.hash.split('?')[1] || ''));

    // ---- artwork ----
    const tags = (it) => (it && it.ImageTags) || {};
    P.img = (id, type, tag, w) => (id && tag ? P.client().getScaledImageUrl(id, { type, maxWidth: w || 600, tag }) : '');
    P.wideArt = (it, w) => {
        if (!it) return '';
        if ((it.BackdropImageTags || []).length) return P.img(it.Id, 'Backdrop', it.BackdropImageTags[0], w || 900);
        if ((it.ParentBackdropImageTags || []).length) return P.img(it.ParentBackdropItemId, 'Backdrop', it.ParentBackdropImageTags[0], w || 900);
        if (tags(it).Thumb) return P.img(it.Id, 'Thumb', tags(it).Thumb, w || 900);
        if (it.ParentThumbItemId && it.ParentThumbImageTag) return P.img(it.ParentThumbItemId, 'Thumb', it.ParentThumbImageTag, w || 900);
        if (tags(it).Primary) return P.img(it.Id, 'Primary', tags(it).Primary, w || 900);
        return '';
    };
    P.posterArt = (it, w) => {
        if (!it) return '';
        if (tags(it).Primary) return P.img(it.Id, 'Primary', tags(it).Primary, w || 400);
        if (it.SeriesPrimaryImageTag) return P.img(it.SeriesId, 'Primary', it.SeriesPrimaryImageTag, w || 400);
        if (it.AlbumPrimaryImageTag) return P.img(it.AlbumId, 'Primary', it.AlbumPrimaryImageTag, w || 400);
        return '';
    };
    // An episode's own still first, a programme's or channel's image, then the wide art.
    P.thumbArt = (it, w) => {
        if (!it) return '';
        if (it.Type === 'Episode' && tags(it).Primary) return P.img(it.Id, 'Primary', tags(it).Primary, w || 600);
        if (tags(it).Thumb) return P.img(it.Id, 'Thumb', tags(it).Thumb, w || 600);
        return P.wideArt(it, w || 600) || P.posterArt(it, w || 600);
    };
    P.bg = (e, url) => { if (url) e.style.backgroundImage = `url("${url}")`; return e; };

    // ---- text ----
    P.minutes = (ticks) => Math.round((ticks || 0) / 600000000);
    P.runtime = (ticks) => { const m = P.minutes(ticks); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : m ? `${m} min` : ''; };
    P.left = (it) => { const u = (it && it.UserData) || {}; const m = P.minutes((it.RunTimeTicks || 0) - (u.PlaybackPositionTicks || 0)); return m > 0 ? `${m} min left` : ''; };
    P.progress = (it) => { const u = (it && it.UserData) || {}; return it && it.RunTimeTicks ? Math.max(0, Math.min(1, (u.PlaybackPositionTicks || 0) / it.RunTimeTicks)) : (u.PlayedPercentage || 0) / 100; };
    P.episodeCode = (it) => (it && it.Type === 'Episode' ? `S${it.ParentIndexNumber != null ? it.ParentIndexNumber : '?'} E${it.IndexNumber != null ? it.IndexNumber : '?'}` : '');
    P.title = (it) => (!it ? '' : it.Type === 'Episode' ? `${it.SeriesName || ''} · ${P.episodeCode(it)} · ${it.Name || ''}` : it.Name || '');
    P.meta = (it) => {
        if (!it) return '';
        const parts = [];
        if (it.ProductionYear) parts.push(String(it.ProductionYear));
        if (it.RunTimeTicks && it.Type !== 'Series') parts.push(P.runtime(it.RunTimeTicks));
        if (it.OfficialRating) parts.push(it.OfficialRating);
        if (it.CommunityRating) parts.push(`★ ${Number(it.CommunityRating).toFixed(1)}`);
        if (it.Type === 'Series' && it.ChildCount) parts.push(`${it.ChildCount} season${it.ChildCount === 1 ? '' : 's'}`);
        if (it.Type === 'BoxSet' && it.ChildCount) parts.push(`Collection of ${it.ChildCount}`);
        if ((it.Type === 'MusicAlbum' || it.Type === 'Playlist') && it.ChildCount) parts.splice(1, 0, P.count(it.ChildCount, it.Type === 'MusicAlbum' ? 'track' : 'item'));
        return parts.filter(Boolean).join(' · ');
    };
    // Hint text with controller buttons drawn as round keys: "Ⓐ Open · Ⓑ Back" (the circled letters aren't in every font).
    P.hintNodes = (text) => {
        const out = [];
        for (const part of String(text).split(/([ⒶⒷⓍⓎ])/)) {
            if (!part) continue;
            const key = { 'Ⓐ': 'A', 'Ⓑ': 'B', 'Ⓧ': 'X', 'Ⓨ': 'Y' }[part];
            out.push(key ? P.el('span', 'pz-btn', key) : document.createTextNode(part));
        }
        return out;
    };
    // "1 season", "3 seasons"
    P.count = (n, word) => (n ? `${n} ${word}${n === 1 ? '' : 's'}` : '');
    P.isVideo = (it) => !!it && ['Movie', 'Episode', 'Video', 'MusicVideo', 'Trailer', 'Series', 'Season', 'TvChannel'].includes(it.Type);
    const TYPE = { MusicAlbum: 'Album', MusicArtist: 'Artist', MusicVideo: 'Music video', BoxSet: 'Collection', Series: 'Show', Episode: 'Episode', Audio: 'Song', TvChannel: 'Channel' };
    P.typeName = (it) => (it ? TYPE[it.Type] || it.Type || '' : '');
    P.time = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    // ---- what each kind of item does ----
    P.play = (it, fromStart) => {
        if (!it) return;
        const ticks = fromStart ? 0 : ((it.UserData || {}).PlaybackPositionTicks || 0);
        T.ctx.play({ ids: [it.Id], serverId: P.sid(), startPositionTicks: ticks });
    };
    P.details = (it) => { if (it) T.ctx.navigate(`#/details?id=${it.Id}&serverId=${P.sid()}`); };
    // Series open Plaza's own seasons screen; playable leaves and channels play; the rest open their details.
    P.open = (it) => {
        if (!it) return;
        const type = it.Type;
        if (type === 'Series') return T.ctx.navigate(`#/home?pz=series&id=${it.Id}`);
        if (type === 'TvChannel') return P.play(it, true);
        if (type === 'Audio') return P.play(it, true);
        return P.details(it);
    };

    // ---- the input in use: controller hints show only for the remote or a controller (9.28) ----
    // Arrow keys go through the same action pipeline as a pad, so a keydown just before an action marks the keyboard.
    let lastKey = 0;
    P.inputMode = (mode) => { const h = document.documentElement; if (h && h.getAttribute('data-pz-input') !== mode) h.setAttribute('data-pz-input', mode); };
    window.addEventListener('keydown', () => { lastKey = Date.now(); P.inputMode('keys'); }, true);
    window.addEventListener('mousemove', (e) => { if (e.movementX || e.movementY) P.inputMode('pointer'); }, true);
    P.sawAction = () => { if (Date.now() - lastKey > 120) P.inputMode('pad'); };

    // ---- a page in a strip of pages: the next one slides in from its side (450 ms, ease-out) ----
    P.slide = (node, dir) => {
        if (!dir) return;
        node.classList.remove('pz-in-left', 'pz-in-right');
        void node.offsetWidth;
        node.classList.add(dir > 0 ? 'pz-in-right' : 'pz-in-left');
    };

    // Columns that fit: cells keep their reference size (px at 1080 lines); a wider screen shows more of them.
    P.fit = (cellPx, gapPx, sideMarginPx, min) => {
        const ref = innerWidth / innerHeight * 1080;
        return Math.max(min || 1, Math.floor((ref - 2 * sideMarginPx + gapPx) / (cellPx + gapPx)));
    };
})();
