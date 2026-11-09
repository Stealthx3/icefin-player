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

    function route() {
        const h = (location.hash || '#/').split('?')[0];
        return h.replace(/\.html$/, '');
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
                    // UI sounds and the native backdrop join this handshake when they exist (8.5 sounds, 8.4 backdrop).
                    services: []
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
        pkg = next && next.id && !(api && standDown(api)) ? next : null;
        document.documentElement.toggleAttribute('data-icefin-theme', !!pkg);
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
        if (r) { r.hidden = true; r.textContent = ''; }
    }

    function route_() {
        const path = route();
        const screen = pkg ? screens[path] : null;
        if (current && current.route === path && current.screen === screen) return;
        unmountScreen();
        if (!screen) return;  // jellyfin-web's own page
        const r = root();
        if (!r) return;
        current = { route: path, screen };
        r.hidden = false;
        try {
            screen.mount(r, ctx);
        } catch (e) {
            console.error('icefinTheme: screen failed, handing the route to jellyfin-web', path, e);
            unmountScreen();
            return;
        }
        const first = r.querySelector(FOCUS);
        if (first) focus(first);
    }

    const ctx = {
        navigate: (hash) => { location.hash = hash; },
        apiClient: () => window.ApiClient,
        focus: (el) => focus(el)
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

    // Nearest focusable in a direction: smallest distance along the axis, with off-axis drift weighted.
    function move(dir) {
        const r = document.getElementById(ROOT_ID);
        const cur = focused();
        const all = Array.from(r.querySelectorAll(FOCUS)).filter((e) => e !== cur && e.offsetParent !== null);
        if (!cur) { if (all[0]) focus(all[0]); return true; }
        const a = cur.getBoundingClientRect();
        const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
        let best = null, bestScore = Infinity;
        for (const e of all) {
            const b = e.getBoundingClientRect();
            const bx = b.left + b.width / 2, by = b.top + b.height / 2;
            const dx = bx - ax, dy = by - ay;
            const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
            if (along <= 0) continue;
            const off = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx);
            const score = along + off * 2;
            if (score < bestScore) { bestScore = score; best = e; }
        }
        if (best) focus(best);
        return true;  // a themed screen keeps arrows even at its edge
    }

    function handleAction(action) {
        if (!current) return false;
        switch (action) {
            case 'up': case 'down': case 'left': case 'right':
                return move(action);
            case 'enter': case 'select': {
                const f = focused();
                if (f) { f.click(); return true; }
                return false;
            }
            case 'back':
                try { return !!(current.screen.onBack && current.screen.onBack()); } catch (e) { return false; }
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

    window.icefinTheme = {
        version: 1,
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
        active: () => (pkg ? { id: pkg.id, source: pkg.source, route: current ? current.route : null } : null),
        stoodDown: () => !!window.icefinPluginRuntime,
        screens: () => Object.keys(screens)
    };

    function refresh(api) { api.theme.activePackage((p) => mount(p, api)); }
    window.apiPromise.then((api) => {
        if (!api.theme || !api.theme.activePackage) return;
        const go = () => refresh(api);
        if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
        api.theme.changed.connect(go);
        window.addEventListener('icefin-plugin-runtime', go);
    });
})();
