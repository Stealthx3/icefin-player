// Orbit kit (PLAN 9.56, the "Orbit Screens" canvas): helpers shared by Orbit's scripts, which load after this
// one (forked from Almanac's kit, itself Tide's, in the pass). Everything sits on window.icefinOrbit, rebuilt each time the theme loads.
// Server calls go through the theme script API's client (T.ctx.apiClient()). Icons are original line drawings;
// nothing here comes from the target.
//
// Orbit's grammar (the canvas, Main board): slate panels over the green sky, the focused row a lime bar (views.js);
// options come in a titled panel over the dimmed screen (panel.js); the hints sit bottom left.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const D = window.icefinOrbit = {};
    // the theme's own folder (its icefin-theme:// address), for the Icefin mark in the corner (styles.css: --or-mark)
    const me = document.currentScript && document.currentScript.src;
    D.base = me ? me.replace(/[^/]*$/, '') : '';
    if (D.base) document.documentElement.style.setProperty('--or-mark', `url("${D.base}icefin-mark.svg")`);
    // the corner shows the server's own icon where the target shows its brand (PLAN 9.27, D39); the app's notices keep the
    // IceFin Player mark (--or-mark)
    if (window.icefinTheme && window.icefinTheme.ui && window.icefinTheme.ui.brand) window.icefinTheme.ui.brand().then((b) => {
        if (b && b.icon) document.documentElement.style.setProperty('--or-brand', `url("${b.icon}")`);
    }).catch(() => {});

    // Tide's screens register through D.register: shared handlers (D.onAction: ≡ and ▶ on the focused entry, the
    // hints) see every action first, then the screen's own onAction.
    D.actions = [];
    D.onAction = (fn) => { D.actions.push(fn); };
    D.register = (path, screen) => T.registerScreen(path, Object.assign({}, screen, {
        onAction(action, ctx) {
            D.sawAction(action);
            for (const fn of D.actions) { try { if (fn(action, ctx)) return true; } catch (e) { console.error('orbit: action', e); } }
            return screen.onAction ? screen.onAction.call(this, action, ctx) : false;
        }
    }));
    D.el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    D.focusable = (e) => { e.setAttribute('data-icefin-focus', ''); e.tabIndex = -1; return e; };
    D.client = () => T.ctx.apiClient();
    D.sid = () => { const c = D.client(); return c ? c.serverId() : ''; };
    D.uid = () => { const c = D.client(); return c ? c.getCurrentUserId() : ''; };
    D.details = (id) => T.ctx.navigate(`#/details?id=${id}&serverId=${D.sid()}`);
    D.params = () => new URLSearchParams((location.hash.split('?')[1] || ''));
    D.time = (d) => (d || new Date()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    D.clockText = () => new Date().toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' });
    D.dur = (ms) => ui.motion.duration(ms);
    D.reduced = () => ui.motion.reduced();
    D.svg = (name, cls) => {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        s.setAttribute('aria-hidden', 'true');
        if (cls) s.setAttribute('class', cls);
        s.innerHTML = D.ICON[name] || D.ICON.item;
        return s;
    };
    D.image = (id, type, tag, w) => (tag ? D.client().getScaledImageUrl(id, { type, maxWidth: w || 300, tag }) : '');
    D.ticks = (t) => {
        const m = Math.round((t || 0) / 600000000);
        return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
    };
    D.left = (it) => {
        const d = it && it.UserData;
        if (!d || !d.PlaybackPositionTicks || !it.RunTimeTicks) return '';
        return `${D.ticks(it.RunTimeTicks - d.PlaybackPositionTicks)} left`;
    };

    // Original line icons (24 × 24, stroke = currentColor).
    const A = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
    D.ICON = {
        settings: `<circle cx="12" cy="12" r="3.2" ${A}/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1" ${A}/>`,
        movies: `<rect x="3" y="5" width="18" height="14" rx="1.5" ${A}/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4" ${A}/>`,
        tvshows: `<rect x="3" y="6" width="18" height="12" rx="1.5" ${A}/><path d="M9 3l3 3 3-3M8 21h8" ${A}/>`,
        music: `<path d="M9 17V5l11-2v12" ${A}/><circle cx="6.5" cy="17" r="2.5" ${A}/><circle cx="17.5" cy="15" r="2.5" ${A}/>`,
        livetv: `<rect x="4" y="9" width="16" height="11" rx="1.5" ${A}/><path d="M8 4l4 5 4-5" ${A}/><circle cx="16.5" cy="14.5" r="1" ${A}/>`,
        search: `<circle cx="10.5" cy="10.5" r="6" ${A}/><path d="M15 15l5.5 5.5" ${A}/>`,
        folder: `<path d="M3 7h6l2 2h10v10H3z" ${A}/>`,
        folderNew: `<path d="M3 7h6l2 2h10v10H3z" ${A}/><path d="M12 12v4M10 14h4" ${A}/>`,
        item: `<rect x="5" y="4" width="14" height="16" rx="1.5" ${A}/><path d="M9 9h6M9 13h6" ${A}/>`,
        star: `<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z" ${A}/>`,
        collections: `<rect x="4" y="7" width="13" height="13" rx="1" ${A}/><path d="M7 4h13v13" ${A}/>`,
        boxsets: `<rect x="4" y="7" width="13" height="13" rx="1" ${A}/><path d="M7 4h13v13" ${A}/>`,
        playlists: `<path d="M4 6h12M4 11h12M4 16h8M18 14v6M15 17h6" ${A}/>`,
        play: `<circle cx="12" cy="12" r="9" ${A}/><path d="M10 8.5l5.5 3.5-5.5 3.5z" ${A}/>`,
        resume: `<circle cx="12" cy="12" r="9" ${A}/><path d="M10 8.5l5.5 3.5-5.5 3.5z" ${A}/><path d="M3 12h2" ${A}/>`,
        restart: `<path d="M5 12a7 7 0 1 0 2-5" ${A}/><path d="M5 4v4h4" ${A}/>`,
        trailer: `<rect x="3" y="6" width="14" height="12" rx="1.5" ${A}/><path d="M17 10l4-2v8l-4-2" ${A}/>`,
        shuffle: `<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3" ${A}/>`,
        mix: `<circle cx="12" cy="12" r="8" ${A}/><circle cx="12" cy="12" r="2" ${A}/><path d="M12 4v2M20 12h-2" ${A}/>`,
        album: `<circle cx="12" cy="12" r="8" ${A}/><circle cx="12" cy="12" r="2" ${A}/>`,
        person: `<circle cx="12" cy="8" r="3.5" ${A}/><path d="M5 20c1.2-4 4-5.5 7-5.5s5.8 1.5 7 5.5" ${A}/>`,
        people: `<circle cx="9" cy="8" r="3.2" ${A}/><path d="M3 19c.9-3.4 3.2-4.8 6-4.8s5.1 1.4 6 4.8" ${A}/><circle cx="17" cy="9" r="2.5" ${A}/><path d="M16 14.3c2.3.1 4 1.4 4.8 4.2" ${A}/>`,
        chapters: `<rect x="3" y="5" width="7" height="6" ${A}/><rect x="14" y="5" width="7" height="6" ${A}/><rect x="3" y="14" width="7" height="6" ${A}/><rect x="14" y="14" width="7" height="6" ${A}/>`,
        audio: `<path d="M4 10v4h4l5 4V6L8 10z" ${A}/><path d="M16 9a4 4 0 0 1 0 6M18.5 7a7 7 0 0 1 0 10" ${A}/>`,
        subtitles: `<rect x="3" y="6" width="18" height="12" rx="1.5" ${A}/><path d="M6 14h5M13 14h5M6 11h3" ${A}/>`,
        versions: `<rect x="4" y="4" width="12" height="12" rx="1" ${A}/><rect x="8" y="8" width="12" height="12" rx="1" ${A}/>`,
        info: `<circle cx="12" cy="12" r="9" ${A}/><path d="M12 11v6M12 7.5h.01" ${A}/>`,
        heart: `<path d="M12 19s-7-4.4-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 2.5C19 14.6 12 19 12 19z" ${A}/>`,
        check: `<path d="M5 12l5 5 9-10" ${A}/>`,
        episodes: `<rect x="3" y="5" width="18" height="4" rx="1" ${A}/><rect x="3" y="11" width="18" height="4" rx="1" ${A}/><path d="M3 19h12" ${A}/>`,
        guide: `<rect x="3" y="5" width="18" height="14" rx="1.5" ${A}/><path d="M3 10h18M9 5v14" ${A}/>`,
        record: `<circle cx="12" cy="12" r="8" ${A}/><circle cx="12" cy="12" r="3.5" ${A}/>`,
        schedule: `<rect x="4" y="5" width="16" height="15" rx="1.5" ${A}/><path d="M4 10h16M8 3v4M16 3v4" ${A}/>`,
        timer: `<circle cx="12" cy="13" r="7" ${A}/><path d="M12 9v4l3 2M9 3h6" ${A}/>`,
        channel: `<rect x="4" y="9" width="16" height="11" rx="1.5" ${A}/><path d="M8 4l4 5 4-5" ${A}/>`,
        photos: `<rect x="3" y="5" width="18" height="14" rx="1.5" ${A}/><path d="M3 16l5-5 4 4 3-3 6 6" ${A}/>`,
        homevideos: `<rect x="3" y="7" width="13" height="10" rx="1.5" ${A}/><path d="M16 11l5-3v8l-5-3" ${A}/>`,
        books: `<path d="M4 5h7v15H4zM13 5h7v15h-7" ${A}/>`,
        musicvideos: `<rect x="3" y="6" width="18" height="12" rx="1.5" ${A}/><path d="M11 14V9l5-1v5" ${A}/><circle cx="9.5" cy="14" r="1.5" ${A}/>`,
        mixed: `<path d="M3 7h6l2 2h10v10H3z" ${A}/>`,
        server: `<rect x="4" y="5" width="16" height="6" rx="1" ${A}/><rect x="4" y="13" width="16" height="6" rx="1" ${A}/><path d="M7 8h.01M7 16h.01" ${A}/>`,
        add: `<circle cx="12" cy="12" r="8" ${A}/><path d="M12 8v8M8 12h8" ${A}/>`,
        network: `<path d="M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0" ${A}/><circle cx="12" cy="13" r="1" ${A}/>`,
        display: `<rect x="3" y="4" width="18" height="12" rx="1.5" ${A}/><path d="M8 20h8M12 16v4" ${A}/>`,
        home: `<path d="M3 11l9-7 9 7v9H3z" ${A}/>`,
        controls: `<rect x="3" y="8" width="18" height="9" rx="4.5" ${A}/><path d="M7 12.5h3M8.5 11v3M15 12h.01M17 13h.01" ${A}/>`,
        client: `<rect x="4" y="4" width="16" height="16" rx="2" ${A}/><path d="M8 9h8M8 13h8M8 17h4" ${A}/>`,
        key: `<circle cx="8" cy="15" r="4" ${A}/><path d="M11 12l8-8M16 7l2 2M14 9l2 2" ${A}/>`,
        signout: `<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" ${A}/>`,
        classic: `<rect x="3" y="4" width="18" height="16" rx="1.5" ${A}/><path d="M3 9h18M8 9v11" ${A}/>`,
        dashboard: `<path d="M4 20V10M10 20V4M16 20v-8M20 20H3" ${A}/>`,
        exit: `<path d="M12 3v9M6.5 6.5a8 8 0 1 0 11 0" ${A}/>`,
        quick: `<rect x="4" y="4" width="6" height="6" ${A}/><rect x="14" y="4" width="6" height="6" ${A}/><rect x="4" y="14" width="6" height="6" ${A}/><path d="M14 14h2v2M18 18h2v2M14 20h2M20 14v2" ${A}/>`,
        queue: `<path d="M4 6h16M4 11h16M4 16h10" ${A}/><path d="M17 15l4 2.5-4 2.5z" ${A}/>`,
        lyrics: `<path d="M4 6h16M4 10h12M4 14h16M4 18h9" ${A}/>`,
        cast: `<rect x="2.5" y="4" width="19" height="13" rx="2" ${A}/><path d="M8 21h8" ${A}/>`,
        together: `<circle cx="8" cy="8" r="3" ${A}/><circle cx="16" cy="8" r="3" ${A}/><path d="M2 19c.6-3.4 3-5 6-5s5.4 1.6 6 5M12 19c.5-2.4 2-4 4-4 2.8 0 5 1.6 6 4" ${A}/>`,
        studio: `<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6" ${A}/>`,
        genre: `<path d="M4 4h7v7H4zM13 13h7v7h-7zM13 4l7 7M20 4l-7 7" ${A}/>`,
        latest: `<circle cx="12" cy="12" r="8" ${A}/><path d="M12 7v5l3 2" ${A}/>`,
        upcoming: `<rect x="4" y="5" width="16" height="15" rx="1.5" ${A}/><path d="M4 10h16M12 13v4M10 15h4" ${A}/>`,
        song: `<path d="M9 17V5l9-2v3l-9 2" ${A}/><circle cx="6.5" cy="17" r="2.5" ${A}/>`,
        back: `<path d="M15 5l-7 7 7 7" ${A}/>`,
        pause: `<path d="M8.5 5.5v13M15.5 5.5v13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`,
        prev: `<path d="M6 5.5v13M18 6l-9 6 9 6z" ${A}/>`,
        next: `<path d="M18 5.5v13M6 6l9 6-9 6z" ${A}/>`,
        rew: `<path d="M11.5 7l-6 5 6 5zM19 7l-6 5 6 5z" ${A}/>`,
        ffw: `<path d="M12.5 7l6 5-6 5zM5 7l6 5-6 5z" ${A}/>`,
        more: `<path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>`,
        reorder: `<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`
    };
    // The line icon for a library or an item, by its collection type or item type.
    D.kindIcon = (type) => ({
        movies: 'movies', tvshows: 'tvshows', music: 'music', livetv: 'livetv', boxsets: 'collections', playlists: 'playlists',
        homevideos: 'homevideos', photos: 'photos', books: 'books', musicvideos: 'musicvideos', mixed: 'mixed',
        Movie: 'movies', Series: 'tvshows', Season: 'episodes', Episode: 'tvshows', MusicAlbum: 'album', MusicArtist: 'person',
        Audio: 'song', Playlist: 'playlists', BoxSet: 'collections', Person: 'person', Book: 'books', Photo: 'photos',
        PhotoAlbum: 'photos', Video: 'homevideos', MusicVideo: 'musicvideos', TvChannel: 'channel', Program: 'livetv',
        Folder: 'folder', CollectionFolder: 'folder', Genre: 'genre', MusicGenre: 'genre', Studio: 'studio'
    }[type] || 'item');
    // Initials for a person, an artist or a user with no picture (the Effects board).
    // the goodbye jingle, then leave (Effects board: Exit and Sign out)
    D.farewell = async (then) => {
        let played = false;
        try { played = !!(T.ctx.music && await T.ctx.music.jingle('goodbye')); } catch (e) { played = false; }
        if (played) await new Promise((r) => setTimeout(r, 1500));
        then();
    };
    D.initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

    // ---- the ground: Orbit's navy gradient is the screen's own background (styles.css); nothing moves on it ----
    D.ground = () => ({ stop() {} });
    D.wave = () => ({ stop() {} });

    // ---- the clock (top right) and the song line under it while music plays (HomeMusic board) ----
    D.clock = (root) => {
        const box = D.el('div', 'or-clock');
        const t = D.el('div', 'or-clock-time');
        const extra = D.el('div', 'or-clock-extra');
        box.append(t, extra);
        root.append(box);
        const tick = () => { t.textContent = D.clockText(); };
        tick();
        const timer = setInterval(tick, 15000);
        const song = D.songLine(box);
        return { box, extra, stop: () => { clearInterval(timer); song.stop(); } };
    };
    D.songLine = (host) => {
        const line = D.el('div', 'or-song');
        line.hidden = true;
        const label = D.el('button', 'or-song-label');
        label.type = 'button';
        label.setAttribute('data-icefin-pointer-only', '');  // the pointer's way; a pad has the capsule's ♪ and the guide's Now playing (QA Orbit 2)
        label.addEventListener('click', () => { T.ctx.sound('select'); T.ctx.navigate('#/queue'); });
        const bar = D.el('div', 'or-song-bar');
        const fill = D.el('div', 'or-song-fill');
        bar.append(fill);
        // pointer seeking on the line (checklist 2.5)
        bar.addEventListener('pointerdown', (e) => {
            const p = ui.player && ui.player.controls ? ui.player.controls() : null;
            const s = p && p.state ? p.state() : null;
            if (!s || !s.duration) return;
            const r = bar.getBoundingClientRect();
            p.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * s.duration);
        });
        line.append(label, bar);
        host.append(line);
        const draw = () => {
            const np = T.ctx.nowPlaying && T.ctx.nowPlaying();
            const it = np && np.item;
            const audio = it && (it.MediaType === 'Audio' || it.Type === 'Audio');
            if (!audio || /^#\/(queue|lyrics)\b/.test(location.hash)) { line.hidden = true; return; }
            line.hidden = false;
            label.textContent = `♪ ${it.Name || ''}`;
            label.setAttribute('aria-label', `Now playing: ${it.Name || ''}; open the queue`);
            const p = ui.player && ui.player.controls ? ui.player.controls() : null;
            const s = p && p.state ? p.state() : null;
            fill.style.width = s && s.duration ? `${Math.min(100, (s.position / s.duration) * 100)}%` : '0%';
        };
        draw();
        const timer = setInterval(draw, 1000);
        return { stop: () => clearInterval(timer) };
    };

    // ---- input mode (hints show for a pad or remote only) ----
    const PAD = new Set(['up', 'down', 'left', 'right', 'enter', 'select', 'back', 'menu', 'search', 'home', 'play_pause', 'playpause', 'step_backward', 'step_forward', 'seek_backward', 'seek_forward']);
    D.sawAction = (a) => { if (PAD.has(a)) document.documentElement.setAttribute('data-or-input', 'pad'); };
    if (!window.icefinOrbitInput) {
        window.icefinOrbitInput = true;
        window.addEventListener('pointermove', (e) => { if (e.movementX || e.movementY) document.documentElement.setAttribute('data-or-input', 'pointer'); }, true);
        window.addEventListener('keydown', (e) => {
            if (/^(Arrow|Enter|Escape|Backspace)/.test(e.key)) document.documentElement.setAttribute('data-or-input', 'pad');
            else if (e.key.length === 1) document.documentElement.setAttribute('data-or-input', 'keys');
        }, true);
    }
    ui.pointerFirst(true);  // hover moves focus on every screen (checklist 2.5)
    if (ui.keyboard) ui.keyboard.enable();  // the on-screen keyboard for every text field (checklist 1.12)

    // ---- hints (the Input board: page-aware, bottom left, the pad's own keys) ----
    // A screen sets what its keys do now: D.hints([['OK', 'open'], ['≡', 'options'], ['Back', '']]). Shown only for a
    // pad or remote (html[data-or-input="pad"], always in Couch Mode); only keys that do something here.
    // While a themed screen is up the engine hides everything at the body's top level except its own layers, so the
    // bar (and a notice) lives in the open overlay, else the screen's root, else the body (a framed jellyfin-web page).
    D.layer = () => {
        const o = document.getElementById('icefin-theme-overlay');
        if (o && o.isConnected && o.childElementCount && !o.hidden) return o;
        const r = document.getElementById('icefin-theme-root');
        if (r && !r.hidden && document.documentElement.classList.contains('icefin-screen')) return r;
        return document.body;
    };
    let hintEl = null;
    D.hints = (list) => {
        if (!hintEl || !hintEl.isConnected) {
            hintEl = D.el('div', 'or-hints');
            hintEl.setAttribute('aria-hidden', 'true');
        }
        const host = D.layer();
        if (hintEl.parentElement !== host) host.append(hintEl);
        hintEl.textContent = '';
        for (const [key, what] of list || []) {
            const s = D.el('span', 'or-hint');
            // the face buttons drawn for the pad in use (the engine's glyphs, by the pad's family);
            // the other keys as small caps (Gate 1, decision 7)
            const face = { OK: 'south', Back: 'east', X: 'west', Y: 'north' }[key];
            if (face && T.glyph) { const g = D.el('b', 'or-glyph or-glyph-' + face); g.innerHTML = T.glyph(face); g.setAttribute('data-key', key); s.append(g); }
            else s.append(D.el('b', 'or-key', key === 'View' ? '⧉' : key === 'L1 R1' ? 'LB RB' : key));
            if (!what && key === 'Back') s.append(document.createTextNode(' Back'));
            if (what) s.append(document.createTextNode(` ${what}`));
            hintEl.append(s);
        }
        hintEl.hidden = !(list && list.length);
    };
    D.hintsOff = () => { if (hintEl) hintEl.hidden = true; };

    // ---- the pointer's Back and Home (Decisions board): a quiet line at the top left, while the mouse moves ----
    // A button in the pointer's line: the pointer that moves over it focuses it, without making it a stop for the arrows.
    // Content moving under a resting cursor sends events without movement: those never take focus (QA Orbit 1)
    D.pointerFocus = (b) => {
        b.addEventListener('mousemove', (e) => { if ((e.movementX || e.movementY) && T.ctx.focused && T.ctx.focused() !== b) T.ctx.focus(b); });
        return b;
    };
    D.pointerNav = (root, back, extra) => {
        const nav = D.el('div', 'or-pnav');
        const b = D.pointerFocus(D.el('button', 'or-pnav-btn'));
        b.type = 'button';
        b.append(D.svg('back'), document.createTextNode(' Back'));
        b.addEventListener('click', () => { T.ctx.sound('back'); if (back) back(); else history.back(); });
        const h = D.pointerFocus(D.el('button', 'or-pnav-btn'));
        h.type = 'button';
        h.append(D.svg('home'), document.createTextNode(' Home'));
        h.addEventListener('click', () => { T.ctx.sound('select'); T.ctx.navigate('#/home'); });
        nav.append(b, h);
        // what a pad has keys for and a mouse doesn't: the options (≡), Play on, Watch together, and a screen's own
        const add = (icon, label, go) => { const x = D.pointerFocus(D.el('button', 'or-pnav-btn')); x.type = 'button'; x.append(D.svg(icon), document.createTextNode(` ${label}`)); x.setAttribute('aria-label', label); x.addEventListener('click', () => { T.ctx.sound('select'); go(); }); nav.append(x); return x; };
        add('reorder', 'Options', () => { if (!(T.handleAction && T.handleAction('menu')) && D.notice) D.notice('No options here', true); });  // always answers (QA Orbit 1)
        add('cast', 'Play on', () => D.playOn && D.playOn('play', null));
        add('together', 'Watch together', () => D.playOn && D.playOn('together', null));
        for (const x of (extra || [])) add(x.icon || 'item', x.label, x.go);
        root.append(nav);
        return nav;
    };

    // ---- the keyboard in desktop mode: Backspace and Escape go back where nothing else used them (as Media Center) ----
    const isText = (e) => !!e && ((e.tagName === 'INPUT' && /^(text|search|password|email|url|tel|number|)$/i.test(e.type || '')) || e.tagName === 'TEXTAREA' || e.isContentEditable);
    if (!window.icefinOrbitKeys) {
        window.icefinOrbitKeys = true;
        window.addEventListener('keydown', (e) => {
            const K = window.icefinOrbit;
            if (!K || !K.keys || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
            K.keys(e);
        });
    }
    D.keys = (e) => {
        if (!T.active() || T.active().id !== 'orbit' || window.icefinOrbit !== D) return;
        if (D.framedKeys && D.framedKeys(e)) return;  // the arrows on a framed jellyfin-web page (settings.js)
        if (e.key !== 'Backspace' && e.key !== 'Escape') return;
        if ((e.key === 'Backspace' && isText(e.target)) || (D.panel && D.panel.isOpen())) return;
        if (document.documentElement.hasAttribute('data-icefin-dashboard') || /^#\/video\b/.test(location.hash)) return;
        if (document.getElementById('icefin-theme-root') && document.querySelector('#icefin-theme-root [data-or-screen]')) return;  // Tide's screens take Back themselves
        e.preventDefault();
        T.ctx.sound('back');
        if (history.length > 1) history.back(); else T.ctx.navigate('#/home');
    };
})();
