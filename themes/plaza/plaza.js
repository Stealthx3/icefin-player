// Plaza (benchmark theme, PLAN 9.7, 9.32; its target is named in docs/PLAN.md). The home: pages of rounded channels in
// three rows, as many columns as the screen's width holds at the channels' own size (four at 16:9), the neighbouring
// pages peeking at the sides with page arrows over them; a bottom bar whose top edge dips into a notch that holds the
// clock, the date under it, and two round buttons (settings, search). Channels: each library (an animated illustration
// of its kind under its name, with its newest art coming through like a banner), Continue Watching (a turning disc
// printed with the item's art), Next Up, then each favourite as a channel of its own, then empty slots.
// Selecting a channel zooms it into a framed card, its preview (pz-card): Home goes back, Open goes to the channel's
// full menu (menus.js), and a favourite's Play starts it. Geometry is in px at 1080 lines (var(--pz)), from the
// user's own reference walk of the target (docs/themes/references/plaza.json).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const P = window.icefinPlaza;
    const ui = T.ui;
    const el = P.el;
    const ROWS = 3, TILE_W = 382, GAP_X = 23, MARGIN = 140, BAR_TOP = 795;
    const OPEN_MS = 870, CLOSE_MS = 420;  // the page turn's 450 ms are in styles.css (.pz-track)

    // ---- channels: { id, kind, label, items?, fetch?(), menu?: hash, play?: item } ----
    function libraryMenu(v) {
        const sid = P.sid(), q = `topParentId=${v.Id}&collectionType=${v.CollectionType}&serverId=${sid}`;
        if (v.CollectionType === 'movies') return `#/movies?${q}`;
        if (v.CollectionType === 'tvshows') return `#/tv?${q}`;
        if (v.CollectionType === 'music') return `#/music?${q}`;
        if (v.CollectionType === 'livetv') return `#/livetv?serverId=${sid}`;
        return `#/home?pz=library&id=${v.Id}&kind=${P.kindOf(v.CollectionType)}&name=${encodeURIComponent(v.Name || '')}`;
    }
    function channels(views, favourites) {
        const c = P.client(), uid = P.uid();
        const list = views.map((v) => ({
            id: 'library-' + v.Id, kind: P.kindOf(v.CollectionType), label: v.Name, view: v, menu: libraryMenu(v),
            fetch: () => (v.CollectionType === 'livetv' ? Promise.resolve([])
                : P.safe(c.getLatestItems({ userId: uid, parentId: v.Id, Limit: 6, Fields: P.FIELDS })).then(P.items))
        }));
        list.push(
            { id: 'resume', kind: 'resume', label: 'Continue Watching', menu: '#/home?pz=resume',
                fetch: () => P.safe(c.getResumableItems(uid, { Limit: 6, MediaTypes: 'Video', Fields: P.FIELDS })).then(P.items) },
            { id: 'nextup', kind: 'nextup', label: 'Next Up', menu: '#/home?pz=nextup',
                fetch: () => P.safe(c.getNextUpEpisodes({ UserId: uid, Limit: 6, Fields: P.FIELDS })).then(P.items) });
        for (const f of favourites) list.push({ id: 'fav-' + f.Id, kind: 'favourite', label: f.Name, play: f, items: [f] });
        return list;
    }

    let S = null;  // the home while it is up

    // ---- tiles ----
    function tile(ch) {
        const t = el('div', 'pz-tile' + (ch ? ' pz-k-' + ch.kind : ' empty'));
        t.plazaChannel = ch || null;
        t.addEventListener('click', () => {
            if (!S || S.card || S.busy) return;
            const page = Number(t.getAttribute('data-pz-page'));
            if (page !== S.page) { turn(page); return; }  // a channel peeking from the next page turns to it
            if (!ch) return;
            T.ctx.sound('select');
            select(t);
        });
        if (!ch) { t.append(el('div', 'pz-tile-mark', 'icefin')); return t; }
        t.setAttribute('data-pz-channel', ch.id);
        t.setAttribute('aria-label', ch.label);
        const screen = el('div', 'pz-screen');
        t.append(screen, el('div', 'pz-tile-label', ch.kind === 'favourite' ? '★ ' + ch.label : ch.label), el('div', 'pz-name', ch.label));
        if (ch.kind === 'favourite') {
            P.bg(screen, P.wideArt(ch.play, 800) || P.posterArt(ch.play, 600));
            screen.classList.add('pz-art');
        } else if (ch.kind === 'resume') {
            const shelf = el('div', 'pz-tile-disc');
            screen.append(shelf);
            ch.fetch().then((items) => { ch.items = items; shelf.textContent = ''; shelf.append(P.disc(items[0] || null)); t.classList.toggle('pz-has-items', !!items.length); });
        } else if (ch.fetch) {
            // The illustration, and the channel's newest art coming through between its turns like a banner.
            ui.liveTile(screen, {
                interval: 4500,
                fetch: async () => {
                    const items = await ch.fetch();
                    ch.items = items;
                    t.classList.toggle('pz-has-items', items.length > 0);
                    const frames = [null];
                    for (const it of items.slice(0, 3)) if (P.wideArt(it)) frames.push(it, null);
                    return frames;
                },
                render: (it) => {
                    if (!it) return P.illustration(ch.kind);
                    const f = el('div', 'pz-frame');
                    P.bg(f, P.wideArt(it, 800));
                    return f;
                }
            });
        } else screen.append(P.illustration(ch.kind));
        return t;
    }

    // ---- pages: all of them side by side on a track; the current one is centred, its neighbours peek ----
    function layout() {
        if (!S) return;
        const cols = P.fit(TILE_W, GAP_X, MARGIN, 4);
        const ref = innerWidth / innerHeight * 1080;
        const pageW = cols * (TILE_W + GAP_X), gridW = pageW - GAP_X;
        S.cols = cols;
        S.root.style.setProperty('--pz-cols', String(cols));
        S.root.style.setProperty('--pz-page-w', String(pageW));
        S.root.style.setProperty('--pz-grid-left', String(Math.round((ref - gridW) / 2)));
        drawBar(ref);
    }
    function fill(list) {
        S.list = list;
        layout();
        const per = S.cols * ROWS;
        const slots = [...list];
        while (slots.length % per || !slots.length) slots.push(null);  // empty slots, like the target
        S.pages = slots.length / per;
        S.track.textContent = '';
        S.tiles = [];
        for (let p = 0; p < S.pages; p++) {
            const page = el('div', 'pz-page');
            page.style.setProperty('--pz-p', String(p));
            for (const ch of slots.slice(p * per, p * per + per)) {
                const t = tile(ch);
                t.setAttribute('data-pz-page', String(p));
                S.tiles.push(t);
                page.append(t);
            }
            S.track.append(page);
        }
        S.root.setAttribute('data-pz-ready', String(list.length));
        show(Math.min(S.page || 0, S.pages - 1), false);
    }
    // Only the current page's channels take focus: arrows past its edge turn the page (onAction).
    function show(p, animate) {
        S.page = p;
        // The turn's 450 ms are the stylesheet's (low motion makes them instant there); a jump without a turn skips them.
        const track = S.track;
        track.style.transitionDuration = animate ? '' : '0ms';
        track.style.setProperty('--pz-page', String(p));
        if (!animate) requestAnimationFrame(() => requestAnimationFrame(() => { track.style.transitionDuration = ''; }));
        for (const t of S.tiles) {
            const here = Number(t.getAttribute('data-pz-page')) === p;
            if (here) P.focusable(t); else { t.removeAttribute('data-icefin-focus'); t.classList.remove('icefin-focused'); }
            t.classList.toggle('pz-off-page', !here);
        }
        S.root.setAttribute('data-pz-page', `${p + 1}/${S.pages}`);
        S.arrows[0].classList.toggle('pz-hidden', p === 0);
        S.arrows[1].classList.toggle('pz-hidden', p >= S.pages - 1);
    }
    function turn(p, focusIndex) {
        if (!S || p < 0 || p >= S.pages || p === S.page) return false;
        show(p, true);
        T.ctx.sound('navigate');
        const t = S.tiles[p * S.cols * ROWS + (focusIndex || 0)];
        if (t) T.ctx.focus(t);
        return true;
    }

    // ---- the bottom bar: a flat top that dips into a centred notch for the clock; the notch keeps its size ----
    function topEdge(cx, w, y, d) {
        return `M0 ${y} H${cx - 470} C${cx - 380} ${y} ${cx - 370} ${d} ${cx - 280} ${d} H${cx + 280} C${cx + 370} ${d} ${cx + 380} ${y} ${cx + 470} ${y} H${w}`;
    }
    function drawBar(ref) {
        if (!S || !S.barSvg) return;
        const w = Math.round(ref), h = 1080 - BAR_TOP, cx = w / 2;
        S.barSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        S.barSvg.querySelector('.pz-bar-fill').setAttribute('d', `${topEdge(cx, w, 4, 105)} V${h} H0 Z`);
        S.barSvg.querySelector('.pz-bar-shine').setAttribute('d', topEdge(cx, w, 11, 112));
        S.barSvg.querySelector('.pz-bar-line').setAttribute('d', topEdge(cx, w, 4, 105));
    }

    // ---- the channel card: zooms out of the tile, then the preview fades in and the name tab slides down ----
    function select(t) {
        const ch = t.plazaChannel;
        if (ch.hash) { T.ctx.navigate(ch.hash); return; }
        openCard(ch, t, true);
    }
    function openCard(ch, t, animate) {
        const card = el('div', 'pz-card pz-k-' + ch.kind);
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-label', ch.label);
        const dim = el('div', 'pz-dim');
        const ms = animate ? ui.motion.duration(OPEN_MS) : 0;
        if (t && animate) {
            const r = t.getBoundingClientRect(), root = S.root.getBoundingClientRect();
            Object.assign(card.style, { left: `${r.left - root.left}px`, top: `${r.top - root.top}px`, width: `${r.width}px`, height: `${r.height}px` });
            card.classList.add('pz-zooming');
        }
        card.style.setProperty('--pz-open-ms', `${ms}ms`);
        S.root.append(dim, card);
        S.busy = ms > 0;
        S.card = { ch, el: card, dim, tile: t };
        S.root.setAttribute('data-pz-channel', ch.id);
        void card.offsetWidth;
        dim.classList.add('pz-on');
        card.classList.add('pz-open');
        if (t && animate) {
            // The card's own rectangle (inset 21 x 18 px at 1080 lines), as numbers so the zoom can animate to it.
            const r = S.root.getBoundingClientRect(), u = r.height / 1080;
            Object.assign(card.style, { left: `${21 * u}px`, top: `${18 * u}px`, width: `${r.width - 42 * u}px`, height: `${r.height - 36 * u}px` });
        }
        fillCard(ch, card);
        const done = () => {
            if (!S || !S.card || S.card.el !== card) return;
            S.busy = false;
            card.classList.remove('pz-zooming');
            Object.assign(card.style, { left: '', top: '', width: '', height: '' });
            card.classList.add('pz-shown');
        };
        if (ms) setTimeout(done, ms); else done();
    }
    function closeCard(leaving) {
        if (!S || !S.card) return false;
        const { el: card, dim, tile: t, preview } = S.card;
        if (preview) preview.stop();
        S.card = null;
        S.root.removeAttribute('data-pz-channel');
        if (leaving) { card.remove(); dim.remove(); return true; }
        const page = t ? Number(t.getAttribute('data-pz-page')) : S.page;
        if (t && page !== S.page) show(page, false);
        const ms = ui.motion.duration(CLOSE_MS);
        const now = card.getBoundingClientRect(), base = S.root.getBoundingClientRect();
        Object.assign(card.style, { left: `${now.left - base.left}px`, top: `${now.top - base.top}px`, width: `${now.width}px`, height: `${now.height}px` });
        card.style.setProperty('--pz-open-ms', `${ms}ms`);
        card.classList.remove('pz-shown', 'pz-open', 'pz-zooming');
        card.classList.add('pz-closing');
        void card.offsetWidth;
        if (t) {
            const r = t.getBoundingClientRect(), root = S.root.getBoundingClientRect();
            Object.assign(card.style, { left: `${r.left - root.left}px`, top: `${r.top - root.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        }
        dim.classList.remove('pz-on');
        S.busy = true;
        setTimeout(() => { card.remove(); dim.remove(); if (S) S.busy = false; }, ms + 20);
        if (t) T.ctx.focus(t);
        return true;
    }
    // Side arrows (and left/right past the card's buttons) step to the neighbouring channel's card.
    function stepCard(dir) {
        if (!S || !S.card) return;
        const list = S.list, i = list.indexOf(S.card.ch);
        const next = list[(i + dir + list.length) % list.length];
        if (!next || next === S.card.ch) return;
        const card = S.card.el;
        if (S.card.preview) S.card.preview.stop();
        card.className = 'pz-card pz-open pz-shown pz-k-' + next.kind;
        card.setAttribute('aria-label', next.label);
        S.card.ch = next;
        S.card.preview = null;
        S.card.tile = S.tiles.find((x) => x.plazaChannel === next) || null;
        S.root.setAttribute('data-pz-channel', next.id);
        fillCard(next, card);
        P.slide(card.querySelector('.pz-card-stage'), dir);
        T.ctx.sound('navigate');
    }

    function fillCard(ch, card) {
        card.textContent = '';
        const stage = el('div', 'pz-card-stage');
        const tab = el('div', 'pz-card-tab', ch.kind === 'favourite' ? '★ ' + ch.label : ch.label);
        const prev = el('div', 'pz-side pz-side-prev'), next = el('div', 'pz-side pz-side-next');
        prev.setAttribute('aria-label', 'Previous channel');
        next.setAttribute('aria-label', 'Next channel');
        prev.addEventListener('click', () => stepCard(-1));
        next.addEventListener('click', () => stepCard(1));
        const band = el('div', 'pz-card-band');
        const pill = (label, cls, go) => { const b = P.focusable(el('div', 'pz-pill ' + cls, label)); b.addEventListener('click', go); band.append(b); return b; };
        const home = pill('Home', 'pz-pill-home', () => { T.ctx.sound('back'); closeCard(); });
        const action = ch.kind === 'favourite'
            ? pill('Play', 'pz-pill-play', () => { const it = ch.play; closeCard(true); P.play(it); })
            : pill('Open', 'pz-pill-open', () => { P.reopen = ch.id; const to = ch.menu; closeCard(true); T.ctx.navigate(to); });
        card.append(stage, tab, prev, next, band);
        S.card.buttons = [home, action];
        T.ctx.focus(action);
        const body = el('div', 'pz-preview pz-preview-' + ch.kind);
        stage.append(body);
        preview(ch, body);
    }

    // ---- previews: what each channel shows on its card ----
    function textBlock(cls, lines) {
        const b = el('div', 'pz-info ' + (cls || ''));
        for (const [c, t] of lines) if (t) b.append(el('div', c, t));
        return b;
    }
    P.textBlock = textBlock;
    function bar(fraction) { const b = el('div', 'pz-progress'); const f = el('div'); f.style.width = `${Math.round(fraction * 100)}%`; b.append(f); return b; }
    P.progressBar = bar;
    async function preview(ch, body) {
        const c = P.client(), uid = P.uid();
        const live = () => S && S.card && S.card.ch === ch && body.isConnected;
        const kind = ch.kind;
        if (kind === 'favourite') {
            const it = ch.play;
            const frame = el('div', 'pz-fav-frame');
            const pan = el('div', 'pz-fav-pan');
            P.bg(pan, P.wideArt(it, 1280) || P.posterArt(it, 800));
            frame.append(pan, el('div', 'pz-fav-badge', '▶ PREVIEW'));
            body.append(frame, el('div', 'pz-reflect pz-fav-reflect'),
                textBlock('pz-fav-info', [['pz-kicker', `★ FAVOURITE · ${(it.Type || '').toUpperCase()}`], ['pz-big', it.Name], ['pz-meta', P.meta(it)],
                    ['pz-overview', it.Overview || ''], ['pz-sub', P.left(it) ? `Resume · ${P.left(it)}` : '']]));
            // A muted preview of the item itself, from a little way in, where the server can stream it.
            if (['Movie', 'Episode', 'Video', 'MusicVideo'].includes(it.Type) && !ui.motion.reduced()) {
                const start = Math.round(((it.RunTimeTicks || 0) / 1e7) * 0.15);
                const pv = ui.mutedPreview(frame, { itemId: it.Id, startSeconds: start, maxWidth: 854 });
                pv.video.classList.add('pz-fav-video');
                pv.video.addEventListener('playing', () => frame.classList.add('pz-playing'));
                if (S.card) S.card.preview = pv;
            }
            return;
        }
        const items = ch.items || (ch.fetch ? await ch.fetch() : []);
        if (!live()) return;
        if (kind === 'livetv') {
            const tv = el('div', 'pz-tv');
            const screen = el('div', 'pz-tv-screen');
            tv.append(el('div', 'pz-tv-ant pz-tv-ant-l'), el('div', 'pz-tv-ant pz-tv-ant-r'), el('div', 'pz-tv-body'));
            tv.lastChild.append(screen);
            body.append(tv, el('div', 'pz-reflect pz-tv-reflect'));
            const r = await P.safe(c.getLiveTvChannels({ UserId: uid, Limit: 12, AddCurrentProgram: true, EnableImages: true, ImageTypeLimit: 1, EnableUserData: false }));
            if (!live()) return;
            const chan = P.items(r).find((x) => x.CurrentProgram) || P.items(r)[0];
            if (!chan) { body.append(textBlock('pz-side-info', [['pz-big', 'No Live TV channels'], ['pz-meta', 'This server has no tuner or guide set up.']])); return; }
            const now = chan.CurrentProgram;
            P.bg(screen, (now && P.thumbArt(now, 800)) || P.thumbArt(chan, 800));
            const lines = [['pz-kicker', `NOW · ${chan.ChannelNumber ? 'CH ' + chan.ChannelNumber : chan.Name}`], ['pz-big', now ? now.Name : chan.Name]];
            const info = textBlock('pz-side-info', lines);
            if (now) {
                info.append(el('div', 'pz-meta', `${P.time(now.StartDate)} – ${P.time(now.EndDate)}`));
                const s = Date.parse(now.StartDate), e = Date.parse(now.EndDate);
                info.append(bar(Math.max(0, Math.min(1, (Date.now() - s) / (e - s || 1)))));
            }
            body.append(info);
            return;
        }
        if (kind === 'resume') {
            const it = items[0], nx = items[1];
            if (!it) { body.append(textBlock('pz-centre-info', [['pz-big', 'Nothing in progress'], ['pz-meta', 'Whatever you stop part-way shows here.']])); return; }
            body.append(P.disc(it, 'big'));
            if (nx) body.append(P.disc(nx, 'next'), textBlock('pz-next-label', [['', 'Next'], ['', nx.Type === 'Episode' ? nx.SeriesName : nx.Name]]));
            const info = textBlock('pz-centre-info', [['pz-big', it.Type === 'Episode' ? it.SeriesName : it.Name],
                ['pz-meta', [it.Type === 'Episode' ? `${P.episodeCode(it)} · ${it.Name}` : P.meta(it), P.left(it)].filter(Boolean).join(' · ')]]);
            info.append(bar(P.progress(it)));
            body.append(info);
            return;
        }
        if (kind === 'nextup') {
            const it = items[0];
            if (!it) { body.append(textBlock('pz-centre-info', [['pz-big', 'Nothing up next'], ['pz-meta', 'Start a series and its next episode shows here.']])); return; }
            const stack = el('div', 'pz-stack');
            const top = items.slice(0, 3);
            for (let k = top.length - 1; k >= 0; k--) { const card = el('div', 'pz-stack-card pz-stack-' + k); P.bg(card, P.thumbArt(top[k], 800)); stack.append(card); }
            stack.lastChild.append(el('div', 'pz-play-badge'));
            body.append(stack, el('div', 'pz-reflect pz-stack-reflect'),
                textBlock('pz-side-info', [['pz-kicker', 'NEXT EPISODE'], ['pz-big', it.SeriesName], ['pz-line', `${P.episodeCode(it)} · ${it.Name}`],
                    ['pz-meta', P.runtime(it.RunTimeTicks)], ['pz-sub', items[1] ? `Then: ${items[1].SeriesName} · ${P.episodeCode(items[1])}` : '']]));
            return;
        }
        const v = ch.view;
        if (kind === 'tvshows' && v) {
            const r = await P.safe(c.getItems(uid, { ParentId: v.Id, IncludeItemTypes: 'Series', Recursive: true, SortBy: 'DateLastContentAdded,DateCreated', SortOrder: 'Descending', Limit: 1, Fields: P.FIELDS }));
            const series = P.items(r)[0];
            if (!live()) return;
            if (!series) { body.append(textBlock('pz-centre-info', [['pz-big', 'No shows yet']])); return; }
            const nu = P.items(await P.safe(c.getNextUpEpisodes({ UserId: uid, SeriesId: series.Id, Limit: 1, Fields: P.FIELDS })))[0];
            if (!live()) return;
            const tv = el('div', 'pz-tv pz-tv-plain');
            const screen = el('div', 'pz-tv-screen');
            P.bg(screen, P.wideArt(series, 1000));
            tv.append(el('div', 'pz-tv-body'));
            tv.lastChild.append(screen);
            const seasons = el('div', 'pz-seasons');
            seasons.append(el('div', 'pz-season pz-season-2'), el('div', 'pz-season pz-season-1'),
                el('div', 'pz-season pz-season-0', nu ? `Season ${nu.ParentIndexNumber}` : `${series.ChildCount || ''} seasons`));
            body.append(tv, el('div', 'pz-reflect pz-tv-reflect'), seasons,
                textBlock('pz-side-info pz-below-seasons', [['pz-big', series.Name], ['pz-meta', P.meta(series)], ['pz-accent', nu ? `Next: ${P.episodeCode(nu)} · ${nu.Name}` : '']]));
            return;
        }
        if (kind === 'music' && v) {
            const r = await P.safe(c.getItems(uid, { ParentId: v.Id, IncludeItemTypes: 'MusicAlbum', Recursive: true, SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 1, Fields: P.FIELDS }));
            const album = P.items(r)[0];
            if (!live()) return;
            if (!album) { body.append(textBlock('pz-centre-info', [['pz-big', 'No music yet']])); return; }
            const tracks = P.items(await P.safe(c.getItems(uid, { ParentId: album.Id, SortBy: 'ParentIndexNumber,IndexNumber,SortName', Limit: 3 })));
            if (!live()) return;
            const record = el('div', 'pz-record');
            const lbl = el('div', 'pz-record-label');
            P.bg(lbl, P.posterArt(album, 300));
            record.append(lbl);
            const sleeve = el('div', 'pz-sleeve');
            P.bg(sleeve, P.posterArt(album, 600));
            const info = textBlock('pz-side-info', [['pz-kicker', 'ALBUM'], ['pz-big', album.Name],
                ['pz-meta', [album.AlbumArtist, album.ProductionYear, album.ChildCount ? `${album.ChildCount} tracks` : ''].filter(Boolean).join(' · ')]]);
            const list = el('div', 'pz-tracks');
            tracks.forEach((x, k) => list.append(el('div', k === 2 ? 'pz-faint' : '', `${x.IndexNumber || k + 1}. ${x.Name}`)));
            info.append(list);
            body.append(record, sleeve, el('div', 'pz-reflect pz-sleeve-reflect'), el('div', 'pz-note'), info);
            return;
        }
        // Movies and every other library: a fan of its newest posters, the newest in front.
        const fan = el('div', 'pz-fan');
        [3, 1, 0, 2, 4].forEach((k, pos) => {
            const it = items[k];
            const p = el('div', 'pz-fan-card pz-fan-' + Math.abs(pos - 2));
            if (it) P.bg(p, P.posterArt(it, 500) || P.wideArt(it, 500)); else p.classList.add('pz-fan-empty');
            fan.append(p);
        });
        const lead = items[0];
        body.append(fan, el('div', 'pz-reflect pz-fan-reflect'),
            textBlock('pz-centre-info pz-fan-info', lead ? [['pz-big', lead.Type === 'Episode' ? lead.SeriesName : lead.Name], ['pz-meta', P.meta(lead)]] : [['pz-big', ch.label], ['pz-meta', 'Nothing here yet']]));
    }

    // ---- the home screen ----
    const home = {
        // The current page's channels and the bar use the engine's spatial focus; this turns pages at the edges and
        // keeps the card modal (left/right past its buttons step to the neighbouring channel).
        onAction(action, ctx) {
            if (!S) return false;
            P.sawAction();
            if (action === 'search') { ctx.navigate('#/search'); return true; }
            if (S.busy) return true;
            if (S.card) {
                const btns = S.card.buttons || [];
                const i = btns.indexOf(ctx.focused());
                if (action === 'back' || action === 'home') { closeCard(); ctx.sound('back'); return true; }
                if (action === 'left' || action === 'right') {
                    const d = action === 'right' ? 1 : -1;
                    if (btns[i + d]) { ctx.focus(btns[i + d]); ctx.sound('focus'); } else stepCard(d);
                    return true;
                }
                return action === 'up' || action === 'down';
            }
            const i = S.tiles ? S.tiles.indexOf(ctx.focused()) : -1;
            if (i >= 0 && (action === 'left' || action === 'right')) {
                const k = i % (S.cols * ROWS), col = k % S.cols, row = Math.floor(k / S.cols);
                if (action === 'left' && col === 0) { turn(S.page - 1, row * S.cols + S.cols - 1); return true; }
                if (action === 'right' && col === S.cols - 1) { turn(S.page + 1, row * S.cols); return true; }
            }
            return false;
        },
        onBack() { return closeCard(); },
        mount(root) {
            root.setAttribute('data-pz', 'home');
            ui.pointerFirst(true);
            S = { root, page: 0, card: null, busy: false, tiles: [] };
            const stage = el('div', 'pz-stage');
            S.track = el('div', 'pz-track');
            const prev = el('div', 'pz-arrow pz-prev pz-hidden'), next = el('div', 'pz-arrow pz-next pz-hidden');
            prev.setAttribute('aria-label', 'Previous page');
            next.setAttribute('aria-label', 'Next page');
            prev.addEventListener('click', () => S && turn(S.page - 1));
            next.addEventListener('click', () => S && turn(S.page + 1));
            S.arrows = [prev, next];
            stage.append(S.track, prev, next);

            const barEl = el('div', 'pz-bar');
            barEl.innerHTML = '<svg class="pz-bar-svg" preserveAspectRatio="none" aria-hidden="true"><path class="pz-bar-fill"/><path class="pz-bar-shine"/><path class="pz-bar-line"/></svg>';
            S.barSvg = barEl.firstChild;
            const round = (cls, label, go) => { const b = P.focusable(el('div', 'pz-round ' + cls)); b.setAttribute('aria-label', label); b.addEventListener('click', go); return b; };
            const settings = round('pz-left', 'Settings', () => T.ctx.navigate('#/mypreferencesmenu'));
            settings.append(el('span', 'pz-round-mark', 'icefin'));
            const search = round('pz-right', 'Search', () => T.ctx.navigate('#/search'));
            search.innerHTML = '<svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="7"/><path d="M36 36 L52 52" stroke="currentColor" stroke-width="9" stroke-linecap="round"/></svg>';
            const clock = el('div', 'pz-clock'), date = el('div', 'pz-date');
            const tick = () => {
                const d = new Date();
                const parts = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).split(' ');
                clock.textContent = parts[0];
                if (parts[1]) clock.append(el('span', 'pz-ampm', parts[1]));
                date.textContent = d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
            };
            tick();
            S.clockTimer = setInterval(tick, 15000);
            barEl.append(clock, date, settings, search);
            root.append(stage, barEl);
            S.onResize = () => {
                if (!S || !S.list) return;
                const idx = S.tiles.indexOf(T.ctx.focused());
                fill(S.list);
                if (idx >= 0 && S.tiles[idx]) T.ctx.focus(S.tiles[idx]);
            };
            window.addEventListener('resize', S.onResize);
            root.plazaFill = (list) => fill(list);
            layout();

            const mine = S;
            Promise.all([ui.userViews(), P.safe(P.client().getItems(P.uid(), { Filters: 'IsFavorite', Recursive: true, Limit: 24, SortBy: 'SortName',
                IncludeItemTypes: 'Movie,Series,Episode,MusicAlbum,MusicVideo,Video,BoxSet,Playlist,Audio', Fields: P.FIELDS })).then(P.items)])
                .then(([views, favs]) => {
                    if (S !== mine) return;
                    fill(channels(views, favs));
                    const reopen = P.reopen && S.list.find((x) => x.id === P.reopen);
                    P.reopen = null;
                    const t = reopen ? S.tiles.find((x) => x.plazaChannel === reopen) : S.tiles[0];
                    if (!t) return;
                    if (reopen) { const pg = Number(t.getAttribute('data-pz-page')); if (pg !== S.page) show(pg, false); T.ctx.focus(t); openCard(reopen, t, false); }
                    else T.ctx.focus(t);
                });
        },
        unmount() {
            if (!S) return;
            if (S.card && S.card.preview) S.card.preview.stop();
            clearInterval(S.clockTimer);
            window.removeEventListener('resize', S.onResize);
            ui.pointerFirst(false);
            S = null;
        }
    };

    // #/home is the home, or one of Plaza's own menus when the query names one (?pz=resume, nextup, series, library).
    let active = null;
    T.registerScreen('#/home', {
        mount(root, ctx) {
            const view = P.params().get('pz');
            active = view && P.menus ? P.menus.screen(view) : home;
            active.mount(root, ctx);
        },
        onAction: (a, ctx) => !!(active && active.onAction && active.onAction(a, ctx)),
        onBack: () => !!(active && active.onBack && active.onBack()),
        unmount() { if (active && active.unmount) active.unmount(); active = null; }
    });
})();

// Details (PLAN 9.18): the engine's details screen (every feature of the stock page) in this theme's layout; the look
// is in styles.css, "Details".
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.details) T.registerScreen('#/details', T.ui.details.screen({ layout: 'banner' }));
})();

// Player controls (PLAN 9.19): jellyfin-web's own controls (every function kept) in this theme's layout; the look is
// the osd.* tokens in tokens.json.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.osd) T.ui.osd.set({ layout: 'panel', align: 'center' });
})();

// Settings (PLAN 9.24): the engine's settings area (Client settings, Classic View, Server Settings) in this theme's look.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.settings) T.registerScreen('#/mypreferencesmenu', T.ui.settings.screen({ layout: 'tiles' }));
})();
