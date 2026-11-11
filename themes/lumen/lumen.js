// Lumen (benchmark theme, PLAN 9.12; its target is named in docs/PLAN.md). Built from the engine's generic capabilities
// only: the focused poster lifts and tilts with a moving highlight (ui.parallax), the tab bar is a frosted panel over
// the artwork (ui.material, opaque when the GPU can't keep up), and the top shelf behind everything shows the focused
// item full-bleed. The tab bar hides once focus leaves it and returns when focus goes back up. Every other route is
// jellyfin-web's own page, styled by tokens.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const E = T.ctx;  // focus, focused, sound: the theme script API (8.7)
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const FIELDS = 'PrimaryImageAspectRatio,Overview,ProductionYear,RunTimeTicks,OfficialRating,UserData,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ParentThumbItemId,ParentThumbImageTag,SeriesPrimaryImageTag';
    const ROW_TOP = 0.62, ROW_FOCUS_TOP = 0.16;  // rows start under the shelf; a lower row slides up to here (fractions of the height)

    let S = null;

    // ---- images ----
    const tags = (it) => it.ImageTags || {};
    function backdrop(c, it, w) {
        if ((it.BackdropImageTags || []).length) return c.getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: w, tag: it.BackdropImageTags[0] });
        if ((it.ParentBackdropImageTags || []).length) return c.getScaledImageUrl(it.ParentBackdropItemId, { type: 'Backdrop', maxWidth: w, tag: it.ParentBackdropImageTags[0] });
        if (tags(it).Primary) return c.getScaledImageUrl(it.Id, { type: 'Primary', maxWidth: w, tag: tags(it).Primary });
        return '';
    }
    function poster(c, it, w) {
        if (tags(it).Primary && it.Type !== 'Episode') return c.getScaledImageUrl(it.Id, { type: 'Primary', maxWidth: w, tag: tags(it).Primary });
        if (it.SeriesPrimaryImageTag) return c.getScaledImageUrl(it.SeriesId, { type: 'Primary', maxWidth: w, tag: it.SeriesPrimaryImageTag });
        if (tags(it).Primary) return c.getScaledImageUrl(it.Id, { type: 'Primary', maxWidth: w, tag: tags(it).Primary });
        return '';
    }
    function thumb(c, it, w) {
        if (tags(it).Thumb) return c.getScaledImageUrl(it.Id, { type: 'Thumb', maxWidth: w, tag: tags(it).Thumb });
        if (it.ParentThumbImageTag) return c.getScaledImageUrl(it.ParentThumbItemId, { type: 'Thumb', maxWidth: w, tag: it.ParentThumbImageTag });
        if (tags(it).Primary && it.Type === 'Episode') return c.getScaledImageUrl(it.Id, { type: 'Primary', maxWidth: w, tag: tags(it).Primary });
        return backdrop(c, it, w);
    }
    const details = (c, it) => { location.hash = `#/details?id=${it.Id}&serverId=${c.serverId()}`; };
    const label = (it) => (it.Type === 'Episode' && it.SeriesName ? `${it.SeriesName} · ${it.Name}` : it.Name);

    // ---- top shelf ----
    let shelfTimer = null;
    function shelf(it) {
        clearTimeout(shelfTimer);
        shelfTimer = setTimeout(() => {  // waits out fast scrolling, so a held arrow doesn't load every backdrop
            if (!S || !it) return;
            const img = backdrop(S.client, it, 1920);
            S.shelf.style.backgroundImage = img ? `url("${img}")` : 'none';
            S.shelfTitle.textContent = it.Type === 'Episode' && it.SeriesName ? it.SeriesName : it.Name;
            S.shelfMeta.textContent = [it.Type === 'Episode' ? it.Name : null, it.ProductionYear, it.OfficialRating,
                it.RunTimeTicks >= 600000000 ? `${Math.round(it.RunTimeTicks / 600000000)} min` : null].filter(Boolean).join('  ·  ');
            S.shelfOverview.textContent = it.Overview || '';
            S.root.setAttribute('data-lm-shelf', it.Id);
        }, 140);
    }

    // ---- rows ----
    function Row(title, items, wide) {
        const section = el('section', 'lm-row' + (wide ? ' wide' : ''));
        section.append(el('div', 'lm-row-title', title));
        const track = el('div', 'lm-track');
        section.append(track);
        const row = { section, track, items, index: 0, cards: [] };
        row.cards = items.map((it, i) => {
            const card = el('div', 'lm-card');
            card.setAttribute('data-icefin-focus', '');
            card.tabIndex = -1;
            const img = wide ? thumb(S.client, it, 640) : poster(S.client, it, 400);
            card.style.backgroundImage = img ? `url("${img}")` : 'none';
            card.append(el('div', 'lm-card-label', label(it)));
            const ticks = it.UserData && it.UserData.PlaybackPositionTicks;
            if (ticks && it.RunTimeTicks) { const p = el('div', 'lm-progress'); const b = el('i'); b.style.width = `${Math.min(100, (100 * ticks) / it.RunTimeTicks).toFixed(1)}%`; p.append(b); card.append(p); }
            card.addEventListener('click', () => details(S.client, it));
            card.addEventListener('icefin-focus', () => shelf(it));
            card.lumenIndex = i;
            track.append(card);
            return card;
        });
        // The focused card keeps one card of context on its left, until the row runs out.
        row.scroll = () => {
            const c = row.cards[row.index];
            if (!c) return;
            const step = row.cards.length > 1 ? row.cards[1].offsetLeft - row.cards[0].offsetLeft : c.offsetWidth;
            const max = Math.max(0, track.scrollWidth - window.innerWidth);
            const x = Math.max(0, Math.min(max, (row.index - 1) * step));
            track.style.transform = `translateX(${-x}px)`;
            section.setAttribute('data-lm-index', String(row.index));
        };
        return row;
    }

    // ---- focus zones ----
    function zone(z) {
        S.zone = z;
        S.root.setAttribute('data-lm-zone', z);
        S.root.setAttribute('data-lm-tabs', z === 'tabs' ? 'shown' : 'hidden');  // the bar hides once focus leaves it
    }
    function focusTab(i) {
        zone('tabs');
        S.tabIndex = Math.max(0, Math.min(S.tabs.length - 1, i));
        E.focus(S.tabs[S.tabIndex]);
        S.rowsBox.style.transform = '';
    }
    function focusRow(r, i) {
        const row = S.rows[r];
        row.index = Math.max(0, Math.min(row.items.length - 1, i));
        S.rows.forEach((x, k) => x.section.classList.toggle('current', k === r));
        zone('rows');
        S.rowIndex = r;
        row.scroll();
        E.focus(row.cards[row.index]);
        const h = window.innerHeight;
        S.rowsBox.style.transform = r === 0 ? '' : `translateY(${Math.round(h * ROW_FOCUS_TOP - h * ROW_TOP - row.section.offsetTop)}px)`;
    }

    T.registerScreen('#/home', {
        onAction(action, ctx) {
            if (!S || !S.ready) return false;
            const f = ctx.focused();
            const ti = S.tabs.indexOf(f);
            if (ti >= 0) {
                if (action === 'left' || action === 'right') { focusTab(ti + (action === 'right' ? 1 : -1)); ctx.sound('focus'); return true; }
                if (action === 'down') { if (S.rows.length) { focusRow(0, S.rows[0].index); ctx.sound('focus'); } return true; }
                return action === 'up';
            }
            const r = S.rows.findIndex((row) => row.track.contains(f));
            if (r < 0) return false;
            const row = S.rows[r];
            if (action === 'left' || action === 'right') {
                const n = row.index + (action === 'right' ? 1 : -1);
                if (n >= 0 && n < row.items.length) { focusRow(r, n); ctx.sound('focus'); }
                return true;  // at a row's end the card only tilts (ui.parallax saw the press)
            }
            if (action === 'down') { if (r + 1 < S.rows.length) { focusRow(r + 1, S.rows[r + 1].index); ctx.sound('focus'); } return true; }
            if (action === 'up') { if (r > 0) focusRow(r - 1, S.rows[r - 1].index); else focusTab(S.tabIndex); ctx.sound('focus'); return true; }
            if (action === 'back') { if (r > 0) focusRow(0, S.rows[0].index); else focusTab(S.tabIndex); ctx.sound('back'); return true; }
            return false;  // Enter: the engine clicks the card
        },
        async mount(root) {
            root.setAttribute('data-lm', 'home');
            S = { client: T.ctx.apiClient(), root, tabs: [], rows: [], zone: 'tabs', tabIndex: 0, rowIndex: 0, ready: false };
            S.shelf = el('div', 'lm-shelf');
            const text = el('div', 'lm-shelf-text');
            S.shelfTitle = el('div', 'lm-shelf-title');
            S.shelfMeta = el('div', 'lm-shelf-meta');
            S.shelfOverview = el('div', 'lm-shelf-overview');
            text.append(S.shelfTitle, S.shelfMeta, S.shelfOverview);
            const bar = ui.material(el('nav', 'lm-tabs'), 'bar');
            S.rowsBox = el('div', 'lm-rows');
            root.append(S.shelf, text, bar, S.rowsBox);
            zone('tabs');

            const views = await ui.userViews();  // also waits out a cold start
            if (!S || S.root !== root) return;
            S.client = T.ctx.apiClient();  // a cold start creates the client late: read it after userViews
            const c = S.client, uid = c.getCurrentUserId();
            const tabs = [{ label: 'Home' }];
            for (const v of views) tabs.push({ label: v.Name, hash: v.CollectionType === 'livetv' ? '#/livetv' : `#/list?parentId=${v.Id}&serverId=${c.serverId()}` });
            tabs.push({ label: 'Search', hash: '#/search' }, { label: 'Settings', hash: '#/mypreferencesmenu' }, { label: 'Classic home', hash: '#/home?icefin=stock' });
            S.tabs = tabs.map((x, i) => {
                const t = el('div', 'lm-tab' + (i === 0 ? ' current' : ''), x.label);
                t.setAttribute('data-icefin-focus', '');
                t.tabIndex = -1;
                t.addEventListener('click', () => { if (x.hash) location.hash = x.hash; else if (S.rows.length) focusRow(0, 0); });
                bar.append(t);
                return t;
            });

            const get = (p) => Promise.resolve(p).then((r) => (r && (r.Items || r)) || [], () => []);
            const [resume, nextUp] = await Promise.all([
                get(c.getResumableItems(uid, { Limit: 24, MediaTypes: 'Video', Fields: FIELDS })),
                get(c.getNextUpEpisodes({ UserId: uid, Limit: 24, Fields: FIELDS }))
            ]);
            const rows = [];
            const upNext = resume.concat(nextUp.filter((n) => !resume.some((r) => r.Id === n.Id)));
            if (upNext.length) rows.push(['Up Next', upNext, true]);
            for (const v of views.filter((x) => x.CollectionType !== 'livetv')) {  // Live TV has channels, not new items
                const items = await get(c.getLatestItems({ userId: uid, parentId: v.Id, Limit: 30, Fields: FIELDS }));
                if (items.length) rows.push([`New in ${v.Name}`, items, false]);
            }
            if (!S || S.root !== root) return;
            S.rows = rows.map(([t, items, wide]) => { const r = Row(t, items, wide); S.rowsBox.append(r.section); return r; });
            S.parallax = ui.parallax(S.rowsBox);
            if (S.rows.length) shelf(S.rows[0].items[0]);
            S.ready = true;
            root.setAttribute('data-lm-ready', String(S.rows.length));
            focusTab(0);
        },
        unmount() {
            clearTimeout(shelfTimer);
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
