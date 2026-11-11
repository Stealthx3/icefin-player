// Orbit (benchmark theme, PLAN 9.8; its target is named in docs/PLAN.md). Built from the engine's generic
// capabilities only: a vertical stack of category channels, each a horizontal 3D carousel of large tiles receding in
// depth (ui.carousel3d), with a slow parallax backdrop that follows the focused channel, and a guide panel that opens
// over any screen, themed or stock (ui.overlay; long press on View). Every other route is jellyfin-web's own page,
// styled by this theme's tokens.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const tags = (it) => it.ImageTags || {};
    const FIELDS = 'PrimaryImageAspectRatio,ProductionYear,RunTimeTicks,UserData';
    const safe = (p) => Promise.resolve(p).then((r) => (r && (r.Items || r)) || [], () => []);

    function libraryHash(client, v) {
        const sid = client.serverId();
        const routes = { movies: 'movies', tvshows: 'tv', music: 'music' };
        return routes[v.CollectionType] ? `#/${routes[v.CollectionType]}?topParentId=${v.Id}&collectionType=${v.CollectionType}&serverId=${sid}` : `#/list?parentId=${v.Id}&serverId=${sid}`;
    }
    const detailsHash = (client, it) => `#/details?id=${it.Id}&serverId=${client.serverId()}`;
    function art(client, it) {
        if (tags(it).Thumb) return client.getScaledImageUrl(it.Id, { type: 'Thumb', maxWidth: 720, tag: tags(it).Thumb });
        if ((it.BackdropImageTags || []).length) return client.getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: 720, tag: it.BackdropImageTags[0] });
        if ((it.ParentBackdropImageTags || []).length) return client.getScaledImageUrl(it.ParentBackdropItemId, { type: 'Backdrop', maxWidth: 720, tag: it.ParentBackdropImageTags[0] });
        if (tags(it).Primary) return client.getScaledImageUrl(it.Id, { type: 'Primary', maxHeight: 480, tag: tags(it).Primary });
        return '';
    }

    // ---- channels: { title, tiles: [{ label, sub, art, go }] } ----
    async function channelsFor(client) {
        const views = await ui.userViews();  // also waits out a cold start, so uid below is set
        const uid = client.getCurrentUserId();
        const media = (it) => ({ label: it.Type === 'Episode' ? (it.SeriesName || it.Name) : it.Name,
            sub: it.Type === 'Episode' ? it.Name : (it.ProductionYear ? String(it.ProductionYear) : ''), art: art(client, it), go: () => { location.hash = detailsHash(client, it); } });
        const [resume, next, ...latest] = await Promise.all([
            safe(client.getResumableItems(uid, { Limit: 10, MediaTypes: 'Video', Fields: FIELDS })),
            safe(client.getNextUpEpisodes({ UserId: uid, Limit: 10, Fields: FIELDS })),
            ...views.map((v) => safe(client.getLatestItems({ userId: uid, parentId: v.Id, Limit: 10, Fields: FIELDS })))]);
        const out = [];
        const spotlight = [...resume, ...next];
        if (spotlight.length) out.push({ title: 'spotlight', tiles: spotlight.map(media) });
        views.forEach((v, i) => out.push({ title: v.Name.toLowerCase(), tiles: [
            { label: v.Name, sub: 'Open library', art: tags(v).Primary ? client.getScaledImageUrl(v.Id, { type: 'Primary', maxWidth: 720, tag: tags(v).Primary }) : '', go: () => { location.hash = libraryHash(client, v); } },
            ...latest[i].map(media)] }));
        out.push({ title: 'system', tiles: [
            { label: 'Search', sub: '', art: '', go: () => { location.hash = '#/search'; } },
            { label: 'Settings', sub: '', art: '', go: () => { location.hash = '#/mypreferencesmenu'; } },
            { label: 'Classic home', sub: 'With plugin sections', art: '', go: () => { location.hash = '#/home?icefin=stock'; } }] });
        return out;
    }

    let S = null;  // { root, stack, rows:[{el, cells, carousel}], index } while the screen is up

    function showCount() {
        if (!S || !S.rows[S.index]) return;
        const row = S.rows[S.index];
        S.count.textContent = `${row.carousel.index() + 1} of ${row.cells.length}`;
    }

    function tile(t) {
        const c = el('div', 'ob-tile');
        c.tabIndex = -1;
        c.orbitTile = t;
        const face = el('div', 'ob-face');
        if (t.art) face.style.backgroundImage = `url("${t.art}")`;
        else face.append(el('div', 'ob-face-title', t.label));
        c.append(face, el('div', 'ob-label', t.label), el('div', 'ob-sub', t.sub || ''));
        c.addEventListener('click', () => t.go());
        c.addEventListener('icefin-focus', () => setTimeout(showCount, 0));
        return c;
    }

    // Fills the channel stack. Also on the screen root as orbitFill, so tests can load their own channels.
    function fill(channels) {
        S.stack.textContent = '';
        S.rows = channels.map((ch, i) => {
            const row = el('section', 'ob-channel');
            row.setAttribute('data-ob-channel', String(i));
            row.append(el('div', 'ob-channel-title', ch.title));
            const ring = el('div', 'ob-ring');
            row.append(ring);
            S.stack.append(row);
            // The target's ring: the front tile flat at the left, the next ones further back on the right (scale 0.745,
            // 0.593), no tilt, 370 ms a step. Depth and perspective are px, so they follow the window's height.
            const k = window.innerHeight / 1080;
            const carousel = ui.carousel3d(ring, ch.tiles, { render: tile, spacing: 116.5, depth: Math.round(411 * k), tilt: 0.001, visible: 4, ms: 370,
                perspective: `${Math.round(1200 * k)}px` });
            return { el: row, carousel, cells: [...ring.querySelectorAll('.ob-tile')], last: 0 };
        });
        S.root.setAttribute('data-ob-ready', String(S.rows.length));
        S.index = -1;
        if (S.rows.length) focusChannel(0);
    }

    function focusChannel(i) {
        i = Math.max(0, Math.min(S.rows.length - 1, i));
        if (S.index >= 0 && S.rows[S.index]) S.rows[S.index].last = S.rows[S.index].carousel.index();
        S.index = i;
        // The focused channel's title sits over its ring; the channels above stack their titles upward, smaller and
        // fainter; the ones below wait out of sight.
        S.rows.forEach((r, k) => {
            r.el.classList.toggle('current', k === i);
            r.el.classList.toggle('near', Math.abs(k - i) === 1);
            r.el.setAttribute('data-ob-rank', k < i ? String(Math.min(i - k, 5)) : k > i ? 'below' : '0');
        });
        const row = S.rows[i];
        S.count.textContent = '';
        S.backdrop.style.transform = `translateY(${-i * 2.2}vh) scale(1.12)`;  // parallax: the backdrop moves a fraction
        S.root.setAttribute('data-ob-index', String(i));
        row.carousel.focus(Math.min(row.last, row.cells.length - 1));
        showCount();
    }

    // ---- the guide: a panel over any screen ----
    ui.overlay.set({
        mount(panel, ctx) {
            panel.classList.add('ob-guide-host');
            const g = el('div', 'ob-guide');
            const clock = el('div', 'ob-guide-clock', new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
            g.append(el('div', 'ob-guide-title', 'icefin guide'), clock);
            const list = el('div', 'ob-guide-list');
            const entry = (label, go) => { const b = el('div', 'ob-guide-item', label); b.setAttribute('data-icefin-focus', ''); b.tabIndex = -1; b.addEventListener('click', () => { ctx.close(); go(); }); list.append(b); };
            entry('Home', () => { location.hash = '#/home'; });
            entry('Search', () => { location.hash = '#/search'; });
            entry('Settings', () => { location.hash = '#/mypreferencesmenu'; });
            entry('Classic home', () => { location.hash = '#/home?icefin=stock'; });
            g.append(list);
            panel.append(g);
            panel.addEventListener('click', (e) => { if (e.target === panel) ctx.close(); });
        }
    });

    T.registerScreen('#/home', {
        // Left/right inside a channel belong to its carousel (an engine hook); up/down change channel here, and each
        // channel keeps the tile it had.
        onAction(action, ctx) {
            if (!S || !S.rows || !S.rows.length) return false;
            const f = ctx.focused();
            const r = S.rows.findIndex((row) => row.cells.includes(f));
            if (r < 0) return false;
            if (action === 'up' || action === 'down') {
                const n = r + (action === 'down' ? 1 : -1);
                if (n >= 0 && n < S.rows.length) { focusChannel(n); ctx.sound('navigate'); }
                return true;
            }
            return action === 'left' || action === 'right';
        },
        mount(root) {
            root.setAttribute('data-ob', 'home');
            S = { root, rows: [], index: -1 };
            S.backdrop = el('div', 'ob-backdrop');
            const view = el('div', 'ob-view');
            S.stack = el('div', 'ob-stack');
            view.append(S.stack);
            const clock = el('div', 'ob-clock');
            const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
            tick();
            S.clockTimer = setInterval(tick, 15000);
            S.count = el('div', 'ob-count');
            root.append(S.backdrop, view, clock, S.count, el('div', 'ob-hint', 'Ⓐ Select   ·   hold View for the guide'));
            root.orbitFill = (channels) => fill(channels);
            channelsFor(T.ctx.apiClient()).then((ch) => { if (S) fill(ch); }, (e) => { console.warn('Orbit: channels', e); if (S) fill([]); });
        },
        unmount() {
            if (!S) return;
            clearInterval(S.clockTimer);
            S = null;
        }
    });
})();

// Details (PLAN 9.18): the engine's details screen (every feature of the stock page) in this theme's layout; the look
// is in styles.css, "Details".
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.details) T.registerScreen('#/details', T.ui.details.screen({ layout: 'poster' }));
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
