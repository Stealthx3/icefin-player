// Plaza (benchmark theme, PLAN 9.7, 9.32; its target is named in docs/PLAN.md). The home: pages of rounded channels in
// three rows, as many columns as the screen's width holds at the channels' own size (four at 16:9), the neighbouring
// pages peeking at the sides with page arrows over them; a bottom bar whose top edge dips into a notch that holds the
// clock, the date under it, and two round buttons (settings, search). Channels: each library (an animated illustration
// of its kind under its name, with its newest art coming through like a banner), Continue Watching (a turning disc
// printed with the item's art), Next Up, then each favourite as a channel of its own, then empty slots.
// Channels move like on the target (user request 2026-11-11): hold a channel (or drag it) with the pointer, or press Menu
// on it with a controller; it lifts and follows, the page edges turn the page, and dropping it on a slot moves it there
// (swapping with the channel already there). Back cancels. The order, gaps included, is kept per user on this device.
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
        if (v.CollectionType === 'homevideos' || v.CollectionType === 'photos') return `#/homevideos?${q}&name=${encodeURIComponent(v.Name || '')}`;
        if (v.CollectionType === 'books') return `#/books?${q}&name=${encodeURIComponent(v.Name || '')}`;
        if (v.CollectionType === 'playlists') return `#/playlists?serverId=${sid}`;
        if (v.CollectionType === 'musicvideos') return `#/musicvideos?${q}&name=${encodeURIComponent(v.Name || '')}`;
        if (v.CollectionType === 'boxsets') return `#/boxsets?${q}&name=${encodeURIComponent(v.Name || '')}`;
        return `#/home?pz=library&id=${v.Id}&kind=${P.kindOf(v.CollectionType)}&name=${encodeURIComponent(v.Name || '')}`;
    }
    function channels(views, favourites, hasPlaylists) {
        const c = P.client(), uid = P.uid();
        const list = views.map((v) => ({
            id: 'library-' + v.Id, kind: P.kindOf(v.CollectionType), label: v.Name, view: v, menu: libraryMenu(v),
            fetch: () => (v.CollectionType === 'livetv' ? Promise.resolve([])
                // Collections: a random handful of the collections themselves, new each time (user feedback).
                // (those with art first; a server whose collections have none still shows them)
                : v.CollectionType === 'boxsets' ? P.safe(c.getItems(uid, { ParentId: v.Id, IncludeItemTypes: 'BoxSet', Recursive: true, SortBy: 'Random',
                    ImageTypes: 'Primary', Limit: 6, Fields: P.FIELDS })).then(P.items).then((items) => (items.length ? items
                    : P.safe(c.getItems(uid, { ParentId: v.Id, IncludeItemTypes: 'BoxSet', Recursive: true, SortBy: 'Random', Limit: 6, Fields: P.FIELDS })).then(P.items)))
                : P.safe(c.getLatestItems({ userId: uid, parentId: v.Id, Limit: 6, Fields: P.FIELDS })).then(P.items))
        }));
        list.push(
            { id: 'resume', kind: 'resume', label: 'Continue Watching', menu: '#/home?pz=resume',
                fetch: () => P.safe(c.getResumableItems(uid, { Limit: 6, MediaTypes: 'Video', Fields: P.FIELDS })).then(P.items) },
            { id: 'nextup', kind: 'nextup', label: 'Next Up', menu: '#/home?pz=nextup',
                fetch: () => P.safe(c.getNextUpEpisodes({ UserId: uid, Limit: 6, Fields: P.FIELDS })).then(P.items) });
        // Playlists: a channel of its own whenever there are playlists and no Playlists library shows them (9.44)
        if (hasPlaylists && !views.some((v) => v.CollectionType === 'playlists'))
            list.push({ id: 'playlists', kind: 'playlists', label: 'Playlists', menu: `#/playlists?serverId=${P.sid()}`,
                fetch: () => P.safe(c.getItems(uid, { IncludeItemTypes: 'Playlist', Recursive: true, SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 6, Fields: P.FIELDS })).then(P.items) });
        for (const f of favourites) list.push({ id: 'fav-' + f.Id, kind: 'favourite', label: f.Name, play: f, items: [f] });
        return list;
    }

    // ---- the order: slot ids (null for an empty slot) per user, on this device ----
    const orderKey = () => 'icefin.plaza.order.' + P.uid();
    function loadOrder() {
        try { const v = JSON.parse(localStorage.getItem(orderKey()) || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; }
    }
    function saveOrder(slots) {
        const ids = slots.map((c) => (c ? c.id : null));
        while (ids.length && ids[ids.length - 1] === null) ids.pop();
        try { localStorage.setItem(orderKey(), JSON.stringify(ids)); } catch (e) { /* the order just isn't kept */ }
    }
    // Saved slots first; a channel the order doesn't know yet (a new library or favourite) takes the first empty slot.
    function arrange(list) {
        const order = loadOrder();
        if (!order) return [...list];
        const byId = new Map(list.map((c) => [c.id, c]));
        const used = new Set();
        const slots = order.map((id) => {
            const c = id && byId.get(id);
            if (!c || used.has(c)) return null;
            used.add(c);
            return c;
        });
        for (const c of list) {
            if (used.has(c)) continue;
            const k = slots.indexOf(null);
            if (k >= 0) slots[k] = c; else slots.push(c);
        }
        return slots;
    }

    let S = null;  // the home while it is up

    // ---- tiles ----
    function tile(ch) {
        const t = el('div', 'pz-tile' + (ch ? ' pz-k-' + ch.kind : ' empty'));
        t.plazaChannel = ch || null;
        t.addEventListener('click', () => {
            if (!S || S.card || S.busy || S.drag || Date.now() - (S.dropped || 0) < 400) return;
            const page = Number(t.getAttribute('data-pz-page'));
            if (page !== S.page) { turn(page); return; }  // a channel peeking from the next page turns to it
            if (!ch) return;
            T.ctx.sound('select');
            select(t);
        });
        if (!ch) { t.append(el('div', 'pz-tile-mark', 'icefin')); return t; }
        t.addEventListener('pointerdown', (e) => press(t, e));
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
        S.channels = list;
        place(arrange(list));
    }
    // Draws the slots (channels and gaps) page by page.
    function place(slots) {
        layout();
        const per = S.cols * ROWS;
        while (slots.length % per || !slots.length) slots.push(null);  // empty slots, like the target
        S.slots = slots;
        S.list = slots.filter(Boolean);
        S.pages = slots.length / per;
        S.track.textContent = '';
        S.tiles = [];
        for (let p = 0; p < S.pages; p++) {
            const page = el('div', 'pz-page');
            page.style.setProperty('--pz-p', String(p));
            for (const ch of slots.slice(p * per, p * per + per)) {
                const t = tile(ch);
                t.setAttribute('data-pz-page', String(p));
                t.setAttribute('data-pz-row', String(Math.floor((S.tiles.length % per) / S.cols)));
                t.setAttribute('data-pz-slot', String(S.tiles.length));
                S.tiles.push(t);
                page.append(t);
            }
            S.track.append(page);
        }
        S.root.setAttribute('data-pz-ready', String(S.list.length));
        if (S.drag && S.tiles[S.drag.from]) S.tiles[S.drag.from].classList.add('pz-lifted');
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
        if (S && S.drag && p === S.pages) place(S.slots.concat(new Array(S.cols * ROWS).fill(null)));  // a fresh page to move onto
        if (!S || p < 0 || p >= S.pages || p === S.page) return false;
        show(p, true);
        T.ctx.sound('navigate');
        const t = S.tiles[p * S.cols * ROWS + (focusIndex || 0)];
        if (t) T.ctx.focus(t);
        return true;
    }

    // ---- moving a channel ----
    const HOLD_MS = 450, SLOP = 12, EDGE_MS = 650;
    function press(t, e) {
        if (!S || S.card || S.busy || S.drag || e.button !== 0) return;
        if (Number(t.getAttribute('data-pz-page')) !== S.page) return;
        const i = S.tiles.indexOf(t);
        const pt = { x: e.clientX, y: e.clientY };
        S.press = { i, pt, timer: setTimeout(() => { if (S && S.press) { S.press = null; lift(i, 'pointer', pt); } }, HOLD_MS) };
    }
    function lift(i, mode, pt) {
        const t = S.tiles[i], ch = S.slots[i];
        if (!t || !ch || S.card || S.busy || S.drag) return false;
        const r = t.getBoundingClientRect(), base = S.root.getBoundingClientRect();
        const ghost = t.cloneNode(true);
        ghost.className = t.className.replace(/\b(icefin-focused|pz-off-page)\b/g, '') + ' pz-ghost pz-ghost-' + mode;
        ghost.removeAttribute('data-icefin-focus');
        ghost.removeAttribute('data-pz-slot');
        ghost.setAttribute('aria-hidden', 'true');
        Object.assign(ghost.style, { left: `${r.left - base.left}px`, top: `${r.top - base.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        const hint = el('div', 'pz-move-hint');
        hint.append(el('span', 'pz-move-name', ch.label),
            el('span', '', mode === 'pad' ? 'Arrows move it · OK places it · Back cancels' : 'Drop it on a slot · the sides turn the page'));
        S.root.append(ghost, hint);
        t.classList.add('pz-lifted');
        S.root.setAttribute('data-pz-moving', ch.id);
        S.drag = { from: i, ch, ghost, hint, mode, over: i, dx: pt ? pt.x - r.left : r.width / 2, dy: pt ? pt.y - r.top : r.height / 2, edge: null };
        T.ctx.sound('select');
        if (mode === 'pad') follow();
        return true;
    }
    function target(i) {
        for (const x of S.tiles) x.classList.toggle('pz-drop', S.tiles.indexOf(x) === i && i !== S.drag.from);
        S.drag.over = i;
    }
    // Controller: the lifted channel rides over the focused slot.
    function follow() {
        const d = S && S.drag;
        if (!d) return;
        const t = T.ctx.focused();
        const i = S.tiles.indexOf(t);
        if (i < 0) return;
        const r = t.getBoundingClientRect(), base = S.root.getBoundingClientRect();
        Object.assign(d.ghost.style, { left: `${r.left - base.left}px`, top: `${r.top - base.top}px` });
        target(i);
    }
    // Pointer: the channel follows it; held at a side, the page turns.
    function drag(e) {
        if (!S) return;
        if (S.press && !S.drag && Math.hypot(e.clientX - S.press.pt.x, e.clientY - S.press.pt.y) > SLOP) {
            const p = S.press; clearTimeout(p.timer); S.press = null;
            lift(p.i, 'pointer', p.pt);
        }
        const d = S.drag;
        if (!d || d.mode !== 'pointer') return;
        const base = S.root.getBoundingClientRect();
        Object.assign(d.ghost.style, { left: `${e.clientX - d.dx - base.left}px`, top: `${e.clientY - d.dy - base.top}px` });
        const under = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.classList && x.classList.contains('pz-tile') && !x.classList.contains('pz-ghost'));
        const i = under && Number(under.getAttribute('data-pz-page')) === S.page ? S.tiles.indexOf(under) : -1;
        target(i);
        const side = (e.clientX - base.left) / base.width;
        const dir = side < 0.07 ? -1 : side > 0.93 ? 1 : 0;
        if (dir !== (d.edge && d.edge.dir)) {
            if (d.edge) clearTimeout(d.edge.timer);
            d.edge = dir ? { dir, timer: setTimeout(function again() {
                if (!S || S.drag !== d || !d.edge || d.edge.dir !== dir) return;
                if (turn(S.page + dir)) d.edge.timer = setTimeout(again, EDGE_MS + 450);
            }, EDGE_MS) } : null;
        }
    }
    function release() {
        if (!S) return;
        if (S.press) { clearTimeout(S.press.timer); S.press = null; }
        const d = S.drag;
        if (!d || d.mode !== 'pointer') return;
        S.dropped = Date.now();
        drop(d.over);
    }
    function endDrag() {
        const d = S.drag;
        if (!d) return null;
        if (d.edge) clearTimeout(d.edge.timer);
        d.ghost.remove();
        d.hint.remove();
        for (const x of S.tiles) x.classList.remove('pz-lifted', 'pz-drop');
        S.root.removeAttribute('data-pz-moving');
        S.drag = null;
        return d;
    }
    // Drops the channel on slot j: an empty slot takes it, a channel there swaps with it. Elsewhere it goes back.
    function drop(j) {
        const d = endDrag();
        if (!d) return;
        const slots = S.slots.slice();
        const moved = j != null && j >= 0 && j !== d.from && j < slots.length;
        if (moved) { slots[d.from] = slots[j] || null; slots[j] = d.ch; }
        while (slots.length && !slots[slots.length - 1]) slots.pop();  // pages opened for the move and left empty go again
        place(slots);
        if (moved) saveOrder(S.slots);
        const at = S.tiles[moved ? j : d.from];
        if (at) {
            const pg = Number(at.getAttribute('data-pz-page'));
            if (pg !== S.page) show(pg, false);
            T.ctx.focus(at);
        }
        T.ctx.sound(moved ? 'select' : 'back');
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
                textBlock('pz-fav-info', [['pz-kicker', `★ FAVOURITE · ${P.typeName(it).toUpperCase()}`], ['pz-big', it.Name], ['pz-meta', P.meta(it)],
                    ['pz-overview', it.Overview || ''], ['pz-sub', P.isVideo(it) && P.left(it) ? `Resume · ${P.left(it)}` : '']]));
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
        // Collections draw a fresh random selection each time their card opens.
        const items = (kind === 'boxsets' && ch.fetch ? await ch.fetch() : ch.items) || (ch.fetch ? await ch.fetch() : []);
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
            const pic = now && P.thumbArt(now, 800);
            P.bg(screen, pic || P.thumbArt(chan, 800));
            screen.classList.toggle('pz-logo', !pic);
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
                el('div', 'pz-season pz-season-0', nu ? `Season ${nu.ParentIndexNumber}` : P.count(series.ChildCount, 'season')));
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
            if (S.drag) {
                const d = S.drag;
                if (action === 'enter' || action === 'select' || action === 'menu') { drop(d.mode === 'pad' ? S.tiles.indexOf(ctx.focused()) : d.over); return true; }
                if (action === 'back' || action === 'home') { drop(null); return true; }
                if (['up', 'down', 'left', 'right'].includes(action)) {
                    const i = S.tiles.indexOf(ctx.focused()), per = S.cols * ROWS;
                    const k = i % per, col = k % S.cols, row = Math.floor(k / S.cols);
                    if (action === 'left' && col === 0 && S.page > 0) turn(S.page - 1, row * S.cols + S.cols - 1);
                    else if (action === 'right' && col === S.cols - 1) turn(S.page + 1, row * S.cols);
                    else if (i >= 0) ctx.move(action, S.tiles[i].parentNode);
                    follow();
                    setTimeout(follow, ui.motion.duration(470));  // after a page turn settles
                }
                return true;
            }
            if (action === 'menu' && !S.card) {
                const i = S.tiles.indexOf(ctx.focused());
                if (i >= 0 && S.slots[i]) { lift(i, 'pad'); return true; }
            }
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
        onBack() {
            if (S && S.drag) { drop(null); return true; }
            if (closeCard()) return true;
            // nothing left to go back to: offer to quit (9.44)
            if (T.ctx.exit && P.sheet) {
                P.sheet.show({
                    title: 'Icefin', kind: 'livetv',
                    render(body) {
                        body.append(el('div', 'pz-sheet-question', 'Exit Icefin?'), el('div', 'pz-sheet-note', 'Anything playing stops.'));
                        const f = el('div', 'pz-panel-foot');
                        const stay = P.focusable(el('div', 'pz-tab pz-tab-on', 'Cancel'));
                        stay.addEventListener('click', () => P.sheet.close());
                        const go = P.focusable(el('div', 'pz-tab', 'Exit'));
                        go.addEventListener('click', () => T.ctx.exit());
                        f.append(stay, go);
                        body.append(f);
                    }
                });
                return true;
            }
            return false;
        },
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
            // Music playing: its capsule over the top of the page (P.miniPlayer, menus.js); up from the channels reaches it.
            if (P.miniPlayer) S.mini = P.miniPlayer(root, 'pz-mini');
            S.onResize = () => {
                if (!S || !S.slots) return;
                if (S.drag) drop(null);
                const idx = S.tiles.indexOf(T.ctx.focused());
                place(S.slots.slice());
                if (idx >= 0 && S.tiles[idx]) T.ctx.focus(S.tiles[idx]);
            };
            window.addEventListener('resize', S.onResize);
            window.addEventListener('pointermove', drag);
            window.addEventListener('pointerup', release);
            window.addEventListener('pointercancel', release);
            root.plazaFill = (list) => fill(list);
            layout();

            const mine = S;
            Promise.all([ui.userViews(), P.safe(P.client().getItems(P.uid(), { Filters: 'IsFavorite', Recursive: true, Limit: 24, SortBy: 'SortName',
                IncludeItemTypes: 'Movie,Series,Episode,MusicAlbum,MusicVideo,Video,BoxSet,Playlist,Audio', Fields: P.FIELDS })).then(P.items),
                P.safe(P.client().getItems(P.uid(), { IncludeItemTypes: 'Playlist', Recursive: true, Limit: 1 })).then((r) => P.items(r).length > 0)])
                .then(([views, favs, hasPlaylists]) => {
                    if (S !== mine) return;
                    fill(channels(views, favs, hasPlaylists));
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
            if (S.press) clearTimeout(S.press.timer);
            if (S.drag && S.drag.edge) clearTimeout(S.drag.edge.timer);
            clearInterval(S.clockTimer);
            if (S.mini) S.mini.stop();
            window.removeEventListener('resize', S.onResize);
            window.removeEventListener('pointermove', drag);
            window.removeEventListener('pointerup', release);
            window.removeEventListener('pointercancel', release);
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

// Details: details.js (9.43) frames the engine's details screen in Plaza's layout.

// Player controls (PLAN 9.19): jellyfin-web's own controls (every function kept) in this theme's layout; the look is
// the osd.* tokens in tokens.json.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.osd) T.ui.osd.set({ layout: 'panel', align: 'center' });
})();

// Settings: settings.js (9.44) frames the engine's settings area in Plaza's layout.
