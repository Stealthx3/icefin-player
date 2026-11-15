// Almanac: the home and Settings (PLAN 9.49; the canvas's Home, HomeMusic, ExitPanel, Settings and HomeOrder boards).
// The home is what to watch as rows like a guide: Now playing (while music plays), Continue watching, Next up, On now
// (Live TV), each library's newest, Favourites and the Libraries; their order and which show is the user's
// (Settings › Home, settings.js). Settings is #/home?al=settings: the user, the preference pages, Play on and Watch
// together, this player, the server, and Exit. The server's status sits in the pane's small line; Back on the home
// asks "Exit Icefin?", Cancel focused.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinAlmanac;
    if (!T || !D || !D.columnScreen) return;
    const ui = T.ui;
    const el = D.el;
    const c = () => D.client();
    const uid = () => D.uid();

    // ---- Settings › Home: the user's order and choices, per user on this device ----
    const prefKey = () => `icefin.almanac.home.${D.uid()}`;
    D.homePrefs = () => {
        let p = null;
        try { p = JSON.parse(localStorage.getItem(prefKey()) || 'null'); } catch (e) { p = null; }
        return Object.assign({ order: [], hidden: [], rows: [], rowsHidden: [] }, p || {});
    };
    D.saveHomePrefs = (p) => { try { localStorage.setItem(prefKey(), JSON.stringify(p)); } catch (e) { /* private window */ } };
    D.orderedViews = (views, prefs) => {
        const order = prefs.order || [];
        return views.slice().sort((a, b) => {
            const ia = order.indexOf(a.Id), ib = order.indexOf(b.Id);
            return (ia < 0 ? 1e6 + views.indexOf(a) : ia) - (ib < 0 ? 1e6 + views.indexOf(b) : ib);
        });
    };

    // ---- the home's rows (each a folder: its level loads as the row comes into view) ----
    const IMG = 'Primary,Backdrop,Thumb';
    const lv = (title, load, empty) => ({ title, load, empty: empty || { title: 'Nothing here yet' } });
    const resume = () => lv('Continue watching', async () => {
        const r = await Promise.resolve(c().getResumableItems(uid(), { Limit: 30, Fields: D.FIELDS, MediaTypes: 'Video', EnableImageTypes: IMG }));
        return ((r && r.Items) || []).map((it) => Object.assign(D.entry(it, { resume: true }), { name: it.Type === 'Episode' ? (it.SeriesName || it.Name) : it.Name, okLabel: 'resume', go: () => D.playItem(it, true) }));
    }, { title: 'Nothing in progress', text: 'what you start and leave part way shows here' });
    const nextUp = () => lv('Next up', async () => {
        const r = await Promise.resolve(c().getNextUpEpisodes({ UserId: uid(), Limit: 30, Fields: D.FIELDS, EnableImageTypes: IMG }));
        return ((r && r.Items) || []).map((it) => Object.assign(D.entry(it, { resume: true }), { name: it.SeriesName || it.Name, sub: `S${it.ParentIndexNumber} · E${it.IndexNumber} · ${it.Name}`, cellSub: `S${it.ParentIndexNumber} E${it.IndexNumber}`, okLabel: 'play', go: () => D.playItem(it, true) }));
    }, { title: 'Nothing up next', text: 'start a show and its next episode waits here' });
    const onNow = () => lv('On now', async () => {
        const r = await Promise.resolve(c().getLiveTvChannels({ UserId: uid(), AddCurrentProgram: true, EnableImages: true, ImageTypeLimit: 1, EnableUserData: false, Limit: 60 }));
        const list = ((r && r.Items) || []).sort((a, b) => (parseFloat(a.ChannelNumber) || 1e9) - (parseFloat(b.ChannelNumber) || 1e9));
        return list.map((ch) => {
            const p = ch.CurrentProgram;
            const s = p ? Date.parse(p.StartDate) : 0, e = p ? Date.parse(p.EndDate) : 0;
            return { name: `${ch.ChannelNumber ? `${ch.ChannelNumber} · ` : ''}${p ? p.Name : ch.Name}`, sub: [ch.Name, p ? `until ${D.time(new Date(e))}` : 'no information'].join(' · '),
                cellSub: p ? `until ${D.time(new Date(e))}` : '', line: p && p.Overview ? p.Overview : '', item: ch, okLabel: 'watch',
                progress: p ? Math.max(0.01, Math.min(0.99, (Date.now() - s) / ((e - s) || 1))) : 0,
                go: () => T.ctx.play({ ids: [ch.Id], serverId: D.sid() }), menu: () => D.liveOptions && D.liveOptions(ch) };
        });
    }, { title: 'No channels', text: 'this server has no Live TV channels' });
    const latest = (v) => {
        const types = { movies: 'Movie', tvshows: 'Episode', music: 'MusicAlbum', books: 'Book', musicvideos: 'MusicVideo', homevideos: 'Video,Photo', photos: 'Photo,Video' }[v.CollectionType];
        return lv(`New in ${v.Name}`, async () => {
            const r = await Promise.resolve(c().getLatestItems({ UserId: uid(), ParentId: v.Id, Limit: 30, Fields: D.FIELDS, IncludeItemTypes: types, EnableImageTypes: IMG }));
            return (r || []).map((it) => D.entry(it));
        }, { title: 'Nothing new' });
    };
    const favourites = () => lv('Favourites', async () => {
        const list = await D.items({ Filters: 'IsFavorite', Recursive: true, SortBy: 'SortName', IncludeItemTypes: 'Movie,Series,MusicAlbum,MusicArtist,Playlist,BoxSet,Book,Video', Limit: 60 });
        return list.map((it) => D.entry(it));
    }, { title: 'No favourites yet', text: '≡ on anything, then Add to favourites' });
    const libraries = (views) => lv('Libraries', async () => views.map((v) => ({ name: v.Name, sub: 'library', icon: D.kindIcon(v.CollectionType), okLabel: 'open', go: () => T.ctx.navigate(D.viewRoute(v)) })));

    // The rows a home can have, in the default order; Settings › Home reorders and hides them
    D.homeRows = (views) => {
        const out = [{ id: 'resume', name: 'Continue watching', level: resume }, { id: 'nextup', name: 'Next up', level: nextUp }];
        if (views.some((v) => v.CollectionType === 'livetv')) out.push({ id: 'onnow', name: 'On now · Live TV', level: onNow });
        for (const v of views) if (!['livetv', 'boxsets', 'playlists', 'folders'].includes(v.CollectionType)) out.push({ id: `latest:${v.Id}`, name: `New in ${v.Name}`, level: () => latest(v) });
        out.push({ id: 'favourites', name: 'Favourites', level: favourites }, { id: 'libraries', name: 'Libraries', level: () => libraries(views) });
        return out;
    };
    D.orderedRows = (rows, prefs) => {
        const order = prefs.rows || [];
        return rows.slice().sort((a, b) => {
            const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
            return (ia < 0 ? 1e6 + rows.indexOf(a) : ia) - (ib < 0 ? 1e6 + rows.indexOf(b) : ib);
        });
    };
    async function homeEntries() {
        const views = await D.loadViews();
        const prefs = D.homePrefs();
        const shown = D.orderedViews(views, prefs).filter((v) => !(prefs.hidden || []).includes(v.Id));
        const out = [];
        // while music plays, Now playing is the home's first row (HomeMusic board)
        const np = D.nowPlayingEntry && D.nowPlayingEntry();
        if (np) {
            const song = np.sub.split(' · ')[0] || 'Now playing';
            out.push({ name: '♪ Now playing', asRow: true, open: () => lv('Now playing', async () => [
                Object.assign({}, np, { name: song, cellSub: 'playing', focusFirst: true }),
                { name: 'The queue', sub: 'what plays next', okLabel: 'open', go: () => T.ctx.navigate('#/queue') },
                { name: 'Lyrics', sub: 'follow the song', okLabel: 'open', go: () => T.ctx.navigate('#/lyrics') }
            ]) });
        }
        for (const r of D.orderedRows(D.homeRows(shown), prefs)) {
            if ((prefs.rowsHidden || []).includes(r.id)) continue;
            out.push({ name: r.name, open: r.level, homeRow: r.id });
        }
        return out;
    }

    // ---- Settings (Settings board) ----
    const go = (hash) => () => T.ctx.navigate(hash);
    D.exitAsk = () => D.panel.ask({ title: 'Exit Icefin?', path: 'Icefin', choices: [{ label: 'Cancel', safe: true }, { label: 'Exit', run: () => T.ctx.exit() }] });
    D.signOutAsk = (user) => D.panel.ask({ title: 'Sign out?', path: user ? `${user.Name} on ${D.serverName || 'this server'}` : '', choices: [{ label: 'Stay signed in', safe: true }, { label: 'Sign out', run: () => T.ctx.signOut() }] });
    D.settingsEntries = async () => {
        let user = null;
        try { user = await c().getCurrentUser(); } catch (e) { user = null; }
        const admin = !!(user && user.Policy && user.Policy.IsAdministrator);
        const a = (row, name, sub, run, o) => Object.assign({ row, name, sub, okLabel: 'open', go: run }, o || {});
        const out = [
            a('You', 'Profile', 'your picture and password', go('#/userprofile')),
            a('You', 'Quick Connect', 'sign in another device', go('#/quickconnect')),
            a('You', 'Switch user', 'sign out here and choose who signs in', () => D.panel.ask({ title: 'Switch user?', path: 'You', text: 'You sign out here and choose who signs in.', choices: [{ label: 'Stay', safe: true }, { label: 'Switch user', run: () => T.ctx.signOut() }] }), { okLabel: 'choose' }),
            a('You', 'Sign out', user ? `${user.Name} on ${D.serverName || 'this server'}` : '', () => D.signOutAsk(user), { okLabel: 'choose' }),
            a('Preferences', 'Display', 'how it looks: language, dates, the pages', go('#/mypreferencesdisplay'), { focusFirst: true }),
            a('Preferences', 'Home', 'which rows Home shows, and their order', go('#/mypreferenceshome')),
            a('Preferences', 'Playback', 'quality, audio, skipping intros', go('#/mypreferencesplayback')),
            a('Preferences', 'Subtitles', 'language, size, look', go('#/mypreferencessubtitles')),
            a('Preferences', 'Controls', 'remote and pad', go('#/mypreferencescontrols')),
            a('Play', 'Play on…', 'send what plays to another device', () => D.playOn && D.playOn('play', null), { okLabel: 'choose' }),
            a('Play', 'Watch together…', 'join or start a group', () => D.playOn && D.playOn('together', null), { okLabel: 'choose' }),
            a('This player', 'Client settings', 'theme, audio passthrough, display and HDR, about', go('#/mypreferencesmenu')),
            a('This player', 'Classic view', 'jellyfin-web’s own pages, until you come back', () => { if (ui.settings && ui.settings.classic) ui.settings.classic(); else T.ctx.navigate('#/home?icefin=stock'); }),
            a('This player', 'Classic home', 'jellyfin-web’s home, once', go('#/home?icefin=stock')),
            a('Server', `${D.serverName || 'This server'}`, `${D.serverUp === false ? '○ not answering' : '● reachable'} · change server`, () => T.ctx.selectServer(), { okLabel: 'choose' })
        ];
        if (admin) out.push(a('Server', 'Dashboard', 'administration (jellyfin-web’s)', go('#/dashboard')));
        out.push(a('Leave', 'Exit Icefin…', '', () => D.exitAsk(), { okLabel: 'choose' }));
        return out;
    };

    // ---- the server's status: pinged every 60 s ----
    async function ping() {
        const cl = c();
        if (!cl) return;
        try {
            const info = await cl.getPublicSystemInfo();
            D.serverName = (info && info.ServerName) || D.serverName;
            D.serverUp = true;
        } catch (e) { D.serverUp = false; }
        const s = document.querySelector('.al-server');
        if (s) { s.textContent = `${D.serverUp ? '●' : '○'} ${D.serverName || 'server'}`; s.classList.toggle('down', !D.serverUp); s.setAttribute('aria-label', `${D.serverName || 'Server'}: ${D.serverUp ? 'reachable' : 'not answering'}; choose a server`); }
        if (!D.serverUp && D.notice) D.notice(`Couldn’t reach ${D.serverName || 'the server'}`, true);
    }

    let timer = 0;
    D.columnScreen('#/home', {
        name: 'home',
        key: () => (D.params().get('al') === 'settings' ? '#/home?al=settings' : '#/home'),
        root(p) {
            if (p.get('al') === 'settings') return { title: 'Settings', headTitle: 'Settings', count: false, load: D.settingsEntries };
            return { title: 'Home', headTitle: 'what to watch now', count: false, load: homeEntries, backLabel: 'exit', onBack: () => { D.exitAsk(); return true; } };
        },
        mounted(C, root) {
            const box = root.querySelector('.al-clock');
            if (box) {
                const srv = el('button', 'al-server', `● ${D.serverName || '…'}`);
                srv.type = 'button';
                srv.addEventListener('click', () => { T.ctx.sound('select'); T.ctx.selectServer(); });
                box.append(srv);
            }
            ping();
            clearInterval(timer);
            timer = setInterval(ping, 60000);
        },
        unmounted() { clearInterval(timer); }
    });
})();
