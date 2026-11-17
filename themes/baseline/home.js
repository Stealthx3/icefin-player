// Baseline: the home (stock's TV home: the Home and Favorites tabs, the user's home sections in their order).
// The sections come from the user's own home settings (displayPreferences "usersettings", homesection0…9, as stock
// reads them): My Media, Continue Watching, Continue Listening, Continue Reading, Live TV (its buttons and On Now),
// Next Up, Recently Added in each library. Favorites (?tab=1) is stock's: a row per kind. Back asks "Exit Icefin?"
// (the user's Gate 1 call 5; stock has no question).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const B = window.icefinBaseline;
    if (!T || !B) return;
    const ui = T.ui;
    const el = B.el;
    const c = () => B.client();
    const uid = () => B.uid();
    const DEFAULTS = ['smalllibrarytiles', 'resume', 'resumeaudio', 'resumebook', 'livetv', 'nextup', 'latestmedia', 'none', 'none', 'none'];

    async function homeSections() {
        let prefs = null;
        try { prefs = await c().getDisplayPreferences('usersettings', uid(), 'emby'); } catch (e) { prefs = null; }
        const cp = (prefs && prefs.CustomPrefs) || {};
        const out = [];
        for (let i = 0; i < 10; i++) { const v = cp[`homesection${i}`] || DEFAULTS[i]; if (v && v !== 'none' && !out.includes(v)) out.push(v); }
        return out;
    }
    // Home Screen Sections (the server plugin, the user's call 6): when the plugin is on for this user, its sections
    // replace stock's, each drawn as a stock row; the ones that are stock's own sections draw as Baseline's. If the
    // plugin is off, slow or failing, the home is stock's.
    const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
    const PLUGIN_OWN = { MyMedia: 'smalllibrarytiles', ContinueWatching: 'resume', NextUp: 'nextup', LiveTV: 'livetv', LatestMedia: 'latestmedia' };
    const PLUGIN_SHAPE = { Portrait: 'portrait', Landscape: 'backdrop', Square: 'square' };
    async function pluginSections() {
        const cl = c();
        let meta = null;
        try { meta = await within(cl.getJSON(cl.getUrl('HomeScreen/Meta')), 3000); } catch (e) { return null; }
        if (!meta || !meta.Enabled) return null;
        let r = null;
        try { r = await within(cl.getJSON(cl.getUrl('HomeScreen/Sections', { userId: uid() })), 8000); } catch (e) { console.warn('baseline: Home Screen Sections did not answer', e); return null; }
        const list = (r && r.Items) || [];
        if (!list.length) return null;
        return list.map((sec) => {
            if (PLUGIN_OWN[sec.Section] && !sec.AdditionalData) return PLUGIN_OWN[sec.Section];
            return async () => {
                const q = { userId: uid() };
                if (sec.AdditionalData) q.additionalData = sec.AdditionalData;
                const res = await within(cl.getJSON(cl.getUrl(`HomeScreen/Section/${encodeURIComponent(sec.Section)}`, q)), 10000);
                const items = (res && res.Items) || [];
                if (!items.length) return null;
                const node = B.cardRow(sec.DisplayText || sec.Section, cards(items, { shape: PLUGIN_SHAPE[sec.ViewMode] }));
                node.setAttribute('data-bl-plugin-section', sec.Section);
                return node;
            };
        });
    }
    const cards = (items, o) => items.map((it) => B.card(it, Object.assign({ row: true }, o || {})));
    const IMG = 'Primary,Backdrop,Thumb';

    const SECTIONS = {
        async smalllibrarytiles(views) {
            if (!views.length) return null;
            return B.cardRow('My Media', views.map((v) => B.card(v, { row: true, shape: 'backdrop', lines: [v.Name] })));
        },
        async resume(views, media, title, shape) {
            const r = await Promise.resolve(c().getResumableItems(uid(), { Limit: 12, Recursive: true, Fields: B.FIELDS, ImageTypeLimit: 1, EnableImageTypes: IMG, EnableTotalRecordCount: false, MediaTypes: media || 'Video' }));
            const items = (r && r.Items) || [];
            if (!items.length) return null;
            return B.cardRow(title || 'Continue Watching', cards(items, { shape: shape || 'backdrop' }));
        },
        resumeaudio(views) { return SECTIONS.resume(views, 'Audio', 'Continue Listening', 'square'); },
        resumebook(views) { return SECTIONS.resume(views, 'Book', 'Continue Reading', 'portrait'); },
        async livetv(views) {
            if (!views.some((v) => v.CollectionType === 'livetv')) return null;
            const wrap = el('div', 'bl-livetv');
            const head = el('div', 'bl-section');
            head.append(el('h2', 'bl-section-title', 'Live TV'));
            const btns = el('div', 'bl-section-buttons');
            [['Programs', 0], ['Guide', 1], ['Channels', 2], ['Recordings', 3], ['Schedule', 4], ['Series', 5]].forEach(([label, tab]) => btns.append(B.raised(label, () => B.go(`#/livetv?tab=${tab}`))));
            head.append(btns);
            wrap.append(head);
            let r = null;
            try { r = await Promise.resolve(c().getLiveTvRecommendedPrograms({ userId: uid(), IsAiring: true, limit: 24, ImageTypeLimit: 1, EnableImageTypes: 'Primary,Thumb,Backdrop', EnableTotalRecordCount: false, Fields: 'ChannelInfo,PrimaryImageAspectRatio' })); } catch (e) { r = null; }
            const items = (r && r.Items) || [];
            if (items.length) {
                const row = B.cardRow('On Now', items.map((p) => B.card(p, { row: true, shape: 'backdrop', go: () => B.playWith({ ids: [p.ChannelId], serverId: B.sid() }),
                    progress: Math.max(0, Math.min(100, ((Date.now() - Date.parse(p.StartDate)) / ((Date.parse(p.EndDate) - Date.parse(p.StartDate)) || 1)) * 100)) })), {});
                row.querySelector('.bl-section-title').addEventListener('click', () => B.go('#/livetv?tab=0'));
                wrap.append(row);
            }
            return wrap;
        },
        async nextup() {
            const r = await Promise.resolve(c().getNextUpEpisodes({ UserId: uid(), Limit: 24, Fields: B.FIELDS, ImageTypeLimit: 1, EnableImageTypes: IMG, EnableTotalRecordCount: false, DisableFirstEpisode: false, EnableResumable: false, EnableRewatching: false, NextUpDateCutoff: new Date(Date.now() - 365 * 864e5).toISOString() }));
            const items = (r && r.Items) || [];
            if (!items.length) return null;
            return B.cardRow('Next Up', cards(items, { shape: 'backdrop' }));
        },
        async latestmedia(views) {
            let user = null;
            try { user = await c().getCurrentUser(); } catch (e) { user = null; }
            const excl = (user && user.Configuration && user.Configuration.LatestItemsExcludes) || [];
            const out = el('div', 'bl-latest');
            for (const v of views) {
                if (['livetv', 'playlists', 'boxsets', 'channels'].includes(v.CollectionType) || excl.includes(v.Id)) continue;
                let items = [];
                try { items = (await Promise.resolve(c().getLatestItems({ UserId: uid(), ParentId: v.Id, Limit: 16, Fields: B.FIELDS, ImageTypeLimit: 1, EnableImageTypes: IMG, GroupItems: true }))) || []; } catch (e) { items = []; }
                if (!items.length) continue;
                const shape = v.CollectionType === 'music' ? 'square' : (v.CollectionType === 'homevideos' || v.CollectionType === 'photos' ? 'backdrop' : 'portrait');
                const row = B.cardRow(`Recently Added in ${v.Name}`, cards(items, { shape }));
                row.querySelector('.bl-section-title').addEventListener('click', () => B.go(B.viewRoute(v)));
                out.append(row);
            }
            return out.childElementCount ? out : null;
        }
    };

    // ---- the Favorites tab (stock's favorites: a row per kind) ----
    const FAVS = [['Movie', 'Movies', 'portrait'], ['Series', 'Shows', 'portrait'], ['Episode', 'Episodes', 'backdrop'], ['Video', 'Videos', 'backdrop'], ['BoxSet', 'Collections', 'portrait'],
        ['Playlist', 'Playlists', 'square'], ['Person', 'People', 'portrait'], ['MusicArtist', 'Artists', 'square'], ['MusicAlbum', 'Albums', 'square'], ['Audio', 'Songs', 'square'], ['Book', 'Books', 'portrait']];
    async function favourites(page) {
        let any = false;
        for (const [type, label, shape] of FAVS) {
            let r;
            try { r = type === 'MusicArtist' ? await Promise.resolve(c().getArtists(uid(), { Filters: 'IsFavorite', Recursive: true, Limit: 20, Fields: B.FIELDS })) : (type === 'Person' ? await Promise.resolve(c().getPeople(uid(), { Filters: 'IsFavorite', Recursive: true, Limit: 20, Fields: B.FIELDS })) : await B.items({ Filters: 'IsFavorite', Recursive: true, IncludeItemTypes: type, Limit: 20, SortBy: 'SortName' })); } catch (e) { r = null; }
            const items = (r && r.Items) || [];
            if (!items.length) continue;
            any = true;
            page.append(B.cardRow(label, cards(items, { shape })));
        }
        if (!any) {
            const e = el('div', 'bl-no-items');
            e.append(el('h1', '', 'You don’t have any favorites yet'), el('p', '', 'Favorite movies, shows, albums, books and more to see them here.'));
            page.append(e);
        }
    }

    // ---- the exit question (stock has none; the controller's Back on the home) ----
    B.exitAsk = () => B.panel && B.panel.ask({ title: 'Exit IceFin Player?', choices: [{ label: 'Cancel', safe: true }, { label: 'Exit', run: () => B.farewell(() => T.ctx.exit()) }] });

    let S = null;
    B.register('#/home', {
        async mount(root) {
            const tab = B.params().get('tab') === '1' ? 1 : 0;
            const me = S = { root, tab };
            const page = B.page(root, 'bl-home');
            const h = B.header(root, { home: true, tabs: [{ label: 'Home', go: () => B.go('#/home') }, { label: 'Favorites', go: () => B.go('#/home?tab=1') }], at: tab });
            me.header = h;
            B.screenTabs = () => true;
            B.backWord = () => 'exit';
            root.setAttribute('data-bl-screen', 'home');
            if (tab === 1) {
                await favourites(page);
            } else {
                const views = await ui.userViews();
                if (S !== me) return;
                const list = (await pluginSections()) || await homeSections();
                if (S !== me) return;
                // each section draws where it belongs as soon as it arrives; focus lands on the first card
                const slots = list.map(() => { const s = el('div', 'bl-slot'); page.append(s); return s; });
                await Promise.all(list.map(async (id, k) => {
                    const fn = typeof id === 'function' ? id : SECTIONS[id];
                    if (!fn) return;
                    let node = null;
                    try { node = await fn(views); } catch (e) { console.error('baseline: home section', id, e); }
                    if (S !== me || !node) return;
                    slots[k].append(node);
                    if (!me.arrived && k === 0) { me.arrived = true; B.arrive(root, page.querySelector('.bl-card')); }
                }));
            }
            if (S !== me) return;
            if (!me.arrived) { me.arrived = true; B.arrive(root, page.querySelector('.bl-card') || h.tabEls[tab]); }
            root.setAttribute('data-bl-ready', '1');
        },
        unmount() { S = null; B.screenTabs = null; B.backWord = null; B.hintsOff(); },
        onAction(a) {
            if (!S) return false;
            if (a === 'step_backward' || a === 'step_forward') { const n = S.tab + (a === 'step_forward' ? 1 : -1); if (n < 0 || n > 1) { T.ctx.sound('error'); return true; } T.ctx.sound('navigate'); B.go(n ? '#/home?tab=1' : '#/home'); return true; }
            if (a === 'back') { B.exitAsk(); return true; }
            return false;
        },
        onBack() { B.exitAsk(); return true; }
    });
})();
