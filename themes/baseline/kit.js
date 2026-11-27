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
    B.sawAction = (a) => {
        if (PAD.has(a)) document.documentElement.setAttribute('data-bl-input', 'pad');
        if (a !== 'back' && B.backFocus) { if (/^(up|down|left|right)$/.test(a)) B.backFocus.moved(); B.backFocus.stop(); }  // the user moved on: Back's focus doesn't take it back (a pad's move counts for the memo too, QA Baseline 1)
    };
    if (!window.icefinBaselineInput) {
        window.icefinBaselineInput = true;
        window.addEventListener('pointermove', (e) => { if (e.movementX || e.movementY) document.documentElement.setAttribute('data-bl-input', 'pointer'); }, true);
        window.addEventListener('keydown', (e) => { if (/^(Arrow|Enter|Escape|Backspace)/.test(e.key)) document.documentElement.setAttribute('data-bl-input', 'pad'); }, true);
    }
    if (ui.keyboard) ui.keyboard.enable();
    // Tab and Shift+Tab step through the screen's controls in page order, as stock's page does (QA Baseline 1: Tab moved
    // nothing, every control being tabIndex -1). Moves the engine's focus rather than giving the controls a tab stop
    if (!window.icefinBaselineTab) {
        window.icefinBaselineTab = true;
        window.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
            const r = document.getElementById('icefin-theme-root');
            if (!r || r.hidden || B.layer() !== r) return;  // a panel (the overlay) keeps its own keys
            const all = [...r.querySelectorAll('[data-icefin-focus]')].filter((x) => x.getClientRects().length);
            if (!all.length) return;
            const i = all.indexOf(T.ctx.focused());
            const n = all[(i < 0 ? 0 : i + (e.shiftKey ? all.length - 1 : 1)) % all.length];
            e.preventDefault();
            T.ctx.focus(n);
            T.ctx.sound('focus');
        }, true);
    }
    // hover moves focus (checklist 2.5, covered by the Focus board in the Gate 1 map; the engine's rule: only a pointer
    // that moves). QA pre-pass: without it the mouse left focus wherever the screen's arrival put it, and Back after a
    // click had nothing of the mouse's to come back to
    if (ui.pointerFirst) ui.pointerFirst(true);

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
            logo.setAttribute('aria-label', 'IceFin Player');
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
        return B.playWith({ ids: [it.Id], serverId: B.sid(), startPositionTicks: pos });
    };
    // every play goes through here: jellyfin-web's playback manager rejects (with nothing) when there is nothing it can
    // play (a folder of books) or the play is called off; that is no error of the page's (QA pre-pass: rejection: undefined)
    B.playWith = (o) => Promise.resolve(T.ctx.play(o)).catch((e) => { console.warn('baseline: play', o, e); return false; });
    // where OK on an item goes, as stock's cards do
    B.open = (it) => {
        if (it.Type === 'CollectionFolder' || it.Type === 'UserView') { B.go(B.viewRoute(it)); return; }
        if (it.Type === 'TvChannel') { B.playWith({ ids: [it.Id], serverId: B.sid() }); return; }
        if (it.Type === 'Photo') { B.playWith({ ids: [it.Id], serverId: B.sid() }); return; }
        if (it.Type === 'Genre' || it.Type === 'MusicGenre' || it.Type === 'Studio') { B.go(`#/list?${it.Type === 'Studio' ? 'studioId' : (it.Type === 'MusicGenre' ? 'musicGenreId' : 'genreId')}=${it.Id}&serverId=${B.sid()}`); return; }
        // a plain folder (books) opens as stock's list, not a details page with a Play that errors (QA Baseline 3, F5)
        if (it.Type === 'Folder') { B.go(`#/list?parentId=${it.Id}&serverId=${B.sid()}`); return; }
        B.details(it);
    };
    const ROUTE = { movies: 'movies', tvshows: 'tv', music: 'music', livetv: 'livetv' };  // stock's tabbed libraries; the rest are #/list
    B.viewRoute = (v) => {
        const r = ROUTE[v.CollectionType];
        if (!r) return `#/list?parentId=${v.Id}&serverId=${B.sid()}`;
        if (r === 'list') return `#/list?parentId=${v.Id}&serverId=${B.sid()}`;
        return `#/${r}?topParentId=${v.Id}&collectionType=${v.CollectionType}`;
    };
    B.kindIcon = (t) => ({ movies: 'video_library', tvshows: 'tv', music: 'music_note', livetv: 'live_tv', boxsets: 'video_library', playlists: 'library_add', homevideos: 'photo_library', photos: 'photo_library', books: 'library_books', musicvideos: 'video_library', mixed: 'folder', folders: 'folder',
        Movie: 'movie', Series: 'tv', Episode: 'tv', Season: 'tv', MusicAlbum: 'album', MusicArtist: 'person', Audio: 'audiotrack', Playlist: 'queue_music', BoxSet: 'video_library', Person: 'person', Book: 'book', Photo: 'photo', PhotoAlbum: 'photo_album', Video: 'videocam', MusicVideo: 'music_video', TvChannel: 'live_tv', Program: 'live_tv', Folder: 'folder', CollectionFolder: 'folder', Genre: 'local_offer', MusicGenre: 'local_offer', Studio: 'business' }[t] || 'folder');

    // ---- cards (stock's card: a box that grows on focus, the picture at its shape, the text under it) ----
    // shape: overflowBackdrop | overflowPortrait | overflowSquare (rows); backdrop | portrait | square (grids)
    B.shapeOf = (it, wide) => {
        if (wide || it.Type === 'Episode' || it.Type === 'Video' || it.Type === 'TvChannel' || it.Type === 'Program' || it.Type === 'CollectionFolder' || it.Type === 'UserView' || it.Type === 'Photo') return 'backdrop';
        if (it.Type === 'MusicAlbum' || it.Type === 'Audio' || it.Type === 'MusicArtist' || it.Type === 'Playlist' || it.Type === 'PhotoAlbum' || it.Type === 'MusicGenre' || it.Type === 'Folder') return 'square';
        return 'portrait';
    };
    const COLORS = ['#00455c', '#44bae1', '#00a4db', '#1c4c5c', '#007ea8'];  // stock's default card colours
    // stock's pick (its default colour index): the middle character's code, its digits summed, the last digit, mod 5
    const colourOf = (s) => {
        s = String(s || '');
        if (!s) return COLORS[0];
        const code = String(s.charCodeAt(Math.floor(s.length / 2)));
        let sum = 0;
        for (const d of code) sum += Number(d);
        return COLORS[Number(String(sum).slice(-1)) % COLORS.length];
    };
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
    let arriving = false;  // B.arrive is focusing: the page scrolls to it whatever the input
    B.page = (root, cls) => {
        root.classList.add('bl-screen');
        const p = B.el('div', 'bl-page' + (cls ? ` ${cls}` : ''));
        // jellyfin-web's TV layout scrolls the nearest scrollable parent of whatever takes focus, unless that parent
        // says its scrolling is its own: Baseline's page does its own (below)
        p.setAttribute('data-scroll-mode-y', 'custom');
        p.setAttribute('data-scroll-mode-x', 'custom');
        root.append(p);
        root.addEventListener('focusin', (e) => {
            const f = e.target;
            B.hintsFor(f);
            if (!p.contains(f)) return;
            // focus that followed the mouse: the page stays where the mouse (and its wheel) put it, as stock's does
            if (!arriving && document.documentElement.getAttribute('data-bl-input') === 'pointer') return;
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
    // focus on arrival: the first card, else the page's first control, else the tab it is on (an empty tab: stock keeps
    // focus on the tab, not the header's Back), else the first control (stock leaves some pages with nothing focused).
    // Back to a page: the control it was left from (B.backFocus), as stock's TV layout does.
    B.arrive = (root, el) => {
        const back = B.backFocus && B.backFocus.target();
        const f = back || el || [...root.querySelectorAll('.bl-page [data-icefin-focus]')].find((x) => !x.closest('.bl-header'))
            || root.querySelector('.bl-tab.active') || root.querySelector('.bl-page [data-icefin-focus]') || root.querySelector('[data-icefin-focus]');
        if (!f) return f;
        // the browser's own scroll on focus nudges the page past the header; a page arrives at its top, as stock's does,
        // unless the control is out of sight there
        const p = f.closest('.bl-page'), top = p ? p.scrollTop : 0;
        arriving = true;
        try { T.ctx.focus(f); } finally { arriving = false; }
        if (p && p.scrollTop !== top) {
            const was = p.scrollTop;
            p.scrollTop = top;
            const r = f.getBoundingClientRect(), pr = p.getBoundingClientRect();
            if (r.top < pr.top || r.bottom > pr.bottom) p.scrollTop = was;
        }
        B.hintsFor(f);
        return f;
    };

    // ---- Back lands on the control a page was left from (QA pre-pass) ----
    // Stock's TV layout keeps each page it showed and, on Back, focuses the control that had focus there (its view
    // manager restores the view's active element). Baseline draws a screen anew on every visit, so each history entry
    // (the Navigation API's key for it, with the hash) remembers the last control focused or clicked on it; Back to that
    // entry focuses that control as soon as the screen has drawn it (within 4 s, and not once the user has moved). A new
    // visit to the same route is a new entry and arrives as usual. The header's Back and Home are never remembered.
    B.backFocus = (() => {
        const memo = new Map();
        const here = () => (window.navigation && navigation.currentEntry ? navigation.currentEntry.key + ' ' : '') + location.hash;
        const rootEl = () => document.getElementById('icefin-theme-root');
        const labelOf = (e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        const secOf = (e) => { const s = e.closest('.bl-section'); const t = s && s.querySelector('.bl-section-title'); return t ? t.textContent.trim() : ''; };
        const idOf = (e) => (e.blItem && (e.blItem.Id || '')) || '';
        const NAV = '.bl-header .bl-hbtn[aria-label="Back"], .bl-header .bl-hbtn[aria-label="Home"]';
        const shown = (e) => e.isConnected && e.getClientRects().length > 0;
        const same = (e, d) => e.classList[0] === d.cls && (d.id ? idOf(e) === d.id : labelOf(e) === d.label);
        let pending = null, obs = null, timer = null, raf = 0;
        // (QA Baseline 1) as the engine's stockMemo: a focus right after a route change is the screen's arrival, not the
        // user's, and must not overwrite the opener's memo; a click, or a move by the user since the change, is
        let navAt = 0, movedAt = 0;
        const nav = () => { navAt = Date.now(); };
        const moved = () => { movedAt = Date.now(); };
        function record(t, user) {
            if (!user && Date.now() - navAt < 2500 && movedAt <= navAt) return;
            const r = rootEl();
            const e = t && t.closest && t.closest('[data-icefin-focus]');
            if (!r || r.hidden || !e || !r.contains(e) || e.matches(NAV)) return;
            const d = { cls: e.classList[0] || '', id: idOf(e), label: labelOf(e), sec: secOf(e) };
            const twins = [...r.querySelectorAll('[data-icefin-focus]')].filter((x) => same(x, d) && secOf(x) === d.sec);
            d.n = Math.max(0, twins.indexOf(e));
            d.k = [...r.querySelectorAll('[data-icefin-focus]')].filter((x) => x.classList[0] === d.cls).indexOf(e);
            const h = here();
            memo.delete(h);
            memo.set(h, d);
            if (memo.size > 200) memo.delete(memo.keys().next().value);
        }
        // the remembered control on the screen as drawn now: same kind, same item (or label), same row, nth of its twins;
        // a button that renamed itself meanwhile (Play is Resume after some playback) by its place among its kind
        function find(d) {
            const r = rootEl();
            if (!r || r.hidden) return null;
            const all = [...r.querySelectorAll('[data-icefin-focus]')].filter((e) => same(e, d) && shown(e));
            const inRow = all.filter((e) => secOf(e) === d.sec);
            const found = inRow[d.n] || inRow[0] || all[0];
            if (found || d.id || d.k < 0) return found || null;
            const kin = [...r.querySelectorAll('[data-icefin-focus]')].filter((e) => e.classList[0] === d.cls && shown(e));
            return kin[d.k] || null;
        }
        function stop() {
            pending = null;
            if (obs) obs.disconnect();
            obs = null;
            clearTimeout(timer);
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
        }
        function attempt() {
            raf = 0;
            if (!pending || here() !== pending.hash) { stop(); return; }
            const e = find(pending.d);
            if (e && T.ctx.focused() !== e) { const r = rootEl(); if (r) B.arrive(r, e); }
        }
        const soon = () => { if (!raf) raf = requestAnimationFrame(attempt); };
        function routed() {
            nav();
            const h = here();
            if (pending && pending.hash === h) return;  // (QA Baseline 1) popstate then hashchange for one Back: keep the target already read
            stop();
            const d = memo.get(h);
            if (!d) return;
            pending = { hash: h, d };
            const r = rootEl();
            if (r) { obs = new MutationObserver(soon); obs.observe(r, { childList: true, subtree: true }); }
            timer = setTimeout(stop, 4000);
            setTimeout(soon, 0);
        }
        // the user's own move ends it (not Back, Escape or Backspace, which are how the user got here)
        const onKey = (e) => { if (/^(Arrow|Tab)/.test(e.key)) moved(); if (!/^(Escape|Backspace|Shift|Control|Alt|Meta)$/.test(e.key)) stop(); };
        const onFocus = (e) => record(e.target, false);
        const onClick = (e) => record(e.target, true);
        const onMove = (e) => { if (e.movementX || e.movementY) { moved(); stop(); } };  // a moving pointer takes focus itself (pointer-first)
        const onDown = () => { moved(); stop(); };
        if (window.icefinBaselineBackFocusOff) window.icefinBaselineBackFocusOff();  // the theme loaded again: one set of listeners
        const on = [[window, 'popstate', routed], [window, 'hashchange', routed], [document, 'icefin-focus', onFocus], [document, 'click', onClick],
            [window, 'keydown', onKey], [window, 'mousedown', onDown], [window, 'mousemove', onMove], [window, 'wheel', onDown]];
        // capture on window: before the engine's own route handler, so the entry is known as the screen mounts
        for (const [t, n, f] of on) t.addEventListener(n, f, true);
        if (window.navigation) navigation.addEventListener('currententrychange', nav);
        window.icefinBaselineBackFocusOff = () => { for (const [t, n, f] of on) t.removeEventListener(n, f, true); if (window.navigation) navigation.removeEventListener('currententrychange', nav); stop(); };
        return {
            stop, moved,
            // the control Back should land on, when this screen is being returned to and it is drawn already
            target() { return pending && here() === pending.hash ? find(pending.d) : null; }
        };
    })();


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
