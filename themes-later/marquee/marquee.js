// Marquee (benchmark theme, PLAN 9.13; its target is named in docs/PLAN.md). Built from the engine's generic capabilities
// only: a navigation bar along the top (ui.chrome top bar), and rows of titles where the focused row stands tall at the
// top with its focused card widened to 16:9 and the title's details under it, the other rows small and wide below. After a
// dwell a muted preview plays in the widened card (ui.mutedPreview: the page's own <video>, never mpv). Every other
// route is jellyfin-web's own page, styled by tokens. Geometry follows docs/themes/references/marquee.json.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const E = T.ctx;  // focus, focused, sound: the theme script API (8.7)
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const FIELDS = 'PrimaryImageAspectRatio,Overview,ProductionYear,RunTimeTicks,OfficialRating,CommunityRating,UserData,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ParentThumbItemId,ParentThumbImageTag,LocalTrailerCount,ChildCount,Genres,SeriesPrimaryImageTag';
    const DWELL = 2500;  // ms on a card before its preview starts

    let S = null;

    // ---- images ----
    const tags = (it) => it.ImageTags || {};
    function wide(c, it, w) {
        if ((it.BackdropImageTags || []).length) return c.getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: w, tag: it.BackdropImageTags[0] });
        if (tags(it).Thumb) return c.getScaledImageUrl(it.Id, { type: 'Thumb', maxWidth: w, tag: tags(it).Thumb });
        if (it.ParentThumbImageTag) return c.getScaledImageUrl(it.ParentThumbItemId, { type: 'Thumb', maxWidth: w, tag: it.ParentThumbImageTag });
        if ((it.ParentBackdropImageTags || []).length) return c.getScaledImageUrl(it.ParentBackdropItemId, { type: 'Backdrop', maxWidth: w, tag: it.ParentBackdropImageTags[0] });
        if (tags(it).Primary) return c.getScaledImageUrl(it.Id, { type: 'Primary', maxWidth: w, tag: tags(it).Primary });
        return '';
    }
    function tall(c, it, h) {
        if (tags(it).Primary) return c.getScaledImageUrl(it.Id, { type: 'Primary', maxHeight: h, tag: tags(it).Primary });
        if (it.Type === 'Episode' && it.SeriesPrimaryImageTag) return c.getScaledImageUrl(it.SeriesId, { type: 'Primary', maxHeight: h, tag: it.SeriesPrimaryImageTag });
        return wide(c, it, h);
    }
    const details = (c, it) => { location.hash = `#/details?id=${it.Id}&serverId=${c.serverId()}`; };
    const label = (it) => (it.Type === 'Episode' && it.SeriesName ? `${it.SeriesName} · ${it.Name}` : it.Name);
    function facts(it) {
        const runtime = it.RunTimeTicks >= 600000000 ? `${Math.round(it.RunTimeTicks / 600000000)} min` : (it.ChildCount ? `${it.ChildCount} seasons` : null);
        return [(it.Genres || []).slice(0, 2).join(', ') || null, it.ProductionYear, runtime, it.OfficialRating].filter(Boolean).join('  •  ');
    }
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

    // ---- the top bar ----
    ui.chrome.set('topBar', {
        height: '11.11vh',
        async mount(bar) {
            bar.append(el('div', 'mq-profile'));
            const nav = el('div', 'mq-navs');
            bar.append(nav, el('div', 'mq-brand', 'icefin'));
            const views = await ui.userViews();
            const c = T.ctx.apiClient();  // a cold start creates the client late: read it after userViews
            const entries = [{ label: '⌕', name: 'Search', hash: '#/search' }, { label: 'Home', name: 'Home', home: true }];
            for (const v of views) entries.push({ label: v.Name, name: v.Name, view: v });
            entries.push({ label: 'Settings', name: 'Settings', hash: '#/mypreferencesmenu' }, { label: 'Classic home', name: 'Classic home', hash: '#/home?icefin=stock' });
            if (!S) return;
            S.nav = entries.map((x) => {
                const b = el('div', 'mq-nav' + (x.home ? ' current' : '') + (x.name === 'Search' ? ' icon' : ''), x.label);
                b.setAttribute('data-icefin-focus', '');
                b.setAttribute('aria-label', x.name);
                b.marqueeName = x.name;
                b.tabIndex = -1;
                b.addEventListener('click', () => {
                    if (x.hash) location.hash = x.hash;
                    else if (x.view) location.hash = x.view.CollectionType === 'livetv' ? '#/livetv' : `#/list?parentId=${x.view.Id}&serverId=${c.serverId()}`;
                    else if (S.rows.length) focusRow(0, S.rows[0].index);
                });
                nav.append(b);
                return b;
            });
            S.parts++;
            S.maybeReady();
        }
    });

    // ---- rows ----
    function Row(title, items) {
        const section = el('section', 'mq-row');
        section.append(el('div', 'mq-row-title', title));
        const view = el('div', 'mq-view');
        const track = el('div', 'mq-track');
        view.append(track);
        const info = el('div', 'mq-details');
        const infoFacts = el('div', 'mq-facts'), infoText = el('div', 'mq-overview');
        info.append(infoFacts, infoText);
        section.append(view, info);
        const row = { section, track, items, index: 0, cards: [] };
        row.setItems = (list) => {  // also used by the long-row check in tests
            row.items = list;
            row.index = 0;
            track.textContent = '';
            row.cards = list.map((it, i) => {
                const card = el('div', 'mq-card');
                card.setAttribute('data-icefin-focus', '');
                card.tabIndex = -1;
                card.marqueeIndex = i;
                card.marqueeItem = it;
                const poster = el('div', 'mq-poster'), land = el('div', 'mq-wide');
                const p = tall(S.client, it, 560), w = wide(S.client, it, 960);
                if (p) poster.style.backgroundImage = `url("${p}")`;
                if (w) land.style.backgroundImage = `url("${w}")`;
                card.append(poster, land, el('div', 'mq-preview'), el('div', 'mq-card-name', label(it)));
                if (!p && !w) card.classList.add('no-art');
                const ticks = it.UserData && it.UserData.PlaybackPositionTicks;
                if (ticks && it.RunTimeTicks) { const bar = el('div', 'mq-progress'); const b = el('i'); b.style.width = `${Math.min(100, (100 * ticks) / it.RunTimeTicks).toFixed(1)}%`; bar.append(b); card.append(bar); }
                card.addEventListener('click', () => details(S.client, it));
                track.append(card);
                return card;
            });
            track.style.transform = '';
        };
        row.show = (i) => {
            row.cards.forEach((c, k) => c.classList.toggle('open', k === i));
            const it = row.items[i];
            infoFacts.textContent = it ? facts(it) : '';
            infoText.textContent = (it && it.Overview) || '';
            // The focused card holds the first slot; the cards before it (all closed: 316 + 17 px each, styles.css) slide
            // off to the left. From the target sizes, not offsetLeft: the last open card is still narrowing.
            track.style.transform = i > 0 ? `translateX(calc(${-i} * (16.46vw + 0.89vw)))` : '';
            section.setAttribute('data-mq-index', String(i));
        };
        row.setItems(items);
        section.marqueeRow = row;
        return row;
    }

    // ---- previews ----
    let dwellTimer = null;
    function armPreview(card) {
        clearTimeout(dwellTimer);
        stopPreview();
        if (ui.motion.reduced()) return;
        dwellTimer = setTimeout(async () => {
            if (!S || E.focused() !== card) return;
            const p = await previewId(S.client, card.marqueeItem);
            if (!p || !S || E.focused() !== card || S.preview) return;
            const pv = ui.mutedPreview(card.querySelector('.mq-preview'), { itemId: p.id, startSeconds: p.start, maxWidth: 1280 });
            S.preview = pv;
            S.root.setAttribute('data-mq-preview', 'playing');
            pv.video.addEventListener('ended', stopPreview);
            pv.video.addEventListener('error', stopPreview);  // keep the artwork
        }, DWELL);
    }
    function stopPreview() {
        clearTimeout(dwellTimer);
        if (S && S.preview) { S.preview.stop(); S.preview = null; S.root.removeAttribute('data-mq-preview'); }
    }

    // ---- focus ----
    function zone(z) { S.zone = z; S.root.setAttribute('data-mq-zone', z); }
    function focusRow(r, i) {
        const row = S.rows[r];
        row.index = Math.max(0, Math.min(row.items.length - 1, i));
        S.rows.forEach((x, k) => {
            x.section.classList.toggle('current', k === r);
            if (k !== r) { x.cards.forEach((c) => c.classList.remove('open')); x.track.style.transform = ''; }
        });
        row.show(row.index);
        zone('rows');
        S.rowIndex = r;
        E.focus(row.cards[row.index]);
        // The focused row rises to the top line; the rows above it scroll away.
        // The rows above are all small (title 30 + 20, cards 178, gap 50 px: styles.css), whatever is mid-transition.
        S.rowsBox.style.transform = r > 0 ? `translateY(calc(${-r} * (2.78vh + 1.85vh + 16.48vh + 4.6vh)))` : '';
        armPreview(row.cards[row.index]);
    }
    function focusNav(name) {
        stopPreview();
        zone('nav');
        E.focus(S.nav.find((b) => b.marqueeName === name) || S.nav.find((b) => b.classList.contains('current')) || S.nav[0]);
    }

    T.registerScreen('#/home', {
        onAction(action, ctx) {
            if (!S || !S.ready) return false;
            const f = ctx.focused();
            const ni = S.nav.indexOf(f);
            if (ni >= 0) {
                if (action === 'left' || action === 'right') { const n = ni + (action === 'right' ? 1 : -1); if (n >= 0 && n < S.nav.length) { E.focus(S.nav[n]); ctx.sound('focus'); } return true; }
                if (action === 'down') { if (S.rows.length) { const r = S.rowIndex || 0; focusRow(r, S.rows[r].index); ctx.sound('focus'); } return true; }
                return action === 'up';
            }
            const r = S.rows.findIndex((row) => row.track.contains(f));
            if (r < 0) return false;
            const row = S.rows[r];
            if (action === 'left') { if (row.index > 0) { focusRow(r, row.index - 1); ctx.sound('focus'); } return true; }
            if (action === 'right') { if (row.index + 1 < row.items.length) { focusRow(r, row.index + 1); ctx.sound('focus'); } return true; }
            if (action === 'down') { if (r + 1 < S.rows.length) { focusRow(r + 1, S.rows[r + 1].index); ctx.sound('focus'); } return true; }
            if (action === 'up') { if (r > 0) focusRow(r - 1, S.rows[r - 1].index); else focusNav('Home'); ctx.sound('focus'); return true; }
            if (action === 'back') { focusNav('Home'); ctx.sound('back'); return true; }
            return false;  // Enter: the engine clicks the card
        },
        async mount(root, ctx) {
            root.setAttribute('data-mq', 'home');
            S = { client: T.ctx.apiClient(), root, nav: [], rows: [], zone: 'rows', ready: false, parts: 0, rowIndex: 0 };
            S.maybeReady = () => {
                if (S.parts < 2 || S.ready) return;
                S.ready = true;
                root.setAttribute('data-mq-ready', String(S.rows.length));
                if (S.rows.length) focusRow(0, 0); else focusNav('Home');
            };
            const content = ui.chrome.frame(root, ctx);
            const view = el('div', 'mq-rows-view');
            S.rowsBox = el('div', 'mq-rows');
            view.append(S.rowsBox);
            content.append(view);
            // The views move by transforms; the browser's own scroll-into-view on focus stays at 0.
            for (const v of [view, content]) v.addEventListener('scroll', () => { v.scrollTop = 0; v.scrollLeft = 0; });

            const views = await ui.userViews();
            if (!S || S.root !== root) return;
            S.client = T.ctx.apiClient();  // a cold start creates the client late: read it after userViews
            const c = S.client, uid = c.getCurrentUserId();
            const get = (p) => Promise.resolve(p).then((r) => (r && (r.Items || r)) || [], () => []);
            const [resume, nextUp] = await Promise.all([
                get(c.getResumableItems(uid, { Limit: 40, MediaTypes: 'Video', Fields: FIELDS })),
                get(c.getNextUpEpisodes({ UserId: uid, Limit: 40, Fields: FIELDS }))
            ]);
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
            stopPreview();
            S = null;
        }
    });
})();

// Details (PLAN 9.18): the engine's details screen (every feature of the stock page) in this theme's layout; the look
// is in styles.css, "Details".
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.details) T.registerScreen('#/details', T.ui.details.screen({ layout: 'hero' }));
})();

// Player controls (PLAN 9.19): jellyfin-web's own controls (every function kept) in this theme's layout; the look is
// the osd.* tokens in tokens.json.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.osd) T.ui.osd.set({ layout: 'bar' });
})();

// Settings (PLAN 9.24): the engine's settings area (Client settings, Classic View, Server Settings) in this theme's look.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.settings) T.registerScreen('#/mypreferencesmenu', T.ui.settings.screen({ layout: 'tiles' }));
})();
