// Media Center kit (PLAN 9.46): helpers shared by the theme's scripts, which load after this one. Everything sits on
// window.icefinMediaCenter, rebuilt each time the theme loads. Server calls go through the theme script API's client.
//
// The page chrome from the design canvas: Back and the Home button at the top left (Home larger than Back, the user,
// 2026-11-12, and showing the server's own icon from ui.brand(): logos come from the server, never this package), the
// page title in light lower case, the clock at the top right.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter = {};

    // Media Center's screens register through M.register: its shared action handlers (M.onAction: ≡ on an item,
    // Play/Pause on an item, the hints) see every action first, then the screen's own onAction.
    M.actions = [];
    M.onAction = (fn) => { M.actions.push(fn); };
    M.register = (path, screen) => T.registerScreen(path, Object.assign({}, screen, {
        onAction(action, ctx) {
            for (const fn of M.actions) { try { if (fn(action, ctx)) return true; } catch (e) { console.error('media-center: action', e); } }
            return screen.onAction ? screen.onAction.call(this, action, ctx) : false;
        }
    }));
    M.el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    M.focusable = (e) => { e.setAttribute('data-icefin-focus', ''); e.tabIndex = -1; return e; };
    M.client = () => T.ctx.apiClient();
    M.sid = () => { const c = M.client(); return c ? c.serverId() : ''; };
    M.details = (id) => T.ctx.navigate(`#/details?id=${id}&serverId=${M.sid()}`);
    M.time = (d) => (d || new Date()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    M.clock = (el) => { const tick = () => { el.textContent = M.time(); }; tick(); return setInterval(tick, 15000); };
    M.svg = (path, cls) => {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        s.setAttribute('aria-hidden', 'true');
        if (cls) s.setAttribute('class', cls);
        s.innerHTML = path;
        return s;
    };
    // Original line icons (no target art).
    M.ICON = {
        back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6"/>',
        play: '<path d="M7 4l14 8-14 8z" fill="currentColor"/>',
        pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/>',
        stop: '<rect x="5" y="5" width="14" height="14" fill="currentColor"/>',
        rew: '<path d="M11 6v12L2 12zM21 6v12l-9-6z" fill="currentColor"/>',
        ff: '<path d="M13 6v12l9-6zM3 6v12l9-6z" fill="currentColor"/>',
        prev: '<path d="M6 5h2v14H6zM20 5v14L9 12z" fill="currentColor"/>',
        next: '<path d="M16 5h2v14h-2zM4 5v14l11-7z" fill="currentColor"/>',
        tracks: '<rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 12h3M7 15h7M13 12h4" stroke="currentColor" stroke-width="2"/>',
        chapters: '<rect x="3" y="5" width="7" height="6" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="5" width="7" height="6" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="14" width="7" height="6" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="7" height="6" fill="none" stroke="currentColor" stroke-width="2"/>',
        info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5h.01" stroke="currentColor" stroke-width="2.2"/>',
        together: '<circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 19c.6-3.4 3-5 6-5s5.4 1.6 6 5M12 19c.5-2.4 2-4 4-4 2.8 0 5 1.6 6 4" fill="none" stroke="currentColor" stroke-width="2"/>',
        cast: '<rect x="2.5" y="4" width="19" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 21h8" stroke="currentColor" stroke-width="2"/>',
        check: '<path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" stroke-width="3"/>'
    };

    // ---- the server's brand (9.27, 9.45): the Home button and corner marks show the server's own icon ----
    M.brand = () => (T.ui.brand ? T.ui.brand() : Promise.resolve({ name: '', icon: null }));
    M.brandMark = (host, opts) => {
        const o = opts || {};
        M.brand().then((b) => {
            host.textContent = '';
            if (b.icon) {
                const img = M.el('img', 'mc-brand-icon');
                img.src = b.icon;
                img.alt = '';
                host.append(img);
            } else {
                host.append(M.el('span', 'mc-brand-initial', (b.name || '·').trim().charAt(0).toUpperCase()));
            }
            if (o.name && b.name) host.append(M.el('span', 'mc-brand-name', b.name));
        });
        return host;
    };

    // ---- page chrome: Back, Home (larger, the server's icon), title, clock ----
    M.chrome = (root, title, opts) => {
        const o = opts || {};
        const nav = M.el('div', 'mc-nav');
        const back = M.focusable(M.el('button', 'mc-round mc-round-back'));
        back.type = 'button';
        back.setAttribute('aria-label', 'Back');
        back.append(M.svg(M.ICON.back));
        back.addEventListener('click', () => { T.ctx.sound('back'); if (o.back) o.back(); else history.back(); });
        const home = M.focusable(M.el('button', 'mc-round mc-round-home'));
        home.type = 'button';
        home.setAttribute('aria-label', 'Home');
        M.brandMark(home);
        home.addEventListener('click', () => { T.ctx.sound('select'); T.ctx.navigate('#/home'); });
        nav.append(back, home);
        const head = M.el('div', 'mc-title', title || '');
        const clock = M.el('div', 'mc-clock');
        const timer = M.clock(clock);
        root.append(nav, head, clock);
        return { nav, back, home, head, clock, stop: () => clearInterval(timer) };
    };

    // ---- a band dialog across the screen (questions, notices with choices) ----
    // choices: [{label, run, safe}] — focus starts on the safe one. Resolves with the chosen label, or null on Back.
    M.band = (host, { title, text, note, choices }) => new Promise((resolve) => {
        const dim = M.el('div', 'mc-dim');
        const band = M.el('div', 'mc-band-dialog');
        band.setAttribute('role', 'dialog');
        band.setAttribute('aria-label', title);
        const body = M.el('div', 'mc-band-body');
        body.append(M.el('div', 'mc-band-title', title));
        if (text) body.append(M.el('div', 'mc-band-text', text));
        if (note) body.append(M.el('div', 'mc-band-note', note));
        const col = M.el('div', 'mc-band-choices');
        let first = null;
        const close = (label) => { dim.remove(); band.remove(); M.band.open = null; resolve(label); };
        for (const c of choices) {
            const b = M.focusable(M.el('button', 'mc-btn', c.label));
            b.type = 'button';
            b.addEventListener('click', () => { close(c.label); if (c.run) c.run(); });
            col.append(b);
            if (c.safe || !first) first = c.safe ? b : first || b;
        }
        band.append(body, col);
        host.append(dim, band);
        M.band.open = { el: band, close: () => close(null) };
        T.ctx.focus(first);
    });
    M.band.open = null;

    // ---- a frame around jellyfin-web's own pages (9.42 ui.stockChrome): the same chrome, the page's title ----
    // stockHooks: the theme's other scripts lay out a page after each update (settings.js: the account pages).
    M.stockHooks = [];
    if (T.ui.stockChrome) T.ui.stockChrome.set({
        mount(host, info) {
            const frame = M.el('div', 'mc-sc');
            const nav = M.el('div', 'mc-nav');
            const back = M.el('button', 'mc-round mc-round-back');
            back.type = 'button';
            back.setAttribute('aria-label', 'Back');
            back.append(M.svg(M.ICON.back));
            back.addEventListener('click', () => info.back());
            const home = M.el('button', 'mc-round mc-round-home');
            home.type = 'button';
            home.setAttribute('aria-label', 'Home');
            M.brandMark(home);
            home.addEventListener('click', () => info.home());
            nav.append(back, home);
            this.title = M.el('div', 'mc-title');
            const clock = M.el('div', 'mc-clock');
            M.clock(clock);
            frame.append(nav, this.title, clock);
            host.append(frame);
            this.update(info);
        },
        update(info) {
            if (!this.title) return;
            const t = (STOCK_TITLES[(info.route || '').replace(/^#\//, '')] || info.title || '').trim();
            this.title.textContent = t.toLowerCase();
            for (const h of M.stockHooks) { try { h(info); } catch (e) { console.error('media-center: stock page', e); } }
        }
    });
    // ---- the keyboard in desktop mode (9.46, the host walk) ----
    // In TV mode the remote's keys never reach the page: the engine and jellyfin-web's focus navigation take them. In
    // desktop mode keys go to the page, where a themed screen that leaves Back to the engine, and jellyfin-web's own
    // pages, did nothing with them. Here, only keys nothing else used (defaultPrevented): Backspace and Escape go back
    // (not while typing, not on the video); on a framed jellyfin-web page the arrows move focus
    // between its controls and the frame's Back and Home, and Enter ticks a tick box. Over a jellyfin-web dialog or a
    // viewer, Back closes it.
    const isText = (e) => !!e && ((e.tagName === 'INPUT' && /^(text|search|password|email|url|tel|number|)$/i.test(e.type || '')) || e.tagName === 'TEXTAREA' || e.isContentEditable);
    const shown = (e) => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; for (let p = e; p && p !== document.documentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
    const overlayUp = () => [...document.querySelectorAll('.dialogContainer .dialog, .slideshowDialog, #bookPlayer, #pdfPlayer, #comicsPlayer')].some((d) => d.getClientRects().length);
    const framed = () => { const h = document.documentElement; return h.hasAttribute('data-icefin-stock') && !h.hasAttribute('data-icefin-dashboard'); };
    // a tick box's input is hidden: its label is what shows, the input what takes focus
    const rectOf = (e) => (e.type === 'checkbox' ? (e.closest('label') || e) : e).getBoundingClientRect();
    function targets() {
        const page = [...document.querySelectorAll('.mainAnimatedPage:not(.hide), .page:not(.hide)')].find((p) => p.getClientRects().length && p.getBoundingClientRect().height > 100);
        const all = [...document.querySelectorAll('#icefin-stock-chrome .mc-nav button')];
        if (page) all.push(...page.querySelectorAll('button, select, input:not([type=hidden]):not([type=file]), textarea, a[href]'));
        return all.filter((e) => !e.disabled && shown(e.type === 'checkbox' ? (e.closest('label') || e) : e));
    }
    function moveIn(dir) {
        const list = targets();
        if (!list.length) return;
        const cur = list.includes(document.activeElement) ? document.activeElement : null;
        if (!cur) { const first = list.find((e) => !e.closest('#icefin-stock-chrome')) || list[0]; first.focus(); first.scrollIntoView({ block: 'nearest' }); return; }
        const a = rectOf(cur), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
        let best = null, score = Infinity;
        for (const e of list) {
            if (e === cur) continue;
            const b = rectOf(e), bx = b.left + b.width / 2, by = b.top + b.height / 2;
            const along = { up: ay - by, down: by - ay, left: ax - bx, right: bx - ax }[dir];
            const across = dir === 'up' || dir === 'down' ? Math.abs(bx - ax) : Math.abs(by - ay);
            if (along <= 4) continue;
            const s = along + across * 2;
            if (s < score) { score = s; best = e; }
        }
        if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); T.ctx.sound('focus'); }
    }
    const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (!window.icefinMediaCenterKeys) {
        window.icefinMediaCenterKeys = true;
        window.addEventListener('keydown', (e) => {
            const K = window.icefinMediaCenter;
            if (!K || !K.keys || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
            K.keys(e);
        });
    }
    M.keys = (e) => {
        if (!T.active() || T.active().id !== 'media-center' || window.icefinMediaCenter !== M) return;
        if (e.key === 'Backspace' || e.key === 'Escape') {
            if ((e.key === 'Backspace' && isText(e.target)) || M.band.open) return;
            // a jellyfin-web dialog, the slide show or a reader: in desktop mode its own keys don't reach it while focus
            // is elsewhere; it closes when history goes back (dialogs without a history entry the engine closes itself)
            if (overlayUp()) {
                const d = [...document.querySelectorAll('.dialogContainer .dialog, .slideshowDialog, #bookPlayer, #pdfPlayer, #comicsPlayer')].find((x) => x.getClientRects().length);
                if (d && d.contains(document.activeElement) && e.key === 'Backspace') return;
                e.preventDefault();
                T.ctx.sound('back');
                history.back();
                return;
            }
            if (document.documentElement.hasAttribute('data-icefin-dashboard') || /^#\/video\b/.test(location.hash)) return;
            e.preventDefault();
            T.ctx.sound('back');
            if (history.length > 1) history.back(); else T.ctx.navigate('#/home');
            return;
        }
        if (!framed() || overlayUp()) return;
        const dir = ARROWS[e.key];
        if (dir) {
            if (isText(e.target) && (dir === 'left' || dir === 'right')) return;
            e.preventDefault();  // a closed drop-down would change its value with up and down
            moveIn(dir);
        } else if (e.key === 'Enter' && e.target && e.target.type === 'checkbox') {
            e.preventDefault();
            e.target.click();
        }
    };

    const STOCK_TITLES = {
        login: 'sign in', selectserver: 'choose a server', forgotpassword: 'forgot password', userprofile: 'profile',
        mypreferencesdisplay: 'display', mypreferenceshome: 'start screen', mypreferencesplayback: 'playback',
        mypreferencessubtitles: 'subtitles', mypreferencescontrols: 'controls', quickconnect: 'quick connect',
        queue: 'now playing', lyrics: 'lyrics', search: 'search', livetv: 'live tv', playlists: 'playlists',
        movies: 'movie library', tv: 'tv library', music: 'music library', books: 'book library', homevideos: 'picture library'
    };
})();
