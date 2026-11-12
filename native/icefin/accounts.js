// Icefin theme engine: servers and sign-in, the play queue, Play on and Watch together for themes (PLAN 9.44, shared
// with 9.46). Appended after themeEngine.js; adds to the ctx every screen gets (T.ctx).
//
// Themes reach no jellyfin-web names (theme-lint rule 4): jellyfin-web hands its services to plugins when it loads
// them (inputPlugin.js keeps that object as window.icefinWebServices: ServerConnections, appRouter, appSettings,
// playbackManager, Dashboard, ...), and only this file reads them, so a jellyfin-web change is absorbed here.
//
//   ctx.servers()                  -> Promise [{id, name, address, lastUsed, current, signedIn}]: the servers this device knows
//   ctx.connect(idOrAddress)       -> Promise {state, serverId}: state 'SignedIn' (at home next), 'ServerSignIn' (sign in
//                                     next), 'Unavailable' or 'ServerUpdateNeeded'
//   ctx.forgetServer(id)           -> Promise true when this device forgot it
//   ctx.publicUsers()              -> Promise [{id, name, image, hasPassword}] on the server being signed in to
//   ctx.signIn(name, password)     -> Promise {ok, error?}; on ok the session is jellyfin-web's (it goes home)
//   ctx.quickConnect()             -> Promise null (the server has it off) or {code, done, cancel()}: show the code; done
//                                     resolves {ok} when another device approves it (signed in), or {ok:false} on cancel/expiry
//   ctx.queueItems()               -> Promise {index, items[{id, playlistItemId, name, artist, album, runtime, image}]} or null
//   ctx.playQueueAt(playlistItemId), ctx.removeFromQueue([playlistItemId…]), ctx.moveInQueue(playlistItemId, newIndex),
//   ctx.clearQueue(), ctx.saveQueueAsPlaylist(name) -> Promise true when done
//   ctx.playMode()                 -> {repeat ('RepeatNone' | 'RepeatAll' | 'RepeatOne'), shuffle (bool)} or null; ctx.setRepeat(mode),
//                                     ctx.setShuffle(on) -> Promise true
//   ctx.playTargets()              -> Promise [{id, name, kind ('this' | 'tv' | 'phone' | 'computer' | 'other'), app, current}]
//   ctx.setPlayTarget(id)          -> Promise true when what plays next plays there (id of this device: back here)
//   ctx.syncPlay.groups()          -> Promise [{id, name, people}]; join(id), create(name), leave() -> Promise true;
//   ctx.syncPlay.current()         -> {id, name} of the group this device is in, or null
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (!T || !T.ctx || T.ctx.servers) return;
    const web = () => window.icefinWebServices || {};
    const conn = () => web().ServerConnections || null;
    const pm = () => web().playbackManager || window.icefinPlaybackManager || null;
    const dash = () => web().dashboard || window.Dashboard || null;
    const safe = (fn, d) => { try { const v = fn(); return v === undefined ? d : v; } catch (e) { return d; } };
    const api = () => {
        const c = conn();
        return (c && safe(() => c.currentApiClient(), null)) || window.ApiClient || null;
    };
    const ajax = (c, type, path, query, body) => c.ajax({ type, url: c.getUrl(path, query), data: body ? JSON.stringify(body) : undefined, contentType: body ? 'application/json' : undefined, dataType: 'json' });
    const go = (hash) => { location.hash = hash; };

    // ---- servers and sign-in ----
    let syncGroup = null;   // the Watch together group this device is in, from the server's messages
    async function servers() {
        const c = conn();
        if (!c) return [];
        const list = safe(() => c.getSavedServers(), []) || [];
        const now = api();
        const curId = now ? safe(() => now.serverId(), '') : '';
        return list.map((s) => ({ id: s.Id, name: s.Name || s.ManualAddress || s.LocalAddress || '', address: s.ManualAddress || s.LocalAddress || s.RemoteAddress || '',
            lastUsed: s.DateLastAccessed ? new Date(s.DateLastAccessed) : null, current: s.Id === curId, signedIn: !!(s.AccessToken && s.UserId) }))
            .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    }
    async function connect(idOrAddress) {
        const c = conn();
        if (!c) return { state: 'Unavailable' };
        const saved = (safe(() => c.getSavedServers(), []) || []).find((s) => s.Id === idOrAddress);
        const opts = { enableAutoLogin: safe(() => web().appSettings.enableAutoLogin(), true) };
        let r;
        try { r = saved ? await c.connectToServer(saved, opts) : await c.connectToAddress(String(idOrAddress), opts); } catch (e) { return { state: 'Unavailable' }; }
        const state = (r && r.State) || 'Unavailable';
        const id = (r && r.ApiClient && safe(() => r.ApiClient.serverId(), '')) || (saved && saved.Id) || '';
        if (state === 'SignedIn') {
            const ac = r.ApiClient;
            const d = dash();
            if (d && d.onServerChanged && ac) safe(() => d.onServerChanged(ac.getCurrentUserId(), ac.accessToken(), ac));
            go('#/home');
        } else if (state === 'ServerSignIn') go(`#/login?serverid=${encodeURIComponent(id)}`);
        return { state, serverId: id };
    }
    async function forgetServer(id) {
        const c = conn();
        if (!c || !c.deleteServer) return false;
        try { await c.deleteServer(id); return true; } catch (e) { return false; }
    }
    function loginClient() {
        const c = conn();
        const m = /[?&]serverid=([^&]+)/i.exec(location.hash);
        return (m && c && safe(() => c.getApiClient(decodeURIComponent(m[1])), null)) || api();
    }
    async function publicUsers() {
        const c = loginClient();
        if (!c) return [];
        let list = [];
        try { list = await c.getPublicUsers(); } catch (e) { list = []; }
        return (list || []).map((u) => ({ id: u.Id, name: u.Name, hasPassword: !!u.HasPassword,
            image: u.PrimaryImageTag ? safe(() => c.getUserImageUrl(u.Id, { type: 'Primary', tag: u.PrimaryImageTag, maxWidth: 300 }), null) : null }));
    }
    function signedIn(c, result) {
        const d = dash();
        if (d && d.onServerChanged && result && result.User) safe(() => d.onServerChanged(result.User.Id, result.AccessToken, c));
        go('#/home');
    }
    async function signIn(name, password) {
        const c = loginClient();
        if (!c) return { ok: false, error: 'No server' };
        try {
            const r = await c.authenticateUserByName(name, password || '');
            signedIn(c, r);
            return { ok: true };
        } catch (e) {
            const status = e && (e.status || (e.response && e.response.status));
            return { ok: false, error: status === 401 ? 'That name and password don’t match' : 'The server didn’t answer' };
        }
    }
    async function quickConnect() {
        const c = loginClient();
        if (!c) return null;
        let enabled = false;
        try { enabled = await c.getJSON(c.getUrl('QuickConnect/Enabled')); } catch (e) { enabled = false; }
        if (!enabled) return null;
        let start;
        try { start = await ajax(c, 'POST', 'QuickConnect/Initiate'); } catch (e) { return null; }
        let stop = false;
        const done = (async () => {
            const until = Date.now() + 5 * 60 * 1000;
            while (!stop && Date.now() < until) {
                await new Promise((r) => setTimeout(r, 4000));
                if (stop) break;
                let s = null;
                try { s = await c.getJSON(c.getUrl('QuickConnect/Connect', { Secret: start.Secret })); } catch (e) { s = null; }
                if (s && s.Authenticated) {
                    try {
                        const r = await ajax(c, 'POST', 'Users/AuthenticateWithQuickConnect', null, { Secret: start.Secret });
                        if (c.onAuthenticated) await c.onAuthenticated(c, r);   // the connection manager keeps the sign-in
                        signedIn(c, r);
                        return { ok: true };
                    } catch (e) { return { ok: false }; }
                }
            }
            return { ok: false };
        })();
        return { code: start.Code, expires: new Date(Date.now() + 5 * 60 * 1000), done, cancel() { stop = true; } };
    }

    // ---- the play queue ----
    async function queueItems() {
        const m = pm();
        if (!m) return null;
        const list = await Promise.resolve(safe(() => m.getPlaylist(), [])).catch(() => []);
        if (!list || !list.length) return null;
        const curId = safe(() => m.getCurrentPlaylistItemId(), null);
        const c = api();
        return {
            index: Math.max(0, list.findIndex((x) => x.PlaylistItemId === curId)),
            items: list.map((x) => ({ id: x.Id, playlistItemId: x.PlaylistItemId, name: x.Name || '', artist: (x.Artists || [])[0] || x.AlbumArtist || x.SeriesName || '', album: x.Album || '',
                runtime: x.RunTimeTicks ? x.RunTimeTicks / 10000 : 0, type: x.Type || '',
                image: c ? (x.AlbumId && x.AlbumPrimaryImageTag ? safe(() => c.getScaledImageUrl(x.AlbumId, { type: 'Primary', tag: x.AlbumPrimaryImageTag, maxWidth: 160 }), null)
                    : x.ImageTags && x.ImageTags.Primary ? safe(() => c.getScaledImageUrl(x.Id, { type: 'Primary', tag: x.ImageTags.Primary, maxWidth: 160 }), null) : null) : null }))
        };
    }
    const qrun = (fn) => { const m = pm(); if (!m) return Promise.resolve(false); return Promise.resolve(safe(() => fn(m), null)).then(() => true, () => false); };
    const playQueueAt = (id) => qrun((m) => m.setCurrentPlaylistItem(id));
    const removeFromQueue = (ids) => qrun((m) => m.removeFromPlaylist([].concat(ids)));
    const moveInQueue = (id, to) => qrun((m) => m.movePlaylistItem(id, to));
    const clearQueue = () => qrun((m) => (m.clearQueue ? m.clearQueue(true) : m.stop()));
    // repeat and shuffle for what plays (music too, where ui.player's controls aren't up)
    function playMode() {
        const m = pm();
        const p = m && safe(() => m.getCurrentPlayer(), null);
        if (!m || !p) return null;
        return { repeat: safe(() => m.getRepeatMode(p), 'RepeatNone'), shuffle: safe(() => m.getQueueShuffleMode(p), 'Sorted') === 'Shuffle' };
    }
    const setRepeat = (mode) => qrun((m) => m.setRepeatMode(mode, m.getCurrentPlayer()));
    const setShuffle = (on) => qrun((m) => m.setQueueShuffleMode(on ? 'Shuffle' : 'Sorted', m.getCurrentPlayer()));
    async function saveQueueAsPlaylist(name) {
        const q = await queueItems();
        const c = api();
        if (!q || !c || !name) return false;
        try { await ajax(c, 'POST', 'Playlists', null, { Name: name, Ids: q.items.map((x) => x.id), UserId: c.getCurrentUserId() }); return true; } catch (e) { return false; }
    }

    // ---- Play on ----
    const KIND = (t) => { const d = String(t.deviceType || '').toLowerCase(); return t.isLocalPlayer ? 'this' : /tv/.test(d) ? 'tv' : /mobile|phone|tablet/.test(d) ? 'phone' : /desktop|computer|web|browser/.test(d) ? 'computer' : 'other'; };
    async function playTargets() {
        const m = pm();
        if (!m || !m.getTargets) return [];
        const list = (await Promise.resolve(safe(() => m.getTargets(), [])).catch(() => [])) || [];
        const now = safe(() => m.getPlayerInfo(), null);
        const remote = !!(now && !now.isLocalPlayer);
        const out = list.map((t) => ({ id: t.id, name: t.name || t.deviceName || '', kind: KIND(t), app: t.appName || '', current: remote ? now.id === t.id : !!t.isLocalPlayer }));
        // this device is always a target (jellyfin-web lists none while nothing else is signed in)
        if (!out.some((t) => t.kind === 'this')) out.unshift({ id: 'localplayer', name: 'This Icefin', kind: 'this', app: 'Icefin', current: !remote });
        return out;
    }
    async function setPlayTarget(id) {
        const m = pm();
        if (!m) return false;
        const list = await Promise.resolve(safe(() => m.getTargets(), [])).catch(() => []);
        const t = (list || []).find((x) => x.id === id) || (id === 'localplayer' ? { isLocalPlayer: true } : null);
        if (!t) return false;
        try { if (t.isLocalPlayer) m.setDefaultPlayerActive(); else await m.trySetActivePlayer(t.playerName, t); return true; } catch (e) { return false; }
    }

    // ---- Watch together (SyncPlay): the server's groups; jellyfin-web follows the group from the server's messages ----
    const syncPlay = {
        async groups() {
            const c = api();
            if (!c) return [];
            let list = [];
            try { list = await c.getJSON(c.getUrl('SyncPlay/List')); } catch (e) { list = []; }
            return (list || []).map((g) => ({ id: g.GroupId, name: g.GroupName || 'Group', people: (g.Participants || []).length }));
        },
        async join(id) {
            const c = api();
            if (!c) return false;
            try { await ajax(c, 'POST', 'SyncPlay/Join', null, { GroupId: id }); } catch (e) { return false; }
            const g = (await syncPlay.groups()).find((x) => x.id === id);
            syncGroup = { id, name: (g && g.name) || 'Group' };
            return true;
        },
        async create(name) {
            const c = api();
            if (!c) return false;
            const before = new Set((await syncPlay.groups()).map((g) => g.id));
            try { await ajax(c, 'POST', 'SyncPlay/New', null, { GroupName: name || 'Watch together' }); } catch (e) { return false; }
            // the new group is the one that wasn't there before (the server's messages say so too, where they reach us)
            for (let i = 0; i < 6 && !syncGroup; i++) {
                const g = (await syncPlay.groups()).find((x) => !before.has(x.id));
                if (g) { syncGroup = { id: g.id, name: g.name }; break; }
                await new Promise((r) => setTimeout(r, 300));
            }
            return true;
        },
        async leave() { const c = api(); if (!c) return false; try { await ajax(c, 'POST', 'SyncPlay/Leave'); syncGroup = null; return true; } catch (e) { return false; } },
        current: () => syncGroup
    };
    // the group this device is in, from the server's SyncPlay messages
    const watchMessages = () => {
        const ev = web().events || window.Events;
        const c = api();
        if (!ev || !c || watchMessages.on === c) return;
        watchMessages.on = c;
        safe(() => ev.on(c, 'message', (e, msg) => {
            if (!msg || msg.MessageType !== 'SyncPlayGroupUpdate' || !msg.Data) return;
            const d = msg.Data;
            if (d.Type === 'GroupJoined' && d.Data) syncGroup = { id: d.GroupId, name: d.Data.GroupName || 'Group' };
            else if (d.Type === 'GroupLeft' || d.Type === 'NotInGroup' || d.Type === 'GroupDoesNotExist') syncGroup = null;
        }));
    };
    setInterval(watchMessages, 2000);

    Object.assign(T.ctx, {
        servers, connect, forgetServer, publicUsers, signIn, quickConnect,
        queueItems, playQueueAt, removeFromQueue, moveInQueue, clearQueue, saveQueueAsPlaylist, playMode, setRepeat, setShuffle,
        playTargets, setPlayTarget, syncPlay
    });
})();
