// Icefin theme engine: web runtime (PLAN 8.3, SPEC "Theme-engine layer"). Appended to the injected native shell
// script after tokenEngine.js. Theme-agnostic: it loads whatever the active package declares and knows no theme.
//
// - Assets come over icefin-theme://<id>/… (ThemeScheme; spike 2.7), already filtered by the package's trust level:
//   styles.css as a <link>, fonts as @font-face, scripts in order.
// - Router: theme scripts register screens for routes (window.icefinTheme.registerScreen). On a registered route
//   the runtime mounts that screen in an overlay above jellyfin-web; every other route is jellyfin-web's own.
// - Focus engine: while a themed screen is up, input actions (inputPlugin.js, ICEFIN-HOOK) go here first: arrows
//   move focus between [data-icefin-focus] elements by position, enter clicks, back asks the screen. Themes can't
//   remap input; anything not used falls through to jellyfin-web.
(function () {
    'use strict';
    if (window.icefinTheme || !window.apiPromise) return;

    const ASSET = 'data-icefin-theme-asset';
    const ROOT_ID = 'icefin-theme-root';
    const FOCUS = '[data-icefin-focus]';
    const FOCUSED = 'icefin-focused';

    let pkg = null;           // activePackage() of the mounted theme, or null
    let generation = 0;       // bumps on every mount so late script loads from an old theme are ignored
    let screens = {};         // route -> {mount(root, ctx), unmount?(), onBack?()}
    let loadingTheme = null;  // id that registerScreen calls belong to while its scripts load
    let current = null;       // {route, screen}
    let actionHooks = [];     // engine capabilities (capabilities.js) that take actions first: (action) => handled
    let resetHooks = [];      // called when the theme changes, so capabilities drop their state

    function route() {
        const h = (location.hash || '#/').split('?')[0];
        return h.replace(/\.html$/, '');
    }

    // While a themed screen is up, jellyfin-web's own chrome and page step aside (kept in the DOM, so their state and any
    // plugin injection survive; they come back as soon as the route is jellyfin-web's again).
    const SCREEN_CLASS = 'icefin-screen';
    function screenShown(on) {
        const h = document.documentElement;
        if (!h) return;
        h.classList.toggle(SCREEN_CLASS, on);
        if (on && !document.getElementById('icefin-screen-style')) {
            const st = document.createElement('style');
            st.id = 'icefin-screen-style';
            // 10.11's legacy chrome and pages, and 10.12+'s React app (#reactRoot: MUI app bar, drawer, pages).
            // Descendants too: jellyfin-web sets visibility: visible on some of its own (the list page's A-Z picker).
            const hide = ['.skinHeader', '.mainDrawer', '.mainDrawerHandle', '.mainAnimatedPages', '.backgroundContainer', '#reactRoot']
                .map((s) => `html.${SCREEN_CLASS} ${s}, html.${SCREEN_CLASS} ${s} *`).join(', ');
            st.textContent = `${hide} { visibility: hidden !important; }`
                // the hidden page's height would still show the document's scrollbar beside the screen
                + ` html.${SCREEN_CLASS}, html.${SCREEN_CLASS} body { overflow: hidden !important; }`;
            (document.head || h).append(st);
        }
    }

    function root() {
        let el = document.getElementById(ROOT_ID);
        if (!el && document.body) {
            el = document.createElement('div');
            el.id = ROOT_ID;
            el.setAttribute('role', 'application');
            el.hidden = true;
            el.style.cssText = 'position:fixed;inset:0;z-index:999;overflow:auto';
            document.body.appendChild(el);
        }
        return el;
    }

    // ---- assets ----
    function clearAssets() {
        document.querySelectorAll(`[${ASSET}]`).forEach((e) => e.remove());
    }

    function addAsset(el) {
        el.setAttribute(ASSET, '');
        (document.head || document.documentElement).appendChild(el);
        return el;
    }

    function loadScript(url, gen) {
        return new Promise((resolve) => {
            if (gen !== generation) return resolve(false);
            const s = document.createElement('script');
            s.src = url;
            s.onload = () => resolve(true);
            s.onerror = () => { console.error('icefinTheme: script failed', url); resolve(false); };
            addAsset(s);
        });
    }

    // Stand-down (SPEC "Stand-down", docs/themes/PACKAGE.md): if the server injects the theme plugin's runtime,
    // this runtime doesn't mount; the native side still offers its services to that runtime once.
    let handshakeDone = false;
    function standDown(api) {
        const rt = window.icefinPluginRuntime;
        if (!rt) return false;
        if (!handshakeDone && typeof rt.attachNative === 'function') {
            handshakeDone = true;
            try {
                rt.attachNative({
                    version: 1,
                    client: 'icefin-player',
                    tokens: () => new Promise((r) => api.theme.tokens(r)),
                    playSound: (name) => api.theme.playSound(String(name)),
                    // The native backdrop joins this handshake when it exists (8.4).
                    services: ['tokens', 'sounds']
                });
            } catch (e) { console.error('icefinTheme: plugin runtime handshake failed', e); }
        }
        return true;
    }

    async function mount(next, api) {
        const gen = ++generation;
        unmountScreen();
        clearAssets();
        screens = {};
        actionHooks = [];
        resetHooks.forEach((f) => { try { f(); } catch (e) { console.error('icefinTheme: reset hook', e); } });
        pkg = next && next.id && !(api && standDown(api)) ? next : null;
        document.documentElement.toggleAttribute('data-icefin-theme', !!pkg);
        // The native backdrop (8.4) draws under the page: html[data-icefin-backdrop] lets the adapter and the theme
        // make page backgrounds transparent.
        document.documentElement.toggleAttribute('data-icefin-backdrop', !!(pkg && pkg.backdrop));
        if (!pkg) { route_(); return; }
        if (pkg.styles) {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = pkg.styles;
            addAsset(l);
        }
        if (pkg.fonts && pkg.fonts.length) {
            const st = document.createElement('style');
            st.textContent = pkg.fonts.map((f) => `@font-face{font-family:${JSON.stringify(f.family)};` +
                `src:url(${JSON.stringify(f.url)});font-weight:${String(f.weight).replace(/[^0-9a-z ]/gi, '')};` +
                `font-style:${String(f.style).replace(/[^a-z]/gi, '')};font-display:swap}`).join('\n');
            addAsset(st);
        }
        loadingTheme = pkg.id;
        for (const url of pkg.scripts || []) {
            if (!(await loadScript(url, gen)) && gen !== generation) return;
        }
        if (gen !== generation) return;
        loadingTheme = null;
        route_();
    }

    // ---- router ----
    function unmountScreen() {
        if (!current) return;
        try { current.screen.unmount && current.screen.unmount(); } catch (e) { console.error('icefinTheme: unmount', e); }
        current = null;
        const r = document.getElementById(ROOT_ID);
        if (r) {
            r.hidden = true;
            r.textContent = '';
            // A fresh root for the next screen: no styles, classes or data attributes left behind.
            for (const at of [...r.attributes]) if (!['id', 'role', 'hidden'].includes(at.name)) r.removeAttribute(at.name);
            r.style.cssText = 'position:fixed;inset:0;z-index:999;overflow:auto';
        }
        screenShown(false);
    }

    // Theme screens load the user's library as they mount, so they wait for a signed-in API client: right after a
    // page load (the 8.4 backdrop reload, a cold start with a theme chosen) the theme is known before jellyfin-web has
    // restored the session.
    const signedIn = () => {
        const c = window.ApiClient;
        try { return !!(c && c.accessToken && c.accessToken() && c.getCurrentUserId && c.getCurrentUserId()); } catch (e) { return false; }
    };
    let signInWait = null;

    function route_() {
        const path = route();
        // "?icefin=stock" on any route shows jellyfin-web's own page, so plugin UI a themed screen replaces (home
        // sections, for example) stays one step away.
        const stock = /[?&]icefin=stock\b/.test(location.hash);
        const screen = pkg && !stock ? screens[path] : null;
        if (current && current.route === path && current.screen === screen) return;
        unmountScreen();
        if (!screen) return;  // jellyfin-web's own page
        if (!signedIn()) {
            if (!signInWait) signInWait = setTimeout(() => { signInWait = null; route_(); }, 250);
            return;
        }
        const r = root();
        if (!r) return;
        current = { route: path, screen };
        r.hidden = false;
        screenShown(true);
        sound('navigate');
        try {
            screen.mount(r, ctx);
        } catch (e) {
            console.error('icefinTheme: screen failed, handing the route to jellyfin-web', path, e);
            unmountScreen();
            return;
        }
        const first = r.querySelector(FOCUS);
        if (first && !focused()) focus(first);  // unless the screen already chose what has focus
    }

    let apiRef = null;
    const sound = (name) => { if (apiRef && pkg) apiRef.theme.playSound(name); };

    // The theme script API (PLAN 8.7, docs/themes/PACKAGE.md "Theme script API"): themes reach Icefin and the server
    // only through this ctx (also window.icefinTheme.ctx) and window.icefinTheme. Host globals (the API client, the
    // playback manager, the native shell objects) stay private to the engine, so upstream and jellyfin-web changes are
    // absorbed here instead of in every theme.
    const ctx = {
        sound,
        navigate: (hash) => { location.hash = hash; },
        apiClient: () => window.ApiClient,
        focus: (el) => focus(el),
        focused: () => focused(),
        // Spatial move to the nearest focusable in a direction, confined to `within` (default: the screen): for
        // modal dialogs and panels inside a screen. True when focus moved.
        move(dir, within) {
            const box = within || document.getElementById(ROOT_ID);
            if (!box) return false;
            const cur = focused();
            const all = Array.from(box.querySelectorAll(FOCUS)).filter((e) => e !== cur && e.offsetParent !== null);
            const next = cur && box.contains(cur) ? pick(all, cur, dir) : all[0];
            if (!next) return false;
            focus(next);
            sound('focus');
            return true;
        },
        // Starts playback through jellyfin-web's playback manager, so the capability prompt (6.3, one per play action)
        // applies as for any play. Resolves with play()'s result, or false when the manager isn't ready.
        play(options) {
            const pm = window.icefinPlaybackManager;
            if (!pm || typeof pm.play !== 'function') return Promise.resolve(false);
            try { return Promise.resolve(pm.play(options)); } catch (e) { return Promise.reject(e); }
        },
        // True when the playback manager is ready for play().
        canPlay: () => !!(window.icefinPlaybackManager && typeof window.icefinPlaybackManager.play === 'function'),
        // {item, player} for what is playing (or paused) now, or null.
        nowPlaying() {
            const pm = window.icefinPlaybackManager;
            try {
                const player = pm && pm.getCurrentPlayer && pm.getCurrentPlayer();
                const item = player && pm.currentItem && pm.currentItem(player);
                return item ? { item, player } : null;
            } catch (e) { return null; }
        }
    };

    // ---- focus engine ----
    function focused() {
        const r = document.getElementById(ROOT_ID);
        return r ? r.querySelector('.' + FOCUSED) : null;
    }

    function focus(el) {
        const prev = focused();
        if (prev) prev.classList.remove(FOCUSED);
        el.classList.add(FOCUSED);
        if (el.focus) el.focus({ preventScroll: false });
        el.dispatchEvent(new CustomEvent('icefin-focus', { bubbles: true }));
    }

    // Nearest focusable in a direction. Beam first: candidates overlapping the current element across the direction
    // of travel (same row for left/right, same column for up/down) win, nearest first; only if there are none does
    // distance with off-axis drift decide. Without the beam, a wide element (a full-width bar) can steal the move.
    function pick(all, cur, dir) {
        const a = cur.getBoundingClientRect();
        const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
        const horiz = dir === 'left' || dir === 'right';
        let beamBest = null, beamDist = Infinity, best = null, bestScore = Infinity;
        for (const e of all) {
            const b = e.getBoundingClientRect();
            const bx = b.left + b.width / 2, by = b.top + b.height / 2;
            const along = dir === 'left' ? a.left - b.right + (ax - bx) / 1e3 : dir === 'right' ? b.left - a.right + (bx - ax) / 1e3
                : dir === 'up' ? a.top - b.bottom + (ay - by) / 1e3 : b.top - a.bottom + (by - ay) / 1e3;
            const centre = dir === 'left' ? ax - bx : dir === 'right' ? bx - ax : dir === 'up' ? ay - by : by - ay;
            if (centre <= 0) continue;
            const overlap = horiz ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) : Math.min(a.right, b.right) - Math.max(a.left, b.left);
            if (overlap > 0 && along > -1) {
                if (along < beamDist) { beamDist = along; beamBest = e; }
                continue;
            }
            // Off the beam a candidate must lie mostly in the direction of travel: a neighbour below doesn't count as
            // "left" just because a scaled-up focused item moved its centre.
            if (along < -Math.min(horiz ? a.width : a.height, horiz ? b.width : b.height) / 2) continue;
            const score = centre + (horiz ? Math.abs(by - ay) : Math.abs(bx - ax)) * 2;
            if (score < bestScore) { bestScore = score; best = e; }
        }
        return beamBest || best;
    }

    function move(dir) {
        const r = document.getElementById(ROOT_ID);
        const cur = focused();
        const all = Array.from(r.querySelectorAll(FOCUS)).filter((e) => e !== cur && e.offsetParent !== null);
        if (!cur) { if (all[0]) focus(all[0]); return true; }
        const best = pick(all, cur, dir);
        if (best) { focus(best); sound('focus'); }
        return true;  // a themed screen keeps arrows even at its edge
    }

    function handleAction(action) {
        for (const h of actionHooks.slice()) {
            try { if (h(action)) return true; } catch (e) { console.error('icefinTheme: action hook', e); }
        }
        if (!current) return false;
        // A screen may own its navigation (rows, strips): it sees every action first and returns true when it used it.
        if (current.screen.onAction) {
            try { if (current.screen.onAction(action, ctx)) return true; } catch (e) { console.error('icefinTheme: screen onAction', e); }
        }
        switch (action) {
            case 'up': case 'down': case 'left': case 'right':
                return move(action);
            case 'enter': case 'select': {
                const f = focused();
                if (f) { sound('select'); f.click(); return true; }
                return false;
            }
            case 'back':
                try {
                    const used = !!(current.screen.onBack && current.screen.onBack());
                    if (used) sound('back');
                    return used;
                } catch (e) { return false; }
            default:
                return false;
        }
    }

    // Desktop mode hands most keys to the page instead of the input pipeline (EventFilter): take the navigation keys
    // here while a themed screen is up. In TV mode keys never reach the page, so nothing is handled twice.
    const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'enter', Escape: 'back', Backspace: 'back' };
    window.addEventListener('keydown', (e) => {
        const action = KEYS[e.key];
        if (!action || !current || e.altKey || e.ctrlKey || e.metaKey) return;
        if (handleAction(action)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);

    window.addEventListener('hashchange', route_);
    window.addEventListener('popstate', route_);
    // jellyfin-web 10.11+ and 12.x move between pages (and redirect at start-up) with history.pushState and
    // replaceState, which fire neither hashchange nor popstate: without this a themed screen never mounted when the
    // user reached it through jellyfin-web's own navigation, only the theme's colours showed.
    for (const name of ['pushState', 'replaceState']) {
        const orig = history[name];
        if (typeof orig !== 'function' || orig.icefinRouted) continue;
        const wrapped = function (...args) {
            const r = orig.apply(this, args);
            setTimeout(route_, 0);  // after the page's own handlers have seen the new URL
            return r;
        };
        wrapped.icefinRouted = true;
        history[name] = wrapped;
    }

    // The capability model's theme view (6.7): deep-frozen, so a theme can't change what others see.
    let systemView = null;
    const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
    if (window.apiPromise) window.apiPromise.then((api) => {
        if (!api.router || !api.router.capabilities) return;
        const take = (c) => {
            if (!c || !c.theme) return;
            const next = JSON.stringify(c.theme);
            if (systemView && JSON.stringify(systemView) === next) return;
            systemView = deepFreeze(JSON.parse(next));
            window.dispatchEvent(new CustomEvent('icefin-system', { detail: systemView }));
        };
        api.router.capabilities(take);
        api.router.capabilitiesChanged.connect(take);
    });

    window.icefinTheme = {
        version: 1,
        apiVersion: 1,  // the theme script API; bumped only for a breaking change
        // What this machine can show and play (the capability model, 6.7): a frozen snapshot, replaced when it changes,
        // with an 'icefin-system' event on window. Read-only; null until the model has answered.
        get system() { return systemView; },
        ctx,            // the same object screens get in mount(): for code outside a screen (chrome, overlays, timers)
        // Called by theme scripts while they load. route: '#/home' style, without query.
        registerScreen(path, screen) {
            if (!loadingTheme || !screen || typeof screen.mount !== 'function') {
                console.error('icefinTheme: registerScreen ignored (outside a theme script load, or no mount())', path);
                return false;
            }
            screens[String(path).replace(/\.html$/, '')] = screen;
            return true;
        },
        handleAction,
        sound,
        active: () => (pkg ? { id: pkg.id, source: pkg.source, route: current ? current.route : null } : null),
        // For the engine's own capability library (capabilities.js), not for themes (theme-lint rule 4).
        _engine: {
            focus: (el) => focus(el),
            focused: () => focused(),
            move: (dir) => move(dir),
            pick: (all, cur, dir) => pick(all, cur, dir),
            root: () => root(),
            hasScreen: () => !!current,
            sound: (n) => sound(n),
            addActionHook(fn) { actionHooks.push(fn); return () => { actionHooks = actionHooks.filter((f) => f !== fn); }; },
            onReset(fn) { resetHooks.push(fn); }
        },
        stoodDown: () => !!window.icefinPluginRuntime,
        screens: () => Object.keys(screens)
    };

    function refresh(api) { api.theme.activePackage((p) => mount(p, api)); }
    window.apiPromise.then((api) => {
        if (!api.theme || !api.theme.activePackage) return;
        apiRef = api;
        const go = () => refresh(api);
        if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
        api.theme.changed.connect(go);
        window.addEventListener('icefin-plugin-runtime', go);
    });
})();
