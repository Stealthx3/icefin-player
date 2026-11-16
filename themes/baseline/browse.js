// Baseline: search and Live TV as stock's TV layout draws them.
//   #/search: the field with its search icon, stock's on-page letters and digits (the TV layout's alpha picker),
//     Suggestions as links before typing, then a row per kind of result.
//   #/livetv: the tabs Programs, Guide, Channels, Recordings, Schedule, Series (?tab=0…5). Programs is rows (On Now,
//     Shows, Sports, Kids, Movies, News); the Guide is the engine's guideGrid in stock's look (the day strip, half-hour
//     slots, channels at the left, the focused programme filled); Channels and Series are grids; Recordings and
//     Schedule are rows and lists. ≡ on a programme opens stock's programme menu (record, series, cancel).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const B = window.icefinBaseline;
    if (!T || !B || !B.panel) return;
    const ui = T.ui;
    const el = B.el;
    const c = () => B.client();
    const uid = () => B.uid();
    const I = ui.items;

    // ---- search ----
    const KINDS = [['Movie', 'Movies', 'portrait'], ['Series', 'Shows', 'portrait'], ['Episode', 'Episodes', 'backdrop'], ['Person', 'People', 'portrait'], ['MusicAlbum', 'Albums', 'square'],
        ['Audio', 'Songs', 'square'], ['MusicArtist', 'Artists', 'square'], ['TvChannel', 'Channels', 'backdrop'], ['Program', 'Programs', 'backdrop'], ['Book', 'Books', 'portrait'], ['BoxSet', 'Collections', 'portrait'], ['Playlist', 'Playlists', 'square']];
    let SR = null;
    B.register('#/search', {
        async mount(root) {
            const me = SR = { root };
            const page = B.page(root, 'bl-search');
            B.header(root, { title: 'Search' });
            root.setAttribute('data-bl-screen', 'search');
            const fields = el('div', 'bl-searchfields');
            const ic = B.icon('search', 'bl-search-ic');
            const input = B.focusable(el('input', 'bl-search-input'));
            input.type = 'text';
            input.placeholder = 'Search';
            input.setAttribute('aria-label', 'Search');
            input.value = B.params().get('query') || '';
            fields.append(ic, input);
            const keys = el('div', 'bl-alpha-h');
            const rowA = el('div', 'bl-alpha-h-row'), rowN = el('div', 'bl-alpha-h-row');
            const key = (label, v, row) => { const b = B.btn('bl-alpha-h-btn', null); if (v === ' ') b.append(B.icon('space_bar')); else if (v === 'back') b.append(B.icon('backspace')); else b.textContent = label; b.blHints = [['OK', 'type'], ['Back', '']];
                b.addEventListener('click', () => { input.value = v === 'back' ? input.value.slice(0, -1) : input.value + v; T.ctx.sound('select'); changed(); }); row.append(b); };
            key('␣', ' ', rowA);
            for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') key(l, l.toLowerCase(), rowA);
            key('⌫', 'back', rowA);
            for (const d of '0123456789') key(d, d, rowN);
            keys.append(rowA, rowN);
            const results = el('div', 'bl-search-results');
            page.append(fields, keys, results);
            let timer = 0;
            const changed = () => { clearTimeout(timer); timer = setTimeout(run, 400); };
            input.addEventListener('input', changed);
            async function suggestions() {
                results.textContent = '';
                const r = await B.items({ SortBy: 'IsFavoriteOrLiked,Random', IncludeItemTypes: 'Movie,Series,MusicArtist', Limit: 20, Recursive: true, ImageTypeLimit: 0, EnableImageTypes: '', EnableTotalRecordCount: false });
                if (SR !== me) return;
                const box = el('div', 'bl-suggestions');
                box.append(el('h2', 'bl-suggestions-title', 'Suggestions'));
                for (const it of r.Items) { const a = B.btn('bl-suggestion', it.Name); a.blItem = it; a.addEventListener('click', () => { T.ctx.sound('select'); B.open(it); }); box.append(a); }
                results.append(box);
            }
            async function run() {
                const q = input.value.trim();
                if (q.length < 1) { suggestions(); return; }
                const r = await B.items({ SearchTerm: q, Recursive: true, Limit: 200, IncludeItemTypes: KINDS.map((k) => k[0]).join(','), IncludePeople: true, IncludeMedia: true, IncludeArtists: true, IncludeGenres: false, IncludeStudios: false });
                if (SR !== me || input.value.trim() !== q) return;
                results.textContent = '';
                for (const [type, label, shape] of KINDS) {
                    const of = r.Items.filter((x) => x.Type === type);
                    if (of.length) results.append(B.cardRow(label, of.map((it) => B.card(it, { row: true, shape }))));
                }
                if (!results.childElementCount) { const e = el('div', 'bl-no-items centered'); e.append(el('p', '', 'Sorry! No results found for "' + q + '"')); results.append(e); }
            }
            if (input.value) run(); else suggestions();
            B.arrive(root, input);
            root.setAttribute('data-bl-ready', '1');
        },
        unmount() { SR = null; B.hintsOff(); if (ui.keyboard && ui.keyboard.isOpen && ui.keyboard.isOpen()) ui.keyboard.close(); }
    });

    // ---- Live TV ----
    const iso = (t) => new Date(t).toISOString();
    const TABS = ['Programs', 'Guide', 'Channels', 'Recordings', 'Schedule', 'Series'];
    async function programmeMenu(p) {
        let prog = p;
        try { prog = await I.programme(p.Id); } catch (e) { prog = p; }
        const s = Date.parse(prog.StartDate), e = Date.parse(prog.EndDate), now = Date.now();
        B.panel.show({ title: prog.Name, path: 'Programme', render(body) {
            if (s <= now && now < e) body.append(B.row('Play', { icon: 'play_arrow', go: () => { B.panel.close(); T.ctx.play({ ids: [prog.ChannelId], serverId: B.sid() }); } }));
            body.append(B.row('Details', { icon: 'info', go: () => { B.panel.close(); B.details(prog); } }));
            if (prog.TimerId) body.append(B.row('Cancel recording', { icon: 'cancel', go: async () => { try { await I.cancelRecording(prog.TimerId); B.panel.close(); B.notice('Recording cancelled.'); } catch (er) { B.notice('That didn’t work', true); } } }));
            else body.append(B.row('Record', { icon: 'fiber_manual_record', go: async () => { try { await I.record(prog, false, {}); B.panel.close(); B.notice('Recording scheduled.'); } catch (er) { B.notice('That didn’t work', true); } } }));
            if (prog.IsSeries && !prog.SeriesTimerId) body.append(B.row('Record Series', { icon: 'fiber_smart_record', go: async () => { try { await I.record(prog, true, {}); B.panel.close(); B.notice('Series recording scheduled.'); } catch (er) { B.notice('That didn’t work', true); } } }));
        } });
    }
    B.liveOptions = (it) => (it.Type === 'TvChannel' ? T.ctx.play({ ids: [it.Id], serverId: B.sid() }) : programmeMenu(it));
    B.onAction((a, ctx) => {
        if (a !== 'menu') return false;
        const f = ctx.focused && ctx.focused();
        if (f && f.blItem && f.blItem.Type === 'Program') { programmeMenu(f.blItem); return true; }
        if (f && f.guideProgramme && f.guideProgramme.item) { programmeMenu(f.guideProgramme.item); return true; }
        return false;
    });
    const rows = async (page, list) => {
        for (const r of list) {
            let items = [];
            try { items = await r.fetch(); } catch (e) { items = []; }
            if (items.length) page.append(B.cardRow(r.title, items.map((it) => B.card(it, { row: true, shape: r.shape || 'backdrop', go: r.go })), { more: r.more !== false }));
        }
        if (!page.querySelector('.bl-card')) { const e = el('div', 'bl-no-items'); e.append(el('p', '', 'No items found.')); page.append(e); }
    };
    const recommended = (q) => () => Promise.resolve(c().getLiveTvRecommendedPrograms(Object.assign({ userId: uid(), limit: 12, ImageTypeLimit: 1, EnableImageTypes: 'Primary,Thumb,Backdrop', EnableTotalRecordCount: false, Fields: 'ChannelInfo,PrimaryImageAspectRatio' }, q))).then((r) => (r && r.Items) || []);
    const playChannel = (p) => T.ctx.play({ ids: [p.ChannelId || p.Id], serverId: B.sid() });

    async function guide(page, me) {
        let chans = [];
        try { chans = ((await Promise.resolve(c().getLiveTvChannels({ UserId: uid(), EnableImages: true, ImageTypeLimit: 1, Limit: 1000, EnableUserData: false }))) || {}).Items || []; } catch (e) { chans = []; }
        if (me !== L) return;
        chans.sort((a, b) => (parseFloat(a.ChannelNumber) || 1e9) - (parseFloat(b.ChannelNumber) || 1e9) || String(a.Name).localeCompare(b.Name));
        // the day strip (stock's guide date tabs)
        const days = el('div', 'bl-guide-days');
        for (let k = 0; k < 8; k++) { const d = new Date(Date.now() + k * 864e5); const b = B.btn('bl-guide-day' + (k === 0 ? ' active' : ''), null); b.append(el('div', 'wd', d.toLocaleDateString([], { weekday: 'short' })), el('div', 'dn', String(d.getDate()))); b.addEventListener('click', () => { T.ctx.sound('select'); B.notice(d.toLocaleDateString()); }); days.append(b); }
        const box = el('div', 'bl-guide');
        page.append(days, box);
        if (!chans.length) { box.append(el('div', 'bl-no-items', 'No channels found.')); return; }
        me.guide = ui.guideGrid(box, {
            channels: chans.map((ch) => ({ id: ch.Id, name: ch.Name, ch })),
            rows: 8, span: 150, focus: true,
            async fetch(ids, a, b) {
                const r = await Promise.resolve(c().getLiveTvPrograms({ UserId: uid(), ChannelIds: ids.join(','), MinEndDate: iso(a), MaxStartDate: iso(b), EnableImages: false, EnableUserData: false, SortBy: 'StartDate', EnableTotalRecordCount: false, Limit: 2000 }));
                return ((r && r.Items) || []).map((p) => ({ id: p.Id, channelId: p.ChannelId, start: Date.parse(p.StartDate), end: Date.parse(p.EndDate), title: p.Name, item: p }));
            },
            renderChannel(ch, cell) { cell.append(el('span', 'bl-gch-no', ch.ch.ChannelNumber || ''), el('span', 'bl-gch-name', ch.name)); },
            renderProgram(p, cell) { cell.append(el('div', 'bl-gp-title', p.title || '')); if (p.item && p.item.TimerId) cell.append(B.icon('fiber_manual_record', 'bl-gp-rec')); },
            emptyLabel: 'No program information',
            onFocus() { B.hints([['OK', 'watch'], ['≡', 'record'], ['▲ ▼', 'channels'], ['◀ ▶', 'time'], ['L1 R1', 'tabs'], ['Back', '']]); },
            onSelect(p, ch) { if (!p.gap && p.start <= Date.now() && p.end > Date.now()) playChannel({ ChannelId: ch.id }); else if (p.item) programmeMenu(p.item); }
        });
    }
    const TABFN = [
        (p) => rows(p, [{ title: 'On Now', fetch: recommended({ IsAiring: true }), go: playChannel }, { title: 'Shows', fetch: recommended({ IsAiring: false, HasAired: false, IsSeries: true, IsMovie: false, IsNews: false, IsKids: false, IsSports: false }) },
            { title: 'Movies', fetch: recommended({ IsAiring: false, HasAired: false, IsMovie: true }) }, { title: 'Sports', fetch: recommended({ IsAiring: false, HasAired: false, IsSports: true }) },
            { title: 'For Kids', fetch: recommended({ IsAiring: false, HasAired: false, IsKids: true }) }, { title: 'News', fetch: recommended({ IsAiring: false, HasAired: false, IsNews: true }) }]),
        (p, me) => guide(p, me),
        async (p) => { const r = await Promise.resolve(c().getLiveTvChannels({ UserId: uid(), AddCurrentProgram: true, EnableImages: true, ImageTypeLimit: 1, Limit: 500 })); const g = el('div', 'bl-items-grid'); for (const ch of ((r && r.Items) || []).sort((a, b) => (parseFloat(a.ChannelNumber) || 1e9) - (parseFloat(b.ChannelNumber) || 1e9))) g.append(B.card(ch, { row: false, shape: 'backdrop', lines: [`${ch.ChannelNumber ? `${ch.ChannelNumber} ` : ''}${ch.Name}`, ch.CurrentProgram ? ch.CurrentProgram.Name : ''] })); p.append(el('div', 'bl-toolbar'), g); },
        (p) => rows(p, [{ title: 'Recordings', shape: 'backdrop', fetch: () => Promise.resolve(c().getLiveTvRecordings({ UserId: uid(), Fields: B.FIELDS, EnableImages: true, Limit: 50 })).then((r) => (r && r.Items) || []) }]),
        async (p) => {
            const r = await Promise.resolve(c().getLiveTvTimers({}));
            const list = (r && r.Items) || [];
            if (!list.length) { const e = el('div', 'bl-no-items'); e.append(el('p', '', 'No items found.')); p.append(e); return; }
            const box = el('div', 'bl-schedule');
            for (const t of list) { const b = B.btn('bl-listitem', null); b.append(B.icon('fiber_manual_record', 'bl-rec'), el('div', 'bl-li-body')); b.lastChild.append(el('div', 'bl-li-title', t.Name), el('div', 'bl-li-sub', `${t.ChannelName || ''} · ${new Date(t.StartDate).toLocaleString()}`));
                b.addEventListener('click', () => B.panel.ask({ title: 'Cancel recording?', choices: [{ label: 'No', safe: true }, { label: 'Yes', run: async () => { try { await I.cancelRecording(t.Id); B.notice('Recording cancelled.'); } catch (e) { B.notice('That didn’t work', true); } } }] })); box.append(b); }
            p.append(box);
        },
        async (p) => { const r = await Promise.resolve(c().getLiveTvSeriesTimers({ SortBy: 'SortName' })); const g = el('div', 'bl-items-grid'); for (const t of (r && r.Items) || []) g.append(B.card({ Id: t.Id, Name: t.Name, Type: 'SeriesTimer', ImageTags: {} }, { row: false, shape: 'portrait', lines: [t.Name], go: () => {} })); if (!g.childElementCount) { const e = el('div', 'bl-no-items'); e.append(el('p', '', 'No items found.')); p.append(e); } else p.append(g); }
    ];
    let L = null;
    B.register('#/livetv', {
        async mount(root) {
            const tab = Math.max(0, Math.min(5, parseInt(B.params().get('tab') || '0', 10) || 0));
            const me = L = { root, tab };
            const page = B.page(root, 'bl-livetv-page' + (tab === 1 ? ' bl-guide-page' : ''));
            root.setAttribute('data-bl-screen', 'livetv');
            const h = B.header(root, { title: 'Live TV', tabs: TABS.map((t, k) => ({ label: t, go: () => B.go(`#/livetv?tab=${k}`) })), at: tab });
            B.screenTabs = () => true;
            await TABFN[tab](page, me);
            if (L !== me) return;
            if (tab !== 1) B.arrive(root, page.querySelector('.bl-card, .bl-listitem') || h.tabEls[tab]);
            root.setAttribute('data-bl-ready', '1');
        },
        unmount() { if (L && L.guide) L.guide.stop(); L = null; B.screenTabs = null; B.hintsOff(); },
        onAction(a) {
            if (!L) return false;
            if (a === 'step_backward' || a === 'step_forward') { const n = L.tab + (a === 'step_forward' ? 1 : -1); if (n < 0 || n > 5) { T.ctx.sound('error'); return true; } T.ctx.sound('navigate'); B.go(`#/livetv?tab=${n}`); return true; }
            return false;
        }
    });
})();
