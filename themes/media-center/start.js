// Media Center: the start strip (Icefin reference theme, PLAN 8.6). It replaces the home route only; every other page is
// the server's own web client, styled by this theme's tokens. "Classic home" (?icefin=stock) keeps plugin home sections
// one step away.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const M = window.icefinMediaCenter;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

    function tile(client, item, wide) {
        const t = el('div', 'mc-tile' + (wide ? ' wide' : ''));
        t.mcItem = item;  // ≡ opens its menu (itemmenu.js)
        t.setAttribute('data-icefin-focus', '');
        t.tabIndex = -1;
        const tag = wide ? (item.ImageTags || {}).Thumb || (item.ImageTags || {}).Primary : (item.ImageTags || {}).Primary;
        const type = wide && (item.ImageTags || {}).Thumb ? 'Thumb' : 'Primary';
        if (tag) t.style.backgroundImage = `url("${client.getScaledImageUrl(item.Id, { type, maxHeight: wide ? 360 : 480, tag })}")`;
        t.append(el('span', 'mc-label', item.Name));
        t.addEventListener('click', () => { location.hash = `#/details?id=${item.Id}&serverId=${client.serverId()}`; });
        return t;
    }

    function textTile(label, go, aria) {
        const t = el('div', 'mc-tile text', label);
        t.setAttribute('data-icefin-focus', '');
        t.setAttribute('role', 'button');
        if (aria) t.setAttribute('aria-label', aria);
        t.tabIndex = -1;
        t.addEventListener('click', go);
        return t;
    }

    async function categories(client) {
        const uid = client.getCurrentUserId();
        const cats = [];
        try {
            const resume = await client.getResumableItems(uid, { Limit: 10, MediaTypes: 'Video', Fields: 'PrimaryImageAspectRatio' });
            if (resume.Items && resume.Items.length) cats.push({ title: 'Continue', items: resume.Items, wide: true });
        } catch (e) { console.warn('Media Center: resume', e); }
        const views = await client.getUserViews({}, uid);
        for (const v of views.Items || []) {
            try {
                const latest = await client.getLatestItems({ userId: uid, parentId: v.Id, Limit: 12, Fields: 'PrimaryImageAspectRatio' });
                // A library with nothing new (the server leaves watched items out of Latest) keeps its row with its
                // "All …" tile: without it, a library watched through had no way in from the start strip (QA 1)
                if (latest.length || LIBRARY[v.CollectionType]) cats.push({ title: v.Name, items: latest, wide: false, view: v });
            } catch (e) { console.warn('Media Center: latest', v.Name, e); }
        }
        cats.push({ title: 'Tasks', links: [
            ['settings', () => { location.hash = '#/mypreferencesmenu'; }],
            ['search', () => { location.hash = '#/search'; }],
            ['favourites', () => { location.hash = '#/favorites'; }],
            // Play on and Watch together (the PlayOn board, 9.60): the side panel, from the start strip as from the player
            ['play on', () => { const K = window.icefinMediaCenter; if (K && K.playOn) K.playOn('play'); }],
            ['watch together', () => { const K = window.icefinMediaCenter; if (K && K.playOn) K.playOn('together'); }],
            ['classic home', () => { location.hash = '#/home?icefin=stock'; }],
            // named in full for screen readers (and the walk's quit rule): "close" alone reads as closing a dialog
            ['close', () => askExit(), 'Close IceFin Player']
        ] });
        return cats;
    }

    // Libraries the poster wall shows (wall.js); Live TV keeps its own guide page.
    // "All ..." opens the library screen for the library's type (library.js); collections and the rest open the wall.
    const LIBRARY = { movies: '#/movies', tvshows: '#/tv', music: '#/music', musicvideos: '#/musicvideos', homevideos: '#/homevideos', books: '#/books', playlists: '#/playlists', boxsets: '#/list' };
    let grid = null;  // rows of tiles, for structured navigation
    let lastCol = [];  // each row remembers where its focus was

    // Back on the start screen, or "close": a band asks before Icefin closes (the canvas's "Back on start asks to close").
    function askExit() {
        const host = document.getElementById('icefin-theme-root');
        if (!host || M.band.open) return;
        M.band(host, {
            title: 'Close IceFin Player?', text: 'Anything playing stops. IceFin Player opens on this start screen next time.',
            note: 'Back again closes this without closing IceFin Player.',
            choices: [{ label: 'Yes', run: () => T.ctx.exit() }, { label: 'No', safe: true }, { label: 'Switch user', run: () => T.ctx.signOut() }]
        }).then(() => { const f = document.querySelector('#icefin-theme-root .mc-cat.current .mc-tile'); if (f && !T.ctx.focused()) T.ctx.focus(f); });
    }

    window.icefinMediaCenter.register('#/home', {
        onBack() {
            if (M.band.open) { M.band.open.close(); return true; }
            askExit();
            return true;
        },
        // The strip navigates by structure, not geometry: up/down change category (keeping the column), left/right stay
        // in the row, Enter opens.
        onAction(action, ctx) {
            if (M.band.open) {
                if (action === 'up' || action === 'down' || action === 'left' || action === 'right') { ctx.move(action, M.band.open.el); return true; }
                return false;
            }
            if (!grid) return false;
            const f = ctx.focused();
            let r = grid.findIndex((row) => row.includes(f));
            if (r < 0) return false;
            let c = grid[r].indexOf(f);
            if (action === 'left' || action === 'right') {
                c += action === 'right' ? 1 : -1;
                if (c >= 0 && c < grid[r].length) { lastCol[r] = c; ctx.focus(grid[r][c]); ctx.sound('focus'); }
                return true;
            }
            if (action === 'up' || action === 'down') {
                lastCol[r] = c;
                r += action === 'down' ? 1 : -1;
                if (r >= 0 && r < grid.length) { ctx.focus(grid[r][Math.min(lastCol[r] || 0, grid[r].length - 1)]); ctx.sound('focus'); }
                return true;
            }
            return false;
        },
        async mount(root) {
            const client = T.ctx.apiClient();
            const field = el('div', 'mc-field');
            field.append(el('div', 'mc-ribbon one'), el('div', 'mc-ribbon two'));
            const start = el('div', 'mc-start');
            const clock = el('div', 'mc-clock');
            const tickClock = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
            tickClock();
            this.clockTimer = setInterval(tickClock, 15000);
            const strip = el('div', 'mc-strip');
            const now = el('div', 'mc-now');
            now.hidden = true;
            // The corner mark is the server's own brand (ui.brand: its icon and name), never an image from this package.
            start.append(M.brandMark(el('div', 'mc-brand'), { name: true }), clock, strip, now);
            // Play on and Watch together, as on every frame (9.60); the strip keeps the arrows, so here they are the
            // pointer's (the pad has them on the Tasks row)
            if (M.extras) M.extras(start, false);
            root.append(field, start);
            root.setAttribute('data-mc', 'start');

            const cats = await categories(client);
            if (!root.contains(start)) return;  // replaced while loading
            // a row for the pointer: its title clicked, or the wheel over the strip (one row a notch)
            function openRow(cat) {
                const g = grid ? grid.findIndex((x) => x.length && cat.contains(x[0])) : -1;
                if (g < 0 || cat.classList.contains('current')) return;
                T.ctx.focus(grid[g][Math.min(lastCol[g] || 0, grid[g].length - 1)]);
                T.ctx.sound('focus');
            }
            let wheelAt = 0;
            start.addEventListener('wheel', (e) => {  // on this mount's own element: the root outlives the screen
                if (!grid || M.band.open || Math.abs(e.deltaY) < Math.abs(e.deltaX) || Date.now() - wheelAt < 250) return;
                const f = T.ctx.focused();
                const g = grid.findIndex((x) => x.includes(f));
                const n = (g < 0 ? 0 : g) + (e.deltaY > 0 ? 1 : -1);
                if (n < 0 || n >= grid.length) return;
                e.preventDefault();
                wheelAt = Date.now();
                T.ctx.focus(grid[n][Math.min(lastCol[n] || 0, grid[n].length - 1)]);
                T.ctx.sound('focus');
            }, { passive: false });
            const rows = cats.map((c) => {
                const cat = el('section', 'mc-cat');
                // a title opens its row for the pointer (the remote's up and down; the rows other than the current one
                // are closed, so a mouse had no way into them)
                const head = el('div', 'mc-cat-title', c.title);
                head.addEventListener('click', () => openRow(cat));
                cat.append(head);
                const row = el('div', 'mc-row');
                cat.setAttribute('data-mc-group', c.title);  // Back finds the tile in its own row (kit.js M.backFocus)
                if (c.links) c.links.forEach(([label, go, aria]) => row.append(textTile(label, go, aria)));
                else c.items.forEach((it) => row.append(tile(client, it, c.wide)));
                // The whole library on the poster wall (wall.js).
                if (c.view && LIBRARY[c.view.CollectionType]) {
                    const r = LIBRARY[c.view.CollectionType];
                    const q = r === '#/list' ? `parentId=${c.view.Id}` : `topParentId=${c.view.Id}&collectionType=${c.view.CollectionType}`;
                    row.append(textTile(`All ${c.view.Name}`, () => T.ctx.navigate(`${r}?${q}&serverId=${client.serverId()}`)));
                }
                const band = el('div', 'mc-band');
                band.append(row);
                cat.append(band);
                strip.append(cat);
                return { cat, row };
            });

            // The current title sits on a fixed line (top 51vh) and the rows above it are closed, so its offset is just
            // r title heights: the lens stays put while categories slide through it. Titles further from the current one
            // fade a little more (depth).
            const ms = ui.motion.duration(320);
            strip.style.setProperty('--mc-ms', `${ms}ms`);
            root.style.setProperty('--mc-lens-ms', `${ui.motion.duration(240)}ms`);
            const vh = () => window.innerHeight / 100;
            // Resting width of a tile (the CSS sizes: posters 12vh tall at 2:3, wide items and links 9.5vh at 16:9). The
            // row's offset is worked out from these, not from offsetLeft, which is mid-animation while the lens moves.
            const restW = (t) => (t.classList.contains('wide') || t.classList.contains('text') ? 9.5 * 16 / 9 : 12 * 2 / 3) * vh();
            let cur = -1;
            // A pointer that moves onto a tile focuses it (pointer-first): its row stays where it is, so the tile stays
            // under the pointer and a click lands on it. The row slid to bring every focused tile to the lens, which moved
            // the tile out from under the pointer (the walk's mouse run: clicks on the Live TV row's right end hit
            // nothing, and a resting pointer then focused whatever slid under it).
            const byPointer = () => document.documentElement.getAttribute('data-mc-input') === 'pointer';
            const inView = (t) => { const b = t.getBoundingClientRect(); return b.left >= 0 && b.right <= window.innerWidth; };
            root.addEventListener('icefin-focus', (e) => {
                const r = rows.findIndex((x) => x.cat.contains(e.target));
                if (r < 0) return;
                const g = grid ? grid.findIndex((x) => x.includes(e.target)) : -1;
                if (g >= 0) lastCol[g] = grid[g].indexOf(e.target);
                if (r === cur && byPointer() && inView(e.target)) return;
                if (r !== cur) {
                    cur = r;
                    rows.forEach((x, k) => {
                        x.cat.classList.toggle('current', k === r);
                        x.cat.style.setProperty('--mc-dim', String(Math.max(0.22, 0.56 - 0.08 * Math.abs(k - r))));
                    });
                    strip.style.transform = `translateY(${Math.round(51 * vh() - r * 9 * vh())}px)`;
                }
                const row = rows[r].row, t = e.target;
                const tiles = [...row.children];
                const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
                let left = 0;
                for (const x of tiles) { if (x === t) break; left += restW(x) + gap; }
                // The lens starts under the titles and travels right to 55% of the width before the row scrolls.
                row.style.transform = `translateX(${Math.min(0, Math.round(window.innerWidth * (0.55 - 0.166) - left))}px)`;
            });
            grid = rows.map((x) => [...x.row.querySelectorAll('[data-icefin-focus]')]).filter((row) => row.length);
            lastCol = grid.map(() => 0);
            // Back to the start strip: the tile that opened the screen left (kit.js), else the first one
            const back = M.returnTo ? M.returnTo(strip) : null;
            const first = back || strip.querySelector('[data-icefin-focus]');
            if (first) T.ctx.focus(first);
            root.setAttribute('data-mc-ready', String(rows.length));

            // Now playing inset
            const refresh = () => {
                const playing = T.ctx.nowPlaying();
                const item = playing && playing.item;
                now.hidden = !item;
                if (item) {
                    now.textContent = '';
                    const txt = el('div', '', item.Name);
                    txt.append(el('small', '', 'Now playing'));
                    now.append(txt);
                }
            };
            refresh();
            this.nowTimer = setInterval(refresh, 3000);
        },
        unmount() {
            grid = null;
            clearInterval(this.clockTimer);
            clearInterval(this.nowTimer);
        }
    });
})();
