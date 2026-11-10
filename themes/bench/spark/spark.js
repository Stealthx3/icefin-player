// Spark (benchmark theme, PLAN 9.5; its target is named in docs/PLAN.md). Built from the engine's generic capabilities only:
// the top-bar chrome slot holds the navigation, a hero carousel shows featured items with a muted preview after a short
// dwell (ui.mutedPreview: the page's own <video>, never mpv or the passthrough device), and rows of 16:9 tiles below
// recycle a fixed pool of tiles however long the row is. Every other route is jellyfin-web's own page, styled by tokens.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const E = T._engine;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const tags = (it) => it.ImageTags || {};
    const FIELDS = 'PrimaryImageAspectRatio,Overview,ProductionYear,RunTimeTicks,OfficialRating,UserData,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ParentThumbItemId,ParentThumbImageTag';
    const POOL = 9;  // tiles per row in the DOM, whatever the row's length
    const DWELL = 1500;  // ms on the hero before its preview starts
    const STEP = 0.19;  // tile width plus gap, as a fraction of the window width (styles.css --sp-step: 19vw)

    let S = null;  // screen state while #/home is up

    // ---- images ----
    function wideImage(c, it, width) {
        if (tags(it).Thumb) return c.getScaledImageUrl(it.Id, { type: 'Thumb', maxWidth: width, tag: tags(it).Thumb });
        if (it.ParentThumbImageTag) return c.getScaledImageUrl(it.ParentThumbItemId, { type: 'Thumb', maxWidth: width, tag: it.ParentThumbImageTag });
        if ((it.BackdropImageTags || []).length) return c.getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: width, tag: it.BackdropImageTags[0] });
        if ((it.ParentBackdropImageTags || []).length) return c.getScaledImageUrl(it.ParentBackdropItemId, { type: 'Backdrop', maxWidth: width, tag: it.ParentBackdropImageTags[0] });
        if (tags(it).Primary) return c.getScaledImageUrl(it.Id, { type: 'Primary', maxWidth: width, tag: tags(it).Primary });
        return '';
    }
    const details = (c, it) => { location.hash = `#/details?id=${it.Id}&serverId=${c.serverId()}`; };

    // ---- top bar ----
    ui.chrome.set('topBar', {
        height: '9vh',
        async mount(bar) {
            bar.append(el('div', 'sp-brand', 'Icefin'));
            const nav = el('div', 'sp-nav');
            bar.append(nav);
            const c = window.ApiClient;
            const entries = [{ label: 'Home' }, { label: 'Search', hash: '#/search' }];
            for (const v of await T.ui.userViews()) entries.push({ label: v.Name, view: v });
            entries.push({ label: 'Settings', hash: '#/mypreferencesmenu' }, { label: 'Classic home', hash: '#/home?icefin=stock' });
            if (!S) return;
            S.top = entries.map((x) => {
                const b = el('div', 'sp-nav-item', x.label);
                b.setAttribute('data-icefin-focus', '');
                b.tabIndex = -1;
                b.addEventListener('click', () => {
                    if (x.hash) location.hash = x.hash;
                    else if (x.view) location.hash = `#/list?parentId=${x.view.Id}&serverId=${c.serverId()}`;
                    else focusHero();
                });
                nav.append(b);
                return b;
            });
            S.top[0].classList.add('current');
            S.readyParts++;
            S.maybeReady();
        }
    });

    // ---- recycled row ----
    // A row of any length keeps POOL tiles in the DOM; moving along re-binds them to the items around the focus. The
    // focused tile stays at the left edge until the row runs out, as on the target.
    function Row(title, items) {
        const section = el('section', 'sp-row-section');
        section.append(el('div', 'sp-row-title', title));
        const view = el('div', 'sp-row-view');
        const track = el('div', 'sp-row');
        view.append(track);
        section.append(view);
        const pool = [];
        const row = { section, track, items, index: 0, pool };
        function bind(node, i) {
            if (node.sparkIndex === i) return;
            node.sparkIndex = i;
            const it = row.items[i];
            node.style.left = `calc(${i} * var(--sp-step))`;
            const img = wideImage(S.client, it, 640);
            node.style.backgroundImage = img ? `url("${img}")` : 'none';
            node.querySelector('.sp-tile-label').textContent = it.Type === 'Episode' && it.SeriesName ? `${it.SeriesName} · ${it.Name}` : it.Name;
            const ticks = it.UserData && it.UserData.PlaybackPositionTicks;
            node.querySelector('.sp-progress').style.width = ticks && it.RunTimeTicks ? `${Math.min(100, (100 * ticks) / it.RunTimeTicks).toFixed(1)}%` : '0';
        }
        row.layout = () => {
            const n = row.items.length;
            const first = Math.max(0, Math.min(row.index - 1, n - POOL));
            const want = new Set();
            for (let i = first; i < Math.min(n, first + POOL); i++) want.add(i);
            const free = pool.filter((p) => !want.has(p.sparkIndex));
            for (const i of want) if (!pool.some((p) => p.sparkIndex === i)) bind(free.shift(), i);
            const fits = Math.max(1, Math.floor(view.offsetWidth / (window.innerWidth * STEP)));
            track.style.transform = `translateX(calc(${-Math.min(row.index, Math.max(0, n - fits))} * var(--sp-step)))`;
            section.setAttribute('data-sp-index', String(row.index));
        };
        row.node = (i) => pool.find((p) => p.sparkIndex === i);
        row.setItems = (list) => {  // also used by the long-row check in tests
            row.items = list;
            row.index = 0;
            track.textContent = '';
            pool.length = 0;
            for (let k = 0; k < Math.min(POOL, list.length); k++) {
                const t = el('div', 'sp-tile');
                t.setAttribute('data-icefin-focus', '');
                t.tabIndex = -1;
                t.append(el('div', 'sp-tile-label'), el('div', 'sp-progress'));
                t.addEventListener('click', () => details(S.client, row.items[t.sparkIndex]));
                t.sparkIndex = -1;
                track.append(t);
                pool.push(t);
            }
            section.setAttribute('data-sp-length', String(list.length));
            row.layout();
        };
        section.sparkRow = row;
        row.setItems(items);
        return row;
    }

    // ---- hero carousel ----
    let dwellTimer = null, rotateTimer = null;
    function showHero(i) {
        const h = S.hero;
        h.index = (i + h.items.length) % h.items.length;
        const it = h.items[h.index];
        stopPreview();
        const img = wideImage(S.client, it, 1920);
        h.art.style.backgroundImage = img ? `url("${img}")` : 'none';
        h.title.textContent = it.Name;
        h.meta.textContent = [it.ProductionYear, it.OfficialRating, it.RunTimeTicks >= 600000000 ? `${Math.round(it.RunTimeTicks / 600000000)} min` : null].filter(Boolean).join('  ·  ');
        h.overview.textContent = it.Overview || '';
        h.dots.forEach((d, k) => d.classList.toggle('active', k === h.index));
        h.el.setAttribute('data-sp-hero', String(h.index));
        h.el.setAttribute('data-sp-kind', it.Type);
        if (E.focused() === h.el) armPreview();
    }
    function armPreview() {
        clearTimeout(dwellTimer);
        if (ui.motion.reduced()) return;  // no autoplay under reduced or low motion
        const it = S.hero.items[S.hero.index];
        if (it.MediaType !== 'Video' && it.Type !== 'Series') return;
        dwellTimer = setTimeout(async () => {
            if (!S || E.focused() !== S.hero.el) return;
            let id = it.Id;
            if (it.Type === 'Series') {  // a series has no stream of its own: preview its first episode
                const c = S.client;
                const eps = await c.getItems(c.getCurrentUserId(), { ParentId: it.Id, Recursive: true, IncludeItemTypes: 'Episode', SortBy: 'ParentIndexNumber,IndexNumber', Limit: 1 }).catch(() => null);
                id = eps && eps.Items && eps.Items[0] ? eps.Items[0].Id : null;
                if (!id || !S || E.focused() !== S.hero.el || S.hero.items[S.hero.index] !== it) return;
            }
            stopPreview();
            const pv = ui.mutedPreview(S.hero.videoBox, { itemId: id, maxWidth: 960 });
            S.hero.preview = pv;
            S.hero.el.setAttribute('data-sp-preview', 'playing');
            pv.video.addEventListener('error', () => { if (S && S.hero.preview === pv) stopPreview(); });  // keep the artwork
        }, DWELL);
    }
    function stopPreview() {
        clearTimeout(dwellTimer);
        if (S && S.hero.preview) { S.hero.preview.stop(); S.hero.preview = null; S.hero.el.removeAttribute('data-sp-preview'); }
    }
    function rotate() {  // the hero advances by itself while focus is elsewhere
        clearInterval(rotateTimer);
        rotateTimer = setInterval(() => { if (S && !ui.motion.reduced() && E.focused() !== S.hero.el) showHero(S.hero.index + 1); }, 9000);
    }

    // ---- focus moves ----
    function zone(z) { S.zone = z; S.content.classList.toggle('sp-in-rows', z === 'rows'); }
    function focusTop(i) { zone('top'); stopPreview(); E.focus(S.top[Math.max(0, Math.min(S.top.length - 1, i))]); }
    function focusHero() { zone('hero'); E.focus(S.hero.el); S.content.style.setProperty('--sp-scroll', '0px'); S.rowsBox.style.transform = ''; armPreview(); }
    function focusRow(r, i) {
        const row = S.rows[r];
        row.index = Math.max(0, Math.min(row.items.length - 1, i));
        row.layout();
        zone('rows');
        S.rowIndex = r;
        stopPreview();
        E.focus(row.node(row.index));
        // the focused row slides up under the (shrunk) hero
        S.rowsBox.style.transform = `translateY(${-row.section.offsetTop}px)`;
    }

    T.registerScreen('#/home', {
        onAction(action, ctx) {
            if (!S || !S.ready) return false;
            const f = ctx.focused();
            const ti = S.top.indexOf(f);
            if (ti >= 0) {
                if (action === 'left' || action === 'right') { focusTop(ti + (action === 'right' ? 1 : -1)); ctx.sound('focus'); return true; }
                if (action === 'down') { S.topIndex = ti; focusHero(); ctx.sound('focus'); return true; }
                return action === 'up';
            }
            if (f === S.hero.el) {
                if (action === 'left' || action === 'right') { showHero(S.hero.index + (action === 'right' ? 1 : -1)); ctx.sound('focus'); return true; }
                if (action === 'up' || action === 'back') { focusTop(S.topIndex || 0); ctx.sound(action === 'back' ? 'back' : 'focus'); return true; }
                if (action === 'down') { if (S.rows.length) focusRow(0, S.rows[0].index); ctx.sound('focus'); return true; }
                if (action === 'enter' || action === 'select') { stopPreview(); details(S.client, S.hero.items[S.hero.index]); return true; }
                return false;
            }
            const r = S.rows.findIndex((row) => row.track.contains(f));
            if (r < 0) return false;
            const row = S.rows[r];
            if (action === 'left' || action === 'right') { focusRow(r, row.index + (action === 'right' ? 1 : -1)); ctx.sound('focus'); return true; }
            if (action === 'down') { if (r + 1 < S.rows.length) { focusRow(r + 1, S.rows[r + 1].index); ctx.sound('focus'); } return true; }
            if (action === 'up') { if (r > 0) focusRow(r - 1, S.rows[r - 1].index); else focusHero(); ctx.sound('focus'); return true; }
            if (action === 'back') { focusHero(); ctx.sound('back'); return true; }
            return false;  // Enter: the engine clicks the tile
        },
        async mount(root, ctx) {
            root.setAttribute('data-sp', 'home');
            S = { client: window.ApiClient, root, top: [], rows: [], zone: 'top', ready: false, readyParts: 0 };
            S.maybeReady = () => {
                if (S.readyParts < 2 || S.ready) return;
                S.ready = true;
                root.setAttribute('data-sp-ready', String(S.rows.length));
                if (S.hero.items.length) focusHero(); else focusTop(0);
            };
            const content = ui.chrome.frame(root, ctx);
            S.content = content;
            const hero = { el: el('div', 'sp-hero'), items: [], index: 0, preview: null };
            hero.el.setAttribute('data-icefin-focus', '');
            hero.el.tabIndex = -1;
            hero.art = el('div', 'sp-hero-art');
            hero.videoBox = el('div', 'sp-hero-video');
            const text = el('div', 'sp-hero-text');
            hero.title = el('div', 'sp-hero-title');
            hero.meta = el('div', 'sp-hero-meta');
            hero.overview = el('div', 'sp-hero-overview');
            const dots = el('div', 'sp-hero-dots');
            text.append(hero.title, hero.meta, hero.overview);
            hero.el.append(hero.art, hero.videoBox, el('div', 'sp-hero-scrim'), text, dots);
            S.hero = hero;
            S.rowsBox = el('div', 'sp-rows');
            const rowsView = el('div', 'sp-rows-view');
            rowsView.append(S.rowsBox);
            content.append(hero.el, rowsView);

            const views = await T.ui.userViews();  // also waits out a cold start, so uid below is set
            if (!S || S.root !== root) return;
            const c = S.client, uid = c.getCurrentUserId();
            const get = (p) => Promise.resolve(p).then((r) => (r && (r.Items || r)) || [], () => []);
            const [latest, resume, nextUp] = await Promise.all([
                get(c.getItems(uid, { Recursive: true, IncludeItemTypes: 'Movie,Series', SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 5, Fields: FIELDS })),
                get(c.getResumableItems(uid, { Limit: 40, MediaTypes: 'Video', Fields: FIELDS })),
                get(c.getNextUpEpisodes({ UserId: uid, Limit: 40, Fields: FIELDS }))
            ]);
            if (!S || S.root !== root) return;
            hero.items = latest;
            hero.dots = hero.items.map(() => { const d = el('span', 'sp-dot'); dots.append(d); return d; });
            if (hero.items.length) showHero(0); else hero.el.hidden = true;
            const rows = [];
            if (resume.length) rows.push(['Continue watching', resume]);
            if (nextUp.length) rows.push(['Next up', nextUp]);
            for (const v of views) {
                const items = await get(c.getLatestItems({ userId: uid, parentId: v.Id, Limit: 40, Fields: FIELDS }));
                if (items.length) rows.push([`Recently added in ${v.Name}`, items]);
            }
            if (!S || S.root !== root) return;
            S.rows = rows.map(([t, items]) => { const r = Row(t, items); S.rowsBox.append(r.section); return r; });
            rotate();
            S.readyParts++;
            S.maybeReady();
        },
        unmount() {
            stopPreview();
            clearInterval(rotateTimer);
            S = null;
        }
    });
})();
