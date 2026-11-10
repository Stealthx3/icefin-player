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
//   ui.userViews     the signed-in user's libraries, once the client is ready (cold start), with a short retry
//   ui.parallax      the focused item lifts, tilts and moves a highlight with pointer motion and arrow nudges (9.11)
//   ui.material      translucent blurred panels from material.* tokens, opaque when the GPU can't hold 60 fps (9.11)
//   ui.chrome        (9.11) a side rail with collapsedWidth collapses to icons and expands, labelled, while it has focus
//   ui.cardExpand    the focused card grows into a larger preview over its neighbours without reflowing the row (9.11)
//   ui.guideGrid     a two-axis virtualized grid: rows of channels, cells on a time axis, paging by time and channel (9.14)
//   ui.keyboard      an on-screen keyboard for text fields, in themed screens and jellyfin-web's own pages (9.14)
//   ui.timePalette   token sets chosen by the local time (and month), cross-faded (9.14)
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
    let pointer = false, px = null, py = null;
    // Only a pointer that moved takes focus: when content changes under a still cursor (a page turns, a row scrolls) the
    // browser sends mouse events at the same coordinates, and those must not pull focus off what the remote just chose.
    function onMove(e) {
        const still = e.clientX === px && e.clientY === py;
        px = e.clientX; py = e.clientY;
        if (!pointer || still) return;
        const t = e.target.closest && e.target.closest(FOCUS);
        if (t && t !== E.focused() && E.root() && E.root().contains(t)) E.focus(t);
    }
    document.addEventListener('mousemove', onMove, true);
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
            if (side.collapsedWidth) expandingRail(root, rail, side);
            side.mount(rail, ctx);
        }
        content = document.createElement('div');
        content.className = 'icefin-content';
        content.style.minWidth = '0';
        content.style.overflow = 'hidden';
        root.append(content);
        return content;
    };

    // ---- expanding side rail (9.11) ----
    // The grid column keeps the collapsed width, so the content never reflows: the rail itself widens over the content
    // while focus is inside it. Labels (.icefin-rail-label) show only when expanded; html[data-icefin-rail] follows.
    function expandingRail(root, rail, spec) {
        root.style.gridTemplateColumns = `${spec.collapsedWidth} 1fr`;
        rail.style.position = 'relative';
        rail.style.zIndex = '5';
        rail.style.overflow = 'hidden';
        const set = (open) => {
            const st = open ? 'expanded' : 'collapsed';
            if (rail.getAttribute('data-icefin-rail') === st) return;
            rail.setAttribute('data-icefin-rail', st);
            rail.style.transition = `width ${motion.duration(spec.ms || 220)}ms ease`;
            rail.style.width = open ? (spec.width || '14em') : spec.collapsedWidth;
            attr('data-icefin-rail', st);
            if (spec.onChange) spec.onChange(open);
        };
        rail.style.width = spec.collapsedWidth;
        set(false);
        root.addEventListener('icefin-focus', (e) => set(rail.contains(e.target)));
    }

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
    let overlaySpec = null, overlayEl = null, overlayPrevFocus = null, overlayScreenFocus = null;
    const overlay = {
        set(spec) { overlaySpec = spec; },
        isOpen: () => !!overlayEl,
        open() {
            if (!overlaySpec || overlayEl) return !!overlayEl;
            overlayPrevFocus = document.activeElement;
            // The overlay is modal: the screen underneath gives up its focus ring until the overlay closes.
            overlayScreenFocus = E.focused();
            if (overlayScreenFocus) overlayScreenFocus.classList.remove('icefin-focused');
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
            if (overlayScreenFocus && overlayScreenFocus.isConnected) E.focus(overlayScreenFocus);
            else if (overlayPrevFocus && overlayPrevFocus.focus) overlayPrevFocus.focus();
            overlayScreenFocus = null;
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
    // {itemId} previews a library item; {itemId, live: true} a Live TV channel (opened through PlaybackInfo the way
    // jellyfin-web does, as a small VP8 transcode; stop() closes the live stream again); {src} any URL.
    function mutedPreview(el, opts) {
        const c = window.ApiClient;
        const v = document.createElement('video');
        v.className = 'icefin-preview';
        v.muted = true;
        v.defaultMuted = true;
        v.playsInline = true;
        v.loop = opts.loop !== false && !opts.live;
        v.setAttribute('muted', '');
        v.style.cssText = 'width:100%;height:100%;object-fit:cover';
        el.append(v);
        let liveStreamId = null, stopped = false;
        const start = () => { if (!stopped && (!motion.reduced() || opts.autoplayUnderLowMotion)) v.play().catch(() => {}); };
        if (opts.live && c) {
            // A profile that only allows a muted VP8/WebM transcode, so the server never hands back a direct stream.
            const profile = { MaxStreamingBitrate: 3000000, DirectPlayProfiles: [], CodecProfiles: [], SubtitleProfiles: [],
                TranscodingProfiles: [{ Container: 'webm', Type: 'Video', VideoCodec: 'vp8', AudioCodec: 'vorbis', Protocol: 'http', Context: 'Streaming', MaxAudioChannels: '2' }] };
            const q = `UserId=${c.getCurrentUserId()}&StartTimeTicks=0&IsPlayback=true&AutoOpenLiveStream=true&MaxStreamingBitrate=3000000`;
            c.ajax({ type: 'POST', url: c.getUrl(`Items/${opts.itemId}/PlaybackInfo?${q}`), data: JSON.stringify({ DeviceProfile: profile }), contentType: 'application/json', dataType: 'json' })
                .then((info) => {
                    const ms = info && info.MediaSources && info.MediaSources[0];
                    if (ms && ms.LiveStreamId) liveStreamId = ms.LiveStreamId;
                    if (stopped) { closeLive(); return; }
                    if (!ms || !ms.TranscodingUrl) { v.dispatchEvent(new Event('error')); return; }
                    // The live transcode URL leaves the container to the server (MPEG-TS for live streams), which a <video>
                    // can't play: ask for the same live stream as a muted VP8 WebM.
                    const [path, query] = ms.TranscodingUrl.replace(/^\//, '').split('?');
                    const p = new URLSearchParams(query || '');
                    p.set('VideoCodec', 'vp8');
                    p.set('AudioStreamIndex', '-1');
                    p.set('MaxWidth', String(opts.maxWidth || 640));
                    p.delete('AudioCodec');
                    p.delete('SegmentContainer');
                    v.src = c.getUrl(path.replace(/\/stream$/, '/stream.webm')) + '?' + p.toString();
                    start();
                }, () => v.dispatchEvent(new Event('error')));
        } else {
            // A small server transcode the browser can always decode: VP8 in WebM, no audio stream, SDR (tone-mapped).
            const q = new URLSearchParams({ Container: 'webm', VideoCodec: 'vp8', AudioStreamIndex: '-1', MaxWidth: String(opts.maxWidth || 640),
                MaxFramerate: '30', EnableTonemapping: 'true', StartTimeTicks: String((opts.startSeconds || 0) * 10000000), api_key: c ? c.accessToken() : '' });
            v.src = opts.src || (c ? c.getUrl(`Videos/${opts.itemId}/stream.webm`) + '?' + q.toString() : '');
            start();
        }
        function closeLive() {
            if (liveStreamId && c) c.ajax({ type: 'POST', url: c.getUrl(`LiveStreams/Close?liveStreamId=${encodeURIComponent(liveStreamId)}`) }).catch(() => {});
            liveStreamId = null;
        }
        return { video: v, live: () => liveStreamId, stop: () => { stopped = true; v.pause(); v.removeAttribute('src'); v.load(); v.remove(); closeLive(); } };
    }

    // ---- engine stylesheet for 9.11 capabilities: values come from tokens or the theme's own CSS ----
    function engineStyle() {
        if (document.getElementById('icefin-caps-style') || !document.head) return;
        const st = document.createElement('style');
        st.id = 'icefin-caps-style';
        st.textContent = [
            '.icefin-parallax [data-icefin-focus] { transform-style: preserve-3d; }',
            '.icefin-parallax .icefin-lifted { transform: perspective(var(--icefin-parallax-perspective, 900px)) rotateX(var(--icefin-tilt-y, 0deg)) rotateY(var(--icefin-tilt-x, 0deg)) scale(var(--icefin-parallax-lift, 1.08)); }',
            '.icefin-parallax[data-icefin-parallax-transform=off] .icefin-lifted { transform: none; }',
            '.icefin-glare { position: absolute; inset: 0; pointer-events: none; border-radius: inherit; opacity: 0; transition: opacity 160ms;',
            '  background: radial-gradient(circle at var(--icefin-glare-x, 50%) var(--icefin-glare-y, 0%), var(--icefin-parallax-highlight, transparent), transparent 60%); }',
            '.icefin-lifted > .icefin-glare { opacity: 1; }',
            'html[data-icefin-motion=low] .icefin-glare { display: none; }',
            '[data-icefin-material] { background: var(--icefin-m-tint); -webkit-backdrop-filter: blur(var(--icefin-m-blur)) saturate(var(--icefin-m-saturate));',
            '  backdrop-filter: blur(var(--icefin-m-blur)) saturate(var(--icefin-m-saturate)); }',
            'html[data-icefin-materials=opaque] [data-icefin-material] { background: var(--icefin-m-opaque); -webkit-backdrop-filter: none; backdrop-filter: none; }',
            '.icefin-card-expanded { position: fixed; z-index: 990; pointer-events: none; overflow: hidden; transform-origin: var(--icefin-expand-origin, left center); }'
        ].join('\n');
        document.head.append(st);
    }

    // ---- focus parallax and highlight (9.11) ----
    // On the focused item inside el: --icefin-tilt-x/-y (deg) and --icefin-glare-x/-y (%) follow the pointer over it; an
    // arrow press tilts it toward the direction for a moment (also at a row's end, where nothing moves); a newly focused
    // item settles from the side it was entered from. The default transform composes tilt with a lift
    // (--icefin-parallax-lift); transform: false leaves the transform to the theme, which reads the same variables.
    // A .icefin-glare child carries the moving highlight (--icefin-parallax-highlight, a token colour).
    // Frozen (flat, no highlight) under reduced or low motion.
    function parallax(el, opts = {}) {
        engineStyle();
        const maxTilt = opts.tilt || 8, nudgeMs = opts.nudgeMs || 260;
        el.classList.add('icefin-parallax');
        if (opts.transform === false) el.setAttribute('data-icefin-parallax-transform', 'off');
        let cur = null, settle = null;
        const set = (node, tx, ty) => {
            const frozen = motion.reduced();
            node.style.setProperty('--icefin-tilt-x', `${frozen ? 0 : tx.toFixed(2)}deg`);
            node.style.setProperty('--icefin-tilt-y', `${frozen ? 0 : ty.toFixed(2)}deg`);
            node.style.setProperty('--icefin-glare-x', `${(50 + (tx / maxTilt) * 50).toFixed(1)}%`);
            node.style.setProperty('--icefin-glare-y', `${(50 - (ty / maxTilt) * 50).toFixed(1)}%`);
        };
        const flat = (node) => { ['--icefin-tilt-x', '--icefin-tilt-y', '--icefin-glare-x', '--icefin-glare-y'].forEach((v) => node.style.removeProperty(v)); };
        const transition = (node, ms) => { node.style.transition = `transform ${motion.duration(ms)}ms ease-out`; };
        const lift = (node, from) => {
            if (cur && cur !== node) { cur.classList.remove('icefin-lifted'); flat(cur); }
            cur = node;
            if (!node.querySelector(':scope > .icefin-glare')) { const g = document.createElement('div'); g.className = 'icefin-glare'; node.append(g); }
            if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
            node.classList.add('icefin-lifted');
            const v = { left: [maxTilt, 0], right: [-maxTilt, 0], up: [0, -maxTilt], down: [0, maxTilt] }[from] || [0, 0];
            transition(node, 0);
            set(node, v[0] * 0.6, v[1] * 0.6);
            clearTimeout(settle);
            requestAnimationFrame(() => { transition(node, nudgeMs); set(node, 0, 0); });
        };
        let lastDir = null;
        el.addEventListener('icefin-focus', (e) => {
            const node = e.target.closest && e.target.closest(FOCUS);
            if (node && el.contains(node)) lift(node, lastDir);
            lastDir = null;
        });
        el.addEventListener('mousemove', (e) => {
            if (!cur || !cur.contains(e.target)) return;
            const r = cur.getBoundingClientRect();
            const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
            transition(cur, 60);
            set(cur, nx * 2 * maxTilt, -ny * 2 * maxTilt);
        });
        el.addEventListener('mouseleave', () => { if (cur) { transition(cur, nudgeMs); set(cur, 0, 0); } });
        // Watches arrows without using them: the item tilts toward the press, then settles.
        const off = E.addActionHook((a) => {
            if (!el.isConnected) { off(); return false; }
            if (!isDir(a) || !cur || !cur.isConnected || E.focused() !== cur) return false;
            lastDir = { left: 'right', right: 'left', up: 'down', down: 'up' }[a];  // the next item enters from the far side
            const node = cur;
            const v = { left: [-maxTilt, 0], right: [maxTilt, 0], up: [0, maxTilt], down: [0, -maxTilt] }[a];
            transition(node, 90);
            set(node, v[0], v[1]);
            clearTimeout(settle);
            settle = setTimeout(() => { transition(node, nudgeMs); set(node, 0, 0); }, 120);
            return false;
        });
        const f = E.focused();
        if (f && el.contains(f)) lift(f, null);
        return { current: () => cur, stop: () => { off(); if (cur) { cur.classList.remove('icefin-lifted'); flat(cur); } el.classList.remove('icefin-parallax'); } };
    }

    // ---- translucent materials (9.11) ----
    // ui.material(el, name): el becomes a blurred translucent panel from the tokens material.<name>.tint, .blur,
    // .saturate and .opaque (--icefin-material-<name>-…). While any material is on screen the engine samples the frame
    // rate; a second under 50 fps switches every material to its opaque colour (html[data-icefin-materials=opaque])
    // until the theme changes. ui.material.force('opaque' | 'translucent' | 'auto') overrides it.
    let materialMode = 'translucent', materialForced = null, materialWatch = null;
    const materialEls = new Set();
    function material(el, name = 'panel') {
        engineStyle();
        const v = (k, d) => `var(--icefin-material-${name}-${k}${d ? ', ' + d : ''})`;
        el.setAttribute('data-icefin-material', name);
        el.style.setProperty('--icefin-m-tint', v('tint', 'var(--icefin-color-surface)'));
        el.style.setProperty('--icefin-m-blur', v('blur', '20px'));
        el.style.setProperty('--icefin-m-saturate', v('saturate', '1.4'));
        el.style.setProperty('--icefin-m-opaque', v('opaque', 'var(--icefin-color-surface)'));
        materialEls.add(el);
        watchFrames();
        return el;
    }
    const applyMaterialMode = () => attr('data-icefin-materials', materialForced || materialMode);
    function watchFrames() {
        applyMaterialMode();
        if (materialWatch || materialForced || materialMode === 'opaque') return;
        let frames = 0, start = 0, last = 0;
        const step = (t) => {
            for (const e of materialEls) if (!e.isConnected) materialEls.delete(e);
            if (!materialEls.size || materialForced || materialMode === 'opaque' || document.hidden) { materialWatch = null; return; }
            if (!start || t - last > 250) { start = t; frames = 0; }  // a stall (hidden page, a dialog) restarts the window
            last = t;
            frames++;
            if (t - start >= 1000) {
                const fps = (frames - 1) * 1000 / (t - start);
                document.documentElement.setAttribute('data-icefin-material-fps', String(Math.round(fps)));
                if (fps < 50) { materialMode = 'opaque'; applyMaterialMode(); materialWatch = null; return; }
                start = t; frames = 0;
            }
            materialWatch = requestAnimationFrame(step);
        };
        materialWatch = requestAnimationFrame(step);
    }
    material.mode = () => materialForced || materialMode;
    material.force = (m) => {
        materialForced = m === 'opaque' || m === 'translucent' ? m : null;
        if (!materialForced) materialMode = 'translucent';
        if (materialWatch) { cancelAnimationFrame(materialWatch); materialWatch = null; }
        watchFrames();
    };

    // ---- in-row card expansion (9.11) ----
    // After a dwell on a card in el, a panel grows from the card over its neighbours (fixed, above the row, so the row
    // never reflows); render(item, panel, card) fills it, and preview(item) may return an item id for a muted trailer
    // (ui.mutedPreview). It stays inside the row's view, so at either edge it grows inward. Moving focus collapses it at once. Under reduced or low
    // motion it still opens, without the grow animation or a trailer.
    function cardExpand(el, opts) {
        engineStyle();
        const dwell = opts.dwell != null ? opts.dwell : 900;
        let timer = null, panel = null, card = null, pv = null;
        const collapse = () => {
            clearTimeout(timer);
            if (pv) { pv.stop(); pv = null; }
            if (panel) { panel.remove(); panel = null; }
            if (card) { card.removeAttribute('data-icefin-expanded'); card = null; }
            el.removeAttribute('data-icefin-expanded');
        };
        const open = (c) => {
            if (!c.isConnected || E.focused() !== c) return;
            const item = opts.item(c);
            if (item == null) return;
            const r = c.getBoundingClientRect();
            const w = r.width * (opts.scale || 1.5), h = opts.height ? opts.height(r) : r.height * (opts.scale || 1.5) + (opts.detailsHeight || r.height);
            // Stays inside the row's view (el's parent, or opts.bounds()): grows centred, pushed in at either edge.
            const b = opts.bounds ? opts.bounds() : (el.parentElement || el).getBoundingClientRect();
            const lo = Math.max(8, b.left), hi = Math.min(window.innerWidth - 8, b.right);
            const x = Math.max(lo, Math.min(hi - w, r.left - (w - r.width) / 2));
            const y = Math.max(8, Math.min(window.innerHeight - h - 8, r.top - (r.height * (opts.scale || 1.5) - r.height) / 2));
            panel = document.createElement('div');
            panel.className = 'icefin-card-expanded';
            panel.style.left = `${x}px`; panel.style.top = `${y}px`; panel.style.width = `${w}px`; panel.style.height = `${h}px`;
            const ox = ((r.left + r.width / 2 - x) / w) * 100, oy = ((r.top + r.height / 2 - y) / h) * 100;
            panel.style.setProperty('--icefin-expand-origin', `${ox.toFixed(1)}% ${oy.toFixed(1)}%`);
            (E.root() || document.body).append(panel);
            opts.render(item, panel, c);
            const ms = motion.duration(opts.ms || 220);
            if (!motion.reduced()) {
                panel.animate([{ transform: `scale(${(r.width / w).toFixed(3)}, ${(r.height / h).toFixed(3)})`, opacity: 0.6 }, { transform: 'none', opacity: 1 }],
                    { duration: ms, easing: 'ease-out' });
            }
            card = c;
            c.setAttribute('data-icefin-expanded', '');
            el.setAttribute('data-icefin-expanded', '');
            const id = opts.preview && !motion.reduced() ? opts.preview(item) : null;
            const box = panel.querySelector('.icefin-expand-video');
            if (id && box) {
                setTimeout(() => {
                    if (!panel || card !== c) return;
                    pv = mutedPreview(box, { itemId: id, maxWidth: 640, loop: false });
                    pv.video.addEventListener('error', () => { if (pv) { pv.stop(); pv = null; } });
                    panel.setAttribute('data-icefin-preview', 'playing');
                }, opts.previewDelay != null ? opts.previewDelay : 600);
            }
            if (opts.onExpand) opts.onExpand(item, panel, c);
        };
        el.addEventListener('icefin-focus', (e) => {
            collapse();
            const c = e.target.closest && e.target.closest(FOCUS);
            if (c && el.contains(c)) timer = setTimeout(() => open(c), dwell);
        });
        // Focus leaving el entirely (no icefin-focus inside it) collapses too.
        const off = E.addActionHook((a) => {
            if (!el.isConnected) { collapse(); off(); return false; }
            if (card && (isDir(a) || a === 'back')) collapse();
            return false;
        });
        return { collapse, expanded: () => card, panel: () => panel };
    }

    // ---- guide grid (9.14) ----
    // el shows `rows` channels at a time against `span` minutes. Only the visible rows and the programmes overlapping the
    // visible window are in the DOM; fetch(channelIds, startMs, endMs) supplies programmes ({id, channelId, start, end}
    // in ms, plus anything render needs) and is asked once per channel and window. Gaps become empty cells. Arrows:
    // left/right step through a row's programmes, paging the window by time at its edges; up/down keep the focus time and
    // scroll by channel at the edges. Returns false (lets the theme move focus) past the first channel and before `now`.
    function guideGrid(el, opts) {
        const MIN = 60000, slot = (opts.slot || 30) * MIN, span = (opts.span || 120) * MIN, rows = opts.rows || 6;
        const now = opts.now || (() => Date.now());
        const chans = opts.channels;
        const floorSlot = (t) => Math.floor(t / slot) * slot;
        const earliest = () => floorSlot(now());
        let t0 = floorSlot(opts.start || now()), top = 0, cur = { row: 0, time: now() }, focusId = null;
        const cache = new Map(), asked = new Set();
        el.classList.add('icefin-guide');
        el.style.position = el.style.position || 'relative';
        const head = document.createElement('div');
        head.className = 'icefin-guide-times';
        const body = document.createElement('div');
        body.className = 'icefin-guide-rows';
        const line = document.createElement('div');
        line.className = 'icefin-guide-now';
        el.append(head, body);
        const pct = (t) => ((t - t0) / span) * 100;
        function programmes(ch) {
            const list = (cache.get(ch.id) || []).filter((p) => p.end > t0 && p.start < t0 + span).sort((a, b) => a.start - b.start);
            const out = [];
            let t = t0;
            for (const p of list) {
                if (p.start > t) out.push({ id: `gap-${ch.id}-${t}`, channelId: ch.id, start: t, end: p.start, gap: true });
                out.push(p);
                t = Math.max(t, p.end);
            }
            if (t < t0 + span) out.push({ id: `gap-${ch.id}-${t}`, channelId: ch.id, start: t, end: t0 + span, gap: true });
            return out;
        }
        async function load() {
            const want = chans.slice(top, top + rows).filter((c) => !asked.has(`${c.id}:${t0}`));
            if (!want.length) return;
            want.forEach((c) => asked.add(`${c.id}:${t0}`));
            let got = [];
            try { got = (await opts.fetch(want.map((c) => c.id), t0, t0 + span)) || []; } catch (e) { console.error('icefinTheme: guide fetch', e); }
            for (const p of got) {
                const list = cache.get(p.channelId) || [];
                if (!list.some((q) => q.id === p.id)) list.push(p);
                cache.set(p.channelId, list);
            }
            if (el.isConnected) draw();
        }
        function draw() {
            head.textContent = '';
            for (let t = t0; t < t0 + span; t += slot) {
                const h = document.createElement('div');
                h.className = 'icefin-guide-time';
                h.style.cssText = `position:absolute;left:${pct(t)}%;width:${(slot / span) * 100}%`;
                h.textContent = new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                head.append(h);
            }
            head.setAttribute('data-start', String(t0));
            body.textContent = '';
            let focusEl = null;
            chans.slice(top, top + rows).forEach((ch, k) => {
                const row = document.createElement('div');
                row.className = 'icefin-guide-row';
                row.setAttribute('data-channel', ch.id);
                const label = document.createElement('div');
                label.className = 'icefin-guide-channel';
                if (opts.renderChannel) opts.renderChannel(ch, label); else label.textContent = ch.name || ch.id;
                const lane = document.createElement('div');
                lane.className = 'icefin-guide-lane';
                lane.style.position = 'relative';
                for (const p of programmes(ch)) {
                    const cell = document.createElement('div');
                    cell.className = 'icefin-guide-cell' + (p.gap ? ' icefin-guide-gap' : '') + (p.start <= now() && p.end > now() ? ' icefin-guide-live' : '');
                    cell.setAttribute('data-icefin-focus', '');
                    cell.tabIndex = -1;
                    const a = Math.max(p.start, t0), b = Math.min(p.end, t0 + span);
                    cell.style.cssText = `position:absolute;top:0;bottom:0;left:${pct(a)}%;width:${((b - a) / span) * 100}%`;
                    cell.guideProgramme = p;
                    cell.guideChannel = ch;
                    cell.guideRow = top + k;
                    if (p.start < t0) cell.classList.add('icefin-guide-cut-start');
                    if (p.end > t0 + span) cell.classList.add('icefin-guide-cut-end');
                    if (opts.renderProgram && !p.gap) opts.renderProgram(p, cell, ch); else if (!p.gap) cell.textContent = p.title || p.name || '';
                    else if (opts.emptyLabel) cell.textContent = opts.emptyLabel;
                    cell.addEventListener('click', () => { if (!p.gap && opts.onSelect) opts.onSelect(p, ch); });
                    cell.addEventListener('icefin-focus', () => { focusId = p.id; if (opts.onFocus) opts.onFocus(p, ch); });
                    lane.append(cell);
                    if (top + k === cur.row && p.start <= cur.time && p.end > cur.time) focusEl = cell;
                }
                row.append(label, lane);
                body.append(row);
            });
            const n = now();
            const lane0 = body.querySelector('.icefin-guide-lane');
            if (lane0 && n >= t0 && n < t0 + span) { line.style.left = `calc(${lane0.offsetLeft}px + ${pct(n) / 100} * ${lane0.offsetWidth}px)`; body.append(line); }
            el.setAttribute('data-top', String(top));
            if (focusEl && (E.focused() == null || el.contains(E.focused()) || opts.takeFocus)) E.focus(focusEl);
            opts.takeFocus = false;
        }
        const clampTime = (t) => Math.max(t0, Math.min(t0 + span - 1, t));
        function go(row, time) { cur = { row, time }; draw(); load(); }
        const off = E.addActionHook((a) => {
            if (!el.isConnected) { off(); clearInterval(tick); return false; }
            const f = E.focused();
            if (!f || !el.contains(f) || !f.guideProgramme) return false;
            const p = f.guideProgramme, list = programmes(f.guideChannel), i = list.findIndex((q) => q.id === p.id);
            if (a === 'right') {
                const nx = list[i + 1];
                if (nx) { cur = { row: f.guideRow, time: nx.start }; draw(); }
                else { t0 += span / 2; go(f.guideRow, t0 + span / 2); }  // past the window: page forward by half
                E.sound('focus');
                return true;
            }
            if (a === 'left') {
                const pv = list[i - 1];
                if (pv) { cur = { row: f.guideRow, time: Math.max(pv.start, t0) }; draw(); E.sound('focus'); return true; }
                if (t0 <= earliest()) return false;
                t0 = Math.max(earliest(), t0 - span / 2);
                go(f.guideRow, Math.min(p.start - 1, t0 + span - 1));
                E.sound('focus');
                return true;
            }
            if (a === 'down' || a === 'up') {
                const r = f.guideRow + (a === 'down' ? 1 : -1);
                if (r < 0 || r >= chans.length) return false;
                if (r < top) top = r;
                if (r >= top + rows) top = r - rows + 1;
                go(r, clampTime(cur.time));
                E.sound('focus');
                return true;
            }
            return false;  // Enter: the engine clicks the cell
        });
        const tick = setInterval(() => { if (!el.isConnected) { clearInterval(tick); return; } draw(); }, 30000);
        cur = { row: 0, time: clampTime(now()) };
        opts.takeFocus = opts.focus !== false;
        draw();
        load();
        return {
            window: () => ({ start: t0, end: t0 + span, top, rows }),
            focused: () => { const f = E.focused(); return f && el.contains(f) ? { programme: f.guideProgramme, channel: f.guideChannel, row: f.guideRow } : null; },
            focus(row, time) { opts.takeFocus = true; top = Math.max(0, Math.min(chans.length - rows, row - Math.floor(rows / 2))); t0 = Math.max(earliest(), floorSlot(time || now())); go(row, clampTime(time || now())); },
            pageTime(dir) { t0 = Math.max(earliest(), t0 + dir * span); opts.takeFocus = true; go(cur.row, t0); },
            pageChannels(dir) { const r = Math.max(0, Math.min(chans.length - 1, cur.row + dir * rows)); top = Math.max(0, Math.min(Math.max(0, chans.length - rows), top + dir * rows)); opts.takeFocus = true; go(r, clampTime(cur.time)); },
            refocus() { opts.takeFocus = true; draw(); },  // back into the grid where focus left it
            refresh() { cache.clear(); asked.clear(); load(); },
            stop() { off(); clearInterval(tick); }
        };
    }

    // ---- on-screen keyboard (9.14) ----
    // ui.keyboard.enable() turns it on for the active theme: a text field focused from the remote or a controller (the
    // last input came through the action pipeline, not a physical key or the mouse) opens a keyboard docked at the
    // bottom, on themed screens and jellyfin-web's own pages alike. Enter on a focused field opens it too. While it is
    // open it takes every action: arrows move between keys, Enter types, Back closes. Typing sets the field's value
    // through the native setter and fires input events, so React and jellyfin-web see it. A printable key on a physical
    // keyboard closes it. html[data-icefin-osk] is set while it is open.
    const OSK_LAYOUTS = {
        letters: ['1234567890', 'qwertyuiop', 'asdfghjkl\'', 'zxcvbnm,.-'],
        symbols: ['!@#$%^&*()', '-_=+[]{};:', '"/\\|?<>`~\'', ',.€£¥§°…·']
    };
    let oskOn = false, osk = null, lastSource = 'pointer', inAction = false;
    const isText = (e) => e && ((e.tagName === 'INPUT' && /^(text|search|password|email|url|tel|number|)$/i.test(e.type || '')) || e.tagName === 'TEXTAREA') && !e.disabled && !e.readOnly;
    function setValue(input, v) {
        const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, v);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function oskOpen(input) {
        if (!oskOn || !isText(input)) return false;
        if (osk) { if (osk.input === input) return true; oskClose(); }
        const panel = document.createElement('div');
        panel.id = 'icefin-osk';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'keyboard');
        panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:1002';
        const preview = document.createElement('div');
        preview.className = 'icefin-osk-preview';
        const keys = document.createElement('div');
        keys.className = 'icefin-osk-keys';
        panel.append(preview, keys);
        document.body.append(panel);
        osk = { input, panel, keys, preview, layout: 'letters', shift: false, focused: null };
        attr('data-icefin-osk', true);
        oskDraw(null);
        E.sound('navigate');
        return true;
    }
    function oskDraw(keepLabel) {
        const { keys, layout, shift } = osk;
        keys.textContent = '';
        const key = (label, value, cls) => {
            const k = document.createElement('div');
            k.className = 'icefin-osk-key' + (cls ? ' ' + cls : '');
            k.textContent = label;
            k.setAttribute('data-icefin-key', value);
            keys.append(k);
            return k;
        };
        for (const row of OSK_LAYOUTS[layout]) {
            const r = document.createElement('div');
            r.className = 'icefin-osk-row';
            keys.append(r);
            for (const ch of row) { const c = shift ? ch.toUpperCase() : ch; r.append(key(c, c)); }
        }
        const bottom = document.createElement('div');
        bottom.className = 'icefin-osk-row icefin-osk-actions';
        keys.append(bottom);
        bottom.append(key(shift ? '⇧ Shift (on)' : '⇧ Shift', 'shift', 'icefin-osk-wide'), key(layout === 'letters' ? '&123' : 'abc', 'layout', 'icefin-osk-wide'),
            key('Space', ' ', 'icefin-osk-space'), key('⌫', 'backspace', 'icefin-osk-wide'), key('Done', 'done', 'icefin-osk-wide icefin-osk-done'));
        const all = [...keys.querySelectorAll('[data-icefin-key]')];
        oskFocus(all.find((k) => k.getAttribute('data-icefin-key') === keepLabel) || all[10] || all[0]);
        oskPreview();
    }
    function oskPreview() {
        const v = osk.input.value || '';
        osk.preview.textContent = osk.input.type === 'password' ? '•'.repeat(v.length) : v;
        osk.preview.setAttribute('data-placeholder', osk.input.placeholder || (osk.input.labels && osk.input.labels[0] ? osk.input.labels[0].textContent : '') || '');
    }
    function oskFocus(k) {
        if (osk.focused) osk.focused.classList.remove('icefin-focused');
        osk.focused = k;
        k.classList.add('icefin-focused');
    }
    function oskPress(k) {
        const v = k.getAttribute('data-icefin-key'), input = osk.input;
        E.sound('select');
        if (v === 'done') { input.dispatchEvent(new Event('change', { bubbles: true })); oskClose(); return; }
        if (v === 'shift') { osk.shift = !osk.shift; oskDraw('shift'); return; }
        if (v === 'layout') { osk.layout = osk.layout === 'letters' ? 'symbols' : 'letters'; oskDraw('layout'); return; }
        if (v === 'backspace') setValue(input, input.value.slice(0, -1));
        else {
            const max = input.maxLength > 0 ? input.maxLength : Infinity;
            if (input.value.length < max) setValue(input, input.value + v);
            if (osk.shift && v !== ' ') { osk.shift = false; oskDraw(v.toLowerCase()); }
        }
        oskPreview();
    }
    function oskClose() {
        if (!osk) return;
        const input = osk.input;
        osk.panel.remove();
        osk = null;
        attr('data-icefin-osk', false);
        if (input.isConnected && input.focus) input.focus();
        E.sound('back');
    }
    const oskHook = (a) => {
        if (a === 'up' || a === 'down' || a === 'left' || a === 'right' || a === 'enter' || a === 'select' || a === 'back') { lastSource = 'action'; inAction = true; setTimeout(() => { inAction = false; }, 0); }
        if (!osk) {
            if (oskOn && (a === 'enter' || a === 'select') && isText(document.activeElement)) return oskOpen(document.activeElement);
            return false;
        }
        if (!osk.input.isConnected) { oskClose(); return false; }
        if (isDir(a)) {
            const all = [...osk.keys.querySelectorAll('[data-icefin-key]')].filter((k) => k !== osk.focused);
            const n = E.pick(all, osk.focused, a);
            if (n) { oskFocus(n); E.sound('focus'); }
            return true;
        }
        if (a === 'enter' || a === 'select') { oskPress(osk.focused); return true; }
        if (a === 'back') { oskClose(); return true; }
        return true;  // modal while open
    };
    // Only a field the remote moves to (focus arriving while the action is handled): a screen focusing its first field as
    // it mounts, a separate task, doesn't open the keyboard.
    document.addEventListener('focusin', (e) => { if (oskOn && inAction && isText(e.target)) setTimeout(() => { if (document.activeElement === e.target) oskOpen(e.target); }, 0); }, true);
    document.addEventListener('mousedown', (e) => { lastSource = 'pointer'; if (osk && !osk.panel.contains(e.target)) oskClose(); }, true);
    document.addEventListener('mousedown', (e) => {
        const k = osk && e.target.closest && e.target.closest('[data-icefin-key]');
        if (k) { e.preventDefault(); oskFocus(k); oskPress(k); }  // pointer users can type on it too; keeps the field's focus
    }, true);
    window.addEventListener('keydown', (e) => {
        if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey) { lastSource = 'keyboard'; if (osk) oskClose(); }
    }, true);
    const keyboard = {
        enable() { oskOn = true; attr('data-icefin-osk-enabled', true); },
        disable() { oskClose(); oskOn = false; attr('data-icefin-osk-enabled', false); },
        open: (input) => { oskOn = true; return oskOpen(input || document.activeElement); },
        close: () => oskClose(),
        isOpen: () => !!osk
    };

    // ---- time-of-day palettes (9.14) ----
    // Palettes are token sets in the theme's tokens.json under palettes.<name> (any token paths, for example
    // palettes.dusk.color.background). ui.timePalette({schedule: [['05:00', 'dawn'], ['09:00', 'day'], ...],
    // months: [12 names] | undefined, fadeMs}) applies the month's set, then the time's set over it, as the matching
    // --icefin-* properties on <html>, and cross-fades colours and numbers over fadeMs when the set changes (checked every
    // minute). Under reduced or low motion the change is instant. ui.timePalette.at(date) pins the clock (tests,
    // previews); at(null) follows the real time again. html[data-icefin-palette] names the sets in use.
    let palette = null;
    const PREFIX = '--icefin-palettes-';
    function paletteSets() {
        const css = (window.icefinTokenEngine && window.icefinTokenEngine.current()) || '';
        const sets = {};
        const re = /(--icefin-palettes-[A-Za-z0-9-]+)\s*:\s*([^;]+);/g;
        let m;
        while ((m = re.exec(css))) {
            const rest = m[1].slice(PREFIX.length);
            const dash = rest.indexOf('-');
            if (dash < 0) continue;
            const name = rest.slice(0, dash);
            (sets[name] = sets[name] || {})['--icefin-' + rest.slice(dash + 1)] = m[2].trim();
        }
        return sets;
    }
    function rgba(v) {
        let m = /^#([0-9a-f]{3,8})$/i.exec(v);
        if (m) {
            let h = m[1];
            if (h.length <= 4) h = [...h].map((c) => c + c).join('');
            const n = (i) => parseInt(h.slice(i, i + 2), 16);
            return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
        }
        m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i.exec(v);
        if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : m[5] ? m[4] / 100 : +m[4]];
        return null;
    }
    const fmt = (c) => `rgba(${c.slice(0, 3).map((x) => Math.round(x)).join(', ')}, ${+c[3].toFixed(3)})`;
    function mix(a, b, k) {
        const ca = rgba(a), cb = rgba(b);
        if (ca && cb) return fmt(ca.map((x, i) => x + (cb[i] - x) * k));
        const na = parseFloat(a), nb = parseFloat(b), ua = String(a).replace(/^[-\d.]+/, ''), ub = String(b).replace(/^[-\d.]+/, '');
        if (!isNaN(na) && !isNaN(nb) && ua === ub) return `${+(na + (nb - na) * k).toFixed(3)}${ua}`;
        return k < 0.5 ? a : b;
    }
    function paletteTarget(date) {
        const sets = paletteSets(), p = palette;
        const mins = date.getHours() * 60 + date.getMinutes();
        const stops = p.schedule.map(([t, n]) => { const [h, m] = String(t).split(':').map(Number); return [h * 60 + (m || 0), n]; }).sort((a, b) => a[0] - b[0]);
        let timeSet = stops.length ? stops[stops.length - 1][1] : null;  // before the first stop: the last one (overnight)
        for (const [m, n] of stops) if (mins >= m) timeSet = n;
        const monthSet = p.months ? p.months[date.getMonth()] : null;
        return { names: [monthSet, timeSet].filter(Boolean), vars: Object.assign({}, sets[monthSet] || {}, sets[timeSet] || {}) };
    }
    function paletteApply(fade) {
        if (!palette) return;
        // The token stylesheet can arrive after the theme's script runs (a theme switch): re-read it when it changes.
        const css = (window.icefinTokenEngine && window.icefinTokenEngine.current()) || '';
        if (css !== palette.css) { palette.css = css; palette.dirty = true; }
        const target = paletteTarget(palette.pinned || new Date());
        const key = target.names.join('+');
        if (key === palette.key && !palette.dirty) return;
        palette.key = key;
        palette.dirty = false;
        attr('data-icefin-palette', key);
        const h = document.documentElement;
        const from = {};
        for (const v of Object.keys(target.vars)) from[v] = h.style.getPropertyValue(v) || getComputedStyle(h).getPropertyValue(v).trim() || target.vars[v];
        for (const v of palette.applied) if (!(v in target.vars)) h.style.removeProperty(v);
        palette.applied = new Set(Object.keys(target.vars));
        cancelAnimationFrame(palette.raf);
        const ms = fade && !motion.reduced() ? palette.fadeMs : 0;
        const set = (k) => {
            for (const [v, to] of Object.entries(target.vars)) {
                const val = k >= 1 ? to : mix(from[v], to, k);
                h.style.setProperty(v, val);
                if (v.startsWith('--icefin-color-')) { const c = rgba(val); if (c) h.style.setProperty(v + '-channel', c.slice(0, 3).map(Math.round).join(' ')); }
            }
        };
        if (!ms) { set(1); return; }
        const t0 = performance.now();
        const step = (t) => { const k = Math.min(1, (t - t0) / ms); set(k); if (k < 1 && palette) palette.raf = requestAnimationFrame(step); };
        palette.raf = requestAnimationFrame(step);
    }
    function timePalette(opts) {
        timePalette.stop();
        palette = { schedule: opts.schedule || [], months: opts.months && opts.months.length === 12 ? opts.months : null, fadeMs: opts.fadeMs || 4000,
            pinned: null, key: null, css: null, applied: new Set(), raf: 0, timer: setInterval(() => paletteApply(true), 60000) };
        paletteApply(false);
        palette.early = [300, 1000, 3000].map((ms) => setTimeout(() => paletteApply(false), ms));
        return timePalette;
    }
    timePalette.at = (date) => { if (!palette) return; palette.pinned = date ? new Date(date) : null; paletteApply(true); };
    timePalette.current = () => (palette ? palette.key : null);
    timePalette.sets = () => Object.keys(paletteSets());
    timePalette.stop = () => {
        if (!palette) return;
        clearInterval(palette.timer);
        palette.early.forEach(clearTimeout);
        cancelAnimationFrame(palette.raf);
        const h = document.documentElement;
        for (const v of palette.applied) { h.style.removeProperty(v); h.style.removeProperty(v + '-channel'); }
        palette = null;
        attr('data-icefin-palette', false);
    };

    // ---- the user's libraries, safe on a cold start ----
    // A screen can mount while jellyfin-web is still restoring the session: the client has no user yet, or the first
    // request fails. Waits for a user and a token, then asks; an error or an empty answer is retried with backoff
    // (a server with no libraries still resolves, empty, after the last try).
    async function userViews() {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const ready = () => { const c = window.ApiClient; return c && c.getCurrentUserId() && c.accessToken() ? c : null; };
        for (let t = 0; t < 40 && !ready(); t++) await wait(250);
        let views = [];
        for (const delay of [0, 500, 1000, 2000, 4000]) {
            if (delay) await wait(delay);
            const c = ready();
            if (!c) continue;
            // jellyfin-web's call can hang while the page restores its session (10.11 after a reload): each try has a
            // deadline, and then asks the server directly with the same token.
            const deadline = (ms) => new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms));
            try { views = ((await Promise.race([c.getUserViews({}, c.getCurrentUserId()), deadline(4000)])) || {}).Items || []; } catch (e) {
                try {
                    const r = await Promise.race([fetch(c.getUrl('UserViews', { userId: c.getCurrentUserId() }), { headers: { Authorization: `MediaBrowser Token="${c.accessToken()}"` } }), deadline(4000)]);
                    views = r.ok ? ((await r.json()) || {}).Items || [] : [];
                } catch (e2) { views = []; }
            }
            if (views.length) break;
        }
        return views;
    }

    E.addActionHook(oskHook);
    E.addActionHook(overlayHook);
    E.onReset(() => {
        cap = 'normal';
        attr('data-icefin-motion', userReduced() ? 'low' : 'normal');
        pointerFirst(false);
        chromeSpecs = {};
        if (overlayEl) overlay.close();
        overlaySpec = null;
        liveTiles.forEach((t) => t.stop());
        materialEls.clear();
        materialMode = 'translucent';
        materialForced = null;
        if (materialWatch) { cancelAnimationFrame(materialWatch); materialWatch = null; }
        attr('data-icefin-materials', false);
        attr('data-icefin-rail', false);
        keyboard.disable();
        timePalette.stop();
        // mount() cleared the hooks just before this runs: the keyboard's and the overlay's go back first (both are modal)
        E.addActionHook(oskHook);
        E.addActionHook(overlayHook);
    });
    const initMotion = () => attr('data-icefin-motion', motion.reduced() ? 'low' : 'normal');
    if (document.documentElement) initMotion(); else document.addEventListener('DOMContentLoaded', initMotion);

    T.ui = { motion, pointerFirst, chrome, pivot, overlay, pagedGrid, carousel3d, liveTile, mutedPreview, userViews, parallax, material, cardExpand, guideGrid, keyboard, timePalette };
})();
