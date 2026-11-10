// Plaza (benchmark theme, PLAN 9.7; its target is named in docs/PLAN.md). Built from the engine's generic capabilities only:
// a paged 4×3 grid of rounded channel tiles (ui.pagedGrid) whose tiles cycle previews of their content (ui.liveTile),
// pointer-first navigation (ui.pointerFirst), page arrows at the sides, and a bottom bar with the clock, the date and
// two round buttons. Selecting a channel zooms the tile up to fill the screen and opens its channel screen (Menu and
// Start). Every other route is jellyfin-web's own page, styled by this theme's tokens.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const tags = (it) => it.ImageTags || {};
    const FIELDS = 'PrimaryImageAspectRatio,ProductionYear,RunTimeTicks,UserData';
    const PER_PAGE = 12;
    const ZOOM_MS = 380;

    function libraryHash(client, v) {
        const sid = client.serverId();
        const routes = { movies: 'movies', tvshows: 'tv', music: 'music' };
        return routes[v.CollectionType] ? `#/${routes[v.CollectionType]}?topParentId=${v.Id}&collectionType=${v.CollectionType}&serverId=${sid}` : `#/list?parentId=${v.Id}&serverId=${sid}`;
    }
    function wideArt(client, it) {
        if ((it.BackdropImageTags || []).length) return client.getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: 800, tag: it.BackdropImageTags[0] });
        if ((it.ParentBackdropImageTags || []).length) return client.getScaledImageUrl(it.ParentBackdropItemId, { type: 'Backdrop', maxWidth: 800, tag: it.ParentBackdropImageTags[0] });
        if (tags(it).Thumb) return client.getScaledImageUrl(it.Id, { type: 'Thumb', maxWidth: 800, tag: tags(it).Thumb });
        if (tags(it).Primary) return client.getScaledImageUrl(it.Id, { type: 'Primary', maxWidth: 800, tag: tags(it).Primary });
        return '';
    }
    const safe = (p) => Promise.resolve(p).then((r) => (r && (r.Items || r)) || [], () => []);

    // ---- channels: { id, label, fetch?() -> items, start?(item), hash? } ----
    function channels(client, views) {
        const uid = client.getCurrentUserId();
        const pm = () => window.icefinPlaybackManager;
        const play = (it, ticks) => { const m = pm(); if (m && it) m.play({ ids: [it.Id], serverId: client.serverId(), startPositionTicks: ticks || 0 }); };
        const list = views.map((v) => ({
            id: 'library-' + v.Id, label: v.Name,
            fetch: () => safe(client.getLatestItems({ userId: uid, parentId: v.Id, Limit: 8, Fields: FIELDS })),
            start: () => { location.hash = libraryHash(client, v); }
        }));
        list.push(
            { id: 'resume', label: 'Continue watching', fetch: () => safe(client.getResumableItems(uid, { Limit: 8, MediaTypes: 'Video', Fields: FIELDS })),
                start: (it) => play(it, it && it.UserData && it.UserData.PlaybackPositionTicks) },
            { id: 'nextup', label: 'Next up', fetch: () => safe(client.getNextUpEpisodes({ UserId: uid, Limit: 8, Fields: FIELDS })), start: (it) => play(it, 0) },
            { id: 'search', label: 'Search', hash: '#/search' },
            { id: 'classic', label: 'Classic home', hash: '#/home?icefin=stock' });
        return list;
    }

    let S = null;  // { client, root, grid, tiles, channel, ... } while the screen is up

    function tile(ch) {
        const t = el('div', 'pz-tile' + (ch ? '' : ' empty'));
        t.tabIndex = -1;
        t.plazaChannel = ch || null;
        if (!ch) return t;
        t.setAttribute('data-pz-channel', ch.id);
        const screen = el('div', 'pz-screen');
        t.append(screen, el('div', 'pz-tile-label', ch.label));
        if (ch.fetch) {
            ui.liveTile(screen, {
                interval: 5000,
                fetch: async () => { const items = await ch.fetch(); ch.items = items; t.classList.toggle('pz-has-items', items.length > 0); return items.length ? items : [null]; },
                render: (it) => {
                    const f = el('div', 'pz-frame');
                    const url = it ? wideArt(S ? S.client : window.ApiClient, it) : '';
                    if (url) f.style.backgroundImage = `url("${url}")`;
                    else f.append(el('div', 'pz-frame-title', ch.label));
                    f.plazaItem = it;
                    return f;
                }
            });
        } else {
            const f = el('div', 'pz-frame pz-static');
            f.append(el('div', 'pz-frame-title', ch.label));
            screen.append(f);
        }
        t.addEventListener('click', () => select(t));
        return t;
    }

    // ---- zoom: a copy of the tile grows from its place to fill the screen, then the channel screen shows ----
    function select(t) {
        if (!S || S.channel || S.zooming) return;
        const ch = t.plazaChannel;
        if (!ch) return;
        const r = t.getBoundingClientRect(), root = S.root.getBoundingClientRect();
        const z = el('div', 'pz-zoom');
        const cur = t.querySelector('.pz-frame');
        if (cur && cur.style.backgroundImage) z.style.backgroundImage = cur.style.backgroundImage;
        z.style.left = `${r.left - root.left}px`;
        z.style.top = `${r.top - root.top}px`;
        z.style.width = `${r.width}px`;
        z.style.height = `${r.height}px`;
        const ms = ui.motion.duration(ZOOM_MS);
        z.style.transitionDuration = `${ms}ms`;
        S.root.append(z);
        S.zooming = true;
        S.root.setAttribute('data-pz-zoom', 'in');
        void z.offsetWidth;
        Object.assign(z.style, { left: '0px', top: '0px', width: '100%', height: '100%', borderRadius: '0' });
        setTimeout(() => {
            if (!S) return;
            S.zooming = false;
            S.root.removeAttribute('data-pz-zoom');
            if (ch.hash) { z.remove(); location.hash = ch.hash; return; }
            openChannel(t, z);
        }, ms + 30);
    }

    function openChannel(t, z) {
        const ch = t.plazaChannel;
        const cur = t.querySelector('.pz-frame');
        const item = (cur && cur.plazaItem) || (ch.items || [])[0] || null;
        const panel = el('div', 'pz-channel');
        panel.setAttribute('role', 'dialog');
        panel.append(el('div', 'pz-channel-title', ch.label));
        if (item) panel.append(el('div', 'pz-channel-item', item.Type === 'Episode' ? `${item.SeriesName || ''} · ${item.Name}` : item.Name));
        const bar = el('div', 'pz-channel-bar');
        const btn = (label, go) => { const b = el('div', 'pz-pill', label); b.setAttribute('data-icefin-focus', ''); b.tabIndex = -1; b.addEventListener('click', go); bar.append(b); return b; };
        const menu = btn('Menu', () => closeChannel());
        const start = btn('Start', () => { const c = S.channel; closeChannel(true); ch.start(c.item); });
        if (!item && !ch.id.startsWith('library-')) start.classList.add('pz-disabled');  // nothing to play yet
        panel.append(bar);
        z.append(panel);
        S.channel = { el: z, tile: t, buttons: [menu, start], item };
        S.root.setAttribute('data-pz-channel', ch.id);
        T._engine.focus(start.classList.contains('pz-disabled') ? menu : start);
    }

    function closeChannel(leaving) {
        if (!S || !S.channel) return false;
        const { el: z, tile: t } = S.channel;
        S.channel = null;
        S.root.removeAttribute('data-pz-channel');
        if (leaving) { z.remove(); return true; }
        // Zoom back out to the tile.
        const r = t.getBoundingClientRect(), root = S.root.getBoundingClientRect();
        z.textContent = '';
        Object.assign(z.style, { left: `${r.left - root.left}px`, top: `${r.top - root.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: '' });
        S.root.setAttribute('data-pz-zoom', 'out');
        setTimeout(() => { z.remove(); if (S) S.root.removeAttribute('data-pz-zoom'); }, ui.motion.duration(ZOOM_MS) + 30);
        T._engine.focus(t);
        return true;
    }

    // Fills the paged grid. Also on the screen root as plazaFill, so tests can load several pages.
    function fill(list) {
        S.pages.textContent = '';
        const slots = [...list];
        while (slots.length % PER_PAGE || !slots.length) slots.push(null);  // empty channel slots, like the target
        S.grid = ui.pagedGrid(S.pages, slots, {
            cols: 4, rows: 3, gap: '2.2vh 1.6vw', render: (ch) => tile(ch),
            onPage: (p) => {
                if (!S) return;
                S.root.setAttribute('data-pz-page', `${p + 1}/${S.grid ? S.grid.pages() : 1}`);
                S.arrows[0].classList.toggle('pz-hidden', p === 0);
                S.arrows[1].classList.toggle('pz-hidden', !S.grid || p >= S.grid.pages() - 1);
            }
        });
        S.root.setAttribute('data-pz-page', `${S.grid.page() + 1}/${S.grid.pages()}`);
        S.arrows[1].classList.toggle('pz-hidden', S.grid.pages() <= 1);
        S.root.setAttribute('data-pz-ready', String(list.length));
    }

    T.registerScreen('#/home', {
        // The grid, the arrows and the bottom bar use the engine's spatial focus (beam-first), with pagedGrid turning
        // pages at the left and right edges. A channel screen is modal: left/right between Menu and Start, Back zooms out.
        onAction(action, ctx) {
            if (!S) return false;
            if (S.zooming) return true;
            if (S.channel) {
                const i = S.channel.buttons.indexOf(ctx.focused());
                if (action === 'back') { closeChannel(); ctx.sound('back'); return true; }
                if ((action === 'left' || action === 'right') && i >= 0) {
                    const n = S.channel.buttons[i + (action === 'right' ? 1 : -1)];
                    if (n && !n.classList.contains('pz-disabled')) ctx.focus(n);
                    return true;
                }
                if (action === 'enter' && i >= 0 && S.channel.buttons[i].classList.contains('pz-disabled')) return true;
                return action === 'up' || action === 'down';
            }
            return false;
        },
        mount(root) {
            root.setAttribute('data-pz', 'home');
            ui.pointerFirst(true);
            S = { client: window.ApiClient, root, channel: null, zooming: false };
            const stage = el('div', 'pz-stage');
            const prev = el('div', 'pz-arrow pz-prev pz-hidden', '‹');
            const next = el('div', 'pz-arrow pz-next pz-hidden', '›');
            prev.addEventListener('click', () => S && S.grid && S.grid.go(S.grid.page() - 1));
            next.addEventListener('click', () => S && S.grid && S.grid.go(S.grid.page() + 1));
            S.arrows = [prev, next];
            S.pages = el('div', 'pz-pages');
            stage.append(prev, S.pages, next);

            // Bottom bar: a round button each side, the clock and date between them.
            const bar = el('div', 'pz-bar');
            const round = (label, cls, go) => { const b = el('div', 'pz-round ' + cls, label); b.setAttribute('data-icefin-focus', ''); b.tabIndex = -1; b.addEventListener('click', go); return b; };
            const clock = el('div', 'pz-clock'), date = el('div', 'pz-date');
            const tick = () => {
                const d = new Date();
                clock.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                date.textContent = d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
            };
            tick();
            S.clockTimer = setInterval(tick, 15000);
            const mid = el('div', 'pz-bar-mid');
            mid.append(clock, date);
            bar.append(round('icefin', 'pz-left', () => { location.hash = '#/mypreferencesmenu'; }), mid, round('✉', 'pz-right', () => { location.hash = '#/search'; }));
            bar.lastChild.setAttribute('aria-label', 'Search');
            bar.firstChild.setAttribute('aria-label', 'Settings');
            root.append(stage, bar);
            root.plazaFill = (list) => fill(list);

            const client = S.client;
            ui.userViews().then((views) => {
                if (!S) return;
                fill(channels(client, views));
                const first = S.pages.querySelector('.pz-tile');
                if (first) T._engine.focus(first);
            });
        },
        unmount() {
            if (!S) return;
            clearInterval(S.clockTimer);
            ui.pointerFirst(false);
            S = null;
        }
    });
})();
