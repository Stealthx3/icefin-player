// Harbor (benchmark theme, PLAN 9.4; its target is named in docs/PLAN.md). Built from the engine's generic capabilities
// only: the side-rail chrome slot holds the persistent main menu, the screen fills the content area with the focused
// section's categories row and shelves over a full-screen fanart layer, and an info dialog opens on a poster. Every
// other route is jellyfin-web's own page, styled by this theme's tokens. Geometry and timing follow the target's
// measurements (docs/themes/references/harbor.json, checked by tests/icefin/web/clone_layout.py).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const tags = (it) => it.ImageTags || {};

    // ---- data ----
    const FIELDS = 'PrimaryImageAspectRatio,Overview,ProductionYear,RunTimeTicks,OfficialRating,CommunityRating,UserData';
    async function shelvesFor(client, section) {
        const uid = client.getCurrentUserId();
        const want = [];
        const add = (title, p) => want.push(Promise.resolve(p).then((r) => ({ title, items: (r && (r.Items || r)) || [] }), () => ({ title, items: [] })));
        const pid = section.view && section.view.Id;
        const kind = section.view ? section.view.CollectionType : 'home';
        if (kind === 'home') {
            add('In progress', client.getResumableItems(uid, { Limit: 16, MediaTypes: 'Video', Fields: FIELDS }));
            add('Next up', client.getNextUpEpisodes({ UserId: uid, Limit: 16, Fields: FIELDS }));
            add('Recently added', client.getLatestItems({ userId: uid, Limit: 16, Fields: FIELDS }));
        } else if (kind === 'movies') {
            add('In progress', client.getResumableItems(uid, { ParentId: pid, Limit: 16, Fields: FIELDS }));
            add('Recently added', client.getLatestItems({ userId: uid, parentId: pid, Limit: 16, Fields: FIELDS }));
            add('Unwatched', client.getItems(uid, { ParentId: pid, Recursive: true, IncludeItemTypes: 'Movie', Filters: 'IsUnplayed', SortBy: 'Random', Limit: 16, Fields: FIELDS }));
        } else if (kind === 'tvshows') {
            add('Next up', client.getNextUpEpisodes({ UserId: uid, ParentId: pid, Limit: 16, Fields: FIELDS }));
            add('In progress', client.getResumableItems(uid, { ParentId: pid, Limit: 16, Fields: FIELDS }));
            add('Recently added', client.getLatestItems({ userId: uid, parentId: pid, Limit: 16, Fields: FIELDS }));
        } else {
            add('Recently added', client.getLatestItems({ userId: uid, parentId: pid, Limit: 16, Fields: FIELDS }));
            add('Random', client.getItems(uid, { ParentId: pid, Recursive: true, SortBy: 'Random', Limit: 16, Fields: FIELDS, IncludeItemTypes: kind === 'music' ? 'MusicAlbum' : undefined }));
        }
        return (await Promise.all(want)).filter((s) => s.items.length);
    }

    // The categories row: for Home the libraries, for a library its jellyfin-web tabs (the target's Genres, Titles,
    // Years ... row). Tab numbers are jellyfin-web 10.11's, checked by theme_harbor.py.
    const TABS = {
        movies: [['Titles', 0], ['Suggestions', 1], ['Favourites', 2], ['Collections', 3], ['Genres', 4]],
        tvshows: [['Shows', 0], ['Suggestions', 1], ['Upcoming', 2], ['Genres', 3], ['Networks', 4], ['Episodes', 5]],
        music: [['Albums', 0], ['Album artists', 2], ['Artists', 3], ['Playlists', 4], ['Songs', 5], ['Genres', 6]]
    };
    function categoriesFor(client, section, views) {
        if (!section.view) {  // Home: each library, then Play on and Watch together (9.52; the target keeps such actions in the home's rows)
            const D = window.icefinHarbor;
            const out = views.map((v) => ({ label: v.Name, hash: libraryHash(client, v) }));
            if (D && D.playOn) out.push({ label: 'Play on…', run: () => D.playOn('play', null) }, { label: 'Watch together…', run: () => D.playOn('together', null) });
            return out;
        }
        const v = section.view, tabs = TABS[v.CollectionType];
        if (!tabs) return [{ label: 'All items', hash: libraryHash(client, v) }];
        return tabs.map(([label, tab]) => ({ label, hash: `${libraryHash(client, v)}&tab=${tab}` }));
    }

    function libraryHash(client, v) {
        const sid = client.serverId();
        if (v.CollectionType === 'livetv') return `#/livetv?serverId=${sid}`;  // Harbor's Live TV screen (tv.js), not the folder as a list (QA pre)
        const routes = { movies: 'movies', tvshows: 'tv', music: 'music' };
        return routes[v.CollectionType] ? `#/${routes[v.CollectionType]}?topParentId=${v.Id}&collectionType=${v.CollectionType}&serverId=${sid}` : `#/list?parentId=${v.Id}&serverId=${sid}`;
    }

    function fanartUrl(client, it) {
        if ((it.BackdropImageTags || []).length) return client.getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: 1920, tag: it.BackdropImageTags[0] });
        if ((it.ParentBackdropImageTags || []).length) return client.getScaledImageUrl(it.ParentBackdropItemId, { type: 'Backdrop', maxWidth: 1920, tag: it.ParentBackdropImageTags[0] });
        return '';
    }

    // ---- state shared by the screen and its rail ----
    let S = null;  // { client, root, rail:[el], shelves:[[el]], lastCol:[], zone, dialog, ... } while the screen is up

    function railItem(label, section) {
        const b = el('div', 'hb-rail-item', label);
        b.setAttribute('data-icefin-focus', '');
        b.tabIndex = -1;
        b.harbor = section;
        b.textContent = '';
        b.append(el('span', null, label));
        b.addEventListener('click', () => openSection(section));
        return b;
    }

    function openSection(section) {
        if (!S) return;
        if (section.hash) { location.hash = section.hash; return; }
        if (section.view) { location.hash = libraryHash(S.client, section.view); return; }
        enterContent();  // Home: Enter goes into its shelves
    }

    // Harbor moves its shelves and menu itself (transforms, timed like the target); the browser's own scroll-into-view on
    // focus would add a jump on top, so these views stay pinned at 0. A scroll that happens anyway (scrollIntoView from
    // assistive tech, a pointer reaching for an entry out of view) is folded into the transform at once, so what it
    // brought into view stays where it was brought (QA pre: the reset slid the menu and the rows back under the pointer
    // and the click landed on a neighbour).
    function pin(view, fold) {
        view.addEventListener('scroll', () => {
            const x = view.scrollLeft, y = view.scrollTop;
            if (!x && !y) return;
            view.scrollTop = 0;
            view.scrollLeft = 0;
            if (fold && S) fold(x, y);
        });
    }
    // a transform set without its transition (a fold must not slide)
    function still(e, tf) {
        e.style.transition = 'none';
        e.style.transform = tf;
        void e.offsetWidth;
        e.style.transition = '';
    }
    // the pointer's wheel steps the menu or the shelves, one step a notch (pointer-first, checklist 2.5)
    function wheel(view, step) {
        let acc = 0;
        view.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (!S || !S.rail) return;
            const horiz = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
            acc += horiz ? (e.deltaX || e.deltaY) : e.deltaY;
            if (Math.abs(acc) < 40) return;
            const d = acc > 0 ? 1 : -1;
            acc = 0;
            step(d, horiz);
        }, { passive: false });
    }

    ui.chrome.set('sideRail', {
        width: '24.0625vw',  // 462 of 1920
        async mount(rail) {
            // where the target shows its own logo: the server's banner, else its icon and name (PLAN 9.27, D39)
            const brand = el('div', 'hb-brand', 'IceFin Player');
            rail.append(brand);
            if (ui.brand) ui.brand().then((b) => {
                if (!b || !brand.isConnected) return;
                if (b.banner) { const img = el('img', 'hb-brand-banner'); img.alt = b.name || ''; img.src = b.banner; brand.replaceChildren(img); }
                else if (b.icon || b.name) { brand.replaceChildren(); if (b.icon) { const img = el('img', 'hb-brand-icon'); img.alt = ''; img.src = b.icon; brand.append(img); } brand.append(el('span', 'hb-brand-name', b.name || 'IceFin Player')); }
            }).catch(() => {});
            const view = el('div', 'hb-rail-view');
            pin(view, (x, y) => {
                if (!y || !S.railList) return;
                S.railShift = Math.max(0, (S.railShift || 0) + y);
                still(S.railList, S.railShift ? `translateY(${-S.railShift}px)` : '');
            });
            wheel(view, (d) => {
                const n = S.railIndex + d;
                if (n < 0 || n >= S.rail.length) return;
                focusRail(n);
                T.ctx.sound('focus');
            });
            const list = el('div', 'hb-rail-list');
            view.append(list);
            rail.append(view);
            const views = await T.ui.userViews();
            const client = T.ctx.apiClient();  // a cold start creates the client late: read it after userViews
            const sections = [{ label: 'Home' }];
            for (const v of views) sections.push({ label: v.Name, view: v });
            sections.push({ label: 'Search', hash: '#/search' }, { label: 'Settings', hash: '#/mypreferencesmenu' }, { label: 'Classic home', hash: '#/home?icefin=stock' });
            if (!S) return;
            S.client = client;
            S.views = views;
            S.railList = list;
            S.rail = sections.map((s) => { const b = railItem(s.label, s); list.append(b); return b; });
            S.ready();
        }
    });

    // ---- shelves ----
    function poster(item) {
        const wide = item.Type === 'Episode';
        const t = el('div', 'hb-poster' + (wide ? ' wide' : ''));
        t.setAttribute('data-icefin-focus', '');
        t.tabIndex = -1;
        t.harborItem = item;
        const type = wide && tags(item).Thumb ? 'Thumb' : 'Primary';
        if (tags(item)[type]) {
            t.style.backgroundImage = `url("${S.client.getScaledImageUrl(item.Id, { type, maxHeight: 420, tag: tags(item)[type] })}")`;
            t.classList.add('has-art');
        }
        const ticks = item.UserData && item.UserData.PlaybackPositionTicks;
        if (ticks && item.RunTimeTicks) {
            const bar = el('div', 'hb-progress');
            bar.style.setProperty('--p', `${Math.min(100, (100 * ticks) / item.RunTimeTicks).toFixed(1)}%`);
            t.append(bar);
        }
        const name = item.Type === 'Episode' ? `${item.SeriesName || ''} · ${item.Name}` : item.Name;
        t.setAttribute('aria-label', name);
        t.append(el('div', 'hb-caption', name));
        t.addEventListener('click', () => { const D = window.icefinHarbor; if (D && D.openItem) { T.ctx.sound('select'); D.openItem(item, t); } else openInfo(item); });  // 9.52: the shared details page
        return t;
    }

    function tile(cat) {
        const t = el('div', 'hb-tile');
        t.setAttribute('data-icefin-focus', '');
        t.setAttribute('aria-label', cat.label);
        t.tabIndex = -1;
        t.append(el('div', 'hb-tile-mark', cat.label.charAt(0)), el('div', 'hb-tile-label', cat.label));
        t.addEventListener('click', () => { if (cat.run) cat.run(); else location.hash = cat.hash; });
        return t;
    }

    let renderGen = 0;
    async function renderSection(section) {
        const gen = ++renderGen;
        S.section = section;
        S.shelfIndex = 0;
        S.shelfShift = 0;
        S.content.setAttribute('data-hb-section', section.label);
        if (section.hash) {  // a link entry: no shelves
            S.shelfBox.textContent = '';
            S.shelves = [];
            S.shelfBox.append(el('div', 'hb-empty', section.label === 'Classic home' ? 'The stock home page, with plugin sections' : `Open ${section.label}`));
            S.content.setAttribute('data-hb-ready', '0');
            return;
        }
        const shelves = await shelvesFor(S.client, section);
        if (!S || gen !== renderGen) return;
        S.shelfBox.textContent = '';
        S.shelfBox.classList.remove('hb-fade');
        void S.shelfBox.offsetWidth;
        S.shelfBox.classList.add('hb-fade');
        S.shelfBox.style.transform = '';
        const cats = categoriesFor(S.client, section, S.views || []);
        const rows = (cats.length ? [{ title: 'Categories', cats }] : []).concat(shelves);
        S.shelves = rows.map((s) => {
            const sec = el('section', 'hb-shelf' + (s.cats ? ' cats' : ''));
            sec.append(el('div', 'hb-shelf-title', s.title));
            const row = el('div', 'hb-row');
            if (s.cats) s.cats.forEach((c) => row.append(tile(c)));
            else s.items.forEach((it) => row.append(poster(it)));
            sec.append(row);
            S.shelfBox.append(sec);
            return [...row.children];
        });
        S.lastCol = S.shelves.map(() => 0);
        S.firstCol = S.shelves.map(() => 0);
        S.rowPx = [];
        if (!shelves.length) S.shelfBox.append(el('div', 'hb-empty', 'Nothing here yet'));
        const first = S.shelves.flat().find((t) => t.harborItem);
        setFanart(first ? first.harborItem : null);
        S.content.setAttribute('data-hb-ready', String(S.shelves.length));
    }

    // ---- fanart layer: two stacked images that cross-fade ----
    let fanartTimer = null;
    function setFanart(item) {
        clearTimeout(fanartTimer);
        const url = item ? fanartUrl(S.client, item) : '';
        fanartTimer = setTimeout(() => {
            if (!S || S.fanartUrl === url) return;
            S.fanartUrl = url;
            const [a, b] = S.fanart;
            b.style.backgroundImage = url ? `url("${url}")` : 'none';
            b.classList.add('on');
            a.classList.remove('on');
            S.fanart = [b, a];
            S.root.setAttribute('data-hb-fanart', url ? 'item' : 'none');
        }, ui.motion.duration(220));
    }

    // ---- focus moves ----
    function focusRail(i) {
        i = Math.max(0, Math.min(S.rail.length - 1, i));
        S.zone = 'rail';
        S.railIndex = i;
        T.ctx.focus(S.rail[i]);
        S.rail.forEach((b, k) => b.classList.toggle('current', k === i));
        // The menu scrolls only when the focused entry would leave it (the target's list, 500 ms cubic out).
        const view = S.railList.parentElement.offsetHeight, item = S.rail[i], cur = S.railShift || 0;
        let shift = cur;
        if (item.offsetTop - shift < 0) shift = item.offsetTop;
        else if (item.offsetTop + item.offsetHeight - shift > view) shift = item.offsetTop + item.offsetHeight - view;
        S.railShift = shift;
        S.railList.style.transform = shift ? `translateY(${-shift}px)` : '';
        clearTimeout(S.sectionTimer);
        if (S.section !== S.rail[i].harbor) S.sectionTimer = setTimeout(() => renderSection(S.rail[i].harbor), ui.motion.duration(250));
    }

    function focusPoster(r, c) {
        const row = S.shelves[r];
        c = Math.max(0, Math.min(row.length - 1, c));
        S.zone = 'content';
        S.shelfIndex = r;
        S.lastCol[r] = c;
        const t = row[c];
        T.ctx.focus(t);
        // Like the target's group list: shelves scroll only as far as it takes to show the focused one whole, its bottom
        // no lower than 920/1080 of the screen.
        const box = S.shelfBox, shelf = t.closest('.hb-shelf');
        const limit = box.parentElement.offsetHeight * (920 / 1080), cur = S.shelfShift || 0;
        let shift = cur;
        if (shelf.offsetTop - shift < 0) shift = shelf.offsetTop;
        else if (shelf.offsetTop + shelf.offsetHeight - shift > limit) shift = shelf.offsetTop + shelf.offsetHeight - limit;
        S.shelfShift = Math.max(0, shift);
        box.style.transform = S.shelfShift ? `translateY(${-Math.round(S.shelfShift)}px)` : '';
        // Rows move focus across the visible slots and scroll a slot at a time at the edges.
        const rowEl = t.parentElement, pitch = row.length > 1 ? row[1].offsetLeft - row[0].offsetLeft : t.offsetWidth;
        const slots = Math.max(1, Math.floor((rowEl.parentElement.offsetWidth - rowEl.offsetLeft) / pitch));
        let f = S.firstCol[r] || 0;
        if (S.rowPx && S.rowPx[r] != null) { f = Math.max(0, Math.round(S.rowPx[r] / pitch)); S.rowPx[r] = null; }  // a folded scroll (pin)
        if (c < f) f = c;
        else if (c >= f + slots) f = c - slots + 1;
        S.firstCol[r] = f;
        rowEl.style.transform = f ? `translateX(${-Math.round(f * pitch)}px)` : '';
        if (t.harborItem) setFanart(t.harborItem);
    }

    // Focus that arrived another way (the pointer's hover through pointerFirst, a click): the menu and the shelves take
    // it as their own, without moving anything under the pointer, so Back, the arrows and the wheel go on from there.
    function adopt(t) {
        if (!S || !S.rail || !t) return;
        const ri = S.rail.indexOf(t);
        if (ri >= 0) {
            if (S.zone === 'rail' && S.railIndex === ri) return;
            S.zone = 'rail';
            S.railIndex = ri;
            S.rail.forEach((b, k) => b.classList.toggle('current', k === ri));
            clearTimeout(S.sectionTimer);
            if (S.section !== t.harbor) S.sectionTimer = setTimeout(() => { if (S && S.rail && S.rail[S.railIndex] === t) renderSection(t.harbor); }, ui.motion.duration(250));
            return;
        }
        const r = S.shelves.findIndex((row) => row.includes(t));
        if (r < 0) return;
        S.zone = 'content';
        S.shelfIndex = r;
        S.lastCol[r] = S.shelves[r].indexOf(t);
        if (t.harborItem) setFanart(t.harborItem);
    }

    // ---- Back to the home lands where you left it (QA pre): the menu entry, and the shelf and poster or category ----
    // Kept for the session (the theme loading again starts fresh); a library that is gone or a poster no longer on its
    // shelf falls back to the menu's first entry or the shelf's same place.
    let homeMemo = null;
    function rememberHome() {
        if (!S || !S.rail) return;
        const r = S.shelfIndex || 0, row = S.shelves[r] || [];
        const t = S.zone === 'content' ? row[S.lastCol[r] || 0] : null;
        homeMemo = { label: S.rail[S.railIndex] ? S.rail[S.railIndex].harbor.label : '', zone: S.zone, r, c: S.lastCol[r] || 0, lastCol: S.lastCol.slice(),
            id: t && t.harborItem ? t.harborItem.Id : '', tile: t && !t.harborItem ? t.getAttribute('aria-label') : '' };
    }
    function restoreShelf(m, i) {
        if (!S || !S.rail || !S.shelves.length || S.section !== S.rail[i].harbor || T.ctx.focused() !== S.rail[i]) return;  // the user moved on
        S.lastCol = S.shelves.map((row, k) => Math.max(0, Math.min(row.length - 1, (m.lastCol && m.lastCol[k]) || 0)));
        const find = (pred) => {
            const order = [Math.min(m.r, S.shelves.length - 1)].concat(S.shelves.map((_, k) => k));
            for (const k of order) { const j = S.shelves[k].findIndex(pred); if (j >= 0) return [k, j]; }
            return null;
        };
        const hit = (m.id && find((t) => t.harborItem && t.harborItem.Id === m.id)) || (m.tile && find((t) => !t.harborItem && t.getAttribute('aria-label') === m.tile));
        const [r, c] = hit || [Math.min(m.r, S.shelves.length - 1), m.c];
        focusPoster(r, c);
    }

    function enterContent() {
        if (!S.shelves.length) return false;
        const r = Math.min(S.shelfIndex || 0, S.shelves.length - 1);  // the categories row first, as on the target
        focusPoster(r, S.lastCol[r] || 0);
        return true;
    }

    // ---- info dialog ----
    // Media items, and containers jellyfin-web plays as a queue (albums, series, seasons, collections, playlists).
    const playable = (it) => !!it.MediaType || ['MusicAlbum', 'MusicArtist', 'Series', 'Season', 'BoxSet', 'Playlist'].includes(it.Type);
    function openInfo(item) {
        closeInfo();
        const c = S.client;
        const d = el('div', 'hb-info');
        d.setAttribute('role', 'dialog');
        const box = el('div', 'hb-info-box');
        const art = el('div', 'hb-info-art');
        if (tags(item).Primary) art.style.backgroundImage = `url("${c.getScaledImageUrl(item.Id, { type: 'Primary', maxHeight: 600, tag: tags(item).Primary })}")`;
        const text = el('div', 'hb-info-text');
        text.append(el('h2', 'hb-info-title', item.Type === 'Episode' ? `${item.SeriesName || ''}: ${item.Name}` : item.Name));
        const meta = [item.ProductionYear, item.OfficialRating, item.RunTimeTicks >= 600000000 ? `${Math.round(item.RunTimeTicks / 600000000)} min` : null,
            item.CommunityRating ? `★ ${item.CommunityRating.toFixed(1)}` : null].filter(Boolean).join('  ·  ');
        text.append(el('div', 'hb-info-meta', meta), el('p', 'hb-info-overview', item.Overview || ''));
        const buttons = el('div', 'hb-info-buttons');
        const btn = (label, go) => { const b = el('div', 'hb-button', label); b.setAttribute('data-icefin-focus', ''); b.tabIndex = -1; b.addEventListener('click', go); buttons.append(b); return b; };
        const ticks = item.UserData && item.UserData.PlaybackPositionTicks;
        if (T.ctx.canPlay() && playable(item)) {
            if (ticks) btn('Resume', () => { closeInfo(); T.ctx.play({ ids: [item.Id], serverId: c.serverId(), startPositionTicks: ticks }); });
            btn(ticks ? 'Play from start' : 'Play', () => { closeInfo(); T.ctx.play({ ids: [item.Id], serverId: c.serverId(), startPositionTicks: 0 }); });
        }
        btn('More info', () => { closeInfo(); location.hash = `#/details?id=${item.Id}&serverId=${c.serverId()}`; });
        text.append(buttons);
        box.append(art, text);
        d.append(box);
        S.root.append(d);
        S.dialog = { el: d, buttons: [...buttons.children], from: T.ctx.focused() };
        S.root.setAttribute('data-hb-dialog', 'info');
        T.ctx.focus(S.dialog.buttons[0]);
    }

    function closeInfo() {
        if (!S || !S.dialog) return false;
        const from = S.dialog.from;
        S.dialog.el.remove();
        S.dialog = null;
        S.root.removeAttribute('data-hb-dialog');
        if (from && from.isConnected) T.ctx.focus(from);
        return true;
    }

    // ---- the home screen ----
    T.registerScreen('#/home', {
        // Structured navigation, like the target: the menu is a column; right enters the shelves; left from a shelf's
        // first poster (or Back) returns to the menu; up/down change shelf and each shelf keeps its own column.
        onAction(action, ctx) {
            if (!S || !S.rail) return false;
            const f = ctx.focused();
            const D = window.icefinHarbor;  // 9.52: the shared item menu, play and exit
            if (D && f && f.harborItem && !S.dialog) {
                if (action === 'menu' && D.itemMenu) { D.itemMenu(f.harborItem, {}); return true; }
                if ((action === 'play_pause' || action === 'playpause') && D.playable(f.harborItem)) { ctx.sound('select'); D.playItem(f.harborItem, true); return true; }
            }
            if (S.dialog) {
                const i = S.dialog.buttons.indexOf(f);
                if (action === 'back') { closeInfo(); ctx.sound('back'); return true; }
                if ((action === 'left' || action === 'right') && i >= 0) {
                    const n = i + (action === 'right' ? 1 : -1);
                    if (n >= 0 && n < S.dialog.buttons.length) ctx.focus(S.dialog.buttons[n]);
                    return true;
                }
                return action === 'up' || action === 'down';  // modal: Enter falls through to the engine (click)
            }
            const ri = S.rail.indexOf(f);
            if (ri >= 0) {
                if (action === 'up' || action === 'down') { focusRail(ri + (action === 'down' ? 1 : -1)); ctx.sound('focus'); return true; }
                if (action === 'right') {
                    if (S.section !== S.rail[ri].harbor) return true;  // still loading this section
                    if (enterContent()) ctx.sound('focus');
                    return true;
                }
                if (action === 'back' && D && D.exitAsk) { D.exitAsk(); return true; }
                return action === 'left';
            }
            const r = S.shelves.findIndex((row) => row.includes(f));
            if (r < 0) return false;
            const c = S.shelves[r].indexOf(f);
            if (action === 'back' || (action === 'left' && c === 0)) { focusRail(S.railIndex); ctx.sound(action === 'back' ? 'back' : 'focus'); return true; }
            if (action === 'left' || action === 'right') { focusPoster(r, c + (action === 'right' ? 1 : -1)); ctx.sound('focus'); return true; }
            if (action === 'up' || action === 'down') {
                const n = r + (action === 'down' ? 1 : -1);
                if (n >= 0 && n < S.shelves.length) { focusPoster(n, S.lastCol[n] || 0); ctx.sound('focus'); }
                return true;
            }
            return false;
        },
        levelBack() { return closeInfo(); },  // the mouse's Back closes the open info card in place (QA Harbor 1)
        mount(root, ctx) {
            root.setAttribute('data-hb', 'home');
            const fan = [el('div', 'hb-fanart'), el('div', 'hb-fanart')];
            root.append(...fan, el('div', 'hb-scrim'));
            const clock = el('div', 'hb-clock');
            const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
            tick();
            S = { client: T.ctx.apiClient(), root, fanart: fan, rail: null, shelves: [], lastCol: [], firstCol: [], railIndex: 0, shelfIndex: 0, zone: 'rail',
                clockTimer: setInterval(tick, 15000) };
            const content = ui.chrome.frame(root, ctx);
            const shelfView = el('div', 'hb-shelves');
            pin(shelfView, (x, y) => {
                if (y) {
                    S.shelfShift = Math.max(0, (S.shelfShift || 0) + y);
                    still(S.shelfBox, S.shelfShift ? `translateY(${-Math.round(S.shelfShift)}px)` : '');
                }
                if (x) S.shelves.forEach((row, r) => {
                    const rowEl = row[0] && row[0].parentElement;
                    if (!rowEl) return;
                    const pitch = row.length > 1 ? row[1].offsetLeft - row[0].offsetLeft : row[0].offsetWidth;
                    const px = (S.rowPx[r] != null ? S.rowPx[r] : (S.firstCol[r] || 0) * pitch) + x;
                    S.rowPx[r] = px;
                    still(rowEl, px ? `translateX(${-Math.round(px)}px)` : '');
                });
            });
            wheel(shelfView, (d, horiz) => {
                const f = T.ctx.focused();
                const r = S.shelves.findIndex((row) => row.includes(f));
                if (r < 0) { if (enterContent()) T.ctx.sound('focus'); return; }
                const c = S.shelves[r].indexOf(f) + d;
                if (horiz && c >= 0 && c < S.shelves[r].length) focusPoster(r, c);
                else if (!horiz && r + d >= 0 && r + d < S.shelves.length) focusPoster(r + d, S.lastCol[r + d] || 0);
                else return;
                T.ctx.sound('focus');
            });
            S.shelfBox = el('div', 'hb-shelf-box');
            shelfView.append(S.shelfBox);
            content.append(clock, shelfView);
            S.content = content;
            S.rowPx = [];
            root.addEventListener('icefin-focus', (e) => adopt(e.target));
            root.addEventListener('click', (e) => adopt(e.target.closest && e.target.closest('[data-icefin-focus]')), true);
            S.ready = () => {
                root.setAttribute('data-hb-rail', String(S.rail.length));
                const m = homeMemo;
                homeMemo = null;
                const i = Math.max(0, m ? S.rail.findIndex((b) => b.harbor.label === m.label) : 0);
                const drawn = renderSection(S.rail[i].harbor);
                focusRail(i);
                if (m && m.zone === 'content') drawn.then(() => restoreShelf(m, i));
            };
        },
        unmount() {
            if (!S) return;
            rememberHome();
            clearInterval(S.clockTimer);
            clearTimeout(S.sectionTimer);
            clearTimeout(fanartTimer);
            S = null;
        }
    });
})();
