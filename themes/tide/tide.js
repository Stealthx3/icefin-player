// Tide (benchmark theme, PLAN 9.17; its target is named in docs/PLAN.md). Built from the engine's generic capabilities
// only: a row of category icons crossing a column of items at a fixed point (the theme's own screen layout), the
// background's colours chosen by the month and dimmed by the time of day (ui.timePalette over palettes.* tokens), and an
// animated wave drawn on a canvas in the web layer, still under reduced or low motion. The native shader backdrop (8.4)
// will take the wave over when it lands. Icons are original line drawings. Every other route is jellyfin-web's own.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const E = T.ctx;  // focus, focused, sound: the theme script API (8.7)
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const FIELDS = 'PrimaryImageAspectRatio,ProductionYear,ChildCount,AlbumArtist';
    const WINDOW = 9;  // items above and below the focused one kept in the DOM
    // The items a library's column lists, by its collection type (live TV has the guide; unknown kinds, their top level).
    const TYPES = { movies: 'Movie', tvshows: 'Series', music: 'MusicAlbum', books: 'Book', boxsets: 'BoxSet', homevideos: 'Video,Photo',
        musicvideos: 'MusicVideo', playlists: 'Playlist' };

    // Original line icons (24x24, stroke = currentColor).
    const A = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
    const ICON = {
        settings: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" ${A}/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1" ${A}/></svg>`,
        movies: `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1.5" ${A}/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4" ${A}/></svg>`,
        tvshows: `<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="1.5" ${A}/><path d="M9 3l3 3 3-3M8 21h8" ${A}/></svg>`,
        music: `<svg viewBox="0 0 24 24"><path d="M9 17V5l11-2v12" ${A}/><circle cx="6.5" cy="17" r="2.5" ${A}/><circle cx="17.5" cy="15" r="2.5" ${A}/></svg>`,
        livetv: `<svg viewBox="0 0 24 24"><rect x="4" y="9" width="16" height="11" rx="1.5" ${A}/><path d="M8 4l4 5 4-5" ${A}/><circle cx="16.5" cy="14.5" r="1" ${A}/></svg>`,
        search: `<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6" ${A}/><path d="M15 15l5.5 5.5" ${A}/></svg>`,
        folder: `<svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v10H3z" ${A}/></svg>`,
        item: `<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="16" rx="1.5" ${A}/><path d="M9 9h6M9 13h6" ${A}/></svg>`
    };
    const MONTHS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'];
    ui.timePalette({ schedule: [['05:00', 'dawn'], ['08:00', 'day'], ['17:00', 'dusk'], ['20:00', 'night']], months: MONTHS, fadeMs: 8000 });

    let S = null;

    // ---- the wave: soft ribbons of sine curves; one frame only under reduced or low motion ----
    function wave(canvas) {
        const ctx = canvas.getContext('2d');
        let raf = 0, colour = '', last = 0, w = 0, h = 0;
        const readColour = () => { colour = getComputedStyle(document.documentElement).getPropertyValue('--icefin-color-waveLine').trim(); };
        const size = () => { w = canvas.width = Math.round(canvas.clientWidth * 0.5); h = canvas.height = Math.round(canvas.clientHeight * 0.5); };
        function frame(t) {
            if (!canvas.isConnected) return;
            if (t - last > 1000) { readColour(); if (canvas.clientWidth * 0.5 !== w) size(); last = t; }
            ctx.clearRect(0, 0, w, h);
            ctx.strokeStyle = colour;
            const s = t / 1000;
            for (let k = 0; k < 14; k++) {
                ctx.globalAlpha = 0.08 + 0.05 * Math.sin(k);
                ctx.lineWidth = k % 4 === 0 ? 2 : 1;
                ctx.beginPath();
                for (let x = 0; x <= w; x += 8) {
                    const u = x / w;
                    const y = h * 0.55 + Math.sin(u * 5.2 + s * 0.35 + k * 0.18) * h * 0.08 + Math.sin(u * 11 - s * 0.22 + k * 0.4) * h * 0.025 + (k - 7) * h * 0.006;
                    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            canvas.setAttribute('data-td-frame', String(Math.round(s * 10)));
            if (!ui.motion.reduced()) raf = requestAnimationFrame(frame);
            else raf = 0;
        }
        size();
        readColour();
        raf = requestAnimationFrame(frame);
        // Restart when the motion cap lifts.
        const mo = new MutationObserver(() => { if (!canvas.isConnected) mo.disconnect(); else if (!raf && !ui.motion.reduced()) raf = requestAnimationFrame(frame); });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-icefin-motion'] });
        return { stop: () => { cancelAnimationFrame(raf); mo.disconnect(); } };
    }

    // ---- categories and their items ----
    async function categories(c, views) {
        const uid = c.getCurrentUserId();
        const cats = [{ id: 'settings', label: 'Settings', icon: 'settings', items: async () => [
            { name: 'Display', hash: '#/mypreferencesdisplay', icon: 'settings' }, { name: 'Playback', hash: '#/mypreferencesplayback', icon: 'settings' },
            { name: 'Client settings', hash: '#/mypreferencesmenu', icon: 'settings' }, { name: 'Classic home', hash: '#/home?icefin=stock', icon: 'folder' }] }];
        for (const v of views) {
            // Each kind of library lists its own items (books, collections, photos and playlists too, not movies: a
            // first library of books opened on an empty column, with nothing to focus); an unknown kind lists its
            // top level.
            const type = TYPES[v.CollectionType || ''];
            cats.push({ id: v.Id, label: v.Name, icon: ICON[v.CollectionType] ? v.CollectionType : 'folder', items: async () => {
                if (v.CollectionType === 'livetv') return [{ name: 'Guide', hash: '#/livetv', icon: 'livetv' }];
                const q = type ? { ParentId: v.Id, Recursive: true, IncludeItemTypes: type } : { ParentId: v.Id };
                const r = await Promise.resolve(c.getItems(uid, Object.assign(q, { SortBy: 'SortName', Fields: FIELDS, Limit: 500 }))).catch(() => null);
                const list = ((r && r.Items) || []).map((it) => ({ name: it.Name, sub: it.ProductionYear || it.AlbumArtist || (it.ChildCount ? `${it.ChildCount} seasons` : ''), item: it }));
                // Never an empty column: the focus needs somewhere to be, and the library's own page is one step away.
                return list.length ? list : [{ name: `Open ${v.Name}`, hash: `#/list?parentId=${v.Id}&serverId=${c.serverId()}`, icon: 'folder' }];
            } });
        }
        cats.push({ id: 'search', label: 'Search', icon: 'search', items: async () => [{ name: 'Search', hash: '#/search', icon: 'search' }] });
        return cats;
    }

    function drawCats() {
        S.catEls.forEach((e, i) => { e.style.left = `calc(var(--td-x) + ${i} * var(--td-step))`; e.classList.toggle('current', i === S.cat); });
        S.catsEl.style.transform = `translateX(calc(${-S.cat} * var(--td-step)))`;
        S.root.setAttribute('data-td-cat', S.cats[S.cat].label);
    }
    // Items before the focused one stack above the category row; the focused one and those after it below it.
    function drawItems() {
        const list = S.lists[S.cat] || [];
        const i = S.index[S.cat] || 0;
        S.itemsEl.textContent = '';
        let focusEl = null;
        for (let k = Math.max(0, i - WINDOW); k < Math.min(list.length, i + WINDOW + 1); k++) {
            const x = list[k];
            const row = el('div', 'td-item' + (k < i ? ' above' : ''));
            row.setAttribute('data-icefin-focus', '');
            row.tabIndex = -1;
            row.tideIndex = k;
            const d = k - i;
            // Above the row the items stack upward; the focused one sits --td-below under the category row, and the
            // ones after it leave room for its larger icon (--td-after), as on the target.
            row.style.top = d < 0 ? `calc(var(--td-y) - 7vh + ${d} * var(--td-item))`
                : d === 0 ? 'calc(var(--td-y) + var(--td-below))'
                : `calc(var(--td-y) + var(--td-below) + var(--td-after) + ${d} * var(--td-item))`;
            const thumb = el('div', 'td-thumb');
            const tag = x.item && x.item.ImageTags && x.item.ImageTags.Primary;
            if (tag) thumb.style.backgroundImage = `url("${S.client.getScaledImageUrl(x.item.Id, { type: 'Primary', maxWidth: 200, tag })}")`;
            else thumb.innerHTML = ICON[x.icon || 'item'];
            const text = el('div');
            text.append(el('div', 'td-name', x.name));
            if (x.sub) text.append(el('div', 'td-sub', String(x.sub)));
            row.append(thumb, text);
            row.addEventListener('click', () => {
                if (x.hash) location.hash = x.hash;
                else location.hash = `#/details?id=${x.item.Id}&serverId=${S.client.serverId()}`;
            });
            S.itemsEl.append(row);
            if (k === i) focusEl = row;
        }
        S.root.setAttribute('data-td-index', String(i));
        S.root.setAttribute('data-td-count', String(list.length));
        if (focusEl) E.focus(focusEl);
    }
    async function showCat(n) {
        S.cat = Math.max(0, Math.min(S.cats.length - 1, n));
        drawCats();
        if (!S.lists[S.cat]) {
            const want = S.cat;
            S.itemsEl.textContent = '';
            S.lists[want] = await S.cats[want].items();
            if (!S || S.cat !== want) return;
        }
        drawItems();
    }

    T.registerScreen('#/home', {
        onAction(action, ctx) {
            if (!S || !S.ready) return false;
            if (action === 'left' || action === 'right') {
                const n = S.cat + (action === 'right' ? 1 : -1);
                if (n >= 0 && n < S.cats.length) { showCat(n); ctx.sound('navigate'); }
                return true;
            }
            if (action === 'up' || action === 'down') {
                const list = S.lists[S.cat] || [];
                const i = (S.index[S.cat] || 0) + (action === 'down' ? 1 : -1);
                if (i >= 0 && i < list.length) { S.index[S.cat] = i; drawItems(); ctx.sound('focus'); }
                return true;
            }
            if (action === 'back') {  // back to the top of the column, then to the first category
                if (S.index[S.cat]) { S.index[S.cat] = 0; drawItems(); ctx.sound('back'); return true; }
                return false;
            }
            return false;  // Enter: the engine clicks the focused item
        },
        async mount(root) {
            root.setAttribute('data-td', 'home');
            S = { client: T.ctx.apiClient(), root, cats: [], lists: {}, index: {}, cat: 0, ready: false };
            const canvas = el('canvas', 'td-wave');
            root.append(canvas, el('div', 'td-shade'));
            S.catsEl = el('div', 'td-cats');
            S.itemsEl = el('div', 'td-items');
            S.clock = el('div', 'td-clock');
            root.append(S.itemsEl, S.catsEl, S.clock);
            S.wave = ui.backdrop.available() ? { stop() {} } : wave(canvas);  // the native backdrop draws the wave
            const tick = () => { if (S && S.root === root) S.clock.textContent = new Date().toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
            tick();
            S.timer = setInterval(tick, 15000);
            const views = await ui.userViews();
            if (!S || S.root !== root) return;
            S.client = T.ctx.apiClient();  // a cold start creates the client late: read it after userViews
            S.cats = await categories(S.client, views);
            S.catEls = S.cats.map((cat, i) => {
                const e = el('div', 'td-cat');
                e.innerHTML = ICON[cat.icon] || ICON.folder;
                e.append(el('div', 'td-cat-label', cat.label));
                e.addEventListener('click', () => showCat(i));
                S.catsEl.append(e);
                return e;
            });
            S.ready = true;
            root.setAttribute('data-td-ready', String(S.cats.length));
            await showCat(Math.min(1, S.cats.length - 1));  // the first library, as the target opens on its media columns
        },
        unmount() {
            if (S) { S.wave.stop(); clearInterval(S.timer); }
            S = null;
        }
    });
})();

// Details (PLAN 9.18): the engine's details screen (every feature of the stock page) in this theme's layout; the look
// is in styles.css, "Details".
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.details) T.registerScreen('#/details', T.ui.details.screen({ layout: 'panel' }));
})();

// Player controls (PLAN 9.19): jellyfin-web's own controls (every function kept) in this theme's layout; the look is
// the osd.* tokens in tokens.json.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.osd) T.ui.osd.set({ layout: 'minimal' });
})();

// Settings (PLAN 9.24): the engine's settings area (Client settings, Classic View, Server Settings) in this theme's look.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.settings) T.registerScreen('#/mypreferencesmenu', T.ui.settings.screen({ layout: 'list' }));
})();
