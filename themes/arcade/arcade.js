// Arcade (benchmark theme, PLAN 9.16; its target is named in docs/PLAN.md). Built from the engine's generic capabilities
// only: a controller-first home of large capsules, a library grid with sort and filter dialogs, a quick-access panel that
// slides in from the right over any screen (ui.overlay: a long press on View, or the top bar's button), button hints
// drawn with the engine's controller glyphs, and the engine's on-screen keyboard for every text field (ui.keyboard),
// themed screens and jellyfin-web's own pages alike. Every other route is jellyfin-web's own page, styled by tokens.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const E = T.ctx;  // focus, focused, sound: the theme script API (8.7)
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const FIELDS = 'PrimaryImageAspectRatio,ProductionYear,RunTimeTicks,UserData,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,SeriesPrimaryImageTag,DateCreated,PremiereDate,CommunityRating,Genres';
    const tags = (it) => it.ImageTags || {};
    const isDir = (a) => a === 'up' || a === 'down' || a === 'left' || a === 'right';

    ui.keyboard.enable();

    let S = null;

    // ---- images ----
    function portrait(c, it, w) {
        if (it.Type === 'Episode' && it.SeriesPrimaryImageTag) return c.getScaledImageUrl(it.SeriesId, { type: 'Primary', maxWidth: w, tag: it.SeriesPrimaryImageTag });
        if (tags(it).Primary) return c.getScaledImageUrl(it.Id, { type: 'Primary', maxWidth: w, tag: tags(it).Primary });
        return '';
    }
    function wide(c, it, w) {
        if ((it.BackdropImageTags || []).length) return c.getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: w, tag: it.BackdropImageTags[0] });
        if ((it.ParentBackdropImageTags || []).length) return c.getScaledImageUrl(it.ParentBackdropItemId, { type: 'Backdrop', maxWidth: w, tag: it.ParentBackdropImageTags[0] });
        return portrait(c, it, w);
    }
    const details = (c, it) => { location.hash = `#/details?id=${it.Id}&serverId=${c.serverId()}`; };
    const label = (it) => (it.Type === 'Episode' && it.SeriesName ? `${it.SeriesName} · ${it.Name}` : it.Name);

    function capsule(c, it, hero) {
        const cap = el('div', 'ar-cap' + (hero ? ' hero' : ''));
        cap.setAttribute('data-icefin-focus', '');
        cap.tabIndex = -1;
        cap.arcadeItem = it;
        const img = hero ? wide(c, it, 1280) : portrait(c, it, 360);
        if (img) { cap.style.backgroundImage = `url("${img}")`; cap.classList.add('has-art'); }
        cap.setAttribute('aria-label', label(it));
        cap.append(el('div', 'ar-cap-name', label(it)));
        const ticks = it.UserData && it.UserData.PlaybackPositionTicks;
        if (ticks && it.RunTimeTicks) { const p = el('div', 'ar-progress'); const b = el('i'); b.style.width = `${Math.min(100, (100 * ticks) / it.RunTimeTicks).toFixed(1)}%`; p.append(b); cap.append(p); }
        cap.addEventListener('click', () => details(c, it));
        return cap;
    }

    // ---- top bar and button hints, shared by both screens ----
    function topBar(root, current, views) {
        const c = T.ctx.apiClient();
        const bar = el('nav', 'ar-top');
        const tabs = [{ label: 'Home', hash: '#/home' }];
        for (const v of views) tabs.push({ label: v.Name, hash: v.CollectionType === 'livetv' ? '#/livetv' : `#/list?parentId=${v.Id}&serverId=${c.serverId()}`, id: v.Id });
        const els = tabs.map((x) => {
            const t = el('div', 'ar-tab' + (x.label === current || x.id === current ? ' current' : ''), x.label);
            t.setAttribute('data-icefin-focus', '');
            t.tabIndex = -1;
            t.addEventListener('click', () => { location.hash = x.hash; });
            bar.append(t);
            return t;
        });
        bar.append(el('div', 'ar-spacer'));
        const search = el('div', 'ar-btn', 'Search');
        const qa = el('div', 'ar-btn ar-qa-btn', '•••');
        const clock = el('div', 'ar-clock');
        for (const b of [search, clock, qa]) { if (b !== clock) { b.setAttribute('data-icefin-focus', ''); b.tabIndex = -1; } bar.append(b); }
        search.addEventListener('click', () => { location.hash = '#/search'; });
        qa.addEventListener('click', () => ui.overlay.open());
        const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
        tick();
        const timer = setInterval(() => { if (!clock.isConnected) clearInterval(timer); else tick(); }, 15000);
        root.append(bar);
        return { bar, items: [...els, search, qa] };
    }
    function hints(root, list) {
        const h = el('div', 'ar-hints');
        const draw = () => {
            h.textContent = '';
            for (const [button, text] of list) {
                const x = el('div', 'ar-hint');
                const g = el('span');
                g.innerHTML = T.glyph ? T.glyph(button) : '';  // the engine's own drawings (bundled theme, trusted)
                x.append(g, el('span', null, text));
                h.append(x);
            }
        };
        draw();
        // Redraw when the controller family changes (a different pad was used).
        const mo = new MutationObserver(() => { if (!h.isConnected) mo.disconnect(); else draw(); });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-icefin-glyphs'] });
        root.append(h);
    }

    // ---- quick-access panel (global overlay) ----
    ui.overlay.set({
        mount(host, ctx) {
            host.classList.add('ar-qa-host');
            const p = el('div', 'ar-qa');
            p.append(el('h2', null, 'Quick access'));
            const playing = ctx.nowPlaying();
            const now = playing && playing.item;
            p.append(el('div', 'ar-qa-now', now ? `Now playing: ${now.Name}` : 'Nothing playing'));
            const item = (text, state, fn) => {
                const x = el('div', 'ar-qa-item');
                x.setAttribute('data-icefin-focus', '');
                x.append(el('span', null, text));
                const st = el('span', 'ar-state', state ? state() : '');
                x.append(st);
                x.addEventListener('click', () => { fn(); st.textContent = state ? state() : ''; });
                p.append(x);
                return x;
            };
            item('Search', null, () => { ctx.close(); location.hash = '#/search'; });
            item('Reduce motion', () => (ui.motion.level() === 'low' ? 'On' : 'Off'), () => ui.motion.cap(ui.motion.level() === 'low' ? 'normal' : 'low'));
            item('Settings', null, () => { ctx.close(); location.hash = '#/mypreferencesmenu'; });
            item('Classic home', null, () => { ctx.close(); location.hash = '#/home?icefin=stock'; });
            host.append(p);
            host.addEventListener('click', (e) => { if (e.target === host) ctx.close(); });
        }
    });

    // ---- spatial moves confined to a container (dialogs) ----
    function moveIn(container, dir) {
        E.move(dir, container);  // a modal dialog keeps the arrows even at its edge
        return true;
    }

    // Arcade moves its rows itself (transforms timed like the target); the browser's scroll-into-view on focus would
    // add a jump on top, so these views stay pinned at 0.
    function pin(view) {
        view.addEventListener('scroll', () => { if (view.scrollTop || view.scrollLeft) { view.scrollTop = 0; view.scrollLeft = 0; } });
    }

    // ---- home ----
    // Like the target's home (docs/themes/references/arcade.json): a row of recent capsules led by a wide hero, the
    // focused capsule's name and status under the row, a centred row of pills choosing a feed, and a row of cards with
    // art above a caption panel; a bar of button hints along the bottom. Everything fits one 1080-line screen.
    function cardEl(c, it) {
        const card = el('div', 'ar-cap card');
        card.setAttribute('data-icefin-focus', '');
        card.tabIndex = -1;
        card.arcadeItem = it;
        const art = el('div', 'ar-card-art');
        const img = wide(c, it, 640);
        if (img) art.style.backgroundImage = `url("${img}")`;
        card.append(art, el('div', 'ar-card-text', label(it)));
        card.addEventListener('click', () => details(c, it));
        return card;
    }
    function status(it) {
        const d = it.UserData || {};
        if (d.PlaybackPositionTicks && it.RunTimeTicks) return `Continue · ${Math.max(1, Math.round((it.RunTimeTicks - d.PlaybackPositionTicks) / 600000000))} min left`;
        if (it.Type === 'Episode' && it.ParentIndexNumber != null) return `Next up · S${it.ParentIndexNumber} E${it.IndexNumber}`;
        return [it.ProductionYear, it.Type === 'Series' ? 'Series' : null].filter(Boolean).join(' · ') || 'New';
    }
    function showFocused(it) {
        if (!S || !it) return;
        S.name.textContent = label(it);
        S.sub.textContent = status(it);
        const img = wide(S.client, it, 1280);
        S.backdrop.style.backgroundImage = img ? `url("${img}")` : 'none';
    }
    function choosePill(k) {
        S.pill = k;
        S.pills.forEach((p, i) => p.classList.toggle('current', i === k));
        const [, items, when] = S.feeds[k];
        S.cardLabel.textContent = when;
        const caps = items.map((it) => cardEl(S.client, it));
        S.shelves[1].track.textContent = '';
        S.shelves[1].track.style.transform = '';
        S.shelves[1].track.append(...caps);
        S.shelves[1].caps = caps;
        S.shelves[1].index = 0;
    }
    T.registerScreen('#/home', {
        onAction(action, ctx) {
            if (!S || !S.ready) return false;
            const f = ctx.focused();
            const pi = S.pills.indexOf(f);
            if (pi >= 0) {
                if (action === 'left' || action === 'right') {
                    const n = pi + (action === 'right' ? 1 : -1);
                    if (n >= 0 && n < S.pills.length) { E.focus(S.pills[n]); choosePill(n); ctx.sound('focus'); }
                    return true;
                }
                if (action === 'down') { if (S.shelves[1].caps.length) { focusCap(1, 0); ctx.sound('focus'); } return true; }
                if (action === 'up') { focusCap(0, S.shelves[0].index); ctx.sound('focus'); return true; }
                if (action === 'back') { focusCap(0, S.shelves[0].index); ctx.sound('back'); return true; }
                return false;
            }
            const r = S.shelves.findIndex((s) => s.track.contains(f));
            if (r >= 0) {
                const sh = S.shelves[r], i = sh.caps.indexOf(f);
                if (action === 'left' || action === 'right') { const n = i + (action === 'right' ? 1 : -1); if (n >= 0 && n < sh.caps.length) { focusCap(r, n); ctx.sound('focus'); } return true; }
                if (action === 'down') {
                    if (r === 0 && S.pills.length) { E.focus(S.pills[S.pill]); ctx.sound('focus'); }
                    return true;
                }
                if (action === 'up') {
                    if (r === 1) E.focus(S.pills[S.pill]);
                    else E.focus(S.top.items[0]);
                    ctx.sound('focus');
                    return true;
                }
                if (action === 'back') { if (r === 1) focusCap(0, S.shelves[0].index); else E.focus(S.top.items[0]); ctx.sound('back'); return true; }
                return false;
            }
            if (S.top.items.includes(f)) {
                const i = S.top.items.indexOf(f);
                if (action === 'left' || action === 'right') { const n = i + (action === 'right' ? 1 : -1); if (n >= 0 && n < S.top.items.length) { E.focus(S.top.items[n]); ctx.sound('focus'); } return true; }
                if (action === 'down') { if (S.shelves[0].caps.length) { focusCap(0, S.shelves[0].index); ctx.sound('focus'); } return true; }
                return action === 'up';
            }
            return false;
        },
        async mount(root) {
            root.setAttribute('data-ar', 'home');
            S = { client: T.ctx.apiClient(), root, shelves: [], ready: false, pills: [], feeds: [], pill: 0 };
            const views = await ui.userViews();
            if (!S || S.root !== root) return;
            S.client = T.ctx.apiClient();  // a cold start creates the client late: read it after userViews
            S.backdrop = el('div', 'ar-backdrop');
            root.append(S.backdrop);
            S.top = topBar(root, 'Home', views);
            const body = el('div', 'ar-body');
            S.scroll = el('div', 'ar-scroll');
            body.append(S.scroll);
            root.append(body);
            hints(root, [['south', 'Select'], ['east', 'Back'], ['view', 'Quick access (hold)']]);
            const c = S.client, uid = c.getCurrentUserId();
            const get = (p) => Promise.resolve(p).then((x) => (x && (x.Items || x)) || [], () => []);
            const [resume, nextUp] = await Promise.all([
                get(c.getResumableItems(uid, { Limit: 20, MediaTypes: 'Video', Fields: FIELDS })),
                get(c.getNextUpEpisodes({ UserId: uid, Limit: 20, Fields: FIELDS }))
            ]);
            let recent = resume.concat(nextUp.filter((n) => !resume.some((x) => x.Id === n.Id)));
            const feeds = [];
            for (const v of views.filter((x) => x.CollectionType !== 'livetv')) {  // Live TV has channels, not new items
                const items = await get(c.getLatestItems({ userId: uid, parentId: v.Id, Limit: 24, Fields: FIELDS }));
                if (items.length) feeds.push([`New in ${v.Name}`, items, 'Recently added']);
            }
            if (!S || S.root !== root) return;
            // The recent row leads with a wide hero: the most recent thing in progress, else the newest items.
            if (!recent.length && feeds.length) recent = feeds[0][1];
            const sec0 = el('section', 'ar-shelf ar-recent');
            const track0 = el('div', 'ar-track');
            const caps0 = recent.slice(0, 20).map((it, i) => capsule(c, it, i === 0));
            track0.append(...caps0);
            S.name = el('div', 'ar-focus-name');
            S.sub = el('div', 'ar-focus-sub');
            sec0.append(track0, S.name, S.sub);
            const pills = el('div', 'ar-pills');
            S.feeds = feeds;
            S.pills = feeds.map(([title], k) => {
                const p = el('div', 'ar-pill', title);
                p.setAttribute('data-icefin-focus', '');
                p.tabIndex = -1;
                p.addEventListener('click', () => choosePill(k));
                pills.append(p);
                return p;
            });
            const sec1 = el('section', 'ar-shelf ar-feed');
            S.cardLabel = el('div', 'ar-card-label');
            const track1 = el('div', 'ar-track ar-cards');
            sec1.append(S.cardLabel, track1);
            S.scroll.append(sec0, pills, sec1);
            [body, S.scroll, sec0, sec1].forEach(pin);
            S.shelves = [{ sec: sec0, track: track0, caps: caps0, index: 0 }, { sec: sec1, track: track1, caps: [], index: 0 }];
            if (feeds.length) choosePill(0);
            S.ready = true;
            root.setAttribute('data-ar-ready', String(S.shelves.filter((x) => x.caps.length).length));
            if (caps0.length) focusCap(0, 0); else E.focus(S.top.items[0]);
        },
        unmount() { S = null; }
    });
    // Focus walks the visible slots; the row scrolls only when the next capsule would leave the screen.
    function focusCap(r, i) {
        const sh = S.shelves[r];
        sh.index = i;
        const cap = sh.caps[i];
        E.focus(cap);
        const view = sh.track.parentElement.offsetWidth, first = sh.caps[0].offsetLeft;
        const cur = sh.shift || 0;
        let shift = cur;
        const left = cap.offsetLeft - first, right = cap.offsetLeft + cap.offsetWidth;
        if (left < shift) shift = left;
        else if (right - shift > view - first) shift = right - (view - first);
        sh.shift = Math.max(0, shift);
        sh.track.style.transform = sh.shift ? `translateX(${-Math.round(sh.shift)}px)` : '';
        if (cap.arcadeItem) showFocused(r === 0 ? cap.arcadeItem : S.shelves[0].caps[S.shelves[0].index] && S.shelves[0].caps[S.shelves[0].index].arcadeItem);
    }

    // ---- library: a sortable, filterable grid ----
    const SORTS = [['SortName', 'Ascending', 'Name'], ['DateCreated', 'Descending', 'Recently added'], ['PremiereDate', 'Descending', 'Release date'], ['CommunityRating', 'Descending', 'Rating']];
    const FILTERS = [['IsUnplayed', 'Unwatched'], ['IsFavorite', 'Favorites'], ['IsResumable', 'In progress']];
    let L = null;
    T.registerScreen('#/list', {
        onAction(action, ctx) {
            if (!L || !L.ready) return false;
            const f = ctx.focused();
            if (L.dialog) {
                if (isDir(action)) return moveIn(L.dialog, action);
                if (action === 'back') { closeDialog(); ctx.sound('back'); return true; }
                return false;  // Enter: the engine clicks the option
            }
            if (L.grid.contains(f)) {
                const i = L.caps.indexOf(f), cols = 7;
                if (action === 'up' && i < cols) { E.focus(L.sortBtn); L.grid.style.transform = ''; ctx.sound('focus'); return true; }
                if (isDir(action)) {
                    const n = i + { left: -1, right: 1, up: -cols, down: cols }[action];
                    if (n >= 0 && n < L.caps.length && !((action === 'left' && i % cols === 0) || (action === 'right' && i % cols === cols - 1))) focusGrid(n);
                    else if (action === 'down' && Math.floor(i / cols) < Math.floor((L.caps.length - 1) / cols)) focusGrid(L.caps.length - 1);  // the last row is short
                    ctx.sound('focus');
                    return true;
                }
                if (action === 'back') { E.focus(L.sortBtn); L.grid.style.transform = ''; ctx.sound('back'); return true; }
                return false;
            }
            if (action === 'down' && !L.grid.contains(f) && L.caps.length && L.barItems.includes(f)) { focusGrid(0); ctx.sound('focus'); return true; }
            return false;  // the top bar and the sort/filter row use the engine's spatial focus
        },
        async mount(root) {
            const params = new URLSearchParams((location.hash.split('?')[1] || ''));
            const parentId = params.get('parentId');
            root.setAttribute('data-ar', 'library');
            L = { client: T.ctx.apiClient(), root, parentId, sort: 0, filters: new Set(), caps: [], ready: false, dialog: null };
            const views = await ui.userViews();
            if (!L || L.root !== root) return;
            L.client = T.ctx.apiClient();  // a cold start creates the client late: read it after userViews
            L.top = topBar(root, parentId, views);
            const bar = el('div', 'ar-lib-bar');
            L.sortBtn = el('div', 'ar-btn', '');
            L.filterBtn = el('div', 'ar-btn', '');
            L.count = el('div', 'ar-count');
            for (const b of [L.sortBtn, L.filterBtn]) { b.setAttribute('data-icefin-focus', ''); b.tabIndex = -1; }
            L.sortBtn.addEventListener('click', () => openDialog('sort'));
            L.filterBtn.addEventListener('click', () => openDialog('filter'));
            bar.append(L.sortBtn, L.filterBtn, L.count);
            L.barItems = [...L.top.items, L.sortBtn, L.filterBtn];
            const body = el('div', 'ar-body');
            L.grid = el('div', 'ar-grid');
            body.append(L.grid);
            root.append(bar, body);
            hints(root, [['south', 'Select'], ['east', 'Back'], ['view', 'Quick access (hold)']]);
            await load();
            if (!L || L.root !== root) return;
            L.ready = true;
            if (L.caps.length) focusGrid(0); else E.focus(L.sortBtn);
        },
        unmount() { L = null; }
    });
    async function load() {
        const c = L.client, uid = c.getCurrentUserId();
        const [by, order, name] = SORTS[L.sort];
        L.sortBtn.textContent = `Sort: ${name}`;
        L.filterBtn.textContent = L.filters.size ? `Filter (${L.filters.size})` : 'Filter';
        const q = { ParentId: L.parentId, Recursive: true, IncludeItemTypes: 'Movie,Series,MusicAlbum,Video', SortBy: `${by},SortName`, SortOrder: order, Fields: FIELDS, Limit: 400 };
        if (L.filters.size) q.Filters = [...L.filters].join(',');
        const r = await Promise.resolve(c.getItems(uid, q)).catch(() => null);
        if (!L) return;
        const items = (r && r.Items) || [];
        L.grid.textContent = '';
        L.grid.style.transform = '';
        L.caps = items.map((it) => capsule(c, it, false));
        L.grid.append(...L.caps);
        L.count.textContent = `${items.length} items`;
        L.root.setAttribute('data-ar-sort', by);
        L.root.setAttribute('data-ar-filters', [...L.filters].join(','));
        L.root.setAttribute('data-ar-count', String(items.length));
    }
    function focusGrid(i) {
        const cap = L.caps[i];
        E.focus(cap);
        const row = Math.floor(i / 7);
        L.grid.style.transform = row > 0 ? `translateY(${-Math.max(0, cap.offsetTop - L.caps[0].offsetTop - cap.offsetHeight * 0.35)}px)` : '';
    }
    function openDialog(kind) {
        const scrim = el('div', 'ar-dialog-scrim');
        const d = el('div', 'ar-dialog');
        d.setAttribute('data-ar-dialog', kind);
        d.append(el('h2', null, kind === 'sort' ? 'Sort by' : 'Show only'));
        const opts = kind === 'sort' ? SORTS.map((s, i) => [s[2], () => L.sort === i, () => { L.sort = i; closeDialog(); load().then(() => L && L.caps.length && focusGrid(0)); }])
            : FILTERS.map(([k, t]) => [t, () => L.filters.has(k), () => { if (L.filters.has(k)) L.filters.delete(k); else L.filters.add(k); draw(); load(); }]);
        const els = opts.map(([text, on, fn]) => {
            const o = el('div', 'ar-opt', text);
            o.setAttribute('data-icefin-focus', '');
            o.tabIndex = -1;
            o.addEventListener('click', fn);
            o.arcadeOn = on;
            d.append(o);
            return o;
        });
        const draw = () => els.forEach((o) => o.classList.toggle('on', o.arcadeOn()));
        draw();
        scrim.append(d);
        L.root.append(scrim);
        L.dialog = scrim;
        L.dialogFrom = E.focused();
        E.focus(els.find((o) => o.arcadeOn()) || els[0]);
    }
    function closeDialog() {
        if (!L || !L.dialog) return;
        L.dialog.remove();
        L.dialog = null;
        E.focus(L.dialogFrom && L.dialogFrom.isConnected ? L.dialogFrom : L.sortBtn);
    }
})();
