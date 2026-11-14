// Tide: libraries, lists and search on jellyfin-web's own routes (PLAN 9.48; the canvas's Folder, SortFilter, Search,
// LibrarySections and PhotosBooks boards), so every link lands in Tide: #/movies, #/tv, #/music, #/livetv,
// #/playlists, #/homevideos, #/photos, #/books, #/musicvideos, #/boxsets, #/mixed (a library's column, its icon in
// the trail), #/list (a genre's, a studio's or a person's items, Play all and Shuffle first) and #/search.
// Sort and filter is the options panel for a list: "Sort and filter…" heads ≡'s options there, and changes apply
// to the column behind as you make them.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinTide;
    if (!T || !D || !D.columnScreen) return;
    const ui = T.ui;
    const el = D.el;
    const c = () => D.client();
    const uid = () => D.uid();

    // ---- a library's own route ----
    const TYPES = { movies: 'movies', tv: 'tvshows', music: 'music', livetv: 'livetv', playlists: 'playlists', homevideos: 'homevideos', photos: 'photos', books: 'books', musicvideos: 'musicvideos', boxsets: 'boxsets', mixed: 'mixed' };
    async function viewFor(kind, p) {
        const id = p.get('topParentId') || p.get('parentId') || p.get('parentid');
        if (id) { try { return await Promise.resolve(c().getItem(uid(), id)); } catch (e) { /* fall through */ } }
        const views = await ui.userViews();
        return views.find((v) => v.CollectionType === TYPES[kind]) || { Id: '', Name: kind, CollectionType: TYPES[kind] };
    }
    for (const kind of Object.keys(TYPES)) {
        if (kind === 'livetv' && D.liveScreen) continue;  // Live TV has its own screen (tv.js)
        D.columnScreen(`#/${kind}`, {
            name: 'library', key: () => location.hash,
            root(p) {
                const lv = { title: '', icon: D.kindIcon(TYPES[kind]), count: false };
                lv.load = async () => { const v = await viewFor(kind, p); lv.title = v.Name; return D.libraryEntries(v, { peek: false }); };
                return lv;
            },
            selfInTrail: true
        });
    }

    // ---- #/list: a genre, a studio, a person, a tag, a folder ----
    D.columnScreen('#/list', {
        name: 'list', key: () => location.hash, selfInTrail: true,
        root(p) {
            const q = { ParentId: p.get('parentId') || undefined };
            const type = p.get('type') || p.get('itemTypes');
            if (type) q.IncludeItemTypes = type;
            let title = '', icon = 'genre', idKey = null;
            if (p.get('genreId')) { q.GenreIds = p.get('genreId'); idKey = p.get('genreId'); }
            else if (p.get('musicGenreId')) { q.GenreIds = p.get('musicGenreId'); q.IncludeItemTypes = q.IncludeItemTypes || 'MusicAlbum'; idKey = p.get('musicGenreId'); }
            else if (p.get('studioId')) { q.StudioIds = p.get('studioId'); icon = 'studio'; idKey = p.get('studioId'); }
            else if (p.get('personId')) { q.PersonIds = p.get('personId'); icon = 'person'; idKey = p.get('personId'); }
            else if (p.get('tag')) { q.Tags = p.get('tag'); title = p.get('tag'); }
            const lv = D.dropLevel(title, icon, q);
            const load = lv.load;
            lv.load = async () => {
                if (idKey && !lv.title) { try { const it = await Promise.resolve(c().getItem(uid(), idKey)); lv.title = it.Name; } catch (e) { lv.title = 'List'; } }
                return load();
            };
            return lv;
        }
    });

    // ---- sort and filter (SortFilter board) ----
    const SORTS = [['SortName', 'Name'], ['DateCreated,SortName', 'Date added'], ['PremiereDate,SortName', 'Release date'], ['CommunityRating,SortName', 'Rating'],
        ['Runtime,SortName', 'Running time'], ['DatePlayed,SortName', 'Last played'], ['Random', 'Random']];
    D.sortPanel = (C, push) => {
        const lv = C.level();
        if (!lv || !lv.query) return;
        const q = lv.query, f = lv.filters;
        const apply = () => { lv.focus = 0; C.reload(); };
        const spec = {
            title: 'Sort and filter', path: `${lv.title || ''}${C.S.entries.length ? ` · ${C.S.entries.length}` : ''}`,
            hints: [['OK', 'change'], ['◀ ▶', 'step'], ['Back', 'close']],
            render(body) {
                body.append(D.sec('Sort'),
                    D.stepper('Sort by', SORTS, q.SortBy, (v) => { q.SortBy = v; apply(); }),
                    D.stepper('Order', [['Ascending', 'A to Z, oldest first'], ['Descending', 'Z to A, newest first']], q.SortOrder, (v) => { q.SortOrder = v; apply(); }),
                    D.sec('Show only'),
                    D.toggle('Unplayed', !!f.unplayed, (on) => { f.unplayed = on; apply(); }),
                    D.toggle('Favourites', !!f.favourites, (on) => { f.favourites = on; apply(); }));
                const pickFrom = (label, fetch, key) => D.row(label, { value: f[key] ? '1 chosen ›' : 'any ›', go: () => D.panel.push({
                    title: label, path: 'Sort and filter',
                    async render(b) {
                        const any = D.row('Any', { on: !f[key], go: () => { f[key] = null; apply(); D.panel.pop(); } });
                        b.append(any);
                        const wait = D.note('One moment…');
                        b.append(wait);
                        let list = [];
                        try { list = await fetch(); } catch (e) { list = []; }
                        wait.remove();
                        for (const x of list) b.append(D.row(x.Name, { on: f[key] === x.Id, go: () => { f[key] = x.Id; apply(); D.panel.pop(); } }));
                    }
                }) });
                const pid = q.ParentId;
                body.append(
                    pickFrom('Genres', async () => { const r = await Promise.resolve(c().getGenres(uid(), { ParentId: pid, IncludeItemTypes: q.IncludeItemTypes, Recursive: true, SortBy: 'SortName' })); return (r && r.Items) || []; }, 'genres'),
                    pickFrom('Years', async () => { const r = await c().getJSON(c().getUrl('Years', { ParentId: pid, UserId: uid(), IncludeItemTypes: q.IncludeItemTypes, Recursive: true, SortBy: 'SortName', SortOrder: 'Descending' })); return ((r && r.Items) || []).map((y) => ({ Id: y.Name, Name: y.Name })); }, 'years'),
                    pickFrom('Studios', async () => { const r = await c().getJSON(c().getUrl('Studios', { ParentId: pid, UserId: uid(), IncludeItemTypes: q.IncludeItemTypes, Recursive: true, SortBy: 'SortName' })); return (r && r.Items) || []; }, 'studios'));
                if (lv.letters && C.S.entries.length > 12) {
                    const letters = [...new Set(C.S.entries.map((e) => ((e.letter || e.name || '').replace(/^(the|a|an)\s+/i, '').charAt(0).toUpperCase()).replace(/[^A-Z]/, '#')))];
                    const at = letters[0];
                    body.append(D.sec('Go to'), D.stepper('A letter', letters.map((l) => [l, l]), at, (l) => {
                        const k = C.S.entries.findIndex((e) => ((e.letter || e.name || '').replace(/^(the|a|an)\s+/i, '').charAt(0).toUpperCase().replace(/[^A-Z]/, '#')) === l);
                        if (k >= 0) { lv.focus = k; C.redraw(); }
                    }));
                }
                body.append(D.row('Reset', { go: () => { q.SortBy = 'SortName'; q.SortOrder = 'Ascending'; for (const k of Object.keys(f)) f[k] = null; apply(); D.panel.close(); } }));
            }
        };
        if (push && D.panel.isOpen()) D.panel.push(spec); else D.panel.show(spec);
    };
    // ≡ on an entry of a sortable list: "Sort and filter…" heads the item's options (or opens alone, on a folder)
    D.onAction((a, ctx) => {
        if (a !== 'menu' || (D.panel && D.panel.isOpen())) return false;
        const C = D.currentColumn;
        if (!C || !C.S.alive || !C.level() || !C.level().sortable || !C.level().query) return false;
        const e = C.entry();
        if (e && e.item) { D.itemMenu(e.item, { sortWith: C }); return true; }
        D.sortPanel(C);
        return true;
    });
    // the item's options gain the list's Sort and filter row (itemmenu.js reads where.sortWith)
    D.sortRow = (C) => D.row('Sort and filter…', { sub: 'for this list', go: () => D.sortPanel(C, true) });

    // ---- search (Search board) ----
    // A column whose first entry is the query; typing (the on-screen keyboard, or a keyboard) refreshes the results
    // under it: the best matches first, then a folder per kind (films, shows, episodes, music, people).
    const KINDS = [['Movie', 'Films', 'movies'], ['Series', 'Shows', 'tvshows'], ['Episode', 'Episodes', 'episodes'], ['MusicAlbum', 'Albums', 'album'],
        ['Audio', 'Songs', 'song'], ['MusicArtist', 'Artists', 'person'], ['Person', 'People', 'person'], ['TvChannel', 'Channels', 'livetv'], ['Book', 'Books', 'books']];
    let SQ = '';
    let input = null;
    D.columnScreen('#/search', {
        name: 'search', key: () => '#/search', selfInTrail: true, fresh: true,
        root(p) {
            SQ = p.get('query') || SQ || '';
            const lv = { title: 'Search', icon: 'search', count: false };
            lv.load = async () => {
                const out = [{ name: SQ ? 'Change the search' : 'Type to search', sub: SQ ? `“${SQ}”` : 'films, shows, music and people', icon: 'search', shape: 'icon', okLabel: 'type', focusFirst: !SQ, query: true,
                    go: () => { if (input) { T.ctx.focus(input); if (ui.keyboard) ui.keyboard.open(input); } } }];
                if (SQ.length < 2) return out;
                const hits = await D.items({ SearchTerm: SQ, Recursive: true, Limit: 120, IncludeItemTypes: KINDS.map((k) => k[0]).join(','), IncludePeople: true, IncludeMedia: true, IncludeArtists: true });
                const best = hits.slice(0, 6).map((it) => D.entry(it));
                if (best.length) best[0].focusFirst = true;
                out.push(...best);
                for (const [type, label, icon] of KINDS) {
                    const of = hits.filter((h) => h.Type === type);
                    if (of.length) out.push({ name: label, sub: `${of.length}`, icon, shape: 'icon', open: () => ({ title: label, icon, load: async () => of.map((it) => D.entry(it)) }) });
                }
                if (out.length === 1) out.push({ name: 'Nothing found', sub: 'try fewer letters', icon: 'search', shape: 'icon' });
                return out;
            };
            return lv;
        },
        mounted(C, root) {
            input = el('input', 'td-search-input');
            input.type = 'search';
            input.value = SQ;
            input.setAttribute('aria-label', 'Search');
            D.focusable(input);
            root.append(input);
            let timer = 0;
            input.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(() => { SQ = input.value.trim(); const lv = C.S.stack[0]; lv.focus = 0; lv.reload = true; C.S.stack.length = 1; C.redraw(); }, 450);
            });
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); SQ = input.value.trim(); C.S.stack.length = 1; C.S.stack[0].focus = 1; C.S.stack[0].reload = true; C.redraw(); } });
            // a physical keyboard types from anywhere on the screen (checklist 2.5)
            root.addEventListener('keydown', (e) => {
                if (e.target === input || e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
                input.value += e.key;
                input.dispatchEvent(new Event('input'));
                T.ctx.focus(input);
            });
            if (!SQ) setTimeout(() => { if (input.isConnected) { T.ctx.focus(input); if (ui.keyboard) ui.keyboard.open(input); } }, 300);
        },
        unmounted() { input = null; }
    });
})();
