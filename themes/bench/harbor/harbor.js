// Harbor (benchmark theme, PLAN 9.4; its target is named in docs/PLAN.md). Built from the engine's generic capabilities
// only: the side-rail chrome slot holds the persistent main menu, the screen fills the content area with the focused
// section's shelves over a full-screen fanart layer, and an info dialog opens on a poster. Every other route is
// jellyfin-web's own page, styled by this theme's tokens.
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

    function libraryHash(client, v) {
        const sid = client.serverId();
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
        b.addEventListener('click', () => openSection(section));
        return b;
    }

    function openSection(section) {
        if (!S) return;
        if (section.hash) { location.hash = section.hash; return; }
        if (section.view) { location.hash = libraryHash(S.client, section.view); return; }
        enterContent();  // Home: Enter goes into its shelves
    }

    ui.chrome.set('sideRail', {
        width: '19vw',
        async mount(rail) {
            rail.append(el('div', 'hb-brand', 'Icefin'));
            const list = el('div', 'hb-rail-list');
            rail.append(list);
            const client = window.ApiClient;
            const sections = [{ label: 'Home' }];
            for (const v of await T.ui.userViews()) sections.push({ label: v.Name, view: v });
            sections.push({ label: 'Search', hash: '#/search' }, { label: 'Settings', hash: '#/mypreferencesmenu' }, { label: 'Classic home', hash: '#/home?icefin=stock' });
            if (!S) return;
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
        if (tags(item)[type]) t.style.backgroundImage = `url("${S.client.getScaledImageUrl(item.Id, { type, maxHeight: 420, tag: tags(item)[type] })}")`;
        const ticks = item.UserData && item.UserData.PlaybackPositionTicks;
        if (ticks && item.RunTimeTicks) {
            const bar = el('div', 'hb-progress');
            bar.style.setProperty('--p', `${Math.min(100, (100 * ticks) / item.RunTimeTicks).toFixed(1)}%`);
            t.append(bar);
        }
        t.append(el('div', 'hb-caption', item.Type === 'Episode' ? `${item.SeriesName || ''} · ${item.Name}` : item.Name));
        t.addEventListener('click', () => openInfo(item));
        return t;
    }

    let renderGen = 0;
    async function renderSection(section) {
        const gen = ++renderGen;
        S.section = section;
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
        S.shelves = shelves.map((s) => {
            const sec = el('section', 'hb-shelf');
            sec.append(el('div', 'hb-shelf-title', s.title));
            const row = el('div', 'hb-row');
            s.items.forEach((it) => row.append(poster(it)));
            sec.append(row);
            S.shelfBox.append(sec);
            return [...row.children];
        });
        S.lastCol = S.shelves.map(() => 0);
        if (!S.shelves.length) S.shelfBox.append(el('div', 'hb-empty', 'Nothing here yet'));
        const first = S.shelves[0] && S.shelves[0][0];
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
        T._engine.focus(S.rail[i]);
        S.rail.forEach((b, k) => b.classList.toggle('current', k === i));
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
        T._engine.focus(t);
        // Keep the focused shelf on the second line and the focused poster in view.
        const box = S.shelfBox, shelf = t.closest('.hb-shelf');
        box.style.transform = `translateY(${-Math.max(0, shelf.offsetTop - box.parentElement.offsetHeight * 0.18)}px)`;
        const rowEl = t.parentElement, view = rowEl.parentElement.offsetWidth;
        const x = Math.max(0, Math.min(t.offsetLeft - view * 0.08, rowEl.scrollWidth - view));
        rowEl.style.transform = `translateX(${-Math.round(x)}px)`;
        setFanart(t.harborItem);
    }

    function enterContent() {
        if (!S.shelves.length) return false;
        const r = Math.min(S.shelfIndex || 0, S.shelves.length - 1);
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
        const pm = window.icefinPlaybackManager;
        const ticks = item.UserData && item.UserData.PlaybackPositionTicks;
        if (pm && playable(item)) {
            if (ticks) btn('Resume', () => { closeInfo(); pm.play({ ids: [item.Id], serverId: c.serverId(), startPositionTicks: ticks }); });
            btn(ticks ? 'Play from start' : 'Play', () => { closeInfo(); pm.play({ ids: [item.Id], serverId: c.serverId(), startPositionTicks: 0 }); });
        }
        btn('More info', () => { closeInfo(); location.hash = `#/details?id=${item.Id}&serverId=${c.serverId()}`; });
        text.append(buttons);
        box.append(art, text);
        d.append(box);
        S.root.append(d);
        S.dialog = { el: d, buttons: [...buttons.children], from: T._engine.focused() };
        S.root.setAttribute('data-hb-dialog', 'info');
        T._engine.focus(S.dialog.buttons[0]);
    }

    function closeInfo() {
        if (!S || !S.dialog) return false;
        const from = S.dialog.from;
        S.dialog.el.remove();
        S.dialog = null;
        S.root.removeAttribute('data-hb-dialog');
        if (from && from.isConnected) T._engine.focus(from);
        return true;
    }

    // ---- the home screen ----
    T.registerScreen('#/home', {
        // Structured navigation, like the target: the menu is a column; right enters the shelves; left from a shelf's
        // first poster (or Back) returns to the menu; up/down change shelf and each shelf keeps its own column.
        onAction(action, ctx) {
            if (!S || !S.rail) return false;
            const f = ctx.focused();
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
        mount(root, ctx) {
            root.setAttribute('data-hb', 'home');
            const fan = [el('div', 'hb-fanart'), el('div', 'hb-fanart')];
            root.append(...fan, el('div', 'hb-scrim'));
            const clock = el('div', 'hb-clock');
            const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
            tick();
            S = { client: window.ApiClient, root, fanart: fan, rail: null, shelves: [], lastCol: [], railIndex: 0, shelfIndex: 0, zone: 'rail',
                clockTimer: setInterval(tick, 15000) };
            const content = ui.chrome.frame(root, ctx);
            const shelfView = el('div', 'hb-shelves');
            S.shelfBox = el('div', 'hb-shelf-box');
            shelfView.append(S.shelfBox);
            content.append(clock, shelfView);
            S.content = content;
            S.ready = () => { root.setAttribute('data-hb-rail', String(S.rail.length)); renderSection(S.rail[0].harbor); focusRail(0); };
        },
        unmount() {
            if (!S) return;
            clearInterval(S.clockTimer);
            clearTimeout(S.sectionTimer);
            clearTimeout(fanartTimer);
            S = null;
        }
    });
})();
