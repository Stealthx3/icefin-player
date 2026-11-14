// Media Center: the item menu and its dialogs (PLAN 9.60; the canvas's ItemMenu, AddToPlaylist, MediaInfo, EditMetadata,
// SubtitleSearch and ConfirmDelete boards, and the "Pass 9.60" page's PlayOn board). More options on details and ≡ on
// any item open the menu in the side panel (panel.js): the item's name and kind at the top, its actions under section
// heads (play, go, organise, info, manage), the first focused. What the user may do and the server calls are the
// engine's (ui.items, 9.60); everything here is how Media Center shows it. A dialog replaces the panel's content in
// place; Delete asks first in a band across the screen with "Keep it" focused.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    if (!T || !T.ui || !T.ui.items || !M || !M.panel) return;
    const I = T.ui.items;
    const el = M.el;
    const KIND = { Movie: 'movie', Episode: 'episode', Series: 'series', Season: 'season', MusicAlbum: 'album', MusicArtist: 'artist', Audio: 'song',
        Playlist: 'playlist', BoxSet: 'collection', Person: 'person', MusicVideo: 'music video', Video: 'video', Book: 'book', Photo: 'picture', TvChannel: 'channel' };
    const SECTIONS = { play: 'play', go: 'go to', organise: 'organise', info: 'info', manage: 'manage' };
    const sub = (it) => [it.ProductionYear, KIND[it.Type] || ''].filter(Boolean).join(' · ');
    const fail = (e) => { console.error('media-center: item menu', e); M.notice('That didn’t work', true); };
    const after = (r) => { if (!r) return; if (r.close) M.panel.close(); if (r.message) M.notice(r.message, !r.ok); };

    async function menu(ref, where) {
        let m;
        try { m = await I.menu(ref, where); } catch (e) { fail(e); return; }
        if (!m.actions.length) { M.notice('Nothing to do with this item', true); return; }
        const item = m.item;
        M.panel.show({
            title: item.Name || 'item', sub: sub(item),
            render(body) {
                let group = null;
                for (const a of m.actions) {
                    if (a.group !== group) { group = a.group; body.append(M.sec(SECTIONS[group] || group)); }
                    const label = a.dialog && a.id !== 'delete' && a.id !== 'mediaInfo' ? `${a.label}…` : a.label;
                    body.append(M.row(label, { danger: a.danger, go: () => act(a, item, where) }));
                }
            }
        });
    }
    async function act(a, item, where) {
        if (!a.dialog) { try { after(await I.run(a.id, item, where)); } catch (e) { fail(e); } return; }
        DIALOGS[a.id](item, where);
    }

    // ---- the dialogs ----
    const DIALOGS = {
        addToPlaylist: (item) => addTo(item, 'Playlist'),
        addToCollection: (item) => addTo(item, 'BoxSet'),
        mediaInfo(item) {
            M.panel.show({
                title: 'media info', sub: item.Name, wide: true,
                render(body) {
                    for (const v of I.mediaInfo(item)) {
                        body.append(M.sec(v.title || 'version'));
                        for (const r of v.rows) body.append(M.row(r.text, { sub: r.type.toLowerCase() }));
                    }
                    body.append(M.foot(M.button('Close', () => M.panel.close(), true)));
                }
            });
        },
        subtitles: (item) => subtitles(item, 0),
        refresh(item) {
            M.panel.show({
                title: 'refresh metadata', sub: item.Name,
                render(body) {
                    for (const mode of I.refreshModes) body.append(M.row(mode.label, { sub: mode.sub, go: async () => {
                        try { await I.refresh(item, mode.id); M.panel.close(); M.notice('Refreshing; it updates when the server is done'); } catch (e) { fail(e); }
                    } }));
                }
            });
        },
        edit: (item) => edit(item),
        images: (item) => images(item, 'Primary'),
        identify: (item) => identify(item),
        removeSubtitles(item) {
            M.panel.show({
                title: 'remove subtitles', sub: item.Name,
                render(body) {
                    body.append(M.note('Pick the subtitles to remove from the server.'));
                    for (const st of I.subtitles.external(item)) body.append(M.row(st.DisplayTitle || st.Language || `Subtitles ${st.Index}`, {
                        sub: st.Path ? st.Path.split('/').pop() : '', danger: true,
                        go: async () => { try { await I.subtitles.remove(item, st); M.panel.close(); M.notice('Subtitles removed'); } catch (e) { fail(e); } }
                    }));
                }
            });
        },
        delete(item) {
            M.panel.close();
            const host = document.getElementById('icefin-theme-root') || document.body;
            M.band(host, {
                title: `Delete ${item.Name}?`,
                text: 'It goes from the server and its files from the disk, for everyone.',
                note: 'This can’t be undone.',
                choices: [{ label: 'Keep it', safe: true }, { label: 'Delete', run: async () => {
                    try { await I.remove(item); M.notice(`Deleted ${item.Name}`); if (/^#\/details/.test(location.hash)) history.back(); } catch (e) { fail(e); }
                } }]
            });
        }
    };

    function addTo(item, type) {
        const word = type === 'Playlist' ? 'playlist' : 'collection';
        M.panel.show({
            title: `add to a ${word}`, sub: item.Name,
            async render(body) {
                body.append(M.note('One moment…'));
                const list = await I.collections(type);
                body.textContent = '';
                body.append(M.sec(`your ${word}s`));
                if (!list.length) body.append(M.note(`No ${word}s yet: name a new one below.`));
                for (const x of list) body.append(M.row(x.Name, { value: x.ChildCount != null ? String(x.ChildCount) : '', go: async () => {
                    try { after(await I.addTo(item, type, x)); M.panel.close(); } catch (e) { fail(e); }
                } }));
                const name = M.field(`a new ${word}, named`, '', { placeholder: type === 'Playlist' ? '[Road trip]' : '[Favourites of the year]' });
                body.append(M.sec('new'), name, M.foot(M.button('Add', async () => {
                    try { const r = await I.createWith(item, type, name.input.value); if (r.ok) M.panel.close(); M.notice(r.message, !r.ok); } catch (e) { fail(e); }
                }, true)));
            }
        });
    }

    function subtitles(item, li) {
        const langs = I.subtitles.languages;
        M.panel.show({
            title: 'find subtitles', sub: item.Name, wide: true,
            async render(body) {
                body.append(M.row('Language', { value: `‹ ${langs[li][1]} ›`, sub: 'select for the next one', go: () => subtitles(item, (li + 1) % langs.length) }));
                const on = I.subtitles.on(item);
                body.append(M.note(on.length ? `On the item now: ${on.slice(0, 6).join(', ')}` : 'The item has no subtitles yet.'), M.sec('found'));
                const wait = M.note('Searching…');
                body.append(wait);
                let r = [];
                try { r = await I.subtitles.search(item, langs[li][0]); } catch (e) { r = []; }
                wait.remove();
                if (!r.length) { body.append(M.note('Nothing in this language. Select Language for the next one.')); return; }
                for (const s of r.slice(0, 30)) {
                    const info = [s.ProviderName, s.Format, s.CommunityRating ? `★ ${Number(s.CommunityRating).toFixed(1)}` : '', s.DownloadCount ? `${s.DownloadCount} downloads` : '', s.IsHashMatch ? 'exact match' : ''].filter(Boolean).join(' · ');
                    body.append(M.row(s.Name || s.Id, { sub: info, value: 'get', go: async () => {
                        try { await I.subtitles.download(item, s); M.panel.close(); M.notice('Downloading the subtitles'); } catch (e) { fail(e); }
                    } }));
                }
            }
        });
    }

    function images(item, type) {
        M.panel.show({
            title: 'edit images', sub: item.Name, wide: true,
            async render(body) {
                const tabs = el('div', 'mc-pivot mc-sp-tabs');
                for (const [t, label] of I.images.types) {
                    const b = M.focusable(el('button', 'mc-pivot-item' + (t === type ? ' on' : ''), label.toLowerCase()));
                    b.type = 'button';
                    b.addEventListener('click', () => images(item, t));
                    tabs.append(b);
                }
                const have = el('div', 'mc-sp-images'), found = el('div', 'mc-sp-images');
                body.append(tabs, M.sec('on the server'), have, M.sec('from the providers'), found);
                const cell = (url, label, go) => {
                    const c = M.focusable(el('div', 'mc-sp-image'));
                    c.style.backgroundImage = `url("${url}")`;
                    c.append(el('span', 'mc-sp-image-label', label));
                    c.setAttribute('role', 'button');
                    c.setAttribute('aria-label', label);
                    c.addEventListener('click', go);
                    return c;
                };
                for (const im of await I.images.list(item, type)) have.append(cell(I.images.url(item, type, im), 'delete', async () => {
                    try { await I.images.remove(item, type, im.ImageIndex); M.notice('Image deleted'); images(item, type); } catch (e) { fail(e); }
                }));
                if (!have.childElementCount) have.append(M.note('None yet.'));
                found.append(M.note('Searching…'));
                let r = [];
                try { r = await I.images.remote(item, type); } catch (e) { r = []; }
                found.textContent = '';
                for (const im of r.slice(0, 24)) found.append(cell(im.ThumbnailUrl || im.Url, [im.ProviderName, im.Width && `${im.Width}×${im.Height}`].filter(Boolean).join(' · '), async () => {
                    try { await I.images.set(item, type, im); M.notice('Image set'); images(item, type); } catch (e) { fail(e); }
                }));
                if (!found.childElementCount) found.append(M.note('The providers have none.'));
            }
        });
    }

    function identify(item) {
        M.panel.show({
            title: 'identify', sub: item.Name, wide: true,
            render(body) {
                const name = M.field('name', item.Name), year = M.field('year', item.ProductionYear || '', { type: 'number' });
                const results = el('div', 'mc-sp-results');
                const search = async () => {
                    results.textContent = '';
                    results.append(M.note('Searching…'));
                    let r = [];
                    try { r = await I.identify.search(item, name.input.value, year.input.value); } catch (e) { r = []; }
                    results.textContent = '';
                    if (!r.length) { results.append(M.note('No matches. Change the name or year and search again.')); return; }
                    for (const m of r.slice(0, 20)) results.append(M.row(m.Name, { sub: [m.ProductionYear, m.SearchProviderName].filter(Boolean).join(' · '), go: async () => {
                        try { await I.identify.apply(item, m); M.panel.close(); M.notice(`Identified as ${m.Name}; the details follow shortly`); } catch (e) { fail(e); }
                    } }));
                    const f = results.querySelector('[data-icefin-focus]');
                    if (f) T.ctx.focus(f);
                };
                body.append(name, year, M.foot(M.button('Search', search, true)), M.sec('matches'), results);
                search();
            }
        });
    }

    // edit details: General, People, IDs and Lock, one Save for all of it (EditMetadata board); Images has its own editor
    function edit(item) {
        M.panel.show({
            title: 'edit details', sub: item.Name, wide: true,
            async render(body) {
                const full = await I.details.read(item);
                const tabs = el('div', 'mc-pivot mc-sp-tabs');
                const panes = {};
                const show = (id) => { for (const [k, p] of Object.entries(panes)) p.hidden = k !== id; for (const b of tabs.children) b.classList.toggle('on', b.dataset.tab === id); };
                const pane = el('div', 'mc-sp-form');
                const tab = (id, label) => {
                    const b = M.focusable(el('button', 'mc-pivot-item', label));
                    b.type = 'button';
                    b.dataset.tab = id;
                    b.addEventListener('click', () => show(id));
                    tabs.append(b);
                    panes[id] = el('div', 'mc-sp-pane');
                    pane.append(panes[id]);
                };
                tab('general', 'general'); tab('people', 'people'); tab('ids', 'ids'); tab('lock', 'lock');
                const f = {
                    Name: M.field('title', full.Name), ForcedSortName: M.field('sort title', full.ForcedSortName || full.SortName), OriginalTitle: M.field('original title', full.OriginalTitle),
                    ProductionYear: M.field('year', full.ProductionYear, { type: 'number' }), OfficialRating: M.field('rating', full.OfficialRating),
                    CommunityRating: M.field('community rating', full.CommunityRating, { type: 'number' }), Genres: M.field('genres, separated by commas', (full.Genres || []).join(', ')),
                    Tags: M.field('tags, separated by commas', (full.Tags || []).join(', '))
                };
                const overview = M.field('overview', full.Overview, { multiline: true });
                panes.general.append(...Object.values(f), overview, M.foot(M.button('Edit images…', () => images(full, 'Primary'))));
                const people = [...(full.People || [])];
                const plist = el('div');
                const drawPeople = () => {
                    plist.textContent = '';
                    people.forEach((p, k) => plist.append(M.row(p.Name, { sub: [p.Role, p.Type].filter(Boolean).join(' · '), value: 'remove', go: () => { people.splice(k, 1); drawPeople(); } })));
                    if (!people.length) plist.append(M.note('No cast or crew.'));
                };
                drawPeople();
                const pName = M.field('name', ''), pRole = M.field('role', '', { placeholder: '[Character, or Director]' });
                panes.people.append(plist, pName, pRole, M.foot(M.button('Add the person', () => {
                    const n = pName.input.value.trim();
                    if (!n) { T.ctx.focus(pName.input); return; }
                    people.push({ Name: n, Role: pRole.input.value.trim(), Type: /director/i.test(pRole.input.value) ? 'Director' : 'Actor' });
                    pName.input.value = ''; pRole.input.value = ''; drawPeople();
                })));
                const ids = Object.assign({ Imdb: '', Tmdb: '', Tvdb: '' }, full.ProviderIds || {});
                const idf = {};
                for (const k of Object.keys(ids)) { idf[k] = M.field(k, ids[k]); panes.ids.append(idf[k]); }
                const toggle = (label, on) => {
                    const r = M.row(label, { on });
                    r.addEventListener('click', () => { r.classList.toggle('mc-sp-on'); T.ctx.sound('select'); });
                    return r;
                };
                const lockAll = toggle('Lock this item (refreshes leave it alone)', !!full.LockData);
                const locked = new Set(full.LockedFields || []);
                const lockRows = I.details.lockFields.map(([k, label]) => { const r = toggle(`Lock ${label.toLowerCase()}`, locked.has(k)); r.dataset.field = k; return r; });
                panes.lock.append(lockAll, ...lockRows);
                show('general');
                body.append(tabs, pane, M.foot(M.button('Save', save, true), M.button('Cancel', () => M.panel.close())));
                async function save() {
                    const v = (k) => f[k].input.value.trim();
                    const list = (k) => v(k).split(',').map((x) => x.trim()).filter(Boolean);
                    const pids = {};
                    for (const [k, x] of Object.entries(idf)) if (x.input.value.trim()) pids[k] = x.input.value.trim();
                    Object.assign(full, { Name: v('Name'), ForcedSortName: v('ForcedSortName'), OriginalTitle: v('OriginalTitle'), OfficialRating: v('OfficialRating'), Overview: overview.input.value,
                        ProductionYear: v('ProductionYear') ? Number(v('ProductionYear')) : null, CommunityRating: v('CommunityRating') ? Number(v('CommunityRating')) : null,
                        Genres: list('Genres'), Tags: list('Tags'), People: people, ProviderIds: pids,
                        LockData: lockAll.classList.contains('mc-sp-on'), LockedFields: lockRows.filter((r) => r.classList.contains('mc-sp-on')).map((r) => r.dataset.field) });
                    try { await I.details.save(full); M.panel.close(); M.notice('Saved'); } catch (e) { fail(e); }
                }
            }
        });
    }

    // ---- Play on and Watch together (the PlayOn board): one panel, two tabs ----
    M.playOn = function playOn(tab, item) {
        const ctx = T.ctx;
        M.panel.show({
            title: tab === 'together' ? 'watch together' : 'play on', sub: item ? item.Name : '',
            async render(body) {
                const tabs = el('div', 'mc-pivot mc-sp-tabs');
                for (const [id, label] of [['play', 'play on'], ['together', 'watch together']]) {
                    const b = M.focusable(el('button', 'mc-pivot-item' + ((tab || 'play') === id ? ' on' : ''), label));
                    b.type = 'button';
                    b.addEventListener('click', () => playOn(id, item));
                    tabs.append(b);
                }
                body.append(tabs);
                if (tab === 'together') {
                    const cur = ctx.syncPlay && ctx.syncPlay.current();
                    if (cur) {
                        body.append(M.sec('you are in'), M.row(cur.name, { on: true }), M.foot(M.button('Leave the group', async () => { try { await ctx.syncPlay.leave(); M.panel.close(); M.notice(`Left ${cur.name}`); } catch (e) { fail(e); } })));
                        return;
                    }
                    body.append(M.sec('groups on this server'));
                    let groups = [];
                    try { groups = await ctx.syncPlay.groups(); } catch (e) { groups = []; }
                    if (!groups.length) body.append(M.note('No groups yet.'));
                    for (const g of groups) body.append(M.row(g.name, { sub: (g.people || []).join(', '), go: async () => { try { await ctx.syncPlay.join(g.id); M.panel.close(); M.notice(`Joined ${g.name}`); } catch (e) { fail(e); } } }));
                    body.append(M.foot(M.button('New group', async () => { try { await ctx.syncPlay.create(''); M.panel.close(); M.notice('Group started'); } catch (e) { fail(e); } }, true)));
                    return;
                }
                const ICON = { this: M.ICON.cast, tv: M.ICON.cast, computer: M.ICON.cast, phone: '<rect x="7" y="2" width="10" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>', other: M.ICON.cast };
                let targets = [];
                try { targets = await ctx.playTargets(); } catch (e) { targets = []; }
                const here = targets.filter((t) => t.kind === 'this'), others = targets.filter((t) => t.kind !== 'this');
                const row = (t) => M.row(t.name, { sub: t.app || '', on: t.current, icon: ICON[t.kind] || ICON.other, go: async () => {
                    try { await ctx.setPlayTarget(t.id); M.panel.close(); M.notice(t.kind === 'this' ? 'Playing here' : `Plays on ${t.name}`); } catch (e) { fail(e); }
                } });
                body.append(M.sec('this device'), ...here.map(row), M.sec('other devices'));
                if (!others.length) body.append(M.note('No other devices are on this server right now.'));
                body.append(...others.map(row), M.row('Look again', { go: () => playOn('play', item) }));
            }
        });
    };

    I.setMenu(menu);
    M.itemMenu = menu;

    // ≡ on any item in Media Center's screens opens its menu (checklist 2.4): the focused tile's item, by reference
    // (library and start tiles keep it) or by id (the wall's posters, the details screen's cards)
    M.onAction((a, ctx) => {
        if (a !== 'menu' || M.panel.isOpen()) return false;
        const f = ctx.focused();
        if (f && f.closest && f.closest('[data-icefin-reorder], .icefin-d-track')) return false;  // ≡ lifts a track there (the engine's reorder)
        // the focused item's menu, else (on a details screen) the item the screen is about
        const it = (f && (f.mcItem || (f.dataset && (f.dataset.id || f.dataset.itemId) ? { Id: f.dataset.id || f.dataset.itemId } : null))) || (M.screenItem && M.screenItem());
        if (!it || !it.Id) return false;
        menu(it, {});
        return true;
    });
})();
