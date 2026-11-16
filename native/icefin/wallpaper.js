// Icefin: device wallpaper behind themes (PLAN 9.26). Appended to the injected native shell script after themeManager.js.
// One wallpaper per device (Client Settings -> Theme): an animated SVG, a looping MP4 or WebM, or a picture. It sits in
// place of the theme's background: html[data-icefin-wallpaper] turns the page backgrounds and --icefin-color-background
// transparent so it shows through. Nothing here names a theme. It is off with no theme (Classic View), paused or drawn once
// under Low Motion, and hidden while video plays.
(function () {
    'use strict';
    if (window.icefinWallpaper || !window.apiPromise) return;
    window.icefinWallpaper = true;
    const ID = 'icefin-wallpaper';
    const STYLE = 'icefin-wallpaper-style';
    const call = (fn, ...args) => new Promise((r) => fn(...args, r));
    const root = () => document.documentElement;

    const css = `
html[data-icefin-wallpaper], html[data-icefin-wallpaper] body, html[data-icefin-wallpaper] #icefin-theme-root { background: transparent !important; background-color: transparent !important; }
html[data-icefin-wallpaper] { --icefin-color-background: transparent !important; }
#${ID} { position: fixed; inset: 0; z-index: -1; pointer-events: none; background: #000; overflow: hidden; }
#${ID} video, #${ID} img, #${ID} canvas { width: 100%; height: 100%; object-fit: cover; display: block; }`;

    let info = null;        // {url, kind, name} or null
    let objectUrl = null;
    let layer = null;
    let token = 0;          // guards a slow load against a newer change
    let backdropHidden = false;

    const engineOn = () => !!root() && root().classList.contains('icefin-themed');
    const playing = () => !!root() && (root().hasAttribute('data-icefin-osd-playing') || /^#\/video\b/.test(location.hash));
    const reduced = () => {
        try { return !!(window.icefinTheme && window.icefinTheme.ui && window.icefinTheme.ui.motion.reduced()); }
        catch (e) { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    };
    const backdropApi = () => (window.icefinTheme && window.icefinTheme.ui && window.icefinTheme.ui.backdrop) || null;

    function ensureStyle() {
        if (document.getElementById(STYLE) || !document.head) return;
        const s = document.createElement('style');
        s.id = STYLE;
        s.textContent = css;
        document.head.append(s);
    }

    function drop() {
        if (layer) { layer.remove(); layer = null; }
        if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    }

    // Hide the native backdrop while the wallpaper shows; give it back when the wallpaper goes.
    function syncBackdrop(want) {
        const b = backdropApi();
        if (!b || !b.available()) { backdropHidden = false; return; }
        if (want && !backdropHidden) { b.hide(); backdropHidden = true; }
        else if (!want && backdropHidden) { b.show(); backdropHidden = false; }
    }

    // Draw an SVG once into a canvas: a still picture instead of an animating image.
    function stillCanvas(src) {
        const c = document.createElement('canvas');
        const img = new Image();
        img.onload = () => {
            const w = img.naturalWidth || 1920, h = img.naturalHeight || 1080;
            c.width = w; c.height = h;
            try { c.getContext('2d').drawImage(img, 0, 0, w, h); } catch (e) { /* leaves it black */ }
        };
        img.src = src;
        return c;
    }

    function applyMotion() {
        if (!layer || !info) return;
        const low = reduced();
        const v = layer.querySelector('video');
        if (v) {
            if (low || layer.style.display === 'none') { v.pause(); if (low) { try { v.currentTime = 0; } catch (e) { /* not ready */ } } }
            else v.play().catch(() => {});
        }
        if (info.kind === 'svg' && objectUrl) {
            const want = low ? 'CANVAS' : 'IMG';
            const cur = layer.firstElementChild;
            if (!cur || cur.tagName !== want) {
                const next = low ? stillCanvas(objectUrl) : Object.assign(document.createElement('img'), { src: objectUrl, alt: '' });
                layer.textContent = '';
                layer.append(next);
            }
        }
    }

    function applyVisibility() {
        if (!layer) return;
        layer.style.display = playing() ? 'none' : '';
        applyMotion();
    }

    async function build() {
        const mine = ++token;
        drop();
        const on = !!info && engineOn();
        if (root()) root().toggleAttribute('data-icefin-wallpaper', on);
        syncBackdrop(on);
        if (!on) return;
        ensureStyle();
        let blob;
        try { blob = await (await fetch(info.url)).blob(); } catch (e) { blob = null; }
        if (mine !== token) return;
        if (!blob) { root().removeAttribute('data-icefin-wallpaper'); syncBackdrop(false); return; }
        objectUrl = URL.createObjectURL(info.kind === 'svg' && !blob.type ? new Blob([blob], { type: 'image/svg+xml' }) : blob);
        layer = document.createElement('div');
        layer.id = ID;
        if (info.kind === 'video') {
            const v = document.createElement('video');
            v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
            v.setAttribute('muted', ''); v.setAttribute('loop', ''); v.setAttribute('autoplay', ''); v.setAttribute('playsinline', '');
            v.src = objectUrl;
            layer.append(v);
        } else if (info.kind === 'image') {
            layer.append(Object.assign(document.createElement('img'), { src: objectUrl, alt: '' }));
        } else {
            layer.append(Object.assign(document.createElement('img'), { src: objectUrl, alt: '' }));
        }
        const mount = () => { (document.body || root()).prepend(layer); applyVisibility(); };
        if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once: true });
    }

    window.apiPromise.then(async (api) => {
        if (!api.theme || !api.theme.wallpaper || !api.theme.wallpaperChanged) return;
        const load = async () => {
            const w = await call(api.theme.wallpaper);
            info = w && w.url ? w : null;
            build();
        };
        api.theme.wallpaperChanged.connect(load);

        // The engine turning on or off, playback starting or ending, Low Motion changing.
        let lastOn = null;
        const react = () => {
            const on = engineOn();
            if (on !== lastOn) { lastOn = on; if (info) build(); else syncBackdrop(false); return; }
            if (on && info && backdropApi()) syncBackdrop(true);
            applyVisibility();
        };
        const start = () => {
            ensureStyle();
            new MutationObserver(react).observe(root(), { attributes: true,
                attributeFilter: ['class', 'data-icefin-osd-playing', 'data-icefin-motion', 'data-icefin-backdrop'] });
            window.addEventListener('hashchange', react);
            if (window.matchMedia) {
                const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
                if (mq.addEventListener) mq.addEventListener('change', applyMotion);
            }
        };
        if (root()) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
        lastOn = engineOn();
        load();
    });
})();
