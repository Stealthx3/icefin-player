// Baseline kit (PLAN 9.51, the "Baseline Screens" canvas): stock jellyfin-web's TV layout, re-implemented with the
// theme engine (the user's Gate 1 calls, 2026-11-14): Baseline's own copy of stock's styles (bl-* classes, styles.css),
// the server's branding where it has one and Icefin's art elsewhere, stock's TV focus (cards grow 1.07, rows and
// buttons fill with the accent), and the controller additions: focus on arrival, ≡ for the item menu, ▶ to play,
// L1 R1 for tabs, the hint line, the exit question. Everything sits on window.icefinBaseline (B).
//
// Navigation is the engine's: every control carries data-icefin-focus and the engine's spatial move picks the next
// one, as stock's own focus manager does on the TV layout; Baseline adds what stock lacks and keeps what it has.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const B = window.icefinBaseline = {};
    const me = document.currentScript && document.currentScript.src;
    B.base = me ? me.replace(/[^/]*$/, '') : '';

    // ---- screens: shared handlers (≡, ▶, the shoulders, the hints) see every action first ----
    B.actions = [];
    B.onAction = (fn) => { B.actions.push(fn); };
    B.register = (path, screen) => T.registerScreen(path, Object.assign({}, screen, {
        onAction(action, ctx) {
            B.sawAction(action);
            if (screen.onAction && screen.first) { const r = screen.onAction.call(this, action, ctx); if (r) return true; }
            for (const fn of B.actions) { try { if (fn(action, ctx)) return true; } catch (e) { console.error('baseline: action', e); } }
            return screen.onAction && !screen.first ? screen.onAction.call(this, action, ctx) : false;
        }
    }));
    B.el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    B.focusable = (e) => { e.setAttribute('data-icefin-focus', ''); e.tabIndex = -1; return e; };
    B.btn = (cls, text) => { const b = B.focusable(B.el('button', cls, text)); b.type = 'button'; return b; };
    // Material icons by name, from the icon font jellyfin-web loads (stock's own glyphs)
    B.icon = (name, cls) => { const s = B.el('span', 'bl-ic' + (cls ? ` ${cls}` : ''), name); s.setAttribute('aria-hidden', 'true'); return s; };
    B.client = () => T.ctx.apiClient();
    B.uid = () => { const c = B.client(); return c ? c.getCurrentUserId() : ''; };
    B.sid = () => { const c = B.client(); return c ? c.serverId() : ''; };
    B.params = () => new URLSearchParams((location.hash.split('?')[1] || ''));
    B.go = (hash) => T.ctx.navigate(hash);
    B.details = (it) => B.go(`#/details?id=${it.Id || it}&serverId=${B.sid()}`);
    B.image = (id, type, tag, w) => (tag ? B.client().getScaledImageUrl(id, { type, maxWidth: w || 400, tag }) : '');
    B.time = (d) => (d || new Date()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    B.reduced = () => ui.motion.reduced();
    B.dur = (ms) => ui.motion.duration(ms);
    B.ticks = (t) => { const m = Math.max(t > 0 ? 1 : 0, Math.round((t || 0) / 600000000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
    B.clockTicks = (t) => { const s = Math.round((t || 0) / 1e7); const h = Math.floor(s / 3600); const mm = Math.floor((s % 3600) / 60); const ss = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`; };
    B.FIELDS = 'PrimaryImageAspectRatio,ProductionYear,PremiereDate,ChildCount,RecursiveItemCount,AlbumArtist,Artists,UserData,RunTimeTicks,Overview,OfficialRating,CommunityRating,CriticRating,SeriesName,ParentIndexNumber,IndexNumber,BackdropImageTags,ParentBackdropItemId,ParentBackdropImageTags,SeriesId,SeriesPrimaryImageTag,ImageTags,MediaType,CollectionType,DateCreated,ParentThumbItemId,ParentThumbImageTag,SeriesThumbImageTag,ChannelId,ChannelName,CurrentProgram,ChannelNumber,StartDate,EndDate,EpisodeTitle';
    B.items = async (q) => { const r = await Promise.resolve(B.client().getItems(B.uid(), Object.assign({ Fields: B.FIELDS, EnableImageTypes: 'Primary,Backdrop,Thumb,Banner' }, q))); return r || { Items: [], TotalRecordCount: 0 }; };

    // ---- input mode: the hint line shows for a pad or remote; the mouse keeps stock's hover ----
    const PAD = new Set(['up', 'down', 'left', 'right', 'enter', 'select', 'back', 'menu', 'search', 'home', 'play_pause', 'playpause', 'step_backward', 'step_forward', 'seek_backward', 'seek_forward']);
    B.sawAction = (a) => { if (PAD.has(a)) document.documentElement.setAttribute('data-bl-input', 'pad'); };
    if (!window.icefinBaselineInput) {
        window.icefinBaselineInput = true;
        window.addEventListener('pointermove', (e) => { if (e.movementX || e.movementY) document.documentElement.setAttribute('data-bl-input', 'pointer'); }, true);
        window.addEventListener('keydown', (e) => { if (/^(Arrow|Enter|Escape|Backspace)/.test(e.key)) document.documentElement.setAttribute('data-bl-input', 'pad'); }, true);
    }
    if (ui.keyboard) ui.keyboard.enable();

    // ---- the visible layer: the engine hides the body's other children under a themed screen ----
    B.layer = () => {
        const o = document.getElementById('icefin-theme-overlay');
        if (o && o.isConnected && o.childElementCount && !o.hidden) return o;
        const r = document.getElementById('icefin-theme-root');
        if (r && !r.hidden && document.documentElement.classList.contains('icefin-screen')) return r;
        return document.body;
    };

    // ---- the hint line (Hints board): bottom right, stock's type on stock's toast colour, page-aware ----
    let hintEl = null;
    B.hints = (list) => {
        if (!hintEl || !hintEl.isConnected) { hintEl = B.el('div', 'bl-hints'); hintEl.setAttribute('aria-hidden', 'true'); }
        const host = B.layer();
        if (hintEl.parentElement !== host) host.append(hintEl);
        hintEl.textContent = '';
        for (const [k, what] of list || []) { const s = B.el('span', 'bl-hint'); s.append(B.el('b', '', k)); if (what) s.append(document.createTextNode(` ${what}`)); hintEl.append(s); }
        hintEl.hidden = !(list && list.length);
    };
    B.hintsOff = () => { if (hintEl) hintEl.hidden = true; };
    // the hints for what has focus now: each focusable may carry its own (el.blHints), else they come from its kind
    B.hintsFor = (f) => {
        if (!f) return;
        if (f.blHints) { B.hints(typeof f.blHints === 'function' ? f.blHints() : f.blHints); return; }
        const h = [];
        const it = f.blItem;
        if (f.classList.contains('bl-tab')) h.push(['◀ ▶', 'tab'], ['▼', 'content']);
        else if (it) { h.push(['OK', it.Type === 'TvChannel' || it.Type === 'Program' ? 'watch' : (it.IsFolder && it.Type !== 'Series' && it.Type !== 'BoxSet' && it.Type !== 'MusicAlbum' ? 'open' : 'details')]); if (B.playable(it)) h.push(['▶', 'play']); h.push(['≡', 'options']); }
        else if (f.tagName === 'INPUT' || f.tagName === 'TEXTAREA') h.push(['OK', 'keyboard'], ['▼', 'next']);
        else if (f.tagName === 'SELECT') h.push(['OK', 'open'], ['▲ ▼', 'choose']);
        else h.push(['OK', f.blOk || 'choose']);
        if (B.screenTabs && B.screenTabs()) h.push(['L1 R1', 'tabs']);
        h.push(['Back', B.backWord ? B.backWord() : '']);
        B.hints(h);
    };

    // ---- notices: stock's toast (bottom left, a dark card, 3 s) ----
    B.notice = (text, bad) => {
        if (!text) return;
        document.querySelectorAll('.bl-toast').forEach((x) => x.remove());
        const n = B.el('div', 'bl-toast' + (bad ? ' bad' : ''), text);
        n.setAttribute('role', 'status');
        B.layer().append(n);
        T.ctx.sound(bad ? 'error' : 'navigate');
        requestAnimationFrame(() => n.classList.add('on'));
        setTimeout(() => n.classList.add('out'), 3300);
        setTimeout(() => n.remove(), 3700);
    };

    // ---- branding (the user's call 3): the server's own where it has it, Icefin's art for the app's own ----
    B.branding = null;
    B.loadBranding = async () => {
        if (B.branding) return B.branding;
        const c = B.client();
        let conf = null;
        try { conf = await c.getJSON(c.getUrl('Branding/Configuration')); } catch (e) { conf = null; }
        B.branding = { splash: conf && conf.SplashscreenEnabled ? c.getUrl('Branding/Splashscreen') : '', css: (conf && conf.CustomCss) || '', disclaimer: (conf && conf.LoginDisclaimer) || '' };
        return B.branding;
    };
    B.mark = () => `${B.base}icefin-mark.svg`;
    // the goodbye jingle before leaving or signing out (the sound set, the user's call 7); straight away when music is off
    B.farewell = async (then) => {
        let played = false;
        try { played = !!(T.ctx.music && await T.ctx.music.jingle('goodbye')); } catch (e) { played = false; }
        if (played) await new Promise((r) => setTimeout(r, 1500));
        then();
    };

    // ---- the header (stock's TV skinHeader): Back, Home and the page's title on the left (Icefin's mark on the home),
    // SyncPlay, Search, the user and the clock on the right; the page's tabs centred under it ----
    B.header = (root, o) => {
        o = o || {};
        const h = B.el('div', 'bl-header' + (o.tabs && o.tabs.length ? ' with-tabs' : ''));
        const top = B.el('div', 'bl-header-top');
        const left = B.el('div', 'bl-header-left');
        if (o.home) {
            const logo = B.el('div', 'bl-logo');
            logo.style.backgroundImage = `url("${B.mark()}")`;
            logo.setAttribute('role', 'img');
            logo.setAttribute('aria-label', 'Icefin');
            left.append(logo);
        } else {
            const back = B.btn('bl-hbtn', null); back.append(B.icon('arrow_back')); back.title = 'Back'; back.setAttribute('aria-label', 'Back');
            back.addEventListener('click', () => { T.ctx.sound('back'); if (o.onBack) o.onBack(); else if (history.length > 1) history.back(); else B.go('#/home'); });
            const home = B.btn('bl-hbtn', null); home.append(B.icon('home')); home.title = 'Home'; home.setAttribute('aria-label', 'Home');
            home.addEventListener('click', () => { T.ctx.sound('select'); B.go('#/home'); });
            left.append(back, home);
            if (o.title) left.append(B.el('h3', 'bl-page-title', o.title));
        }
        const right = B.el('div', 'bl-header-right');
        const btn = (icon, label, go) => { const b = B.btn('bl-hbtn', null); b.append(B.icon(icon)); b.title = label; b.setAttribute('aria-label', label); b.addEventListener('click', () => { T.ctx.sound('select'); go(); }); right.append(b); return b; };
        btn('group', 'SyncPlay', () => B.playOn && B.playOn('together'));
        btn('search', 'Search', () => B.go('#/search'));
        btn('person', 'Settings', () => B.go('#/mypreferencesmenu'));
        const clock = B.el('div', 'bl-clock', B.time());
        right.append(clock);
        const timer = setInterval(() => { if (clock.isConnected) clock.textContent = B.time(); else clearInterval(timer); }, 10000);
        top.append(left, right);
        h.append(top);
        const tabs = B.el('div', 'bl-tabs');
        h.tabEls = [];
        (o.tabs || []).forEach((t, i) => {
            const b = B.btn('bl-tab' + (i === o.at ? ' active' : ''), t.label);
            b.addEventListener('click', () => { if (i !== h.at) { T.ctx.sound('navigate'); t.go(); } });
            tabs.append(b);
            h.tabEls.push(b);
        });
        h.at = o.at || 0;
        if (o.tabs && o.tabs.length) h.append(tabs);
        // the header scrolls away with the page, as stock's TV header does
        (root.querySelector('.bl-page') || root).prepend(h);
        h.setActive = (i) => { h.at = i; h.tabEls.forEach((b, k) => b.classList.toggle('active', k === i)); };
        return h;
    };

    // ---- items ----
    const CONTAINER = ['Series', 'Season', 'BoxSet', 'MusicAlbum', 'MusicArtist', 'Playlist', 'PhotoAlbum', 'MusicGenre', 'Folder', 'CollectionFolder'];
    B.playable = (it) => !!it && (!!it.MediaType || CONTAINER.includes(it.Type) || it.Type === 'TvChannel' || it.Type === 'Program');
    B.play = (it, resume) => {
        const pos = resume && it.UserData && it.UserData.PlaybackPositionTicks ? it.UserData.PlaybackPositionTicks : 0;
        return T.ctx.play({ ids: [it.Id], serverId: B.sid(), startPositionTicks: pos });
    };
    // where OK on an item goes, as stock's cards do
    B.open = (it) => {
        if (it.Type === 'CollectionFolder' || it.Type === 'UserView') { B.go(B.viewRoute(it)); return; }
        if (it.Type === 'TvChannel') { T.ctx.play({ ids: [it.Id], serverId: B.sid() }); return; }
        if (it.Type === 'Photo') { T.ctx.play({ ids: [it.Id], serverId: B.sid() }); return; }
        if (it.Type === 'Genre' || it.Type === 'MusicGenre' || it.Type === 'Studio') { B.go(`#/list?${it.Type === 'Studio' ? 'studioId' : (it.Type === 'MusicGenre' ? 'musicGenreId' : 'genreId')}=${it.Id}&serverId=${B.sid()}`); return; }
        B.details(it);
    };
    const ROUTE = { movies: 'movies', tvshows: 'tv', music: 'music', livetv: 'livetv' };  // stock's tabbed libraries; the rest are #/list
    B.viewRoute = (v) => {
        const r = ROUTE[v.CollectionType];
        if (!r) return `#/list?parentId=${v.Id}&serverId=${B.sid()}`;
        if (r === 'list') return `#/list?parentId=${v.Id}&serverId=${B.sid()}`;
        return `#/${r}?topParentId=${v.Id}&collectionType=${v.CollectionType}`;
    };
    B.kindIcon = (t) => ({ movies: 'video_library', tvshows: 'tv', music: 'library_music', livetv: 'live_tv', boxsets: 'video_library', playlists: 'library_add', homevideos: 'photo_library', photos: 'photo_library', books: 'library_books', musicvideos: 'video_library', mixed: 'folder', folders: 'folder',
        Movie: 'movie', Series: 'tv', Episode: 'tv', Season: 'tv', MusicAlbum: 'album', MusicArtist: 'person', Audio: 'audiotrack', Playlist: 'queue_music', BoxSet: 'collections', Person: 'person', Book: 'book', Photo: 'photo', PhotoAlbum: 'photo_album', Video: 'videocam', MusicVideo: 'music_video', TvChannel: 'live_tv', Program: 'live_tv', Folder: 'folder', CollectionFolder: 'folder', Genre: 'local_offer', MusicGenre: 'local_offer', Studio: 'business' }[t] || 'folder');

    // ---- cards (stock's card: a box that grows on focus, the picture at its shape, the text under it) ----
    // shape: overflowBackdrop | overflowPortrait | overflowSquare (rows); backdrop | portrait | square (grids)
    B.shapeOf = (it, wide) => {
        if (wide || it.Type === 'Episode' || it.Type === 'Video' || it.Type === 'TvChannel' || it.Type === 'Program' || it.Type === 'CollectionFolder' || it.Type === 'UserView' || it.Type === 'Photo') return 'backdrop';
        if (it.Type === 'MusicAlbum' || it.Type === 'Audio' || it.Type === 'MusicArtist' || it.Type === 'Playlist' || it.Type === 'PhotoAlbum' || it.Type === 'MusicGenre') return 'square';
        return 'portrait';
    };
    const COLORS = ['#00455c', '#44bae1', '#00a4db', '#1c4c5c', '#007ea8'];  // stock's default card colours
    const colourOf = (s) => { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
    B.artOf = (it, shape, w) => {
        const tags = it.ImageTags || {};
        if (shape === 'backdrop') {
            if (it.Type === 'Program' && tags.Primary) return B.image(it.Id, 'Primary', tags.Primary, w || 480);
            if (tags.Thumb) return B.image(it.Id, 'Thumb', tags.Thumb, w || 480);
            if (it.Type === 'Episode' && tags.Primary) return B.image(it.Id, 'Primary', tags.Primary, w || 480);
            if ((it.BackdropImageTags || [])[0]) return B.image(it.Id, 'Backdrop', it.BackdropImageTags[0], w || 480);
            if (it.ParentThumbItemId && it.ParentThumbImageTag) return B.image(it.ParentThumbItemId, 'Thumb', it.ParentThumbImageTag, w || 480);
            if (tags.Primary) return B.image(it.Id, 'Primary', tags.Primary, w || 480);
            if (it.ParentBackdropItemId && (it.ParentBackdropImageTags || [])[0]) return B.image(it.ParentBackdropItemId, 'Backdrop', it.ParentBackdropImageTags[0], w || 480);
            return '';
        }
        if (tags.Primary) return B.image(it.Id, 'Primary', tags.Primary, w || 300);
        if (it.AlbumId && it.AlbumPrimaryImageTag) return B.image(it.AlbumId, 'Primary', it.AlbumPrimaryImageTag, w || 300);
        if (it.SeriesId && it.SeriesPrimaryImageTag) return B.image(it.SeriesId, 'Primary', it.SeriesPrimaryImageTag, w || 300);
        return '';
    };
    const yearOf = (it) => it.ProductionYear || (it.PremiereDate ? new Date(it.PremiereDate).getFullYear() : '');
    B.cardLines = (it, o) => {
        o = o || {};
        if (o.lines) return o.lines;
        if (it.Type === 'Episode') return [it.SeriesName || it.Name, it.ParentIndexNumber != null ? `S${it.ParentIndexNumber}:E${it.IndexNumber} - ${it.Name}` : it.Name];
        if (it.Type === 'Program') return [it.Name, it.StartDate ? `${B.time(new Date(it.StartDate))} - ${B.time(new Date(it.EndDate))}` : ''];
        if (it.Type === 'TvChannel') { const p = it.CurrentProgram; return [p ? p.Name : it.Name, p ? `${B.time(new Date(p.StartDate))} - ${B.time(new Date(p.EndDate))}` : it.Name]; }
        if (it.Type === 'MusicAlbum') return [it.Name, it.AlbumArtist || ''];
        if (it.Type === 'Audio') return [it.Name, (it.Artists || [])[0] || it.AlbumArtist || ''];
        if (it.Type === 'CollectionFolder' || it.Type === 'UserView' || it.Type === 'Playlist' || it.Type === 'BoxSet' || it.Type === 'MusicArtist' || it.Type === 'Person' || it.Type === 'Genre' || it.Type === 'Studio' || it.Type === 'MusicGenre' || it.Type === 'PhotoAlbum' || it.Type === 'Folder') return [it.Name];
        return [it.Name, o.year === false ? '' : String(yearOf(it) || '')];
    };
    B.card = (it, o) => {
        o = o || {};
        const shape = o.shape || B.shapeOf(it, o.wide);
        const c = B.btn(`bl-card bl-card-${o.row === false ? '' : 'overflow-'}${shape}`, null);
        const box = B.el('div', 'bl-card-box');
        const sc = B.el('div', 'bl-card-scalable');
        const pad = B.el('div', `bl-card-padder bl-padder-${shape}`);
        const img = B.el('div', 'bl-card-img');
        const art = o.art != null ? o.art : B.artOf(it, shape);
        if (art) { img.style.backgroundImage = `url("${art}")`; img.classList.add('has-art'); }
        else {
            img.style.backgroundColor = colourOf(it.Name);
            if (o.label) img.append(B.el('div', 'bl-card-default', o.label));
            else img.append(B.icon(B.kindIcon(it.CollectionType || it.Type), 'bl-card-icon'));
        }
        const ud = it.UserData || {};
        if (ud.Played && !['Series', 'Season', 'BoxSet', 'CollectionFolder', 'UserView', 'Folder', 'MusicAlbum', 'Playlist'].includes(it.Type)) { const p = B.el('div', 'bl-ind bl-played'); p.append(B.icon('check')); img.append(p); }
        else if (ud.UnplayedItemCount && (it.Type === 'Series' || it.Type === 'Season' || it.Type === 'BoxSet')) img.append(B.el('div', 'bl-ind bl-count', String(ud.UnplayedItemCount)));
        else if (it.ChildCount && it.Type === 'BoxSet') img.append(B.el('div', 'bl-ind bl-count', String(it.ChildCount)));
        let pct = ud.PlayedPercentage || 0;
        if (it.Type === 'TvChannel' && it.CurrentProgram) { const p = it.CurrentProgram, s = Date.parse(p.StartDate), e = Date.parse(p.EndDate); pct = Math.max(0, Math.min(100, ((Date.now() - s) / ((e - s) || 1)) * 100)); }
        if (o.progress != null) pct = o.progress;
        if (pct > 0 && pct < 100) { const bar = B.el('div', 'bl-card-progress'); const f = B.el('div', 'bl-card-progress-fill'); f.style.width = `${pct}%`; bar.append(f); img.append(bar); }
        sc.append(pad, img);
        box.append(sc);
        const lines = B.cardLines(it, o).filter((x, k) => k === 0 || x);
        if (o.text !== false) {
            const foot = B.el('div', 'bl-card-footer');
            lines.forEach((l, k) => foot.append(B.el('div', 'bl-card-text' + (k ? ' secondary' : ' first') + (o.center === false ? '' : ' centered'), l)));
            box.append(foot);
        }
        c.append(box);
        c.setAttribute('aria-label', lines.join(', '));
        c.blItem = it;
        c.addEventListener('click', () => { T.ctx.sound('select'); if (o.go) o.go(it, c); else B.open(it); });
        return c;
    };

    // ---- a row of cards (stock's scroller with centred focus: the row slides so the focused card sits near
    // the middle, 270 ms ease-out) ----
    B.cardRow = (title, cards, o) => {
        o = o || {};
        const s = B.el('div', 'bl-section');
        if (title) {
            const h = B.el('h2', 'bl-section-title', title);
            if (o.more) { h.classList.add('linked'); h.append(B.icon('chevron_right', 'bl-title-chevron')); }
            s.append(h);
        }
        const sc = B.el('div', 'bl-scroller');
        const list = B.el('div', 'bl-items bl-items-row');
        cards.forEach((c) => list.append(c));
        sc.append(list);
        s.append(sc);
        s.blList = list;
        list.addEventListener('focusin', (e) => {
            const c = e.target.closest('.bl-card, .bl-raised');
            if (!c) return;
            const vw = sc.clientWidth;
            const x = c.offsetLeft + c.offsetWidth / 2 - vw / 2;
            const max = Math.max(0, list.scrollWidth - vw);
            const to = c === list.firstElementChild ? 0 : Math.max(0, Math.min(max, x));
            list.style.transform = `translateX(${-to}px)`;
        });
        return s;
    };
    // stock's raised buttons (the Live TV section's Programs, Guide, …)
    B.raised = (label, go) => { const b = B.btn('bl-raised', label); b.addEventListener('click', () => { T.ctx.sound('select'); go(); }); return b; };

    // ---- the page: scrolls itself so focus stays in view (stock centres it on the TV layout) ----
    B.page = (root, cls) => {
        root.classList.add('bl-screen');
        const p = B.el('div', 'bl-page' + (cls ? ` ${cls}` : ''));
        root.append(p);
        root.addEventListener('focusin', (e) => {
            const f = e.target;
            B.hintsFor(f);
            if (!p.contains(f)) return;
            if (f.closest('.bl-header')) { p.scrollTo({ top: 0, behavior: B.reduced() ? 'auto' : 'smooth' }); return; }
            const unit = f.closest('.bl-section') || f;
            const r = unit.getBoundingClientRect(), pr = p.getBoundingClientRect();
            // in view with room around it: stay (the header stays at the top while the first rows have focus)
            if (r.top >= pr.top + pr.height * 0.12 && r.bottom <= pr.bottom - pr.height * 0.12) return;
            const target = p.scrollTop + (r.top - pr.top) - (pr.height - r.height) / 2;
            p.scrollTo({ top: Math.max(0, unit === p.querySelector('.bl-section') ? 0 : target), behavior: B.reduced() ? 'auto' : 'smooth' });  // the first section shows the header too
        });
        return p;
    };
    // focus on arrival: the first card, else the first control (stock leaves some pages with nothing focused)
    B.arrive = (root, el) => {
        const f = el || root.querySelector('.bl-page [data-icefin-focus]') || root.querySelector('[data-icefin-focus]');
        if (f) { T.ctx.focus(f); B.hintsFor(f); }
        return f;
    };


    // ---- glue for the forked list box and item menu (panel.js, itemmenu.js) ----
    const SVG = { play: 'play_arrow', record: 'fiber_manual_record', timer: 'schedule', add: 'add', check: 'check', back: 'arrow_back', home: 'home', reorder: 'more_vert', person: 'person', cast: 'cast', together: 'group' };
    B.svg = (name, cls) => B.icon(SVG[name] || name, cls);
    B.screenHints = () => B.hintsFor(T.ctx.focused && T.ctx.focused());
    B.currentColumn = null;  // the screen's refresher after an item action: {S: {alive}, reload()}
    B.refresher = (fn) => { const r = { S: { alive: true }, reload: fn }; B.currentColumn = r; return r; };

    // ---- shared actions: ≡ the focused item's menu, ▶ play it ----
    B.onAction((a, ctx) => {
        const f = ctx.focused && ctx.focused();
        if (a === 'menu' && f && f.blItem && B.itemMenu) { B.itemMenu(f.blItem, { from: f }); return true; }
        if ((a === 'play_pause' || a === 'playpause') && f && f.blItem && B.playable(f.blItem)) { T.ctx.sound('select'); B.play(f.blItem, true); return true; }
        return false;
    });
})();
