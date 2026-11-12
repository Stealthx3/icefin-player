// Icefin theme engine: the server's branding for themes (PLAN 9.27, 9.45). Appended after capabilities.js.
//
//   T.ui.brand() -> Promise<{ name, icon, banner, splash }>
//
// Themes show the server's brand wherever their target shows its own (a start button, a corner logo), and every image
// comes from the server, never from the theme's package (the user, 2026-11-12):
//   name    the server's name (System/Info/Public)
//   icon    a square logo: the web client's own icons as the server serves them (the page's <link rel=icon> and
//           apple-touch-icon, then its assets/img/icon-transparent.png), the largest that loads
//   banner  a wide logo: the web client's banner-light.png as the server serves it
//   splash  the server's custom splash screen (Branding/Splashscreen) when the administrator enabled one
// Each is null when the server doesn't have it, so a theme falls back to the name in text. Cached per server.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (!T || !T.ui || T.ui.brand) return;
    const cache = new Map();

    function loads(url) {
        return new Promise((resolve) => {
            if (!url) return resolve(null);
            const img = new Image();
            img.onload = () => resolve(img.naturalWidth > 1 ? { url, w: img.naturalWidth, h: img.naturalHeight } : null);
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }
    function abs(href, base) { try { return new URL(href, base).href; } catch (e) { return null; } }

    async function build(c) {
        const base = c.serverAddress ? c.serverAddress() : location.origin;
        const web = abs('web/', base.endsWith('/') ? base : base + '/');
        let name = '';
        try { name = ((await c.getPublicSystemInfo()) || {}).ServerName || ''; } catch (e) { /* offline: no name */ }
        // Square icons: what the page itself declares (the web client is served by this server), then the known path.
        const declared = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')]
            .filter((l) => l.href && abs(l.href, location.href) && new URL(l.href, location.href).origin === new URL(web).origin)
            .map((l) => abs(l.getAttribute('href'), location.href));
        const icons = (await Promise.all([...declared, abs('assets/img/icon-transparent.png', web)].filter(Boolean).map(loads))).filter(Boolean)
            .filter((i) => Math.abs(i.w - i.h) <= Math.max(i.w, i.h) * 0.2);
        icons.sort((a, b) => b.w - a.w);
        const banner = await loads(abs('assets/img/banner-light.png', web));
        let splash = null;
        try {
            const conf = await c.getJSON(c.getUrl('Branding/Configuration'));
            if (conf && conf.SplashscreenEnabled) splash = (await loads(c.getUrl('Branding/Splashscreen'))) || null;
        } catch (e) { /* older servers have no splash screen */ }
        return { name, icon: icons[0] ? icons[0].url : null, banner: banner ? banner.url : null, splash: splash ? splash.url : null };
    }

    T.ui.brand = function () {
        const c = window.ApiClient;
        if (!c || !c.serverAddress) return Promise.resolve({ name: '', icon: null, banner: null, splash: null });
        const key = c.serverId ? c.serverId() || c.serverAddress() : c.serverAddress();
        if (!cache.has(key)) cache.set(key, build(c).catch(() => ({ name: '', icon: null, banner: null, splash: null })));
        return cache.get(key);
    };
})();
