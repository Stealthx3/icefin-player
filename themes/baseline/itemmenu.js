// Baseline: an item's options as stock's action sheet (centred list, the focused row filled), in stock's wording.
// ≡ on any card or list item, and More on details, open it. The actions are the engine's (ui.items: policy, item and
// context); the dialogs open as stock's form dialogs (panel.js, a header bar with Back). Delete asks first.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinBaseline;
    if (!T || !T.ui || !T.ui.items || !D || !D.panel) return;
    const I = T.ui.items;
    const el = D.el;
    const fail = (e) => { console.error('baseline: item options', e); D.notice('That didn’t work', true); };
    const after = (r) => { if (!r) return; if (r.close) D.panel.close(); if (r.message) D.notice(r.message, !r.ok); if (r.navigate) T.ctx.navigate(r.navigate); if (D.currentColumn && r.ok) D.currentColumn.reload(); };
    // stock's names for the engine's actions (jellyfin-web's itemContextMenu strings)
    const STOCK = { playFromStart: 'Play from beginning', queue: 'Add to play queue', instantMix: 'Instant Mix', goAlbum: 'View album', goArtist: 'View artist',
        goSeason: 'View season', goSeries: 'View series', addToPlaylist: 'Add to playlist', addToCollection: 'Add to collection', removeFromPlaylist: 'Remove from playlist',
        removeFromCollection: 'Remove from collection', mediaInfo: 'Media Info', subtitles: 'Edit subtitles', refresh: 'Refresh metadata', edit: 'Edit metadata',
        images: 'Edit images', identify: 'Identify', copyUrl: 'Copy Stream URL', download: 'Download', delete: 'Delete media',
        played: 'Mark played', unplayed: 'Mark unplayed', favourite: 'Add to favorites', unfavourite: 'Remove from favorites' };
    const ICON = { playFromStart: 'replay', queue: 'playlist_add', instantMix: 'explore', goAlbum: 'album', goArtist: 'person', goSeason: 'folder', goSeries: 'tv',
        addToPlaylist: 'playlist_add', addToCollection: 'playlist_add', removeFromPlaylist: 'remove', removeFromCollection: 'remove', unresume: 'remove_done', move: 'swap_vert',
        mediaInfo: 'info', subtitles: 'closed_caption', removeSubtitles: 'closed_caption', refresh: 'refresh', edit: 'edit', images: 'image', identify: 'edit',
        copyUrl: 'content_copy', download: 'file_download', delete: 'delete', played: 'check', unplayed: 'check', favourite: 'favorite', unfavourite: 'favorite' };
    // stock's order (itemContextMenu): the item's own actions, then editing, then the context's; a rule between
    const ORDER = ['playFromStart', 'queue', 'instantMix', 'addToCollection', 'addToPlaylist', 'download', 'copyUrl', 'played', 'unplayed', 'favourite', 'unfavourite', 'delete', '|',
        'edit', 'images', 'subtitles', 'removeSubtitles', 'identify', 'mediaInfo', 'refresh', '|',
        'move', 'removeFromPlaylist', 'removeFromCollection', 'unresume', 'goAlbum', 'goArtist', 'goSeason', 'goSeries'];
    const groupOf = (id) => { const i = ORDER.indexOf(id); return i < 0 ? 9 : ORDER.slice(0, i).filter((x) => x === '|').length; };
    const rank = (id) => { const i = ORDER.indexOf(id); return i < 0 ? 999 : i; };
    const WIDE = [['edit', 'Details'], ['images', 'Images'], ['identify', 'Identify'], ['mediaInfo', 'Media info'], ['refresh', 'Refresh']];

    async function menu(ref, where) {
        let m;
        try { m = await I.menu(ref, where || {}); } catch (e) { fail(e); return; }
        if (!m.actions.length) { D.notice('Nothing to do with this item', true); return; }
        const item = m.item;
        D.panel.show({
            title: item.Name || 'Item', path: 'Options',
            hints: [['OK', 'choose'], ['Back', 'close']],
            render(body) {
                if (where && where.sortWith && D.sortRow) body.append(D.sortRow(where.sortWith), el('div', 'bl-rule'));
                let group = null;
                const onDetails = /^#\/details/.test(location.hash);  // there they are the page's own buttons, as in stock
                for (const a of [...m.actions].sort((x, y) => rank(x.id) - rank(y.id))) {
                    if (onDetails && ['played', 'unplayed', 'favourite', 'unfavourite'].includes(a.id)) continue;
                    const g = groupOf(a.id);
                    if (group !== null && g !== group) body.append(el('div', 'bl-rule'));
                    group = g;
                    body.append(D.row(STOCK[a.id] || a.label, { icon: ICON[a.id] || 'more_horiz', go: () => act(a, item, where, m) }));
                }
            }
        });
    }
    async function act(a, item, where, m) {
        if (!a.dialog) { try { after(await I.run(a.id, item, where || {})); } catch (e) { fail(e); } return; }
        const dlg = DIALOGS[a.id];
        if (dlg) dlg(item, m); else { try { after(await I.run(a.id, item, where || {})); } catch (e) { fail(e); } }
    }
    const allowed = (m, id) => !m || m.actions.some((a) => a.id === id);
    // the wide panel's sections, only those the user may use for this item
    const wideTabs = (item, m, at) => D.tabs(WIDE.filter(([id]) => allowed(m, id)), at, (id) => DIALOGS[id](item, m, true));
    const wide = (item, m, at, title, render, swap) => {
        const spec = { title, path: `${item.Name} › Options`, wide: true, hints: [['OK', 'choose'], ['L1 R1', 'section'], ['Back', 'to the options']],
            render(body) { body.append(wideTabs(item, m, at)); return render(body); } };
        if (swap) D.panel.show(spec); else D.panel.push(spec);
    };

    const DIALOGS = {
        addToPlaylist: (item) => addTo(item, 'Playlist'),
        addToCollection: (item) => addTo(item, 'BoxSet'),
        mediaInfo: (item, m, swap) => wide(item, m, 'mediaInfo', 'Media info', (body) => {
            for (const v of I.mediaInfo(item)) {
                body.append(D.sec(v.title || 'Version'));
                for (const r of v.rows) body.append(D.row(r.text, { sub: r.type }));
            }
        }, swap),
        subtitles: (item) => subtitles(item, 0),
        refresh: (item, m, swap) => wide(item, m, 'refresh', 'Refresh', (body) => {
            body.append(D.note('The server reads the item again from its files and its providers.'));
            for (const mode of I.refreshModes) body.append(D.row(mode.label, { sub: mode.sub, go: async () => {
                try { await I.refresh(item, mode.id); D.panel.close(); D.notice('Refreshing; it updates when the server is done'); } catch (e) { fail(e); }
            } }));
        }, swap),
        edit: (item, m, swap) => edit(item, m, swap),
        images: (item, m, swap) => images(item, m, 'Primary', swap),
        identify: (item, m, swap) => identify(item, m, swap),
        removeSubtitles(item) {
            D.panel.push({
                title: 'Remove subtitles', path: `${item.Name} › Options`,
                render(body) {
                    body.append(D.note('Choose the subtitles to remove from the server.'));
                    for (const st of I.subtitles.external(item)) body.append(D.row(st.DisplayTitle || st.Language || `Subtitles ${st.Index}`, {
                        sub: st.Path ? st.Path.split('/').pop() : '', danger: true,
                        go: async () => { try { await I.subtitles.remove(item, st); D.panel.close(); D.notice('Subtitles removed'); } catch (e) { fail(e); } }
                    }));
                }
            });
        },
        delete(item) {
            D.panel.ask({
                push: true, title: 'Delete Item', path: `${item.Name} › Options`,
                text: 'Deleting this item will delete it from both the file system and your media library. Are you sure you wish to continue?',
                choices: [{ label: 'Cancel', safe: true }, { label: 'Delete', danger: true, run: async () => {
                    try { await I.remove(item); D.notice(`Deleted ${item.Name}`); if (/^#\/details/.test(location.hash)) history.back(); else if (D.currentColumn) D.currentColumn.reload(); } catch (e) { fail(e); }
                } }]
            });
        }
    };

    // Add to a playlist or a collection (MenuDialog board): New at the top, then yours with their counts
    // stock's Add to Playlist / Add to Collection form: the target (New… or one of yours), a name for a new one, Add
    function addTo(item, type) {
        const word = type === 'Playlist' ? 'Playlist' : 'Collection';
        D.panel.push({
            title: `Add to ${word}`, path: `${item.Name} › Options`, form: true,
            async render(body) {
                let list = [];
                try { list = await I.collections(type); } catch (e) { list = []; }
                let target = null;  // null: a new one
                const lab = el('label', 'bl-field');
                const sel = D.focusable(el('button', 'bl-selectbox', 'New…'));
                sel.type = 'button';
                sel.append(D.icon('keyboard_arrow_down', 'bl-select-arrow'));
                lab.append(el('span', 'bl-field-label', word), sel);
                const name = D.field('Name', '');
                const show = () => { sel.firstChild.textContent = target ? target.Name : 'New…'; name.hidden = !!target; };
                sel.addEventListener('click', () => D.panel.push({
                    title: word, path: `Add to ${word}`,
                    render(b2) {
                        const pick = (t, label) => { const r = D.row(label, { on: t === target, go: () => { target = t; show(); D.panel.pop(); } }); if (t === target) r.classList.add('bl-row-focus-first'); b2.append(r); };
                        pick(null, 'New…');
                        for (const x of list) pick(x, x.Name);
                    }
                }));
                const add = D.button('Add', async () => {
                    try {
                        if (target) { after(await I.addTo(item, type, target)); D.panel.close(); return; }
                        if (!name.input.value.trim()) { T.ctx.sound('error'); return; }
                        const r = await I.createWith(item, type, name.input.value.trim());
                        if (r.ok) D.panel.close();
                        D.notice(r.message, !r.ok);
                    } catch (e) { fail(e); }
                }, true);
                body.append(lab, name, D.foot(add));
                show();
            }
        });
    }

    function subtitles(item, li) {
        const langs = I.subtitles.languages;
        const spec = {
            title: 'Find subtitles', path: `${item.Name} › Options`, wide: true,
            async render(body) {
                body.append(D.stepper('Language', langs.map((l) => [l[0], l[1]]), langs[li][0], (code) => subtitles(item, langs.findIndex((l) => l[0] === code))));
                const on = I.subtitles.on(item);
                body.append(D.note(on.length ? `On the item now: ${on.slice(0, 6).join(', ')}` : 'The item has no subtitles yet.'), D.sec('Found'));
                const wait = D.note('Searching…');
                body.append(wait);
                let r = [];
                try { r = await I.subtitles.search(item, langs[li][0]); } catch (e) { r = []; }
                wait.remove();
                if (!r.length) { body.append(D.note('Nothing in this language. ◀ ▶ on Language for another.')); return; }
                for (const s of r.slice(0, 30)) {
                    const info = [s.ProviderName, s.Format, s.CommunityRating ? `★ ${Number(s.CommunityRating).toFixed(1)}` : '', s.DownloadCount ? `${s.DownloadCount} downloads` : '', s.IsHashMatch ? 'exact match' : ''].filter(Boolean).join(' · ');
                    body.append(D.row(s.Name || s.Id, { sub: info, value: 'get', go: async () => {
                        try { await I.subtitles.download(item, s); D.panel.close(); D.notice('Downloading the subtitles'); } catch (e) { fail(e); }
                    } }));
                }
            }
        };
        if (li === 0 && D.panel.depth() < 2) D.panel.push(spec); else D.panel.show(spec);
    }

    function images(item, m, type, swap) {
        wide(item, m, 'images', 'Images', async (body) => {
            body.append(D.stepper('Kind', I.images.types.map(([t, label]) => [t, label]), type, (t) => images(item, m, t, true)));
            const have = el('div', 'bl-images'), found = el('div', 'bl-images');
            body.append(D.sec('On the server'), have, D.sec('From the providers'), found);
            const cell = (url, label, go) => {
                const c = D.focusable(el('div', 'bl-image'));
                c.style.backgroundImage = `url("${url}")`;
                c.append(el('span', 'bl-image-label', label));
                c.setAttribute('role', 'button');
                c.setAttribute('aria-label', label);
                c.addEventListener('click', go);
                return c;
            };
            for (const im of await I.images.list(item, type)) have.append(cell(I.images.url(item, type, im), 'delete', async () => {
                try { await I.images.remove(item, type, im.ImageIndex); D.notice('Image deleted'); images(item, m, type, true); } catch (e) { fail(e); }
            }));
            if (!have.childElementCount) have.append(D.note('None yet.'));
            found.append(D.note('Searching…'));
            let r = [];
            try { r = await I.images.remote(item, type); } catch (e) { r = []; }
            found.textContent = '';
            for (const im of r.slice(0, 24)) found.append(cell(im.ThumbnailUrl || im.Url, [im.ProviderName, im.Width && `${im.Width}×${im.Height}`].filter(Boolean).join(' · '), async () => {
                try { await I.images.set(item, type, im); D.notice('Image set'); images(item, m, type, true); } catch (e) { fail(e); }
            }));
            if (!found.childElementCount) found.append(D.note('The providers have none.'));
        }, swap);
    }

    function identify(item, m, swap) {
        wide(item, m, 'identify', 'Identify', (body) => {
            const name = D.field('Name', item.Name), year = D.field('Year', item.ProductionYear || '', { type: 'number' });
            const results = el('div');
            const search = async () => {
                results.textContent = '';
                results.append(D.note('Searching…'));
                let r = [];
                try { r = await I.identify.search(item, name.input.value, year.input.value); } catch (e) { r = []; }
                results.textContent = '';
                if (!r.length) { results.append(D.note('No matches. Change the name or year and search again.')); return; }
                for (const x of r.slice(0, 20)) results.append(D.row(x.Name, { sub: [x.ProductionYear, x.SearchProviderName].filter(Boolean).join(' · '), go: async () => {
                    try { await I.identify.apply(item, x); D.panel.close(); D.notice(`Identified as ${x.Name}; the details follow shortly`); } catch (e) { fail(e); }
                } }));
            };
            body.append(name, year, D.foot(D.button('Search', search, true)), D.sec('Matches'), results);
            search();
        }, swap);
    }

    // Edit details (MediaInfo board): the fields in Tide's lines; people, provider ids and locks below; one Save
    function edit(item, m, swap) {
        wide(item, m, 'edit', 'Edit details', async (body) => {
            const full = await I.details.read(item);
            const f = {
                Name: D.field('Title', full.Name), ForcedSortName: D.field('Sort title', full.ForcedSortName || full.SortName), OriginalTitle: D.field('Original title', full.OriginalTitle),
                ProductionYear: D.field('Year', full.ProductionYear, { type: 'number' }), OfficialRating: D.field('Parental rating', full.OfficialRating),
                CommunityRating: D.field('Community rating', full.CommunityRating, { type: 'number' }), Genres: D.field('Genres, separated by commas', (full.Genres || []).join(', ')),
                Tags: D.field('Tags, separated by commas', (full.Tags || []).join(', '))
            };
            const overview = D.field('Overview', full.Overview, { multiline: true });
            const form = el('div', 'bl-form');
            form.append(...Object.values(f), overview);
            const people = [...(full.People || [])];
            const plist = el('div');
            const drawPeople = () => {
                plist.textContent = '';
                people.forEach((p, k) => plist.append(D.row(p.Name, { sub: [p.Role, p.Type].filter(Boolean).join(' · '), value: 'remove', go: () => { people.splice(k, 1); drawPeople(); } })));
                if (!people.length) plist.append(D.note('No cast or crew.'));
            };
            drawPeople();
            const pName = D.field('Add a person: name', ''), pRole = D.field('Their role', '', { placeholder: '[Character, or Director]' });
            const ids = Object.assign({ Imdb: '', Tmdb: '', Tvdb: '' }, full.ProviderIds || {});
            const idf = {};
            for (const k of Object.keys(ids)) idf[k] = D.field(`${k} id`, ids[k]);
            const lockAll = D.toggle('Lock this item (refreshes leave it alone)', !!full.LockData);
            const locked = new Set(full.LockedFields || []);
            const lockRows = I.details.lockFields.map(([k, label]) => { const r = D.toggle(`Lock ${label.toLowerCase()}`, locked.has(k)); r.dataset.field = k; return r; });
            body.append(form, D.sec('Cast and crew'), plist, pName, pRole, D.foot(D.button('Add the person', () => {
                const n = pName.input.value.trim();
                if (!n) { T.ctx.sound('error'); T.ctx.focus(pName.input); return; }
                people.push({ Name: n, Role: pRole.input.value.trim(), Type: /director/i.test(pRole.input.value) ? 'Director' : 'Actor' });
                pName.input.value = ''; pRole.input.value = ''; drawPeople();
            })), D.sec('Provider ids'), ...Object.values(idf), D.sec('Locks'), lockAll, ...lockRows,
            D.foot(D.button('Save', save, true), D.button('Cancel', () => D.panel.pop())));
            async function save() {
                const v = (k) => f[k].input.value.trim();
                const list = (k) => v(k).split(',').map((x) => x.trim()).filter(Boolean);
                const pids = {};
                for (const [k, x] of Object.entries(idf)) if (x.input.value.trim()) pids[k] = x.input.value.trim();
                Object.assign(full, { Name: v('Name'), ForcedSortName: v('ForcedSortName'), OriginalTitle: v('OriginalTitle'), OfficialRating: v('OfficialRating'), Overview: overview.input.value,
                    ProductionYear: v('ProductionYear') ? Number(v('ProductionYear')) : null, CommunityRating: v('CommunityRating') ? Number(v('CommunityRating')) : null,
                    Genres: list('Genres'), Tags: list('Tags'), People: people, ProviderIds: pids,
                    LockData: lockAll.isOn(), LockedFields: lockRows.filter((r) => r.isOn()).map((r) => r.dataset.field) });
                try { await I.details.save(full); D.panel.close(); D.notice('Saved'); } catch (e) { fail(e); }
            }
        }, swap);
    }

    // ---- Play on and Watch together (PlayOn board): one panel, two sections ----
    D.playOn = function playOn(tab, item, swap) {
        const ctx = T.ctx;
        const spec = {
            title: 'Play on · Watch together', path: item ? item.Name : '', hints: [['OK', 'send'], ['L1 R1', 'switch'], ['Back', 'close']],
            async render(body) {
                body.append(D.tabs([['play', 'Play on'], ['together', 'Watch together']], tab || 'play', (id) => playOn(id, item, true)));
                if (tab === 'together') {
                    const cur = ctx.syncPlay && ctx.syncPlay.current();
                    if (cur) {
                        body.append(D.sec('You are in'), D.row(cur.name, { on: true }), D.row('Leave the group', { go: async () => { try { await ctx.syncPlay.leave(); D.panel.close(); D.notice(`Left ${cur.name}`); } catch (e) { fail(e); } } }));
                        return;
                    }
                    body.append(D.sec('Groups on this server'));
                    let groups = [];
                    try { groups = await ctx.syncPlay.groups(); } catch (e) { groups = []; }
                    if (!groups.length) body.append(D.note('No groups yet.'));
                    for (const g of groups) body.append(D.row(`Join ${g.name}`, { sub: (g.people || []).join(', '), value: `${(g.people || []).length} watching`, go: async () => { try { await ctx.syncPlay.join(g.id); D.panel.close(); D.notice(`Joined ${g.name}`); } catch (e) { fail(e); } } }));
                    body.append(D.row('New group', { icon: 'add', go: async () => { try { await ctx.syncPlay.create(''); D.panel.close(); D.notice('Group started'); } catch (e) { fail(e); } } }));
                    return;
                }
                let targets = [];
                try { targets = await ctx.playTargets(); } catch (e) { targets = []; }
                const here = targets.filter((t) => t.kind === 'this'), others = targets.filter((t) => t.kind !== 'this');
                const row = (t) => D.row(t.name, { sub: t.app || '', value: t.current ? 'playing here ✓' : '', icon: t.kind === 'phone' ? 'item' : 'cast', go: async () => {
                    try { await ctx.setPlayTarget(t.id); D.panel.close(); D.notice(t.kind === 'this' ? 'Playing here' : `Plays on ${t.name}`); } catch (e) { fail(e); }
                } });
                body.append(D.sec('This device'), ...here.map(row), D.sec('On your network'));
                if (!others.length) body.append(D.note('No other devices are on this server right now.'));
                body.append(...others.map(row), D.row('Look again', { go: () => playOn('play', item, true) }));
            }
        };
        if (swap || !D.panel.isOpen()) D.panel.show(spec); else D.panel.push(spec);
    };

    I.setMenu(menu);
    D.itemMenu = menu;
})();
