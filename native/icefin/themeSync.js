// Icefin theme engine: per-user theme choice (PLAN 8.5, SPEC "Per-user settings"). Appended to the injected native
// shell script after themeEngine.js.
// - Tells ThemeComponent who is signed in, so it applies that user's cached choice at once.
// - Syncs the choice with the server: DisplayPreferences "usersettings", client "icefin-player", custom pref
//   "icefin.theme" = {"schema":1,"theme","preset","scheme","timestamp"} (scheme since 9.20; older entries have none). The newest timestamp wins, in either direction.
// - Stands down when the server's theme plugin runtime is present: its settings API owns the choice then.
(function () {
    'use strict';
    if (window.icefinThemeSync || !window.apiPromise) return;
    const CLIENT = 'icefin-player';
    const KEY = 'icefin.theme';
    const PREFS = 'usersettings';
    let user = null;
    let synced = 0;  // timestamp known to match the server
    let busy = Promise.resolve();

    const qt = (fn, ...args) => new Promise((r) => fn(...args, r));

    function client() {
        const c = window.ApiClient;
        return c && c.getCurrentUserId && c.accessToken && c.accessToken() ? c : null;
    }

    async function prefs(c, uid, body) {
        const url = c.getUrl(`DisplayPreferences/${PREFS}`, { userId: uid, client: CLIENT });
        const headers = { Authorization: `MediaBrowser Token="${c.accessToken()}"`, 'Content-Type': 'application/json' };
        const res = await fetch(url, body ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers });
        if (!res.ok) throw new Error(`DisplayPreferences ${body ? 'POST' : 'GET'} ${res.status}`);
        return body ? null : res.json();
    }

    async function push(api, c, uid) {
        const sel = await qt(api.theme.selection);
        if (!sel.timestamp || sel.timestamp <= synced) return;
        const p = await prefs(c, uid);
        p.CustomPrefs = p.CustomPrefs || {};
        p.CustomPrefs[KEY] = JSON.stringify({ schema: 1, theme: sel.theme, preset: sel.preset, scheme: sel.scheme || '', timestamp: sel.timestamp });
        p.Client = CLIENT;
        await prefs(c, uid, p);
        synced = sel.timestamp;
        console.info('icefinThemeSync: saved to the server', sel.theme || '(off)');
    }

    async function syncUser(api, c, uid) {
        await qt(api.theme.setUser, uid);
        const local = await qt(api.theme.selection);
        let remote = null;
        try {
            const p = await prefs(c, uid);
            remote = JSON.parse((p.CustomPrefs || {})[KEY] || 'null');
        } catch (e) { console.warn('icefinThemeSync: no server copy', e.message); }
        const lt = local.timestamp || 0;
        const rt = (remote && remote.schema === 1 && remote.timestamp) || 0;
        if (rt > lt) {
            await qt(api.theme.applyRemote, remote.theme || '', remote.preset || '', remote.scheme || '', rt);
            synced = rt;
            console.info('icefinThemeSync: server choice is newer', remote.theme || '(off)');
        } else if (lt > rt) {
            synced = rt;
            await push(api, c, uid);
        } else {
            synced = lt;
        }
    }

    const queue = (job) => { busy = busy.then(job).catch((e) => console.error('icefinThemeSync:', e)); return busy; };

    window.icefinThemeSync = { user: () => user, synced: () => synced, idle: () => busy };

    window.apiPromise.then((api) => {
        if (!api.theme || !api.theme.setUser) return;
        // jellyfin-web has no stable sign-in event across versions: watch the current user.
        setInterval(() => {
            if (window.icefinPluginRuntime) return;
            const c = client();
            const uid = c ? c.getCurrentUserId() : null;
            if (!uid || uid === user) return;
            user = uid;
            synced = 0;
            queue(() => syncUser(api, c, uid));
        }, 1000);
        api.theme.changed.connect(() => {
            const c = client();
            if (!c || !user || window.icefinPluginRuntime) return;
            const uid = user;
            queue(() => push(api, c, uid));
        });
    });
})();
