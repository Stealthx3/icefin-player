// Media Center: the start strip (Icefin reference theme, PLAN 8.6). It replaces the home route only; every other page is
// the server's own web client, styled by this theme's tokens. "Classic home" (?icefin=stock) keeps plugin home sections
// one step away.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

    function tile(client, item, wide) {
        const t = el('div', 'mc-tile' + (wide ? ' wide' : ''));
        t.setAttribute('data-icefin-focus', '');
        t.tabIndex = -1;
        const tag = wide ? (item.ImageTags || {}).Thumb || (item.ImageTags || {}).Primary : (item.ImageTags || {}).Primary;
        const type = wide && (item.ImageTags || {}).Thumb ? 'Thumb' : 'Primary';
        if (tag) t.style.backgroundImage = `url("${client.getScaledImageUrl(item.Id, { type, maxHeight: wide ? 360 : 480, tag })}")`;
        t.append(el('span', 'mc-label', item.Name));
        t.addEventListener('click', () => { location.hash = `#/details?id=${item.Id}&serverId=${client.serverId()}`; });
        return t;
    }

    function textTile(label, go) {
        const t = el('div', 'mc-tile text', label);
        t.setAttribute('data-icefin-focus', '');
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
                if (latest.length) cats.push({ title: v.Name, items: latest, wide: false });
            } catch (e) { console.warn('Media Center: latest', v.Name, e); }
        }
        cats.push({ title: 'More', links: [
            ['Classic home', () => { location.hash = '#/home?icefin=stock'; }],
            ['Search', () => { location.hash = '#/search'; }],
            ['Settings', () => { location.hash = '#/mypreferencesmenu'; }]
        ] });
        return cats;
    }

    let grid = null;  // rows of tiles, for structured navigation
    let lastCol = [];  // each row remembers where its focus was

    T.registerScreen('#/home', {
        // The strip navigates by structure, not geometry: up/down change category (keeping the column), left/right stay
        // in the row, Enter opens.
        onAction(action, ctx) {
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
            const client = window.ApiClient;
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
            start.append(el('div', 'mc-brand', 'Icefin'), clock, strip, now);
            root.append(field, start);
            root.setAttribute('data-mc', 'start');

            const cats = await categories(client);
            if (!root.contains(start)) return;  // replaced while loading
            const rows = cats.map((c) => {
                const cat = el('section', 'mc-cat');
                cat.append(el('div', 'mc-cat-title', c.title));
                const row = el('div', 'mc-row');
                if (c.links) c.links.forEach(([label, go]) => row.append(textTile(label, go)));
                else c.items.forEach((it) => row.append(tile(client, it, c.wide)));
                cat.append(row);
                strip.append(cat);
                return { cat, row };
            });

            // Keep the focused category on a fixed line and its focused tile in view.
            const ms = ui.motion.duration(320);
            strip.style.setProperty('--mc-ms', `${ms}ms`);
            root.addEventListener('icefin-focus', (e) => {
                const r = rows.findIndex((x) => x.cat.contains(e.target));
                if (r < 0) return;
                rows.forEach((x, k) => x.cat.classList.toggle('current', k === r));
                const catH = rows[r].cat.offsetHeight;
                strip.style.transform = `translateY(${Math.round(window.innerHeight * 0.34 - r * catH)}px)`;
                const row = rows[r].row, t = e.target;
                const maxX = row.parentElement.offsetWidth * 0.6;
                row.style.transform = `translateX(${Math.min(0, Math.round(maxX - t.offsetLeft))}px)`;
            });
            grid = rows.map((x) => [...x.row.querySelectorAll('[data-icefin-focus]')]).filter((row) => row.length);
            lastCol = grid.map(() => 0);
            const first = strip.querySelector('[data-icefin-focus]');
            if (first) T._engine.focus(first);
            root.setAttribute('data-mc-ready', String(rows.length));

            // Now playing inset
            const pm = window.icefinPlaybackManager;
            const refresh = () => {
                const player = pm && pm.getCurrentPlayer && pm.getCurrentPlayer();
                const item = player && pm.currentItem && pm.currentItem(player);
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
