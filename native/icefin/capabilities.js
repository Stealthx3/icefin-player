// Icefin theme engine: generic capabilities for theme screens (PLAN 9.2, 9.3, SPEC "Generic engine capabilities").
// Appended to the injected native shell script after themeEngine.js. Built once in the engine, usable by every theme
// as window.icefinTheme.ui; no theme is named here (CI: theme-lint). Theme scripts call these while they load or from
// their screens' mount(). Everything resets when the theme changes.
//
//   ui.motion        theme-level motion cap ('normal' | 'low') beside the user's reduced-motion setting (9.3)
//   ui.pointerFirst  hover moves focus, large hit targets (9.3)
//   ui.chrome        top bar and side rail slots around themed screens (9.3)
//   ui.pivot         pivot headers that slide with their sections (9.3)
//   ui.overlay       a global panel over any screen, opened by a long press on View (9.3)
//   ui.pagedGrid     a grid in pages with indicators; arrows past the edge turn the page (9.2)
//   ui.carousel3d    a perspective carousel: depth, tilt, the focused item in front (9.2)
//   ui.liveTile      a tile cycling content (Next Up, Latest, ...); frozen under reduced or low motion (9.2)
//   ui.mutedPreview  a muted SDR preview in the page's own video element, never mpv or the audio device (9.2)
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (!T || !T._engine || T.ui) return;
    const E = T._engine;
    const FOCUS = '[data-icefin-focus]';
    // <html> doesn't exist yet when this runs (document creation): look it up when needed.
    const attr = (name, value) => { const h = document.documentElement; if (!h) return; if (value === false) h.removeAttribute(name); else h.setAttribute(name, value === true ? '' : value); };

    // ---- motion (9.3) ----
    let cap = 'normal';
    const userReduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motion = {
        cap(level) {
            cap = level === 'low' ? 'low' : 'normal';
            attr('data-icefin-motion', motion.reduced() ? 'low' : 'normal');
        },
        level: () => cap,
        // Low motion when the theme caps it or the user asked the system for reduced motion.
        reduced: () => cap === 'low' || userReduced(),
        // A theme's duration under the current profile: low motion keeps transitions short but not zero.
        duration: (ms) => (motion.reduced() ? Math.min(ms, 80) : ms)
    };

    // ---- spatial focus inside any container (for the overlay and components) ----
    function nearest(container, from, dir) {
        const all = [...container.querySelectorAll(FOCUS)].filter((e) => e !== from && e.offsetParent !== null);
        if (!from) return all[0] || null;
        return E.pick(all, from, dir);  // the runtime's beam-first rule
    }
    const isDir = (a) => a === 'up' || a === 'down' || a === 'left' || a === 'right';

    // ---- pointer-first (9.3) ----
    let pointer = false;
    function onHover(e) {
        if (!pointer) return;
        const t = e.target.closest && e.target.closest(FOCUS);
        if (t && t !== E.focused() && E.root() && E.root().contains(t)) E.focus(t);
    }
    document.addEventListener('mouseover', onHover, true);
    const pointerFirst = (on) => {
        pointer = !!on;
        attr('data-icefin-pointer', pointer);
        if (pointer && window.api && window.api.window && window.api.window.setCursorVisibility) window.api.window.setCursorVisibility(true);
    };

    // ---- chrome slots (9.3): fixed regions of the theme root, around the screen ----
    const chrome = {
        set(slot, spec) {
            if (slot !== 'topBar' && slot !== 'sideRail') throw new Error('chrome slot must be topBar or sideRail');
            chromeSpecs[slot] = spec;
        }
    };
    let chromeSpecs = {};
    // Called by screens that want the chrome: returns the content element the screen should fill.
    chrome.frame = (root, ctx) => {
        root.classList.add('icefin-chromed');
        const top = chromeSpecs.topBar, side = chromeSpecs.sideRail;
        root.style.display = 'grid';
        root.style.gridTemplateRows = top ? `${top.height || '4em'} 1fr` : '1fr';
        root.style.gridTemplateColumns = side ? `${side.width || '14em'} 1fr` : '1fr';
        let content;
        if (top) {
            const bar = document.createElement('nav');
            bar.className = 'icefin-topbar';
            bar.style.gridColumn = '1 / -1';
            root.append(bar);
            top.mount(bar, ctx);
        }
        if (side) {
            const rail = document.createElement('nav');
            rail.className = 'icefin-siderail';
            root.append(rail);
            side.mount(rail, ctx);
        }
        content = document.createElement('div');
        content.className = 'icefin-content';
        content.style.minWidth = '0';
        content.style.overflow = 'hidden';
        root.append(content);
        return content;
    };

    // ---- pivot headers (9.3) ----
    function pivot(el, sections, opts = {}) {
        let index = 0;
        el.classList.add('icefin-pivot');
        const headers = document.createElement('div');
        headers.className = 'icefin-pivot-headers';
        headers.style.cssText = 'display:flex;gap:1.5em;white-space:nowrap;transition:transform var(--icefin-pivot-ms,300ms) ease';
        const body = document.createElement('div');
        body.className = 'icefin-pivot-body';
        el.append(headers, body);
        const hs = sections.map((s, i) => {
            const h = document.createElement('div');
            h.className = 'icefin-pivot-header';
            h.textContent = s.title;
            h.addEventListener('click', () => show(i));
            headers.append(h);
            return h;
        });
        function show(i) {
            index = (i + sections.length) % sections.length;
            hs.forEach((h, k) => h.classList.toggle('active', k === index));
            const offset = hs[index].offsetLeft - hs[0].offsetLeft;
            headers.style.setProperty('--icefin-pivot-ms', `${motion.duration(opts.ms || 300)}ms`);
            headers.style.transform = `translateX(${-offset}px)`;  // the headers slide with the content
            body.textContent = '';
            sections[index].mount(body);
            const f = body.querySelector(FOCUS);
            if (f) E.focus(f);
            if (opts.onChange) opts.onChange(index);
        }
        // Left/right at the edge of a section's content moves to the neighbouring section.
        const off = E.addActionHook((a) => {
            if (!el.isConnected) { off(); return false; }
            const f = E.focused();
            if (!f || !body.contains(f) || (a !== 'left' && a !== 'right')) return false;
            if (nearest(body, f, a)) return false;
            show(index + (a === 'right' ? 1 : -1));
            E.sound('navigate');
            return true;
        });
        show(0);
        return { show, index: () => index };
    }

    // ---- global overlay (9.3) ----
    let overlaySpec = null, overlayEl = null, overlayPrevFocus = null;
    const overlay = {
        set(spec) { overlaySpec = spec; },
        isOpen: () => !!overlayEl,
        open() {
            if (!overlaySpec || overlayEl) return !!overlayEl;
            overlayPrevFocus = document.activeElement;
            overlayEl = document.createElement('div');
            overlayEl.id = 'icefin-theme-overlay';
            overlayEl.setAttribute('role', 'dialog');
            overlayEl.style.cssText = 'position:fixed;inset:0;z-index:1001';
            document.body.append(overlayEl);
            overlaySpec.mount(overlayEl, { close: overlay.close, sound: E.sound });
            const f = overlayEl.querySelector(FOCUS);
            if (f) setOverlayFocus(f);
            E.sound('navigate');
            return true;
        },
        close() {
            if (!overlayEl) return;
            try { overlaySpec.unmount && overlaySpec.unmount(); } catch (e) { console.error(e); }
            overlayEl.remove();
            overlayEl = null;
            if (overlayPrevFocus && overlayPrevFocus.focus) overlayPrevFocus.focus();
            E.sound('back');
        }
    };
    function setOverlayFocus(el) {
        overlayEl.querySelectorAll('.icefin-focused').forEach((x) => x.classList.remove('icefin-focused'));
        el.classList.add('icefin-focused');
        el.focus && el.focus();
    }
    // Opens on any screen, themed or not: long press on View (gamepad map) sends icefin_overlay.
    const overlayHook = (a) => {
        if (a === 'icefin_overlay') { if (overlayEl) overlay.close(); else overlay.open(); return !!overlaySpec; }
        if (!overlayEl) return false;
        if (a === 'back') { overlay.close(); return true; }
        if (isDir(a)) {
            const n = nearest(overlayEl, overlayEl.querySelector('.icefin-focused'), a);
            if (n) { setOverlayFocus(n); E.sound('focus'); }
            return true;
        }
        if (a === 'enter' || a === 'select') {
            const f = overlayEl.querySelector('.icefin-focused');
            if (f) { E.sound('select'); f.click(); }
            return true;
        }
        return true;  // the overlay is modal
    };

    // ---- paged grid (9.2) ----
    function pagedGrid(el, items, opts) {
        const cols = opts.cols || 4, rows = opts.rows || 3, per = cols * rows, pages = Math.max(1, Math.ceil(items.length / per));
        let page = 0;
        el.classList.add('icefin-paged-grid');
        const grid = document.createElement('div');
        grid.className = 'icefin-grid-page';
        grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:${opts.gap || '1em'}`;
        const dots = document.createElement('div');
        dots.className = 'icefin-page-indicators';
        dots.setAttribute('aria-label', 'pages');
        el.append(grid, dots);
        function draw(p, focusEdge) {
            page = Math.max(0, Math.min(pages - 1, p));
            grid.textContent = '';
            for (const item of items.slice(page * per, page * per + per)) {
                const cell = opts.render(item);
                cell.setAttribute('data-icefin-focus', '');
                grid.append(cell);
            }
            dots.textContent = '';
            for (let i = 0; i < pages; i++) {
                const d = document.createElement('span');
                d.className = 'icefin-page-dot' + (i === page ? ' active' : '');
                d.textContent = i === page ? '●' : '○';
                d.addEventListener('click', () => draw(i));
                dots.append(d);
            }
            dots.setAttribute('data-page', `${page + 1}/${pages}`);
            const cells = [...grid.children];
            const target = focusEdge === 'left' ? cells[Math.min(cells.length - 1, cols - 1)] : cells[0];
            if (target) E.focus(target);
            if (opts.onPage) opts.onPage(page);
        }
        const off = E.addActionHook((a) => {
            if (!el.isConnected) { off(); return false; }
            const f = E.focused();
            if (!f || !grid.contains(f) || (a !== 'left' && a !== 'right')) return false;
            if (nearest(grid, f, a)) return false;  // still inside this page
            const next = page + (a === 'right' ? 1 : -1);
            if (next < 0 || next >= pages) return false;
            draw(next, a === 'right' ? 'right' : 'left');
            E.sound('navigate');
            return true;
        });
        draw(0);
        return { page: () => page, pages: () => pages, go: (p) => draw(p) };
    }

    // ---- 3D carousel (9.2) ----
    function carousel3d(el, items, opts) {
        let index = 0;
        el.classList.add('icefin-carousel3d');
        el.style.perspective = opts.perspective || '1200px';
        const stage = document.createElement('div');
        stage.style.cssText = 'position:relative;height:100%;transform-style:preserve-3d';
        el.append(stage);
        const cells = items.map((item, i) => {
            const c = opts.render(item);
            c.setAttribute('data-icefin-focus', '');
            c.style.position = 'absolute';
            c.style.left = '50%';
            c.style.top = '50%';
            c.addEventListener('icefin-focus', () => layout(i));
            stage.append(c);
            return c;
        });
        function layout(i) {
            index = i;
            const ms = motion.duration(opts.ms || 350);
            cells.forEach((c, k) => {
                const d = k - index, ad = Math.abs(d);
                c.style.transition = `transform ${ms}ms ease, opacity ${ms}ms ease`;
                c.style.transform = `translate(-50%,-50%) translateX(${d * (opts.spacing || 60)}%) translateZ(${-ad * (opts.depth || 220)}px) rotateY(${-Math.sign(d) * Math.min(ad, 1) * (opts.tilt || 35)}deg)`;
                c.style.zIndex = String(100 - ad);
                c.style.opacity = ad > (opts.visible || 3) ? '0' : String(1 - ad * 0.18);
            });
        }
        // Items overlap in depth, so geometry can't order them: left/right step through the list.
        const off = E.addActionHook((a) => {
            if (!el.isConnected) { off(); return false; }
            const f = E.focused();
            const i = cells.indexOf(f);
            if (i < 0 || (a !== 'left' && a !== 'right')) return false;
            const n = i + (a === 'right' ? 1 : -1);
            if (n < 0 || n >= cells.length) return true;  // stay at the ends
            E.focus(cells[n]);
            E.sound('focus');
            return true;
        });
        layout(0);
        return { index: () => index, focus: (i) => E.focus(cells[i]) };
    }

    // ---- live tiles (9.2) ----
    const liveTiles = new Set();
    function liveTile(el, opts) {
        let items = [], i = 0, timer = null;
        el.classList.add('icefin-live-tile');
        const show = () => { if (items.length) { el.textContent = ''; el.append(opts.render(items[i % items.length])); el.setAttribute('data-live-index', String(i % items.length)); } };
        const tick = () => { if (!el.isConnected) return stop(); if (!motion.reduced()) { i++; show(); } };
        function stop() { clearInterval(timer); timer = null; liveTiles.delete(api); }
        const api = {
            stop,
            refresh: () => Promise.resolve(opts.fetch()).then((list) => { items = list || []; i = 0; show(); }),
            frozen: () => motion.reduced()
        };
        api.refresh();
        timer = setInterval(tick, opts.interval || 6000);
        liveTiles.add(api);
        return api;
    }

    // ---- muted previews (9.2): the page's own <video>, SDR and muted; never mpv, never the passthrough device ----
    function mutedPreview(el, opts) {
        const c = window.ApiClient;
        const v = document.createElement('video');
        v.className = 'icefin-preview';
        v.muted = true;
        v.defaultMuted = true;
        v.playsInline = true;
        v.loop = opts.loop !== false;
        v.setAttribute('muted', '');
        v.style.cssText = 'width:100%;height:100%;object-fit:cover';
        // A small server transcode the browser can always decode: VP8 in WebM, no audio stream, SDR (tone-mapped).
        const q = new URLSearchParams({ Container: 'webm', VideoCodec: 'vp8', AudioStreamIndex: '-1', MaxWidth: String(opts.maxWidth || 640),
            MaxFramerate: '30', EnableTonemapping: 'true', StartTimeTicks: String((opts.startSeconds || 0) * 10000000), api_key: c ? c.accessToken() : '' });
        v.src = opts.src || (c ? c.getUrl(`Videos/${opts.itemId}/stream.webm`) + '?' + q.toString() : '');
        el.append(v);
        if (!motion.reduced() || opts.autoplayUnderLowMotion) v.play().catch(() => {});
        return { video: v, stop: () => { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } };
    }

    E.addActionHook(overlayHook);
    E.onReset(() => {
        cap = 'normal';
        attr('data-icefin-motion', userReduced() ? 'low' : 'normal');
        pointerFirst(false);
        chromeSpecs = {};
        if (overlayEl) overlay.close();
        overlaySpec = null;
        liveTiles.forEach((t) => t.stop());
        // mount() cleared the hooks just before this runs: the overlay's goes back first (it is modal)
        E.addActionHook(overlayHook);
    });
    const initMotion = () => attr('data-icefin-motion', motion.reduced() ? 'low' : 'normal');
    if (document.documentElement) initMotion(); else document.addEventListener('DOMContentLoaded', initMotion);

    T.ui = { motion, pointerFirst, chrome, pivot, overlay, pagedGrid, carousel3d, liveTile, mutedPreview };
})();
