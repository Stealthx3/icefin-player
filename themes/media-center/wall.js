// Media Center: the poster wall (Icefin reference theme, PLAN 8.6). A library as a wall of posters, seven across, the
// focused row held on a fixed line, art loaded only near the visible rows and the next page fetched before the end.
// Opened from the start strip's "All ..." tile (#/list?parentId=...); a list without a library goes to jellyfin-web.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    const COLS = 7, PAGE = 140;
    const TYPES = { movies: 'Movie', tvshows: 'Series', music: 'MusicAlbum', musicvideos: 'MusicVideo', homevideos: 'Video,Photo', boxsets: 'BoxSet' };
    let W = null;  // the mounted wall

    function poster(client, item) {
        const t = el('div', 'mc-tile mc-poster');
        t.setAttribute('data-icefin-focus', '');
        t.tabIndex = -1;
        t.dataset.id = item.Id;
        const tag = (item.ImageTags || {}).Primary;
        if (tag) t.dataset.src = client.getScaledImageUrl(item.Id, { type: 'Primary', maxHeight: 420, tag });
        t.append(el('span', 'mc-label', item.Name));
        t.addEventListener('click', () => T.ctx.navigate(`#/details?id=${item.Id}&serverId=${client.serverId()}`));
        if (W && W.io) W.io.observe(t);
        return t;
    }

    async function more() {
        if (!W || W.loading || W.done) return;
        W.loading = true;
        const q = { ParentId: W.parentId, SortBy: 'SortName', SortOrder: 'Ascending', StartIndex: W.tiles.length, Limit: PAGE,
                    Fields: 'PrimaryImageAspectRatio', ImageTypeLimit: 1, EnableImageTypes: 'Primary' };
        if (W.types) { q.IncludeItemTypes = W.types; q.Recursive = true; }
        try {
            const r = await W.client.getItems(W.client.getCurrentUserId(), q);
            if (!W) return;
            const items = r.Items || [];
            W.total = r.TotalRecordCount || W.tiles.length + items.length;
            for (const it of items) { const t = poster(W.client, it); W.grid.append(t); W.tiles.push(t); }
            W.done = W.tiles.length >= W.total || !items.length;
            W.count.textContent = `${W.total} ${W.total === 1 ? 'item' : 'items'}`;
            W.root.setAttribute('data-mc-count', String(W.tiles.length));
        } catch (e) {
            console.warn('Media Center: wall', e);
            W.done = true;
        } finally {
            if (W) W.loading = false;
        }
    }

    function focusAt(i, ctx) {
        const t = W.tiles[i];
        if (!t) return;
        ctx.focus(t);
        ctx.sound('focus');
        const row = Math.floor(i / COLS);
        const rowH = t.offsetHeight + parseFloat(getComputedStyle(W.grid).rowGap || 0);
        W.grid.style.transform = `translateY(${Math.round(Math.max(0, row - 1) * -rowH)}px)`;
        if (W.tiles.length - i <= COLS * 2) more();
    }

    T.registerScreen('#/list', {
        onAction(action, ctx) {
            if (!W || !W.tiles.length) return false;
            const i = W.tiles.indexOf(ctx.focused());
            if (i < 0) return false;
            const step = { left: -1, right: 1, up: -COLS, down: COLS }[action];
            if (step === undefined) return false;  // Enter clicks; Back is the engine's
            if ((action === 'left' && i % COLS === 0) || (action === 'right' && i % COLS === COLS - 1)) return true;
            if (action === 'up' && i < COLS) return false;  // the top row: up reaches Back and Home
            let n = i + step;
            if (action === 'down' && n >= W.tiles.length) n = W.done ? W.tiles.length - 1 : i;  // the last row is short
            if (n >= 0 && n < W.tiles.length && n !== i) focusAt(n, ctx);
            return true;
        },
        async mount(root) {
            const params = new URLSearchParams(location.hash.split('?')[1] || '');
            const parentId = params.get('parentId') || params.get('topParentId');
            if (!parentId) { location.replace(location.hash + (location.hash.includes('?') ? '&' : '?') + 'icefin=stock'); return; }
            root.setAttribute('data-mc', 'wall');
            const views = await ui.userViews();
            const view = (views || []).find((v) => v.Id === parentId);
            // Live TV has its own screen (tv.js); a wall of its folder is empty
            if (view && view.CollectionType === 'livetv') { location.replace('#/livetv'); return; }
            W = { root, parentId, client: T.ctx.apiClient(), tiles: [], loading: false, done: false, total: 0,
                  types: view ? TYPES[view.CollectionType] : null };
            const field = el('div', 'mc-field');
            field.append(el('div', 'mc-ribbon one'), el('div', 'mc-ribbon two'));
            // the page chrome (Back, Home, the title in lower case, the clock); the count and order under the title
            const M = window.icefinMediaCenter;
            W.chrome = M ? M.chrome(root, view ? view.Name.toLowerCase() : '') : null;
            const title = W.chrome ? W.chrome.head : el('div');
            const head = el('div', 'mc-wall-head');
            W.count = el('div', 'mc-wall-count');
            head.append(W.count, el('div', 'mc-wall-sort', 'A to Z'));
            const body = el('div', 'mc-wall-body');
            W.grid = el('div', 'mc-wall');
            W.grid.style.setProperty('--mc-ms', `${ui.motion.duration(300)}ms`);
            body.append(W.grid);
            root.append(field, head, body);
            // Art for the tiles near the view only: a library of thousands keeps a light page.
            W.io = new IntersectionObserver((entries) => {
                for (const e of entries) {
                    if (!e.isIntersecting || !e.target.dataset.src) continue;
                    e.target.style.backgroundImage = `url("${e.target.dataset.src}")`;
                    delete e.target.dataset.src;
                    W.io.unobserve(e.target);
                }
            }, { root: body, rootMargin: '60% 0px' });
            if (!view) {
                try { title.textContent = ((await W.client.getItem(W.client.getCurrentUserId(), parentId)).Name || '').toLowerCase(); } catch (e) { /* a name is optional */ }
            }
            await more();
            if (!W || W.root !== root) return;
            if (W.tiles.length) T.ctx.focus(W.tiles[0]);
            root.setAttribute('data-mc-ready', '1');
        },
        unmount() {
            if (W && W.io) W.io.disconnect();
            if (W && W.chrome) W.chrome.stop();
            W = null;
        }
    });
})();
