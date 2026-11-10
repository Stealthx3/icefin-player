// Marquee (benchmark theme, PLAN 9.13; its target is named in docs/PLAN.md). Built from the engine's generic capabilities
// only: an icon rail that widens with labels while it has focus (ui.chrome side rail with collapsedWidth), a billboard
// whose muted trailer starts after a dwell and shrinks the title away (ui.mutedPreview), rows that jump a page at a time,
// and a focused card that grows into an inline preview over its neighbours (ui.cardExpand). Every other route is
// jellyfin-web's own page, styled by tokens.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const E = T._engine;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const FIELDS = 'PrimaryImageAspectRatio,Overview,ProductionYear,RunTimeTicks,OfficialRating,CommunityRating,UserData,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ParentThumbItemId,ParentThumbImageTag,LocalTrailerCount,ChildCount';
    const DWELL = 2500;  // ms on the billboard before its trailer starts

    let S = null;

    // ---- images ----
    const tags = (it) => it.ImageTags || {};
    function boxart(c, it, w) {
        if (tags(it).Thumb) return c.getScaledImageUrl(it.Id, { type: 'Thumb', maxWidth: w, tag: tags(it).Thumb });
        if (it.ParentThumbImageTag) return c.getScaledImageUrl(it.ParentThumbItemId, { type: 'Thumb', maxWidth: w, tag: it.ParentThumbImageTag });
        if ((it.BackdropImageTags || []).length) return c.getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: w, tag: it.BackdropImageTags[0] });
        if ((it.ParentBackdropImageTags || []).length) return c.getScaledImageUrl(it.ParentBackdropItemId, { type: 'Backdrop', maxWidth: w, tag: it.ParentBackdropImageTags[0] });
        if (tags(it).Primary) return c.getScaledImageUrl(it.Id, { type: 'Primary', maxWidth: w, tag: tags(it).Primary });
        return '';
    }
    const details = (c, it) => { location.hash = `#/details?id=${it.Id}&serverId=${c.serverId()}`; };
    const minutes = (it) => (it.RunTimeTicks >= 600000000 ? `${Math.round(it.RunTimeTicks / 600000000)} min` : null);
    const label = (it) => (it.Type === 'Episode' && it.SeriesName ? `${it.SeriesName} · ${it.Name}` : it.Name);
    // A stream for a preview: the item's local trailer, else the item itself (a series' first episode).
    async function previewId(c, it) {
        const uid = c.getCurrentUserId();
        if (it.LocalTrailerCount) {
            const tr = await c.getLocalTrailers(uid, it.Id).catch(() => null);
            if (tr && tr[0]) return { id: tr[0].Id, start: 0 };
        }
        if (it.Type === 'Series') {
            const eps = await c.getItems(uid, { ParentId: it.Id, Recursive: true, IncludeItemTypes: 'Episode', SortBy: 'ParentIndexNumber,IndexNumber', Limit: 1 }).catch(() => null);
            const ep = eps && eps.Items && eps.Items[0];
            return ep ? { id: ep.Id, start: 0 } : null;
        }
        if (it.MediaType !== 'Video') return null;
        return { id: it.Id, start: it.RunTimeTicks ? Math.round(it.RunTimeTicks / 1e7 * 0.1) : 0 };  // past the opening
    }

    // ---- rail ----
    ui.chrome.set('sideRail', {
        collapsedWidth: '6vw',
        width: '22vw',
        async mount(rail) {
            const views = await ui.userViews();
            const c = window.ApiClient;  // a cold start creates the client late: read it after userViews
            const entries = [{ icon: '⌕', label: 'Search', hash: '#/search' }, { icon: '⌂', label: 'Home', home: true }];
            for (const v of views) entries.push({ icon: v.CollectionType === 'tvshows' ? '▭' : v.CollectionType === 'music' ? '♪' : '▤', label: v.Name, view: v });
            entries.push({ icon: '⚙', label: 'Settings', hash: '#/mypreferencesmenu' }, { icon: '↺', label: 'Classic home', hash: '#/home?icefin=stock' });
            if (!S) return;
            S.rail = entries.map((x) => {
                const b = el('div', 'mq-nav' + (x.home ? ' current' : ''));
                b.setAttribute('data-icefin-focus', '');
                b.tabIndex = -1;
                b.append(el('span', 'mq-icon', x.icon), el('span', 'icefin-rail-label', x.label));
                b.addEventListener('click', () => {
                    if (x.hash) location.hash = x.hash;
                    else if (x.view) location.hash = x.view.CollectionType === 'livetv' ? '#/livetv' : `#/list?parentId=${x.view.Id}&serverId=${c.serverId()}`;
                    else focusBillboard(0);
                });
                rail.append(b);
                return b;
            });
            S.parts++;
            S.maybeReady();
        }
    });

    // ---- billboard ----
    let dwellTimer = null;
    function armTrailer() {
        clearTimeout(dwellTimer);
        if (ui.motion.reduced() || !S.bill.item) return;
        const it = S.bill.item;
        dwellTimer = setTimeout(async () => {
            if (!S || !S.bill.btns.includes(E.focused())) return;
            const p = await previewId(S.client, it);
            if (!p || !S || !S.bill.btns.includes(E.focused()) || S.bill.preview) return;
            const pv = ui.mutedPreview(S.bill.video, { itemId: p.id, startSeconds: p.start, maxWidth: 1280 });
            S.bill.preview = pv;
            S.root.setAttribute('data-mq-trailer', 'playing');
            pv.video.addEventListener('ended', stopTrailer);
            pv.video.addEventListener('error', stopTrailer);  // keep the artwork
        }, DWELL);
    }
    function stopTrailer() {
        clearTimeout(dwellTimer);
        if (S && S.bill.preview) { S.bill.preview.stop(); S.bill.preview = null; S.root.removeAttribute('data-mq-trailer'); }
    }

    // ---- rows: page jumps ----
    function Row(title, items) {
        const section = el('section', 'mq-row');
        section.append(el('div', 'mq-row-title', title));
        const view = el('div', 'mq-view');
        const track = el('div', 'mq-track');
        view.append(track);
        section.append(view);
        const row = { section, track, items, index: 0, page: 0, cards: [] };
        row.setItems = (list) => {  // also used by the page-jump check in tests
            row.items = list;
            row.index = 0;
            track.textContent = '';
            row.cards = list.map((it, i) => {
                const card = el('div', 'mq-card');
                card.setAttribute('data-icefin-focus', '');
                card.tabIndex = -1;
                card.marqueeIndex = i;
                card.marqueeItem = it;
                card.append(el('div', 'mq-card-name', label(it)));
                const img = boxart(S.client, it, 480);
                if (img) card.style.backgroundImage = `url("${img}")`;
                const ticks = it.UserData && it.UserData.PlaybackPositionTicks;
                if (ticks && it.RunTimeTicks) { const p = el('div', 'mq-progress'); const b = el('i'); b.style.width = `${Math.min(100, (100 * ticks) / it.RunTimeTicks).toFixed(1)}%`; p.append(b); card.append(p); }
                card.addEventListener('click', () => details(S.client, it));
                track.append(card);
                return card;
            });
            track.style.transform = '';
        };
        row.setItems(items);
        section.marqueeRow = row;
        // Cards per page: what fits whole in the view; the next page peeks in at the right edge.
        row.perPage = () => {
            const step = row.cards.length > 1 ? row.cards[1].offsetLeft - row.cards[0].offsetLeft : row.cards[0].offsetWidth;
            return Math.max(1, Math.floor((view.offsetWidth - row.cards[0].offsetLeft) / step));
        };
        row.layout = () => {
            const per = row.perPage();
            row.page = Math.floor(row.index / per);
            const step = row.cards.length > 1 ? row.cards[1].offsetLeft - row.cards[0].offsetLeft : 0;
            track.style.transform = `translateX(${-row.page * per * step}px)`;
            section.setAttribute('data-mq-page', String(row.page));
        };
        row.expand = ui.cardExpand(track, {
            dwell: 700,
            scale: 1.45,
            detailsHeight: 0,
            height: (r) => r.height * 1.45 / 0.58,
            item: (card) => card.marqueeItem,
            preview: (it) => (it.MediaType === 'Video' ? it.Id : null),
            render(it, panel) {
                panel.classList.add('mq-expanded');
                const art = el('div', 'mq-x-art');
                const img = boxart(S.client, it, 960);
                if (img) art.style.backgroundImage = `url("${img}")`;
                art.append(el('div', 'icefin-expand-video'));
                const body = el('div', 'mq-x-body');
                body.append(el('div', 'mq-x-title', label(it)));
                const meta = el('div', 'mq-x-meta');
                if (it.CommunityRating) meta.append(el('b', null, `★ ${it.CommunityRating.toFixed(1)}  `));
                meta.append(document.createTextNode([it.ProductionYear, it.OfficialRating, minutes(it) || (it.ChildCount ? `${it.ChildCount} seasons` : null)].filter(Boolean).join('  ·  ')));
                body.append(meta, el('div', 'mq-x-overview', it.Overview || ''));
                panel.append(art, body);
            }
        });
        return row;
    }

    // ---- focus ----
    function zone(z) { S.zone = z; S.root.setAttribute('data-mq-zone', z); }
    function focusBillboard(i) {
        zone('billboard');
        S.scroll.style.transform = '';
        E.focus(S.bill.btns[Math.max(0, Math.min(S.bill.btns.length - 1, i))]);
        armTrailer();
    }
    function focusRow(r, i) {
        const row = S.rows[r];
        row.index = Math.max(0, Math.min(row.items.length - 1, i));
        row.layout();
        zone('rows');
        S.rowIndex = r;
        stopTrailer();
        E.focus(row.cards[row.index]);
        // the billboard scrolls away: the focused row takes the first row's place
        S.scroll.style.transform = r === 0 ? 'translateY(-34vh)' : `translateY(calc(-34vh - ${row.section.offsetTop - S.rows[0].section.offsetTop}px))`;
    }
    function focusRail() {
        stopTrailer();
        const cur = S.rail.find((b) => b.classList.contains('current')) || S.rail[0];
        S.back = E.focused();
        zone('rail');
        E.focus(cur);
    }

    T.registerScreen('#/home', {
        onAction(action, ctx) {
            if (!S || !S.ready) return false;
            const f = ctx.focused();
            if (S.rail.includes(f)) {
                const i = S.rail.indexOf(f);
                if (action === 'up' || action === 'down') { const n = i + (action === 'down' ? 1 : -1); if (n >= 0 && n < S.rail.length) { E.focus(S.rail[n]); ctx.sound('focus'); } return true; }
                if (action === 'right' || action === 'back') {
                    const b = S.back && S.back.isConnected ? S.back : S.bill.btns[0];
                    const r = S.rows.findIndex((row) => row.track.contains(b));
                    if (r >= 0) focusRow(r, S.rows[r].index); else focusBillboard(Math.max(0, S.bill.btns.indexOf(b)));
                    ctx.sound(action === 'back' ? 'back' : 'focus');
                    return true;
                }
                return action === 'left';
            }
            const bi = S.bill.btns.indexOf(f);
            if (bi >= 0) {
                if (action === 'left') { if (bi > 0) focusBillboard(bi - 1); else focusRail(); ctx.sound('focus'); return true; }
                if (action === 'right') { if (bi + 1 < S.bill.btns.length) { focusBillboard(bi + 1); ctx.sound('focus'); } return true; }
                if (action === 'down') { if (S.rows.length) { focusRow(0, S.rows[0].index); ctx.sound('focus'); } return true; }
                if (action === 'back') { focusRail(); ctx.sound('back'); return true; }
                return action === 'up';
            }
            const r = S.rows.findIndex((row) => row.track.contains(f));
            if (r < 0) return false;
            const row = S.rows[r];
            if (action === 'left') { if (row.index > 0) focusRow(r, row.index - 1); else focusRail(); ctx.sound('focus'); return true; }
            if (action === 'right') { if (row.index + 1 < row.items.length) { focusRow(r, row.index + 1); ctx.sound('focus'); } return true; }
            if (action === 'down') { if (r + 1 < S.rows.length) { focusRow(r + 1, S.rows[r + 1].index); ctx.sound('focus'); } return true; }
            if (action === 'up') { if (r > 0) focusRow(r - 1, S.rows[r - 1].index); else if (S.bill.item) focusBillboard(0); ctx.sound('focus'); return true; }
            if (action === 'back') { row.expand.collapse(); focusBillboard(0); ctx.sound('back'); return true; }
            return false;  // Enter: the engine clicks the card
        },
        async mount(root, ctx) {
            root.setAttribute('data-mq', 'home');
            S = { client: window.ApiClient, root, rail: [], rows: [], zone: 'billboard', ready: false, parts: 0 };
            S.maybeReady = () => {
                if (S.parts < 2 || S.ready) return;
                S.ready = true;
                root.setAttribute('data-mq-ready', String(S.rows.length));
                if (S.bill.item) focusBillboard(0); else if (S.rows.length) focusRow(0, 0); else E.focus(S.rail[0]);
            };
            const content = ui.chrome.frame(root, ctx);
            S.scroll = el('div', 'mq-scroll');
            content.append(S.scroll);
            const bill = { el: el('div', 'mq-billboard'), item: null, preview: null };
            bill.art = el('div', 'mq-art');
            bill.video = el('div', 'mq-video');
            const info = el('div', 'mq-info');
            bill.title = el('div', 'mq-title');
            bill.overview = el('div', 'mq-overview');
            const btns = el('div', 'mq-btns');
            bill.btns = ['▶  Play', 'ⓘ  More info'].map((t, i) => {
                const b = el('div', 'mq-btn', t);
                b.setAttribute('data-icefin-focus', '');
                b.tabIndex = -1;
                b.addEventListener('click', () => {
                    if (!bill.item) return;
                    stopTrailer();
                    const pm = window.icefinPlaybackManager;
                    if (i === 0 && pm && bill.item.MediaType === 'Video') pm.play({ ids: [bill.item.Id], serverId: S.client.serverId(), startPositionTicks: 0 });
                    else details(S.client, bill.item);
                });
                btns.append(b);
                return b;
            });
            info.append(bill.title, bill.overview, btns);
            bill.el.append(bill.art, bill.video, el('div', 'mq-scrim'), info);
            S.bill = bill;
            S.rowsBox = el('div', 'mq-rows');
            S.scroll.append(bill.el, S.rowsBox);

            const views = await ui.userViews();
            if (!S || S.root !== root) return;
            S.client = window.ApiClient;  // a cold start creates the client late: read it after userViews
            const c = S.client, uid = c.getCurrentUserId();
            const get = (p) => Promise.resolve(p).then((r) => (r && (r.Items || r)) || [], () => []);
            const [featured, resume, nextUp] = await Promise.all([
                get(c.getItems(uid, { Recursive: true, IncludeItemTypes: 'Movie,Series', SortBy: 'Random', Limit: 1, Fields: FIELDS })),
                get(c.getResumableItems(uid, { Limit: 40, MediaTypes: 'Video', Fields: FIELDS })),
                get(c.getNextUpEpisodes({ UserId: uid, Limit: 40, Fields: FIELDS }))
            ]);
            if (!S || S.root !== root) return;
            const it = featured[0];
            bill.item = it || null;
            if (it) {
                const art = (it.BackdropImageTags || []).length ? c.getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: 1920, tag: it.BackdropImageTags[0] }) : boxart(c, it, 1920);
                if (art) bill.art.style.backgroundImage = `url("${art}")`;
                if (tags(it).Logo) { const img = el('img'); img.alt = it.Name; img.src = c.getScaledImageUrl(it.Id, { type: 'Logo', maxWidth: 800, tag: tags(it).Logo }); bill.title.append(img); }
                else bill.title.textContent = it.Name;
                bill.overview.textContent = it.Overview || '';
                bill.el.setAttribute('data-mq-item', it.Id);
            } else bill.el.hidden = true;
            const rows = [];
            if (resume.length) rows.push(['Continue Watching', resume]);
            if (nextUp.length) rows.push(['Next Up', nextUp]);
            for (const v of views.filter((x) => x.CollectionType !== 'livetv')) {  // Live TV has channels, not new items
                const items = await get(c.getLatestItems({ userId: uid, parentId: v.Id, Limit: 40, Fields: FIELDS }));
                if (items.length) rows.push([`New in ${v.Name}`, items]);
            }
            if (!S || S.root !== root) return;
            S.rows = rows.map(([t, items]) => { const r = Row(t, items); S.rowsBox.append(r.section); return r; });
            S.parts++;
            S.maybeReady();
        },
        unmount() {
            stopTrailer();
            if (S) S.rows.forEach((r) => r.expand.collapse());
            S = null;
        }
    });
})();
