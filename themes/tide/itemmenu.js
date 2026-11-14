// Tide: an item's options and their dialogs (PLAN 9.48; the canvas's ItemOptions, MenuDialog, MediaInfo and PlayOn
// boards). ≡ on any entry, and More options on details, bring in the item's options from the right edge (panel.js):
// every action the user may take for the item (the engine's ui.items: policy, item and context), in five groups with
// thin rules between, the first focused. A dialog is the panel's next level, sliding over the options; the four large
// ones (Edit details, Images, Identify, Media info, Refresh) share one wide panel with sections along its top that the
// shoulder buttons step. Delete asks first, Keep it focused. Everything here is how Tide shows it; the server calls
// are the engine's.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinTide;
    if (!T || !T.ui || !T.ui.items || !D || !D.panel) return;
    const I = T.ui.items;
    const el = D.el;
    const fail = (e) => { console.error('tide: item options', e); D.notice('That didn’t work', true); };
    const after = (r) => { if (!r) return; if (r.close) D.panel.close(); if (r.message) D.notice(r.message, !r.ok); if (r.navigate) T.ctx.navigate(r.navigate); if (D.currentColumn && r.ok) D.currentColumn.reload(); };
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
                if (where && where.sortWith && D.sortRow) body.append(D.sortRow(where.sortWith), el('div', 'td-rule'));
                let group = null;
                for (const a of m.actions) {
                    if (group !== null && a.group !== group) body.append(el('div', 'td-rule'));
                    group = a.group;
                    const label = a.dialog && a.id !== 'delete' && a.id !== 'mediaInfo' ? `${a.label}…` : a.label;
                    body.append(D.row(label, { danger: a.danger, go: () => act(a, item, where, m) }));
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
                push: true, title: `Delete ${item.Name}?`, path: `${item.Name} › Options`,
                text: 'It goes from the server and its files from the disk, for everyone. This can’t be undone.',
                choices: [{ label: 'Keep it', safe: true }, { label: 'Delete', danger: true, run: async () => {
                    try { await I.remove(item); D.notice(`Deleted ${item.Name}`); if (/^#\/details/.test(location.hash)) history.back(); else if (D.currentColumn) D.currentColumn.reload(); } catch (e) { fail(e); }
                } }]
            });
        }
    };

    // Add to a playlist or a collection (MenuDialog board): New at the top, then yours with their counts
    function addTo(item, type) {
        const word = type === 'Playlist' ? 'playlist' : 'collection';
        D.panel.push({
            title: `Add to a ${word}`, path: `${item.Name} › Options`,
            async render(body) {
                const fresh = D.row(`New ${word}…`, { sub: 'name it', go: () => {
                    D.panel.push({
                        title: `New ${word}`, path: `${item.Name} › Add to a ${word}`,
                        render(b2) {
                            const name = D.field('Name', '', { placeholder: type === 'Playlist' ? '[Road trip]' : '[Favourites of the year]' });
                            b2.append(name, D.foot(D.button('Create and add', async () => {
                                try { const r = await I.createWith(item, type, name.input.value); if (r.ok) D.panel.close(); D.notice(r.message, !r.ok); } catch (e) { fail(e); }
                            }, true), D.button('Cancel', () => D.panel.pop())));
                        }
                    });
                } });
                fresh.classList.add('td-row-focus-first');
                body.append(fresh);
                const wait = D.note('One moment…');
                body.append(wait);
                const list = await I.collections(type);
                wait.remove();
                for (const x of list) body.append(D.row(x.Name, { value: x.ChildCount != null ? `${x.ChildCount} items` : '', go: async () => {
                    try { after(await I.addTo(item, type, x)); D.panel.close(); } catch (e) { fail(e); }
                } }));
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
            const have = el('div', 'td-images'), found = el('div', 'td-images');
            body.append(D.sec('On the server'), have, D.sec('From the providers'), found);
            const cell = (url, label, go) => {
                const c = D.focusable(el('div', 'td-image'));
                c.style.backgroundImage = `url("${url}")`;
                c.append(el('span', 'td-image-label', label));
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
            const form = el('div', 'td-form');
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
