// Plaza channel menus (PLAN 9.32): where a channel card's Open leads. Every menu shares one frame: the channel's name in
// a pill and its tabs along the top, the content, and a curved bottom bar with round Back and Home buttons, the focused
// item's name between them and a line of controller hints (shown only while a remote or controller is in use, 9.28).
// Grids page sideways like the home (450 ms), keep their cells at their own size, and fit more columns on wider
// screens; the focused cell glows and shows its name in a pill. Registered on jellyfin-web's own routes for the
// libraries, Live TV and search (#/movies, #/tv, #/music, #/livetv, #/search), so any way there lands here, and on
// #/home?pz=… for Plaza's own (series, resume, nextup, library, items).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const P = window.icefinPlaza;
    const ui = T.ui;
    const el = P.el;
    const SHAPES = {
        poster: { w: 195, h: 293, gx: 33, gy: 66, rows: 2, top: 162 },
        square: { w: 240, h: 240, gx: 33, gy: 75, rows: 2, top: 162 },
        wide: { w: 405, h: 186, gx: 27, gy: 33, rows: 3, top: 168 },
        episode: { w: 390, h: 219, gx: 36, gy: 105, rows: 2, top: 162 },
        result: { w: 240, h: 180, gx: 24, gy: 0, rows: 1, top: 0 },
        // playlists: four across, the server's quilt of the playlist's art with the name on it (the walk's mock-up)
        quilt: { w: 330, h: 300, gx: 36, gy: 30, rows: 2, top: 162 }
    };

    // ---- the frame ----
    function frame(root, spec) {
        root.setAttribute('data-pz', 'menu');
        root.setAttribute('data-pz-view', spec.view);
        const m = el('div', 'pz-menu pz-k-' + spec.kind);
        const head = el('div', 'pz-mhead');
        // The clock rides in the channel's name pill (user's choice): tabs and pills can't cover it there, and the name
        // shortens before the time does.
        const name = el('div', 'pz-mname');
        const nameText = el('span', 'pz-mname-text', spec.name);
        const clock = el('span', 'pz-mclock');
        name.append(nameText, clock);
        const tabs = el('div', 'pz-tabs');
        const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
        tick();
        const timer = setInterval(tick, 15000);
        head.append(name);
        P.nowPill(head);
        head.append(tabs);
        const body = el('div', 'pz-mbody');
        const barEl = el('div', 'pz-mbar');
        barEl.innerHTML = '<svg class="pz-mbar-svg" viewBox="0 0 1920 210" preserveAspectRatio="none" aria-hidden="true"><path class="pz-bar-fill" d="M0 24 C480 6 1440 6 1920 24 V210 H0 Z"/><path class="pz-bar-shine" d="M0 32 C480 14 1440 14 1920 32"/><path class="pz-bar-line" d="M0 24 C480 6 1440 6 1920 24"/></svg>';
        const round = (cls, label, go) => { const b = P.focusable(el('div', 'pz-mround ' + cls, label)); b.setAttribute('aria-label', label); b.addEventListener('click', go); return b; };
        const back = round('pz-mround-back', 'Back', () => { T.ctx.sound('back'); goBack(); });
        const homeBtn = round('pz-mround-home', 'Home', () => { P.reopen = null; T.ctx.navigate('#/home'); });
        const mid = el('div', 'pz-mmid');
        const focusLine = el('div', 'pz-mfocus');
        const hint = el('div', 'pz-mhints');
        const hintText = el('span', 'pz-mhint-keys');
        hintText.append(...P.hintNodes(spec.hints || 'Ⓐ Select · Ⓑ Back'));
        const pageText = el('span', 'pz-mpage');
        hint.append(hintText, pageText);
        mid.append(focusLine, hint);
        barEl.append(back, mid, homeBtn);
        m.append(head, body, barEl);
        root.append(m);
        let tabEls = [];
        const f = {
            root, body, menu: m, back, home: homeBtn, kind: spec.kind,
            setTabs(list, active, onTab) {
                tabs.textContent = '';
                tabEls = list.map((t) => {
                    const b = P.focusable(el('div', 'pz-tab' + (t.id === active ? ' pz-tab-on' : '') + (t.cls ? ' ' + t.cls : ''), t.label));
                    b.setAttribute('data-pz-tab', t.id);
                    b.addEventListener('click', () => {
                        if (t.go) { t.go(); return; }
                        const from = tabEls.findIndex((x) => x.classList.contains('pz-tab-on')), to = tabEls.indexOf(b);
                        f.setActive(t.id);
                        onTab(t.id, b);
                        // the content arrives from the side of the tab picked (220 ms, eased); low motion: at once
                        if (from >= 0 && to !== from && body.animate && document.documentElement.getAttribute('data-icefin-motion') !== 'low') {
                            const dx = (to > from ? 1 : -1) * 40;
                            body.animate([{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
                        }
                    });
                    tabs.append(b);
                    return b;
                });
            },
            setActive(id) { tabEls.forEach((b) => b.classList.toggle('pz-tab-on', b.getAttribute('data-pz-tab') === id)); },
            tab: (id) => tabEls.find((b) => b.getAttribute('data-pz-tab') === id),
            tabs: () => tabEls,
            setName(text) { nameText.textContent = text; },
            focusText(text) { P.caption(focusLine, text); },
            pageText(text) { pageText.textContent = text ? ` · ${text}` : ''; },
            hints(text) { hintText.textContent = ''; hintText.append(...P.hintNodes(text)); },
            stop() { clearInterval(timer); }
        };
        return f;
    }
    function goBack() {
        if (history.length > 1) history.back(); else T.ctx.navigate('#/home');
    }

    // ---- an empty list: the channel's picture, what it means, and a way forward (9.43) ----
    P.emptyState = (text, hint, action, kind) => {
        const box = el('div', 'pz-empty pz-empty-state');
        // an empty shelf in the channel's colours
        const ill = el('div', 'pz-empty-ill pz-k-' + (kind || 'folder'));
        ill.innerHTML = '<svg viewBox="0 0 160 100" aria-hidden="true"><rect x="8" y="10" width="144" height="80" rx="20" fill="var(--icefin-color-surface)" stroke="var(--pz-ch-b)" stroke-width="5"/>'
            + '<rect x="30" y="30" width="28" height="40" rx="6" fill="var(--pz-ch-a)" opacity=".55"/><rect x="66" y="30" width="28" height="40" rx="6" fill="none" stroke="var(--pz-ch-a)" stroke-width="4" stroke-dasharray="6 5"/>'
            + '<rect x="102" y="30" width="28" height="40" rx="6" fill="none" stroke="var(--pz-ch-a)" stroke-width="4" stroke-dasharray="6 5"/></svg>';
        box.append(ill);
        box.append(el('div', 'pz-empty-text', text));
        if (hint) box.append(el('div', 'pz-empty-hint', hint));
        if (action) { const b = P.focusable(el('div', 'pz-tab pz-tab-on pz-empty-go', action.label)); b.addEventListener('click', action.go); box.append(b); }
        return box;
    };

    // ---- a paged grid of server items ----
    // opts: shape, fetch(start, limit) -> {items, total}, art(item) -> url, caption?(item), name(item), focus(item) -> text,
    // select(item), play?(item), menu?(item), empty: text, onPage?(page, pages), frame
    function pageGrid(host, opts) {
        const sh = SHAPES[opts.shape];
        const g = { page: 0, pages: 1, cache: new Map(), total: null, cells: [], dead: false };
        const box = el('div', 'pz-grid pz-grid-' + opts.shape);
        const pageEl = el('div', 'pz-grid-page');
        const prev = el('div', 'pz-arrow pz-prev pz-hidden'), next = el('div', 'pz-arrow pz-next pz-hidden');
        prev.setAttribute('aria-label', 'Previous page');
        next.setAttribute('aria-label', 'Next page');
        prev.addEventListener('click', () => go(g.page - 1));
        next.addEventListener('click', () => go(g.page + 1));
        box.append(pageEl, prev, next);
        host.append(box);
        const cols = () => P.fit(sh.w, sh.gx, 90, 1);
        const per = () => cols() * sh.rows;
        box.style.setProperty('--pz-cw', String(sh.w));
        box.style.setProperty('--pz-ch', String(sh.h));
        box.style.setProperty('--pz-gx', String(sh.gx));
        box.style.setProperty('--pz-gy', String(sh.gy));
        box.style.setProperty('--pz-top', String(sh.top));
        async function load(p) {
            const key = `${p}:${per()}`;
            if (!g.cache.has(key)) g.cache.set(key, Promise.resolve(opts.fetch(p * per(), per())).then((r) => r || { items: [], total: 0 }, () => ({ items: [], total: 0 })));
            return g.cache.get(key);
        }
        async function draw(p, dir, focusAt) {
            const r = await load(p);
            if (g.dead || !box.isConnected) return;
            g.total = r.total != null ? r.total : (r.items || []).length;
            g.pages = Math.max(1, Math.ceil(g.total / per()));
            g.page = Math.max(0, Math.min(p, g.pages - 1));
            box.style.setProperty('--pz-cols', String(cols()));
            pageEl.textContent = '';
            const items = r.items || [];
            g.cells = items.map((it, i) => cell(it, i));
            g.cells.forEach((c) => pageEl.append(c));
            if (!items.length) pageEl.append(P.emptyState(opts.empty || 'Nothing here yet', opts.emptyHint, opts.emptyAction, opts.frame && opts.frame.kind));
            P.slide(pageEl, dir);
            prev.classList.toggle('pz-hidden', g.page === 0);
            next.classList.toggle('pz-hidden', g.page >= g.pages - 1);
            if (opts.frame) opts.frame.pageText(g.pages > 1 ? `${g.page + 1} / ${g.pages}` : '');
            box.setAttribute('data-pz-grid-page', `${g.page + 1}/${g.pages}`);
            box.setAttribute('data-pz-grid-ready', String(items.length));
            if (focusAt != null && g.cells.length) T.ctx.focus(g.cells[Math.max(0, Math.min(focusAt, g.cells.length - 1))]);
            if (opts.onPage) opts.onPage(g.page, g.pages);
        }
        function cell(it, i) {
            const c = P.focusable(el('div', 'pz-cell'));
            c.plazaItem = it;
            const art = el('div', 'pz-cell-art');
            const url = opts.art ? opts.art(it) : '';
            if (url) { P.bg(art, url); if (opts.label) art.append(el('div', 'pz-cell-label', opts.name(it))); } else art.append(el('div', 'pz-cell-title', opts.name(it)));
            c.append(art);
            if (opts.decorate) opts.decorate(c, it, art);
            if (opts.caption) c.append(el('div', 'pz-cell-cap', opts.caption(it)));
            c.append(el('div', 'pz-name', opts.name(it)));
            c.addEventListener('icefin-focus', () => { if (opts.frame) opts.frame.focusText(opts.focus ? opts.focus(it) : opts.name(it)); });
            c.addEventListener('click', () => {
                const a = art.getBoundingClientRect();
                P.flight.from = { id: it.Id, rect: a, image: (art.style.backgroundImage.match(/url\("?(.*?)"?\)/) || [])[1] || '', at: Date.now() };
                opts.select(it, c);
            });
            // back from this item's details: its picture shrinks home into this cell (once the grid has laid out)
            // (a moment later: Back rebuilds this grid inside the same hashchange that tells the details page it is left)
            setTimeout(() => {
                const b = P.flight.back;
                if (!b || b.id !== it.Id || Date.now() - b.at > 4000 || !c.isConnected) return;
                P.flight.back = null;
                P.fly({ from: b.rect, to: art.getBoundingClientRect(), image: b.image, ms: 320, radius: 18 });
            }, 30);
            c.setAttribute('data-pz-index', String(i));
            return c;
        }
        function go(p, focusAt, dir) {
            if (p < 0 || p >= g.pages || p === g.page) return false;
            T.ctx.sound('navigate');
            draw(p, dir || (p > g.page ? 1 : -1), focusAt != null ? focusAt : 0);
            return true;
        }
        g.ready = draw(0, 0, opts.takeFocus ? 0 : null);
        g.el = box;
        g.focusFirst = () => { if (g.cells[0]) { T.ctx.focus(g.cells[0]); return true; } return false; };
        g.focused = () => { const f = T.ctx.focused(); return g.cells.includes(f) ? f : null; };
        // Left/right past the page's edge turn the page; play/menu act on the focused item.
        g.action = (a) => {
            const f = g.focused();
            if (!f) return false;
            const i = g.cells.indexOf(f), n = cols(), col = i % n, row = Math.floor(i / n);
            if (a === 'left' && col === 0) { go(g.page - 1, row * n + n - 1); return true; }
            if (a === 'right' && (col === n - 1 || i === g.cells.length - 1)) {
                if (g.page < g.pages - 1) { go(g.page + 1, row * n); return true; }
                return col === n - 1 || i === g.cells.length - 1;
            }
            if (a === 'play_pause' && opts.play) { opts.play(f.plazaItem); return true; }
            if (a === 'menu' && f.plazaItem && !f.plazaItem.pzNew && P.itemMenu) { P.itemMenu(f.plazaItem); return true; }
            if (a === 'menu' && opts.menu) { opts.menu(f.plazaItem); return true; }
            return false;
        };
        g.relayout = () => { g.cache.clear(); draw(Math.min(g.page, g.pages - 1), 0, g.focused() ? 0 : null); };
        // jump to the item at an index (the A–Z rail): its page, focused
        g.goToIndex = (i) => { const n = per(), p = Math.max(0, Math.min(Math.floor(i / n), g.pages - 1)); T.ctx.sound('navigate'); draw(p, p === g.page ? 0 : (p > g.page ? 1 : -1), Math.max(0, i - p * n)); };
        g.destroy = () => { g.dead = true; box.remove(); };
        return g;
    }
    P.pageGrid = pageGrid;

    // ---- shared item queries ----
    const ITEM_SORTS = [
        { id: 'name', label: 'A–Z', SortBy: 'SortName', SortOrder: 'Ascending' },
        { id: 'added', label: 'Newest', SortBy: 'DateCreated,SortName', SortOrder: 'Descending' },
        { id: 'year', label: 'Year', SortBy: 'ProductionYear,PremiereDate,SortName', SortOrder: 'Descending' },
        { id: 'rating', label: 'Rating', SortBy: 'CommunityRating,SortName', SortOrder: 'Descending' }
    ];
    const itemsQuery = (q) => (start, limit) => P.safe(P.client().getItems(P.uid(), Object.assign({ Recursive: true, Fields: P.FIELDS, StartIndex: start, Limit: limit, EnableTotalRecordCount: true }, q)))
        .then((r) => ({ items: P.items(r), total: r.TotalRecordCount }));
    const namedQuery = (path, q) => (start, limit) => P.get(path, Object.assign({ UserId: P.uid(), SortBy: 'SortName', StartIndex: start, Limit: limit, EnableTotalRecordCount: true }, q))
        .then((r) => ({ items: P.items(r), total: r.TotalRecordCount }));
    const filtered = (parent, type, field, item) => T.ctx.navigate(`#/home?pz=items&parent=${parent || ''}&type=${type}&${field}=${item.Id}&name=${encodeURIComponent(item.Name || '')}`);

    // ---- a library menu: tabs over grids, a sort pill ----
    // The sort and filter panel (9.42): sort pills, the order, and "show only" switches, applied as they change.
    const FILTERS = [{ id: 'IsUnplayed', label: 'Not watched yet' }, { id: 'IsFavorite', label: 'Favourites' }, { id: 'IsResumable', label: 'In progress' }];
    function sortPanel(F, state, apply) {
        const panel = el('div', 'pz-panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Sort and filter');
        const dim = el('div', 'pz-dim pz-on');
        const card = el('div', 'pz-panel-card');
        card.append(el('div', 'pz-dlg-tab', 'Sort and filter'));
        const btn = (label, cls, go) => { const b = P.focusable(el('div', 'pz-tab ' + (cls || ''), label)); b.addEventListener('click', go); return b; };
        const sorts = el('div', 'pz-panel-pills');
        const drawSorts = () => { sorts.textContent = ''; ITEM_SORTS.forEach((x, k) => sorts.append(btn(x.label, k === state.sort ? 'pz-tab-on' : '', () => { state.sort = k; state.flip = false; drawSorts(); orderEl.textContent = orderText(); apply(); T.ctx.focus(sorts.children[k]); }))); };
        const orderText = () => { const x = ITEM_SORTS[state.sort]; const asc = (x.SortOrder === 'Ascending') !== !!state.flip; return x.id === 'name' ? (asc ? 'A to Z' : 'Z to A') : (asc ? 'Oldest or lowest first' : 'Newest or highest first'); };
        const orderEl = el('span', 'pz-stepper-val', '');
        const order = P.focusable(el('div', 'pz-stepper'));
        order.append(el('span', 'pz-stepper-arrow pz-l'), orderEl, el('span', 'pz-stepper-arrow pz-r'));
        order.addEventListener('click', () => { state.flip = !state.flip; orderEl.textContent = orderText(); apply(); });
        order.plazaStep = () => order.click();
        const rows = FILTERS.map((f) => {
            const r = P.focusable(el('div', 'pz-setrow'));
            const sw = el('span', 'pz-switch');
            r.append(el('span', 'pz-setrow-label', f.label), sw);
            const draw = () => sw.classList.toggle('pz-on', state.filters.has(f.id));
            r.addEventListener('click', () => { if (state.filters.has(f.id)) state.filters.delete(f.id); else state.filters.add(f.id); draw(); apply(); });
            draw();
            return r;
        });
        const foot = el('div', 'pz-panel-foot');
        const done = btn('Done', 'pz-panel-done', () => close());
        foot.append(done, btn('Reset', '', () => { state.sort = 0; state.flip = false; state.filters.clear(); close(); apply(); }));
        card.append(el('div', 'pz-panel-label', 'Sort by'), sorts, el('div', 'pz-panel-label', 'Order'), order, el('div', 'pz-panel-label', 'Show only'), ...rows, foot);
        panel.append(dim, card);
        dim.addEventListener('click', () => close());
        F.root.append(panel);
        drawSorts();
        orderEl.textContent = orderText();
        F.root.setAttribute('data-pz-panel', 'sort');
        T.ctx.focus(sorts.children[state.sort]);
        T.ctx.sound('select');
        const close = () => {
            if (!panel.isConnected || panel.classList.contains('pz-panel-out')) return;
            const low = document.documentElement.getAttribute('data-icefin-motion') === 'low';
            if (low) panel.remove(); else { panel.classList.add('pz-panel-out'); setTimeout(() => panel.remove(), 220); }
            F.root.removeAttribute('data-pz-panel');
            const t = F.tab('sort');
            if (t) { t.textContent = sortLabel(state); T.ctx.focus(t); }
            T.ctx.sound('back');
        };
        return {
            el: card, close,
            action(a, ctx) {
                if (a === 'back') { close(); return true; }
                if ((a === 'left' || a === 'right') && ctx.focused() === order) { order.click(); return true; }
                if (['up', 'down', 'left', 'right'].includes(a)) { ctx.move(a, card); return true; }
                return a !== 'enter' && a !== 'select';
            }
        };
    }
    const sortLabel = (state) => `${ITEM_SORTS[state.sort].label}${state.flip ? ' ↑' : ''}${state.filters.size ? ` · ${state.filters.size} filter${state.filters.size > 1 ? 's' : ''}` : ''} ▾`;
    const sortOf = (state) => {
        const x = ITEM_SORTS[state.sort];
        const order = state.flip ? (x.SortOrder === 'Ascending' ? 'Descending' : 'Ascending') : x.SortOrder;
        return { id: x.id, label: x.label, SortBy: x.SortBy, SortOrder: order, Filters: [...state.filters].join(',') };
    };

    function libraryMenu(spec) {
        let F = null, grid = null, tab = null, panel = null;
        const state = { sort: 0, flip: false, filters: new Set() };
        const screen = {
            mount(root) {
                ui.pointerFirst(true);
                const p = P.params();
                const parent = spec.parent ? spec.parent(p) : p.get('topParentId') || p.get('id');
                F = frame(root, { view: spec.view, kind: spec.kind(p), name: spec.name(p), hints: spec.hints });
                const tabs = spec.tabs(parent, p).map((t) => Object.assign({}, t));
                if (spec.sortable) tabs.push({ id: 'sort', label: sortLabel(state), cls: 'pz-tab-sort', go: () => { panel = sortPanel(F, state, () => show(tab, false)); } });
                const show = (id, focusGrid) => {
                    tab = id;
                    const t = tabs.find((x) => x.id === id);
                    if (grid) grid.destroy();
                    F.focusText('');
                    grid = pageGrid(F.body, Object.assign({ frame: F, takeFocus: focusGrid, empty: t.empty }, t.grid(sortOf(state), parent, p)));
                    screen.grid = grid;
                    if (spec.shown) spec.shown(screen);
                };
                screen.sort = () => sortOf(state);
                F.setTabs(tabs, tabs[0].id, (id) => show(id, false));
                if (spec.after) spec.after(F, parent, p, screen);
                show(tabs[0].id, true);
                screen.relayout = () => { if (grid) grid.relayout(); };
                window.addEventListener('resize', screen.relayout);
            },
            onAction(a, ctx) {
                P.sawAction();
                if (panel && panel.el.isConnected) return panel.action(a, ctx);
                if (spec.action && spec.action(a, ctx, screen)) return true;
                if (grid && grid.action(a)) return true;
                return common(a, ctx);
            },
            onBack() { if (panel && panel.el.isConnected) { panel.close(); return true; } if (spec.back && spec.back(screen)) return true; goBack(); return true; },
            frame: () => F,
            unmount() { if (F) F.stop(); window.removeEventListener('resize', screen.relayout); ui.pointerFirst(false); if (spec.unmount) spec.unmount(); F = null; grid = null; panel = null; }
        };
        return screen;
    }
    function common(a, ctx) {
        if (a === 'home') { ctx.navigate('#/home'); return true; }
        if (a === 'search') { ctx.navigate('#/search'); return true; }
        return false;
    }

    const withSort = (s, q) => { const o = Object.assign({ SortBy: s.SortBy, SortOrder: s.SortOrder }, q); if (s.Filters) o.Filters = [q.Filters, s.Filters].filter(Boolean).join(','); return o; };
    const posterGrid = (q, extra) => (s) => Object.assign({ shape: 'poster', fetch: itemsQuery(withSort(s, q)),
        art: (it) => P.posterArt(it, 400), name: (it) => it.Name, focus: (it) => [it.Name, P.meta(it)].filter(Boolean).join(' · '),
        select: P.open, play: (it) => P.play(it), menu: P.details }, extra || {});
    const nameGrid = (path, q, onPick) => () => ({ shape: 'wide', fetch: namedQuery(path, q), label: true,
        art: (it) => P.wideArt(it, 600) || P.posterArt(it, 400), name: (it) => it.Name, focus: (it) => it.Name, select: onPick });

    const MOVIES = libraryMenu({
        view: 'movies', kind: () => 'movies', name: () => 'Movies', sortable: true,
        hints: 'Ⓐ Open · ▶ Play · ≡ Details · ◀▶ Page',
        tabs: (parent) => [
            { id: 'movies', label: 'Movies', grid: posterGrid({ ParentId: parent, IncludeItemTypes: 'Movie' }) },
            { id: 'collections', label: 'Collections', grid: posterGrid({ IncludeItemTypes: 'BoxSet' }), empty: 'No collections yet' },
            { id: 'genres', label: 'Genres', grid: nameGrid('Genres', { ParentId: parent, IncludeItemTypes: 'Movie' }, (g) => filtered(parent, 'Movie', 'genre', g)) },
            { id: 'favourites', label: 'Favourites', grid: posterGrid({ ParentId: parent, IncludeItemTypes: 'Movie', Filters: 'IsFavorite' }), empty: 'No favourite movies yet' }
        ]
    });
    const SHOWS = libraryMenu({
        view: 'tv', kind: () => 'tvshows', name: () => 'Shows', sortable: true,
        hints: 'Ⓐ Open · ▶ Play · ≡ Details · ◀▶ Page',
        tabs: (parent) => [
            { id: 'shows', label: 'Shows', grid: posterGrid({ ParentId: parent, IncludeItemTypes: 'Series' }) },
            { id: 'genres', label: 'Genres', grid: nameGrid('Genres', { ParentId: parent, IncludeItemTypes: 'Series' }, (g) => filtered(parent, 'Series', 'genre', g)) },
            { id: 'networks', label: 'Networks', grid: nameGrid('Studios', { ParentId: parent, IncludeItemTypes: 'Series' }, (s) => filtered(parent, 'Series', 'studio', s)) },
            { id: 'favourites', label: 'Favourites', grid: posterGrid({ ParentId: parent, IncludeItemTypes: 'Series', Filters: 'IsFavorite' }), empty: 'No favourite shows yet' }
        ]
    });

    // What's playing (music): one wide capsule, on the home (9.44; every other screen has the Now playing pill in its
    // head): the record, the title and the transport, with the progress as a glowing line along its foot from the
    // record's left edge. Pointing at the line shows the grabber; a click or a drag seeks. Returns {el, stop()}.
    P.miniPlayer = (host, cls) => {
        const np = el('div', 'pz-nowplaying' + (cls ? ' ' + cls : ''));
        const rec = el('div', 'pz-np-record'), text = el('div', 'pz-np-text');
        const line = el('div', 'pz-np-line'), fillEl = el('div', 'pz-np-fill'), dot = el('div', 'pz-np-dot');
        line.append(fillEl, dot);
        const ICON = {
            prev: '<path d="M6 5v14M19 5 9 12l10 7z"/>', next: '<path d="M18 5v14M5 5l10 7-10 7z"/>',
            playpause: '<path d="M4 5l8 7-8 7z"/><path d="M14 5h2.5v14H14zM19 5h2.5v14H19z"/>', open: '<ellipse cx="6.2" cy="17.6" rx="3.2" ry="2.4" transform="rotate(-22 6.2 17.6)" stroke="none"/><ellipse cx="17.2" cy="15.4" rx="3.2" ry="2.4" transform="rotate(-22 17.2 15.4)" stroke="none"/>'
                + '<path d="M8.9 16.8V6.4M19.9 14.6V4.2" fill="none" stroke-width="1.9" stroke-linecap="round"/><path d="M8.9 5.9 19.9 3.6v3.4L8.9 9.3z" stroke="none"/>'
        };
        const btn = (icon, aria, go) => {
            const b = P.focusable(el('div', 'pz-np-btn'));
            b.innerHTML = `<svg viewBox="0 0 24 24" width="60%" height="60%" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">${ICON[icon]}</svg>`;
            b.setAttribute('aria-label', aria);
            b.addEventListener('click', go);
            return b;
        };
        const pm = () => T.ctx.nowPlaying();
        const ctl = (fn) => { const n = pm(); if (n && n.player) try { fn(n.player); } catch (e) { /* the player went away */ } };
        const open = btn('open', 'Now playing', () => T.ctx.navigate('#/queue'));
        np.append(rec, text, btn('prev', 'Previous', () => ctl((p) => p.previousTrack && p.previousTrack())),
            btn('playpause', 'Play or pause', () => ctl((p) => (p.paused && p.paused() ? p.unpause() : p.pause()))), btn('next', 'Next', () => ctl((p) => p.nextTrack && p.nextTrack())), open, line);
        host.append(np);
        let dur = 0, dragging = false;
        const show = (f) => { const pc = `${Math.max(0, Math.min(1, f)) * 100}%`; fillEl.style.width = pc; dot.style.left = pc; };
        // seeking: the line (with a taller zone to point at) takes clicks and drags
        const frac = (e) => { const r = line.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
        const seek = (f) => ctl((p) => { if (dur && p.currentTime) p.currentTime(Math.max(0, Math.min(1, f)) * dur); });
        line.addEventListener('pointerdown', (e) => { if (!dur) return; dragging = true; line.setPointerCapture(e.pointerId); np.classList.add('pz-np-seeking'); show(frac(e)); e.preventDefault(); });
        line.addEventListener('pointermove', (e) => { if (dragging) show(frac(e)); });
        const end = (e) => { if (!dragging) return; dragging = false; np.classList.remove('pz-np-seeking'); seek(frac(e)); T.ctx.sound('select'); };
        line.addEventListener('pointerup', end);
        line.addEventListener('pointercancel', () => { dragging = false; np.classList.remove('pz-np-seeking'); });
        const tick = () => {
            const n = pm();
            const it = n && n.item;
            const on = !!(it && it.MediaType === 'Audio');
            np.classList.toggle('pz-on', on);
            if (host.setAttribute) host.toggleAttribute('data-pz-music', on);
            if (!it) return;
            text.textContent = '';
            text.append(el('b', '', it.Name || ''), document.createTextNode(` — ${(it.Artists || [])[0] || it.AlbumArtist || ''}`));
            P.bg(rec, P.posterArt(it, 200));
            let paused = false;
            try { paused = !!(n.player.paused && n.player.paused()); } catch (e) { /* the player went away */ }
            np.classList.toggle('pz-np-paused', paused);
            if (dragging) return;
            try { const pos = n.player.currentTime ? n.player.currentTime() : 0; dur = (n.player.duration ? n.player.duration() : 0) || 0; show(dur ? pos / dur : 0); } catch (e) { show(0); }
        };
        tick();
        const timer = setInterval(tick, 500);
        return { el: np, stop() { clearInterval(timer); np.remove(); } };
    };

    // ---- "Now playing" beside the name pill on every screen while music plays (9.44); it opens now playing ----
    // It waits tucked under the name pill: playback starting slides it out (pushing the tabs along), stopping slides it
    // back. The record spins while the music plays and stands still while it is paused.
    P.nowPill = (head) => {
        const b = el('div', 'pz-nowpill');
        b.setAttribute('aria-label', 'Now playing');
        const rec = el('span', 'pz-nowpill-rec'), disc = el('span', 'pz-nowpill-disc'), label = el('span', 'pz-nowpill-label'), text = el('span', 'pz-nowpill-text');
        disc.append(label);
        rec.append(disc);
        b.append(rec, el('b', '', '♫ Now playing'), text);
        b.addEventListener('click', () => { if (b.classList.contains('pz-on')) T.ctx.navigate('#/queue'); });
        let seen = false, first = true, art = '';
        const tick = () => {
            if (b.isConnected) seen = true;
            else if (seen) { clearInterval(timer); return; }
            const n = T.ctx.nowPlaying();
            const it = n && n.item;
            const on = !!(it && it.MediaType === 'Audio');
            let paused = false;
            try { paused = !!(on && n.player.paused && n.player.paused()); } catch (e) { /* the player went away */ }
            if (on) {
                text.textContent = [it.Name, (it.Artists || [])[0] || it.AlbumArtist].filter(Boolean).join(' · ');
                const a = P.posterArt(it, 120) || '';
                if (a !== art) { art = a; label.style.backgroundImage = a ? `url("${a}")` : ''; }
            }
            // how far to tuck it: its own width, so it hides wholly under the name pill. Set without a transition, so
            // a new title doesn't shove the tabs before the slide begins.
            if (b.isConnected && !b.classList.contains('pz-on')) {
                b.classList.add('pz-np-still');
                b.style.setProperty('--pz-np-w', `${b.offsetWidth}px`);
                void getComputedStyle(b).marginLeft;
                if (!first) b.classList.remove('pz-np-still');
            }
            if (first && b.isConnected) {
                // a screen opened while music plays shows it out already; the slide is for playback starting and stopping
                first = false;
                b.classList.add('pz-np-still');
                requestAnimationFrame(() => requestAnimationFrame(() => b.classList.remove('pz-np-still')));
            }
            if (on !== b.classList.contains('pz-on')) {
                b.classList.toggle('pz-on', on);
                if (on) P.focusable(b);
                else {
                    b.removeAttribute('data-icefin-focus');
                    if (b.classList.contains('icefin-focused')) {
                        const next = [...head.querySelectorAll('[data-icefin-focus]')].find((x) => x !== b);
                        if (next) T.ctx.focus(next);
                    }
                }
            }
            b.classList.toggle('pz-np-paused', paused);
        };
        const timer = setInterval(tick, 1000);
        head.append(b);
        tick();
        requestAnimationFrame(tick);
        return b;
    };

    // Music: albums, artists, songs, playlists and genres (what is playing shows in the head's Now playing pill).
    const squareGrid = (q, extra) => (s) => Object.assign(posterGrid(q)(s), { shape: 'square', art: (it) => P.posterArt(it, 400),
        focus: (it) => [it.Name, it.AlbumArtist || (it.Artists || [])[0], it.ProductionYear].filter(Boolean).join(' · ') }, extra || {});
    const MUSIC = libraryMenu({
        view: 'music', kind: () => 'music', name: () => 'Music', sortable: true,
        hints: 'Ⓐ Open · ▶ Play · ≡ Details · ◀▶ Page',
        tabs: (parent) => [
            { id: 'albums', label: 'Albums', grid: squareGrid({ ParentId: parent, IncludeItemTypes: 'MusicAlbum' }) },
            { id: 'artists', label: 'Artists', grid: () => ({ shape: 'square', label: true, fetch: namedQuery('Artists/AlbumArtists', { ParentId: parent, Fields: 'PrimaryImageAspectRatio' }),
                art: (it) => P.posterArt(it, 400), name: (it) => it.Name, focus: (it) => it.Name, select: P.details, play: (it) => P.play(it), menu: P.details }) },
            { id: 'songs', label: 'Songs', grid: squareGrid({ ParentId: parent, IncludeItemTypes: 'Audio' }, { select: (it) => P.play(it, true) }) },
            { id: 'playlists', label: 'Playlists', grid: squareGrid({ IncludeItemTypes: 'Playlist', MediaTypes: 'Audio' }), empty: 'No playlists yet' },
            { id: 'genres', label: 'Genres', grid: nameGrid('MusicGenres', { ParentId: parent }, (g) => filtered(parent, 'MusicAlbum', 'genre', g)) }
        ],
    });

    // Any other library: its folders and items as they are on disk; folders open in place.
    const LIBRARY = libraryMenu({
        view: 'library', kind: (p) => p.get('kind') || 'folder', name: (p) => p.get('name') || 'Library', sortable: true,
        parent: (p) => p.get('id'),
        hints: 'Ⓐ Open · ▶ Play · ≡ Details · ◀▶ Page',
        tabs: (parent, p) => [
            { id: 'all', label: 'All', grid: posterGrid({ ParentId: parent, Recursive: false }, {
                select: (it) => (it.IsFolder && it.Type !== 'Series' && it.Type !== 'BoxSet' && it.Type !== 'MusicAlbum'
                    ? T.ctx.navigate(`#/home?pz=library&id=${it.Id}&kind=${p.get('kind') || 'folder'}&name=${encodeURIComponent(it.Name || '')}`) : P.open(it)) }) },
            { id: 'favourites', label: 'Favourites', grid: posterGrid({ ParentId: parent, Filters: 'IsFavorite' }), empty: 'No favourites here yet' }
        ]
    });
    // A genre's or a network's items (from a Genres or Networks tab).
    const ITEMS = libraryMenu({
        view: 'items', kind: (p) => ({ Movie: 'movies', Series: 'tvshows', MusicAlbum: 'music' })[p.get('type')] || 'folder', name: (p) => p.get('name') || '', sortable: true,
        parent: (p) => p.get('parent'),
        hints: 'Ⓐ Open · ▶ Play · ≡ Details · ◀▶ Page',
        tabs: (parent, p) => {
            const q = { ParentId: parent || undefined, IncludeItemTypes: p.get('type') };
            if (p.get('genre')) q.GenreIds = p.get('genre');
            if (p.get('studio')) q.StudioIds = p.get('studio');
            const shape = p.get('type') === 'MusicAlbum' ? squareGrid(q) : posterGrid(q);
            return [{ id: 'all', label: p.get('genre') ? 'Genre' : 'Network', grid: shape }];
        }
    });

    // ---- Live TV: channels, the guide, recordings, the schedule ----
    function liveTv() {
        let F = null, grid = null, guide = null, guideEl = null;
        const c = () => P.client(), uid = () => P.uid();
        const playChannel = (ch) => P.play(ch, true);
        // each channel on the page with what comes on next (one request for the page)
        const withNext = async (r) => {
            const chans = P.items(r);
            if (!chans.length) return r;
            const res = await P.safe(c().getLiveTvPrograms({ UserId: uid(), ChannelIds: chans.map((x) => x.Id).join(','), MinStartDate: new Date().toISOString(), SortBy: 'StartDate',
                EnableImages: false, EnableUserData: false, EnableTotalRecordCount: false, Limit: 400 }));
            const next = new Map();
            for (const p of P.items(res)) if (!next.has(p.ChannelId)) next.set(p.ChannelId, p);
            for (const ch of chans) ch.pzNext = next.get(ch.Id) || null;
            return r;
        };
        const channelCell = (c2, ch) => {
            const now = ch.CurrentProgram;
            c2.classList.add('pz-chan');
            const art = c2.querySelector('.pz-cell-art');
            art.textContent = '';
            art.style.backgroundImage = '';
            const logo = el('div', 'pz-chan-logo');
            const tag = ch.ImageTags && ch.ImageTags.Primary;
            if (tag) P.bg(logo, P.img(ch.Id, 'Primary', tag, 200)); else logo.textContent = ch.Name;
            art.append(logo, el('div', 'pz-chan-no', ch.ChannelNumber ? `CH ${ch.ChannelNumber}` : ''), el('div', 'pz-chan-now', now ? now.Name : ch.Name),
                el('div', 'pz-chan-time', [now ? `${P.time(now.StartDate)} – ${P.time(now.EndDate)}` : '', ch.pzNext ? `Next ${P.time(ch.pzNext.StartDate)} ${ch.pzNext.Name}` : ''].filter(Boolean).join(' · ')));
            if (now) {
                const s = Date.parse(now.StartDate), e = Date.parse(now.EndDate);
                art.append(P.progressBar(Math.max(0, Math.min(1, (Date.now() - s) / (e - s || 1)))));
            }
        };
        const tabs = {
            channels: () => ({ shape: 'wide', fetch: (start, limit) => P.safe(c().getLiveTvChannels({ UserId: uid(), StartIndex: start, Limit: limit, AddCurrentProgram: true, EnableImages: true, ImageTypeLimit: 1, EnableUserData: false, EnableTotalRecordCount: true })).then(withNext)
                .then((r) => ({ items: P.items(r), total: r.TotalRecordCount })),
            art: () => '', decorate: channelCell, name: (ch) => ch.Name, focus: (ch) => [ch.ChannelNumber ? `CH ${ch.ChannelNumber}` : '', ch.CurrentProgram ? ch.CurrentProgram.Name : ch.Name].filter(Boolean).join(' · '),
            select: playChannel, play: playChannel, menu: P.details, empty: 'This server has no Live TV channels' }),
            recordings: () => ({ shape: 'episode', fetch: (start, limit) => P.safe(c().getLiveTvRecordings({ UserId: uid(), StartIndex: start, Limit: limit, Fields: P.FIELDS, EnableImages: true, EnableTotalRecordCount: true }))
                .then((r) => ({ items: P.items(r), total: r.TotalRecordCount })),
            art: (it) => P.thumbArt(it, 600), caption: (it) => it.Name, name: (it) => it.Name, focus: (it) => [it.Name, it.StartDate ? new Date(it.StartDate).toLocaleDateString() : ''].filter(Boolean).join(' · '),
            select: P.details, play: (it) => P.play(it), menu: P.details, empty: 'No recordings yet', emptyHint: 'Record a programme from the Guide; it shows up here.',
            emptyAction: { label: 'Open the Guide', go: () => { const t = F && F.tab('guide'); if (t) t.click(); } } }),
            schedule: () => ({ shape: 'wide', fetch: () => P.safe(c().getLiveTvTimers({})).then((r) => ({ items: P.items(r), total: P.items(r).length })),
            art: () => '', decorate: (c2, t) => { const a = c2.querySelector('.pz-cell-art'); a.textContent = ''; a.append(el('div', 'pz-chan-no', t.ChannelName || ''), el('div', 'pz-chan-now', t.Name || ''), el('div', 'pz-chan-time', t.StartDate ? `${new Date(t.StartDate).toLocaleDateString([], { weekday: 'short' })} ${P.time(t.StartDate)}` : '')); c2.classList.add('pz-chan'); },
            name: (t) => t.Name, focus: (t) => [t.Name, t.ChannelName].filter(Boolean).join(' · '), select: (t) => t.ProgramId && T.ctx.navigate(`#/details?id=${t.ProgramId}&serverId=${P.sid()}`), empty: 'Nothing scheduled to record', emptyHint: 'Programmes and series you choose to record are listed here.',
            emptyAction: { label: 'Open the Guide', go: () => { const t = F && F.tab('guide'); if (t) t.click(); } } })
        };
        async function showGuide(focusIt) {
            guideEl = el('div', 'pz-guide');
            guideEl.style.position = 'absolute';  // the guide keeps an inline position; its box is the stylesheet's
            F.body.append(guideEl);
            F.pageText('');
            const r = await P.safe(c().getLiveTvChannels({ UserId: uid(), EnableImages: true, ImageTypeLimit: 1, Limit: 1000, EnableUserData: false }));
            if (!F || !guideEl.isConnected) return;
            const chans = P.items(r).sort((a, b) => (parseFloat(a.ChannelNumber) || 1e9) - (parseFloat(b.ChannelNumber) || 1e9) || String(a.Name).localeCompare(b.Name));
            F.root.setAttribute('data-pz-guide', String(chans.length));
            if (!chans.length) { guideEl.append(el('div', 'pz-empty', 'This server has no Live TV channels')); return; }
            const iso = (t) => new Date(t).toISOString();
            guide = ui.guideGrid(guideEl, {
                channels: chans.map((ch) => ({ id: ch.Id, name: ch.Name, ch })),
                rows: 7, span: 120, focus: !!focusIt,
                async fetch(ids, a, b) {
                    const res = await P.safe(c().getLiveTvPrograms({ UserId: uid(), ChannelIds: ids.join(','), MinEndDate: iso(a), MaxStartDate: iso(b), EnableImages: false, EnableUserData: false, SortBy: 'StartDate', EnableTotalRecordCount: false, Limit: 2000 }));
                    return P.items(res).map((p) => ({ id: p.Id, channelId: p.ChannelId, start: Date.parse(p.StartDate), end: Date.parse(p.EndDate), title: p.Name, item: p }));
                },
                renderChannel(ch, cell) {
                    const logo = el('div', 'pz-gch-logo');
                    const tag = ch.ch.ImageTags && ch.ch.ImageTags.Primary;
                    if (tag) P.bg(logo, P.img(ch.id, 'Primary', tag, 160));
                    cell.append(logo, el('div', 'pz-gch-no', ch.ch.ChannelNumber ? `CH ${ch.ch.ChannelNumber}` : ch.name));
                },
                renderProgram(p, cell) { cell.append(el('div', 'pz-gp-title', p.title), el('div', 'pz-gp-time', `${P.time(p.start)} – ${P.time(p.end)}`)); },
                emptyLabel: 'No information',
                onFocus(p, ch) { F.focusText(p.gap ? ch.name : `${p.title} · ${ch.ch.ChannelNumber ? 'CH ' + ch.ch.ChannelNumber : ch.name} · ${P.time(p.start)} – ${P.time(p.end)}`); },
                onSelect(p, ch) {
                    // Plaza's programme card: watch, record, record the series (9.44); a gap in the guide just tunes in
                    if (p.gap || !p.id || !P.programmeCard) { playChannel(ch.ch); return; }
                    P.programmeCard(p.id, ch.ch);
                }
            });
            // the day the guide shows, over the channels (it follows the guide past midnight)
            const day = el('div', 'pz-guide-day');
            guideEl.append(day);
            const head = guideEl.querySelector('.icefin-guide-times');
            const dayOf = () => {
                const t = +(head && head.getAttribute('data-start')) || Date.now();
                const d = new Date(t), today = new Date();
                const n = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 864e5);
                day.textContent = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
            };
            dayOf();
            if (head) new MutationObserver(dayOf).observe(head, { attributes: true, attributeFilter: ['data-start'] });
        }
        function show(id, focus) {
            if (grid) { grid.destroy(); grid = null; }
            if (guide) { guide.stop(); guide = null; }
            if (guideEl) { guideEl.remove(); guideEl = null; }
            F.focusText('');
            F.root.setAttribute('data-pz-tab', id);
            F.hints(id === 'guide' ? 'Ⓐ Watch · ▲▼ Channels · ◀▶ Time' : 'Ⓐ Select · ≡ Details · ◀▶ Page');
            if (id === 'guide') showGuide(focus);
            else grid = pageGrid(F.body, Object.assign({ frame: F, takeFocus: focus }, tabs[id]()));
        }
        const screen = {
            mount(root) {
                ui.pointerFirst(true);
                F = frame(root, { view: 'livetv', kind: 'livetv', name: 'Live TV' });
                const first = P.params().get('pztab') === 'guide' ? 'guide' : 'channels';
                F.setTabs([{ id: 'channels', label: 'Channels' }, { id: 'guide', label: 'Guide' }, { id: 'recordings', label: 'Recordings' }, { id: 'schedule', label: 'Schedule' }], first, (id) => show(id, false));
                show(first, true);
            },
            onAction(a, ctx) {
                P.sawAction();
                if (grid && grid.action(a)) return true;
                // Up out of the guide's top row goes to the tabs.
                if (guide && a === 'up') { const f = guide.focused(); if (f && f.row === 0) { const t = F.tab('guide'); if (t) { ctx.focus(t); ctx.sound('focus'); } return true; } }
                if (guide && a === 'down' && F.tabs().includes(ctx.focused())) { guide.refocus(); return true; }
                return common(a, ctx);
            },
            onBack() { goBack(); return true; },
            unmount() { if (guide) guide.stop(); if (F) F.stop(); ui.pointerFirst(false); F = null; grid = null; guide = null; guideEl = null; }
        };
        return screen;
    }

    // ---- a series: its seasons as tabs, the season's episodes in a list beside the poster ----
    function series() {
        let F = null, list = null, seriesItem = null;
        const c = () => P.client();
        async function season(s, focusFirst) {
            list.textContent = '';
            const r = await P.get(`Shows/${seriesItem.Id}/Episodes`, { UserId: P.uid(), SeasonId: s.Id, Fields: P.FIELDS });
            if (!F) return;
            const eps = P.items(r);
            F.pageText(`Season ${s.IndexNumber != null ? s.IndexNumber : ''}`.trim());
            eps.forEach((ep) => {
                const row = P.focusable(el('div', 'pz-ep'));
                row.plazaItem = ep;
                const still = el('div', 'pz-ep-still');
                P.bg(still, P.thumbArt(ep, 400));
                const pr = P.progress(ep);
                if (pr > 0 && pr < 1) still.append(P.progressBar(pr));
                const text = el('div', 'pz-ep-text');
                text.append(el('div', 'pz-ep-title', `E${ep.IndexNumber != null ? ep.IndexNumber : '?'} · ${ep.Name}`),
                    el('div', 'pz-ep-meta', [P.runtime(ep.RunTimeTicks), ep.PremiereDate ? new Date(ep.PremiereDate).getFullYear() : '', ep.Overview || ''].filter(Boolean).join(' · ')));
                const played = ep.UserData && ep.UserData.Played;
                const more = P.focusable(el('div', 'pz-ep-more', 'Details'));
                more.addEventListener('click', (e) => { e.stopPropagation(); P.details(ep); });
                row.append(still, text);
                if (played) row.append(el('div', 'pz-ep-done', '✓'));
                const wrap = el('div', 'pz-ep-wrap');
                wrap.append(row, more);
                row.addEventListener('click', () => P.play(ep));
                row.addEventListener('icefin-focus', () => F.focusText([`E${ep.IndexNumber} · ${ep.Name}`, P.left(ep) && pr > 0 ? P.left(ep) : P.runtime(ep.RunTimeTicks)].filter(Boolean).join(' · ')));
                list.append(wrap);
            });
            F.root.setAttribute('data-pz-episodes', String(eps.length));
            if (!eps.length) list.append(el('div', 'pz-empty', 'No episodes in this season'));
            const firstRow = list.querySelector('.pz-ep');
            if (focusFirst && firstRow) {
                const resumeRow = [...list.querySelectorAll('.pz-ep')].find((x) => { const u = x.plazaItem.UserData || {}; return !u.Played; });
                T.ctx.focus(resumeRow || firstRow);
            }
        }
        return {
            async mount(root) {
                ui.pointerFirst(true);
                const id = P.params().get('id');
                F = frame(root, { view: 'series', kind: 'tvshows', name: '', hints: 'Ⓐ Play · ≡ Details · ◀▶ Season' });
                const poster = el('div', 'pz-series-poster');
                list = el('div', 'pz-eps');
                F.body.append(poster, el('div', 'pz-reflect pz-series-reflect'), list);
                seriesItem = await P.safe(c().getItem(P.uid(), id));
                if (!F) return;
                F.setName(seriesItem.Name || '');
                P.bg(poster, P.posterArt(seriesItem, 500));
                const seasons = P.items(await P.get(`Shows/${id}/Seasons`, { UserId: P.uid(), Fields: 'UserData' }));
                if (!F) return;
                const nextUp = P.items(await P.safe(c().getNextUpEpisodes({ UserId: P.uid(), SeriesId: id, Limit: 1 })))[0];
                if (!F) return;
                const start = (nextUp && seasons.find((s) => s.Id === nextUp.SeasonId)) || seasons[0];
                const tabs = seasons.map((s) => ({ id: s.Id, label: s.IndexNumber === 0 ? 'Specials' : s.Name, s }));
                F.setTabs(tabs, start ? start.Id : null, (sid) => { const t = tabs.find((x) => x.id === sid); if (t && t.s) season(t.s, false); });
                F.root.setAttribute('data-pz-seasons', String(seasons.length));
                if (start) await season(start, true); else list.append(el('div', 'pz-empty', 'No seasons yet'));
            },
            onAction(a, ctx) {
                P.sawAction();
                const f = ctx.focused();
                if (f && f.plazaItem && a === 'menu') { P.details(f.plazaItem); return true; }
                if (f && f.plazaItem && a === 'play_pause') { P.play(f.plazaItem); return true; }
                return common(a, ctx);
            },
            onBack() { goBack(); return true; },
            unmount() { if (F) F.stop(); ui.pointerFirst(false); F = null; }
        };
    }

    // ---- Continue Watching: a rack of discs; the chosen one lifts and turns ----
    function resume() {
        let F = null, items = [], index = 0, rack = null, info = null, discs = [];
        function draw() {
            rack.textContent = '';
            discs = [];
            for (let d = -2; d <= 2; d++) {
                const it = items[index + d];
                if (!it) continue;
                const disc = P.disc(it, d === 0 ? 'chosen' : 'rack');
                disc.style.setProperty('--pz-slot', String(d));
                if (d === 0) { P.focusable(disc); disc.classList.add('pz-disc-focus'); }
                disc.addEventListener('click', () => { if (d === 0) P.play(it); else { index += d; draw(); T.ctx.focus(rack.querySelector('.pz-disc-focus')); } });
                const pr = el('div', 'pz-progress pz-rack-progress' + (d === 0 ? ' pz-rack-progress-chosen' : ''));
                const fl = el('div');
                fl.style.width = `${Math.round(P.progress(it) * 100)}%`;
                pr.append(fl);
                pr.style.setProperty('--pz-slot', String(d));
                rack.append(disc, pr);
                discs.push(disc);
            }
            const it = items[index];
            info.textContent = '';
            info.append(el('div', 'pz-big', it.Type === 'Episode' ? it.SeriesName : it.Name),
                el('div', 'pz-meta', [it.Type === 'Episode' ? `${P.episodeCode(it)} · ${it.Name}` : P.meta(it), P.left(it)].filter(Boolean).join(' · ')));
            F.focusText([it.Type === 'Episode' ? it.SeriesName : it.Name, P.left(it)].filter(Boolean).join(' · '));
            F.pageText(`${index + 1} / ${items.length}`);
            F.root.setAttribute('data-pz-disc', String(index));
        }
        return {
            async mount(root) {
                ui.pointerFirst(true);
                F = frame(root, { view: 'resume', kind: 'resume', name: 'Continue Watching', hints: 'Ⓐ Resume · ◀▶ Disc · ≡ Details' });
                F.setTabs([{ id: 'all', label: 'All' }, { id: 'movies', label: 'Movies' }, { id: 'episodes', label: 'Episodes' }], 'all', (id) => load(id, false));
                rack = el('div', 'pz-rack');
                info = el('div', 'pz-info pz-centre-info pz-rack-info');
                const pills = el('div', 'pz-rack-pills');
                const pill = (label, go) => { const b = P.focusable(el('div', 'pz-pill pz-pill-small', label)); b.addEventListener('click', () => { const it = items[index]; if (it) go(it); }); pills.append(b); return b; };
                pill('▶ Resume', (it) => P.play(it)).classList.add('pz-pill-main');
                pill('From start', (it) => P.play(it, true));
                pill('Details', P.details);
                F.body.append(rack, info, pills);
                const load = async (id, focus) => {
                    const q = { Limit: 40, Fields: P.FIELDS, MediaTypes: 'Video' };
                    if (id === 'movies') q.IncludeItemTypes = 'Movie';
                    if (id === 'episodes') q.IncludeItemTypes = 'Episode';
                    const r = await P.safe(P.client().getResumableItems(P.uid(), q));
                    if (!F) return;
                    items = P.items(r);
                    index = 0;
                    F.root.setAttribute('data-pz-ready', String(items.length));
                    if (!items.length) { rack.textContent = ''; info.textContent = ''; info.append(el('div', 'pz-big', 'Nothing in progress')); pills.style.display = 'none'; F.focusText(''); F.pageText(''); return; }
                    pills.style.display = '';
                    draw();
                    if (focus) T.ctx.focus(rack.querySelector('.pz-disc-focus'));
                };
                await load('all', true);
            },
            onAction(a, ctx) {
                P.sawAction();
                const f = ctx.focused();
                if (f && f.classList.contains('pz-disc-focus') && (a === 'left' || a === 'right')) {
                    const n = index + (a === 'right' ? 1 : -1);
                    if (n >= 0 && n < items.length) { index = n; draw(); ctx.focus(rack.querySelector('.pz-disc-focus')); ctx.sound('focus'); }
                    return true;
                }
                if (a === 'menu' && items[index]) { P.details(items[index]); return true; }
                if (a === 'play_pause' && items[index]) { P.play(items[index]); return true; }
                return common(a, ctx);
            },
            onBack() { goBack(); return true; },
            unmount() { if (F) F.stop(); ui.pointerFirst(false); F = null; }
        };
    }

    // ---- Next Up: episode cards ----
    const episodeGrid = (fetch, empty) => () => ({ shape: 'episode', fetch, art: (it) => P.thumbArt(it, 600),
        caption: (it) => `${it.SeriesName || ''} · ${P.episodeCode(it)}`, name: (it) => `${it.SeriesName || ''} · ${P.episodeCode(it)} · ${it.Name}`,
        focus: (it) => `${it.SeriesName || ''} · ${P.episodeCode(it)} · ${it.Name}`, decorate: (c) => c.querySelector('.pz-cell-art').append(el('div', 'pz-play-badge')),
        select: (it) => P.play(it), play: (it) => P.play(it), menu: P.details, empty });
    const NEXTUP = libraryMenu({
        view: 'nextup', kind: () => 'nextup', name: () => 'Next Up',
        hints: 'Ⓐ Play · ≡ Details · ◀▶ Page',
        tabs: () => [
            { id: 'nextup', label: 'Next Up', grid: episodeGrid((start, limit) => P.safe(P.client().getNextUpEpisodes({ UserId: P.uid(), StartIndex: start, Limit: limit, Fields: P.FIELDS, EnableTotalRecordCount: true }))
                .then((r) => ({ items: P.items(r), total: r.TotalRecordCount })), 'Nothing up next') },
            { id: 'upcoming', label: 'Upcoming', grid: episodeGrid(namedQuery('Shows/Upcoming', { Fields: P.FIELDS, SortBy: undefined }), 'Nothing upcoming') },
            { id: 'latest', label: 'Recently added', grid: episodeGrid(itemsQuery({ IncludeItemTypes: 'Episode', SortBy: 'DateCreated', SortOrder: 'Descending' }), 'No new episodes') }
        ]
    });

    // ---- Search: a field, filters, a row of results and a keyboard for the remote ----
    function search() {
        let F = null, input = null, grid = null, filter = 'all', timer = null, onKey = null, lastTerm = null;
        const TYPES = {
            all: { IncludeItemTypes: 'Movie,Series,Episode,MusicAlbum,Audio,MusicArtist,BoxSet,Video,MusicVideo,TvChannel,Playlist', IncludePeople: true },
            movies: { IncludeItemTypes: 'Movie', IncludePeople: false, IncludeArtists: false },
            shows: { IncludeItemTypes: 'Series', IncludePeople: false, IncludeArtists: false },
            episodes: { IncludeItemTypes: 'Episode', IncludePeople: false, IncludeArtists: false },
            music: { IncludeItemTypes: 'MusicAlbum,Audio,MusicArtist', IncludePeople: false, IncludeArtists: true },
            people: { IncludePeople: true, IncludeMedia: false, IncludeArtists: false }
        };
        const hintArt = (h) => (h.PrimaryImageTag ? P.img(h.Id || h.ItemId, 'Primary', h.PrimaryImageTag, 300)
            : h.ThumbImageTag ? P.img(h.ThumbImageItemId, 'Thumb', h.ThumbImageTag, 300) : h.BackdropImageTag ? P.img(h.BackdropImageItemId, 'Backdrop', h.BackdropImageTag, 300) : '');
        const asItem = (h) => ({ Id: h.Id || h.ItemId, Type: h.Type, Name: h.Name });
        function results(focus) {
            const term = input.value.trim();
            lastTerm = term;
            if (grid) grid.destroy();
            F.root.setAttribute('data-pz-term', term);
            if (!term) { grid = null; F.focusText(''); F.pageText(''); resultsBox.textContent = ''; resultsBox.append(el('div', 'pz-empty', 'Type to search your library')); return; }
            resultsBox.textContent = '';
            grid = pageGrid(resultsBox, { frame: F, shape: 'result', takeFocus: focus, empty: 'Nothing found',
                fetch: (start, limit) => P.get('Search/Hints', Object.assign({ UserId: P.uid(), searchTerm: term, StartIndex: start, Limit: limit, IncludeGenres: false, IncludeStudios: false }, TYPES[filter]))
                    .then((r) => ({ items: r.SearchHints || [], total: r.TotalRecordCount })),
                art: hintArt, name: (h) => h.Name, focus: (h) => [h.Name, h.Type === 'Episode' && h.Series ? h.Series : h.Type, h.ProductionYear].filter(Boolean).join(' · '),
                select: (h) => P.open(asItem(h)), menu: (h) => P.details(asItem(h)) });
        }
        let resultsBox = null;
        const type = (ch) => { input.value = ch === '⌫' ? input.value.slice(0, -1) : input.value + ch; changed(); };
        const changed = () => { clearTimeout(timer); timer = setTimeout(() => { if (F && input.value.trim() !== lastTerm) results(false); }, 300); };
        return {
            mount(root) {
                ui.pointerFirst(true);
                F = frame(root, { view: 'search', kind: 'search', name: 'Search', hints: 'Ⓐ Type / Open · ≡ Details' });
                const field = P.focusable(el('div', 'pz-search-field'));
                field.innerHTML = '<svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" stroke-width="7"/><path d="M37 37 L54 54" stroke="currentColor" stroke-width="9" stroke-linecap="round"/></svg>';
                input = el('input', 'pz-search-input');
                input.type = 'search';
                input.setAttribute('aria-label', 'Search');
                input.placeholder = 'Search';
                input.value = P.params().get('query') || '';
                input.addEventListener('input', changed);
                field.append(input);
                field.addEventListener('click', () => input.focus());
                const filters = el('div', 'pz-search-filters');
                const labels = { all: 'All', movies: 'Movies', shows: 'Shows', episodes: 'Episodes', music: 'Music', people: 'People' };
                for (const id of Object.keys(TYPES)) {
                    const b = P.focusable(el('div', 'pz-tab' + (id === filter ? ' pz-tab-on' : ''), labels[id]));
                    b.setAttribute('data-pz-filter', id);
                    b.addEventListener('click', () => { filter = id; filters.querySelectorAll('.pz-tab').forEach((x) => x.classList.toggle('pz-tab-on', x === b)); results(false); });
                    filters.append(b);
                }
                resultsBox = el('div', 'pz-search-results');
                const kb = el('div', 'pz-keys');
                for (const row of ['1234567890', 'qwertyuiop', 'asdfghjkl⌫', 'zxcvbnm ']) {
                    const r = el('div', 'pz-keyrow');
                    for (const ch of row) {
                        const k = P.focusable(el('div', 'pz-key' + (ch === ' ' ? ' pz-key-space' : ch === '⌫' ? ' pz-key-wide' : ''), ch === ' ' ? 'space' : ch));
                        k.setAttribute('data-pz-key', ch);
                        k.addEventListener('click', () => type(ch));
                        r.append(k);
                    }
                    kb.append(r);
                }
                F.body.append(field, filters, resultsBox, kb);
                results(false);
                T.ctx.focus(kb.querySelector('[data-pz-key="a"]'));
                // A physical keyboard types straight into the field, wherever focus is on the screen.
                onKey = (e) => {
                    if (!F || e.ctrlKey || e.metaKey || e.altKey || document.activeElement === input) return;
                    if (e.key && e.key.length === 1) { e.preventDefault(); type(e.key); }
                };
                window.addEventListener('keydown', onKey);
            },
            onAction(a, ctx) {
                P.sawAction();
                // Backspace reaches screens as Back: on the search screen it deletes instead, while there is text.
                const ev = window.event;
                if (a === 'back' && ev && ev.key === 'Backspace' && input.value) { input.value = input.value.slice(0, -1); changed(); return true; }
                if (grid && grid.action(a)) return true;
                if (a === 'search') { ctx.focus(F.body.querySelector('[data-pz-key="a"]')); return true; }
                return common(a, ctx);
            },
            onBack() { goBack(); return true; },
            unmount() { clearTimeout(timer); window.removeEventListener('keydown', onKey); if (F) F.stop(); ui.pointerFirst(false); F = null; grid = null; }
        };
    }

    // The menus on #/home?pz=… (plaza.js asks for them by name) and on jellyfin-web's own routes.

    // ---- 9.42: the routes jellyfin-web links to that Plaza draws itself ----
    // jellyfin-web's list page (#/list): a genre's, a studio's, a person's or a tag's items, and every "more" link.
    const LIST_KEYS = [['genreId', 'GenreIds'], ['musicGenreId', 'GenreIds'], ['studioId', 'StudioIds'], ['personId', 'PersonIds'], ['artistId', 'ArtistIds'],
        ['albumArtistId', 'AlbumArtistIds'], ['tag', 'Tags'], ['parentId', 'ParentId'], ['type', 'IncludeItemTypes'], ['IsFavorite', 'IsFavorite']];
    function listQuery(p) {
        const q = {};
        for (const [k, f] of LIST_KEYS) if (p.get(k)) q[f] = p.get(k);
        if (p.get('musicGenreId') && !q.IncludeItemTypes) q.IncludeItemTypes = 'MusicAlbum';
        if (!q.IncludeItemTypes && !q.ParentId) q.IncludeItemTypes = 'Movie,Series,MusicAlbum,MusicVideo,Video,BoxSet,Book';
        return q;
    }
    const listKind = (p) => {
        const t = (p.get('type') || '').split(',')[0];
        return p.get('musicGenreId') || t === 'MusicAlbum' || t === 'Audio' ? 'music' : t === 'Series' || t === 'Episode' ? 'tvshows' : t === 'Movie' || p.get('genreId') ? 'movies' : 'folder';
    };
    async function playAll(q, shuffle) {
        const r = await P.safe(P.client().getItems(P.uid(), Object.assign({ Recursive: true, Limit: 300, SortBy: shuffle ? 'Random' : 'SortName', MediaTypes: 'Video,Audio' }, q, { IncludeItemTypes: undefined })));
        const ids = P.items(r).filter((x) => !x.IsFolder).map((x) => x.Id);
        if (ids.length) T.ctx.play({ ids, serverId: P.sid() });
        else T.ctx.sound('error');
    }
    const LIST = libraryMenu({
        view: 'list', kind: listKind, name: (p) => p.get('name') || '', sortable: true, parent: () => null,
        hints: 'Ⓐ Open · ▶ Play · ≡ Details · ◀▶ Page',
        tabs: (parent, p) => {
            const q = listQuery(p);
            const square = /MusicAlbum|Audio/.test(q.IncludeItemTypes || '');
            return [
                { id: 'all', label: 'All', grid: square ? squareGrid(q) : posterGrid(q), empty: 'Nothing here yet' },
                { id: 'playall', label: 'Play all', cls: 'pz-tab-action pz-tab-play', go: () => playAll(q, false) },
                { id: 'shuffle', label: 'Shuffle', cls: 'pz-tab-action', go: () => playAll(q, true) }
            ];
        },
        after(F, parent, p, screen) {
            // The A–Z rail (the walk's mock-up): a letter jumps the list to the first title from it; shown while sorted A to Z
            const rail = el('div', 'pz-az');
            const q = listQuery(p);
            for (const ch of ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']) {
                const b = P.focusable(el('div', 'pz-az-key', ch));
                b.setAttribute('aria-label', ch === '#' ? 'Numbers and symbols' : `Titles from ${ch}`);
                b.addEventListener('icefin-focus', () => F.focusText(ch === '#' ? 'The start of the list' : `Titles from ${ch}`));
                b.addEventListener('click', async () => {
                    if (!screen.grid) return;
                    let i = 0;
                    if (ch !== '#') {
                        const r = await P.safe(P.client().getItems(P.uid(), Object.assign({ Recursive: true, Limit: 0, EnableTotalRecordCount: true, NameLessThan: ch }, withSort(screen.sort(), q))));
                        i = r.TotalRecordCount || 0;
                    }
                    if (screen.grid) screen.grid.goToIndex(i);
                });
                rail.append(b);
            }
            F.body.append(rail);
            screen.rail = rail;
            // The pill shows the genre's, studio's or person's own name.
            const id = p.get('genreId') || p.get('musicGenreId') || p.get('studioId') || p.get('personId') || p.get('artistId') || p.get('albumArtistId') || p.get('parentId');
            if (id && !p.get('name')) P.safe(P.client().getItem(P.uid(), id)).then((it) => { if (it && it.Name) F.setName(it.Name); });
            else if (p.get('tag')) F.setName(p.get('tag'));
        },
        shown(screen) { if (screen.rail) { const x = screen.sort(); screen.rail.hidden = !(x.id === 'name' && x.SortOrder === 'Ascending'); } }
    });

    // Playlists (#/playlists): each as a square of its art with a count; the last cell makes a new one.
    function newPlaylist(F, made) {
        const panel = el('div', 'pz-panel');
        const dim = el('div', 'pz-dim pz-on');
        const card = el('div', 'pz-panel-card pz-panel-narrow');
        card.append(el('div', 'pz-dlg-tab', 'New playlist'));
        const label = el('label', 'pz-field');
        const input = el('input', 'pz-input');
        input.type = 'text';
        input.placeholder = 'Name';
        P.focusable(input);
        label.append(el('span', 'pz-field-label', 'Name'), input);
        const foot = el('div', 'pz-panel-foot');
        const make = P.focusable(el('div', 'pz-tab pz-panel-done', 'Create'));
        const cancel = P.focusable(el('div', 'pz-tab', 'Cancel'));
        foot.append(make, cancel);
        card.append(label, foot);
        panel.append(dim, card);
        F.root.append(panel);
        const close = () => { panel.remove(); T.ctx.sound('back'); };
        cancel.addEventListener('click', close);
        dim.addEventListener('click', close);
        make.addEventListener('click', async () => {
            const name = input.value.trim();
            if (!name) { T.ctx.focus(input); T.ctx.sound('error'); return; }
            const c = P.client();
            try {
                await c.ajax({ type: 'POST', url: c.getUrl('Playlists'), data: JSON.stringify({ Name: name, UserId: P.uid(), Ids: [] }), contentType: 'application/json', dataType: 'json' });
                panel.remove();
                T.ctx.sound('select');
                made();
            } catch (e) { T.ctx.sound('error'); }
        });
        T.ctx.focus(input);
        return {
            el: card, close,
            action(a, ctx) {
                if (a === 'back') { close(); return true; }
                if (['up', 'down', 'left', 'right'].includes(a)) { ctx.move(a, card); return true; }
                return false;
            }
        };
    }
    let plPanel = null;
    const playlistGrid = (mediaType) => (s) => {
        const q = { IncludeItemTypes: 'Playlist' };
        if (mediaType) q.MediaTypes = mediaType;
        const base = itemsQuery(withSort(s, q));
        return {
            shape: 'quilt', label: true,
            // one more cell than the server has: "New playlist", at the end
            fetch: async (start, limit) => { const r = await base(start, limit); const total = (r.total || 0) + 1; const items = r.items.slice(); if (start + items.length === total - 1 && items.length < limit) items.push({ Id: '', pzNew: true, Name: 'New playlist' }); return { items, total }; },
            art: (it) => (it.pzNew ? '' : P.posterArt(it, 400)), name: (it) => it.Name,
            decorate: (c, it) => { if (it.pzNew) c.classList.add('pz-cell-new'); else if (it.ChildCount != null) c.append(el('div', 'pz-count', String(it.ChildCount))); },
            focus: (it) => (it.pzNew ? 'New playlist' : `${it.Name} · ${it.ChildCount || 0} items`),
            select: (it, c) => { if (it.pzNew) { const F = PLAYLISTS.frame(); plPanel = newPlaylist(F, () => PLAYLISTS.grid && PLAYLISTS.grid.relayout()); return; } P.details(it); },
            play: (it) => { if (!it.pzNew) P.play(it, true); }, menu: (it) => { if (!it.pzNew) P.details(it); },
            empty: 'No playlists yet'
        };
    };
    const PLAYLISTS = libraryMenu({
        view: 'playlists', kind: () => 'playlists', name: () => 'Playlists', sortable: true, parent: () => null,
        hints: 'Ⓐ Open · ▶ Play · ≡ Details · ◀▶ Page',
        tabs: () => [
            { id: 'all', label: 'All', grid: playlistGrid('') },
            { id: 'music', label: 'Music', grid: playlistGrid('Audio') },
            { id: 'video', label: 'Video', grid: playlistGrid('Video') }
        ],
        action(a, ctx) { if (plPanel && plPanel.el.isConnected) return plPanel.action(a, ctx); return false; },
        back() { if (plPanel && plPanel.el.isConnected) { plPanel.close(); return true; } return false; },
        unmount() { plPanel = null; }
    });

    // Photos and home videos (#/homevideos, #/photos): newest first with the day on the first photo of each day; a photo
    // opens jellyfin-web's viewer on this page's photos (slideshow included), a video plays.
    const day = (it) => { const d = it.DateCreated || it.PremiereDate; return d ? new Date(d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''; };
    const photoGrid = (q, byDate) => (s) => {
        let pageItems = [];
        const base = itemsQuery(withSort(byDate ? Object.assign({}, s, { SortBy: 'DateCreated,SortName', SortOrder: s.id === 'added' || s.id === 'name' ? 'Descending' : s.SortOrder }) : s,
            Object.assign({ Fields: P.FIELDS + ',DateCreated' }, q)));
        return {
            shape: 'square',
            fetch: async (start, limit) => { const r = await base(start, limit); pageItems = r.items; return r; },
            art: (it) => P.posterArt(it, 400) || P.wideArt(it, 400), name: (it) => it.Name,
            decorate: (c, it, art) => {
                const i = pageItems.indexOf(it);
                if (byDate && day(it) && (i === 0 || day(pageItems[i - 1]) !== day(it))) c.append(el('div', 'pz-day', day(it)));
                if (it.Type === 'Video' || it.MediaType === 'Video') art.append(el('div', 'pz-play-badge'));
                if (it.IsFolder) c.classList.add('pz-cell-folder');
            },
            focus: (it) => [it.Name, day(it)].filter(Boolean).join(' · '),
            select: (it) => {
                if (it.IsFolder) return T.ctx.navigate(`#/home?pz=library&id=${it.Id}&kind=photos&name=${encodeURIComponent(it.Name || '')}`);
                if (it.MediaType === 'Photo' || it.Type === 'Photo') {
                    const photos = pageItems.filter((x) => x.MediaType === 'Photo' || x.Type === 'Photo');
                    return T.ctx.play({ items: photos, startIndex: Math.max(0, photos.indexOf(it)) });
                }
                return P.play(it, true);
            },
            play: (it) => P.play(it, true), menu: P.details, empty: 'No photos here yet'
        };
    };
    const PHOTOS = libraryMenu({
        view: 'photos', kind: () => 'photos', name: (p) => p.get('name') || 'Photos', sortable: true,
        hints: 'Ⓐ View · ▶ Slideshow · ≡ Details · ◀▶ Page',
        tabs: (parent) => [
            { id: 'date', label: 'By date', grid: photoGrid({ ParentId: parent, IncludeItemTypes: 'Photo,Video', Recursive: true }, true) },
            { id: 'albums', label: 'Albums', grid: photoGrid({ ParentId: parent, Recursive: false, IsFolder: true }, false), empty: 'No albums here' },
            { id: 'videos', label: 'Videos', grid: photoGrid({ ParentId: parent, IncludeItemTypes: 'Video', Recursive: true }, true), empty: 'No videos here' },
            { id: 'favourites', label: 'Favourites', grid: photoGrid({ ParentId: parent, Filters: 'IsFavorite', Recursive: true }, true), empty: 'No favourites here yet' }
        ],
        action(a, ctx, screen) {
            // Play on a photo: the slideshow from it.
            if (a !== 'play_pause' || !screen.grid) return false;
            const f = screen.grid.focused();
            if (!f || !f.plazaItem || f.plazaItem.IsFolder) return false;
            f.click();
            return true;
        }
    });

    // Books (#/books): covers; A opens the reader, Menu the book's page.
    // Through P.play, which always gives a start position (the saved one): jellyfin-web's EPUB and PDF readers divide
    // it without a default, so leaving it out opens the book at NaN ("No Section Found", "Invalid page request").
    const read = (it) => P.play(it);
    const BOOKS = libraryMenu({
        view: 'books', kind: () => 'books', name: (p) => p.get('name') || 'Books', sortable: true,
        hints: 'Ⓐ Read · ≡ Details · ◀▶ Page',
        tabs: (parent) => [
            { id: 'all', label: 'All', grid: posterGrid({ ParentId: parent, IncludeItemTypes: 'Book' }, { select: read, play: read }), empty: 'No books here yet' },
            { id: 'reading', label: 'Reading', grid: posterGrid({ ParentId: parent, IncludeItemTypes: 'Book', Filters: 'IsResumable' }, { select: read, play: read }), empty: 'Nothing in progress' },
            { id: 'favourites', label: 'Favourites', grid: posterGrid({ ParentId: parent, IncludeItemTypes: 'Book', Filters: 'IsFavorite' }, { select: read, play: read }), empty: 'No favourite books yet' }
        ]
    });

    // Music videos, collections and mixed libraries: their items, folders opening in place.
    const plainLibrary = (view, kind, label, types) => libraryMenu({
        view, kind: () => kind, name: (p) => p.get('name') || label, sortable: true,
        hints: 'Ⓐ Open · ▶ Play · ≡ Details · ◀▶ Page',
        tabs: (parent) => [
            { id: 'all', label: 'All', grid: posterGrid(Object.assign({ ParentId: parent }, types ? { IncludeItemTypes: types } : { Recursive: false })) },
            { id: 'favourites', label: 'Favourites', grid: posterGrid({ ParentId: parent, Filters: 'IsFavorite' }), empty: 'No favourites here yet' }
        ]
    });

    // ---- You (9.44): the user's own pages, and the account: switch user or server, sign out ----
    function you() {
        let F = null;
        return {
            async mount(root) {
                ui.pointerFirst(true);
                F = frame(root, { view: 'you', kind: 'tvshows', name: 'You', hints: 'Ⓐ Open · Ⓑ Back' });
                const c = P.client(), uid = P.uid();
                let u = {};
                try { u = await c.getCurrentUser(); } catch (e) { u = {}; }
                if (!F) return;
                const me = el('div', 'pz-you-me');
                const pic = el('div', 'pz-you-pic');
                // a user's picture is a user image (Users/{id}/Images), not an item image
                const face = u.PrimaryImageTag && c.getUserImageUrl ? c.getUserImageUrl(uid, { type: 'Primary', tag: u.PrimaryImageTag, maxWidth: 300 }) : '';
                if (face) P.bg(pic, face); else pic.textContent = (u.Name || '?').charAt(0).toUpperCase();
                me.append(pic, el('div', 'pz-you-name', u.Name || ''), el('div', 'pz-you-server', (c.serverInfo && c.serverInfo() && c.serverInfo().Name) || ''));
                const list = el('div', 'pz-you-rows');
                const row = (label, sub, go, cls) => {
                    const r = P.focusable(el('div', 'pz-setrow pz-you-row' + (cls ? ' ' + cls : '')));
                    r.append(el('span', 'pz-setrow-label', label));
                    if (sub) r.append(el('span', 'pz-sheet-row-sub', sub));
                    r.addEventListener('click', go);
                    r.addEventListener('icefin-focus', () => F && F.focusText(label));
                    list.append(r);
                    return r;
                };
                const to = (route) => () => T.ctx.navigate(route);
                row('Profile', 'Picture, password', to(`#/userprofile?userId=${uid}`));
                row('Display', 'Language, date and time', to(`#/mypreferencesdisplay?userId=${uid}`));
                row('Home', 'What the home shows', to(`#/mypreferenceshome?userId=${uid}`));
                row('Playback', 'Languages, quality', to(`#/mypreferencesplayback?userId=${uid}`));
                row('Subtitles', 'Language, look', to(`#/mypreferencessubtitles?userId=${uid}`));
                row('Controls', 'Controllers and remotes', to(`#/mypreferencescontrols?userId=${uid}`));
                row('Quick Connect', 'Sign in another device', to('#/quickconnect'));
                if (T.ctx.signOut) row('Switch user', 'Another account on this server', () => T.ctx.signOut());
                if (T.ctx.selectServer) row('Switch server', 'Another server', () => T.ctx.selectServer());
                if (T.ctx.signOut && P.sheet) row('Sign out', '', () => P.sheet.show({
                    title: 'Sign out', kind: 'folder', danger: true,
                    render(body) {
                        body.append(el('div', 'pz-sheet-question', `Sign out of ${u.Name || 'your account'}?`), el('div', 'pz-sheet-note', 'This device forgets the sign-in; you choose who signs in next.'));
                        const f = el('div', 'pz-panel-foot');
                        const keep = P.focusable(el('div', 'pz-tab pz-tab-on', 'Stay signed in'));
                        keep.addEventListener('click', () => P.sheet.close());
                        const out = P.focusable(el('div', 'pz-tab', 'Sign out'));
                        out.addEventListener('click', () => { P.sheet.close(); T.ctx.signOut(); });
                        f.append(keep, out);
                        body.append(f);
                    }
                }), 'pz-you-danger');
                const box = el('div', 'pz-you');
                box.append(me, list);
                F.body.append(box);
                const first = list.querySelector('[data-icefin-focus]');
                if (first) T.ctx.focus(first);
            },
            onAction(a, ctx) { P.sawAction(); return common(a, ctx); },
            onBack() { goBack(); return true; },
            unmount() { if (F) F.stop(); ui.pointerFirst(false); F = null; }
        };
    }

    const VIEWS = { library: () => LIBRARY, items: () => ITEMS, series, resume, nextup: () => NEXTUP, you };
    P.menus = { screen: (name) => (VIEWS[name] || VIEWS.library)() };
    // the menu frame and its helpers, for screens in other files (music.js)
    P.frame = frame;
    P.goBack = goBack;
    P.common = common;
    T.registerScreen('#/movies', MOVIES);
    T.registerScreen('#/tv', SHOWS);
    T.registerScreen('#/music', MUSIC);
    T.registerScreen('#/livetv', liveTv());
    T.registerScreen('#/search', search());
    T.registerScreen('#/list', LIST);
    T.registerScreen('#/playlists', PLAYLISTS);
    T.registerScreen('#/homevideos', PHOTOS);
    T.registerScreen('#/photos', PHOTOS);
    T.registerScreen('#/books', BOOKS);
    T.registerScreen('#/musicvideos', plainLibrary('musicvideos', 'music', 'Music videos', 'MusicVideo'));
    T.registerScreen('#/boxsets', plainLibrary('boxsets', 'boxsets', 'Collections', 'BoxSet'));
    T.registerScreen('#/mixed', plainLibrary('mixed', 'folder', 'Library', ''));
})();
