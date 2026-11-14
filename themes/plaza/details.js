// Plaza's details page (PLAN 9.43, from the walk's mock-ups): the engine's details screen keeps every function (play,
// resume, trailer, favourite, played, more, the version / audio / subtitle pickers, chapters, cast, seasons, episodes,
// tracks, items, filmography, moving a playlist's items); Plaza frames and lays it out like its menus: the name pill
// with the clock and tabs that jump to each section on top, the framed art (its reflection under it) beside the
// title and facts, one row of action pills and the pickers under them, and the curved bar with round Back and Home
// and the focused thing's name at the bottom. Albums and playlists put their tracks beside the art. The look is in
// styles.css, "Details (9.43)".
(function () {
    'use strict';
    const T = window.icefinTheme;
    const P = window.icefinPlaza;
    if (!T || !T.ui || !T.ui.details || !P) return;
    const el = P.el;
    const KIND = { Movie: 'movies', Trailer: 'movies', BoxSet: 'boxsets', Series: 'tvshows', Season: 'tvshows', Episode: 'tvshows', MusicAlbum: 'music', MusicArtist: 'music',
        Audio: 'music', MusicVideo: 'music', Playlist: 'playlists', Person: 'folder', Video: 'homevideos', Folder: 'folder' };
    const NAME = { Movie: 'Movies', Trailer: 'Movies', BoxSet: 'Collections', Series: 'Shows', Season: 'Shows', Episode: 'Shows', MusicAlbum: 'Music', MusicArtist: 'Music',
        Audio: 'Music', MusicVideo: 'Music', Playlist: 'Playlists', Person: 'Cast & crew', Video: 'Videos', Folder: 'Library' };

    function onReady(root, item) {
        const d = root.querySelector('.icefin-details');
        if (!d) return;
        root.setAttribute('data-pz', 'details');
        d.classList.add('pz-k-' + (KIND[item.Type] || 'folder'));
        // ---- the head: the name pill with the clock, and tabs that jump to each section ----
        const head = el('div', 'pz-mhead pz-d-head');
        const name = el('div', 'pz-mname');
        const clock = el('span', 'pz-mclock');
        name.append(el('span', 'pz-mname-text', item.Type === 'Playlist' ? item.Name || 'Playlist' : NAME[item.Type] || 'Details'), clock);
        const tabs = el('div', 'pz-tabs pz-d-tabs');
        head.append(name);
        if (P.nowPill) P.nowPill(head);
        head.append(tabs);
        const now = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        clock.textContent = now();
        const timer = setInterval(() => { if (!clock.isConnected) { clearInterval(timer); return; } clock.textContent = now(); }, 15000);
        // ---- the bar: the engine's Back and Home become the round buttons; the focused thing's name between them ----
        const bar = el('div', 'pz-mbar pz-d-bar');
        bar.innerHTML = '<svg class="pz-mbar-svg" viewBox="0 0 1920 210" preserveAspectRatio="none" aria-hidden="true"><path class="pz-bar-fill" d="M0 24 C480 6 1440 6 1920 24 V210 H0 Z"/><path class="pz-bar-shine" d="M0 32 C480 14 1440 14 1920 32"/><path class="pz-bar-line" d="M0 24 C480 6 1440 6 1920 24"/></svg>';
        const mid = el('div', 'pz-mmid');
        const focusLine = el('div', 'pz-mfocus');
        const hints = el('div', 'pz-mhints');
        const keys = el('span', 'pz-mhint-keys');
        keys.append(...P.hintNodes('Ⓐ Select · ◀▶ Choose · ≡ More · Ⓑ Back'));
        hints.append(keys);
        mid.append(focusLine, hints);
        bar.append(mid);
        for (const b of d.querySelectorAll('.icefin-d-navbtn')) {
            b.classList.add('pz-mround', b.getAttribute('data-action') === 'home' ? 'pz-mround-home' : 'pz-mround-back');
            b.textContent = b.getAttribute('data-action') === 'home' ? 'Home' : 'Back';
            bar.append(b);
        }
        d.append(head, bar);
        // ---- the hero: the framed art beside the title and facts; the actions and pickers in rows under both ----
        const scroll0 = () => d.querySelector('.icefin-d-scroll');
        const main = d.querySelector('.icefin-d-main');
        const info = d.querySelector('.icefin-d-info');
        const art = d.querySelector('.icefin-d-art');
        const wide = !!(art && /url\(/.test(art.style.backgroundImage || '')) && !['MusicAlbum', 'Audio', 'Playlist', 'Person', 'MusicArtist'].includes(item.Type);
        d.setAttribute('data-pz-hero', wide ? 'wide' : 'poster');
        if (main && info) {
            const frame = el('div', 'pz-d-frame');
            if (wide) frame.style.backgroundImage = art.style.backgroundImage;
            else {
                const poster = main.querySelector('.icefin-d-poster');
                if (poster) frame.append(poster);
            }
            frame.append(el('div', 'pz-d-frame-ring'));
            const reflect = el('div', 'pz-reflect pz-d-reflect');
            const heroArt = el('div', 'pz-d-art');
            heroArt.append(frame, reflect);
            if (item.Type === 'MusicAlbum' || item.Type === 'Audio') heroArt.append(el('div', 'pz-d-record'));
            main.prepend(heroArt);
            // 15 · arriving from a grid cell: its picture flies into this frame while the page fades in under it
            const fl = P.flight.from;
            const picOf = () => { const e = frame.querySelector('.icefin-d-poster') || frame; return ((getComputedStyle(e).backgroundImage || '').match(/url\("?(.*?)"?\)/) || [])[1] || ''; };
            if (fl && fl.id === item.Id && Date.now() - fl.at < 2500) {
                P.flight.from = null;
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    const to = frame.getBoundingClientRect();
                    if (!to.width) return;
                    frame.style.visibility = 'hidden';
                    if (d.animate && document.documentElement.getAttribute('data-icefin-motion') !== 'low') d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 120, easing: 'ease', fill: 'backwards' });
                    P.fly({ from: fl.rect, to, image: fl.image || picOf(), ms: 360, radius: 24 }).then(() => { frame.style.visibility = ''; });
                }));
            }
            // 21 · leaving by Back: the grid this came from shrinks the picture home into its cell (menus.js)
            const leave = () => {
                window.removeEventListener('hashchange', leave);
                const r = frame.pzRect;
                if (r && r.width) P.flight.back = { id: item.Id, rect: r, image: picOf(), at: Date.now() };
            };
            const keep = () => { if (frame.isConnected) frame.pzRect = frame.getBoundingClientRect(); };
            setTimeout(keep, 500);
            if (scroll0()) scroll0().addEventListener('scroll', keep, { passive: true });
            window.addEventListener('hashchange', leave);
            const kicker = info.querySelector('.icefin-d-kicker');
            const year = (d) => (d ? new Date(d).getFullYear() : '');
            const kick = item.Type === 'Person'
                ? (item.PremiereDate ? `BORN ${year(item.PremiereDate)}${item.EndDate ? ' · DIED ' + year(item.EndDate) : ''}` : 'CAST & CREW')
                : [P.typeName(item), item.ProductionYear].filter(Boolean).join(' · ').toUpperCase();
            const k = el('div', 'pz-kicker pz-d-kicker', kick);
            if (kicker && kicker.textContent.trim()) kicker.classList.add('pz-d-sub'); else if (kicker) kicker.remove();
            info.prepend(k);
            const actions = info.querySelector('.icefin-d-actions');
            const options = info.querySelector('.icefin-d-options');
            if (actions) main.append(actions);
            if (options) main.append(options);
        }
        // ---- the walk's mock-ups (9.44): genres as chips; the actions' labels and marks ----
        const genres = d.querySelector('.icefin-d-genres');
        if (genres && item.Genres && item.Genres.length) {
            genres.textContent = '';
            item.Genres.slice(0, 4).forEach((g) => genres.append(el('span', 'pz-chip', g)));
        }
        const btn = (a) => d.querySelector(`.icefin-d-actions .icefin-d-btn[data-action="${a}"]`);
        const relabel = (b, text) => { if (b) { b.textContent = text; b.setAttribute('aria-label', text); } };
        if (btn('more')) relabel(btn('more'), 'More');
        if (item.Type === 'Series') {
            const b = btn('play');
            if (b && /^Play S\d+ E\d+/.test(b.textContent)) relabel(b, b.textContent.replace(/^Play /, 'Next up: '));
        } else if (btn('resume') && P.left(item)) relabel(btn('resume'), `Resume · ${P.left(item)}`);
        // ---- More options opens Plaza's own item menu (itemmenu.js), not jellyfin-web's page ----
        const more = d.querySelector('.icefin-d-btn[data-action="more"]');
        if (more && P.itemMenu) more.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); P.itemMenu(item); }, true);
        root.plazaItem = item;
                // ---- the focus line, and the section tabs once the lists are in ----
        root.addEventListener('icefin-focus', (e) => {
            const t = e.target;
            const label = t.getAttribute('aria-label') || (t.querySelector('.icefin-d-name') || t).textContent;
            P.caption(focusLine, (label || '').replace(/\s+/g, ' ').trim().slice(0, 90));
        }, true);
        const scroll = d.querySelector('.icefin-d-scroll');
        const drawTabs = () => {
            tabs.textContent = '';
            const tab = (label, target) => {
                const b = P.focusable(el('div', 'pz-tab', label));
                b.addEventListener('click', () => {
                    if (!scroll) return;
                    const top = target ? target.offsetTop - scroll.offsetTop - 20 : 0;
                    scroll.scrollTo({ top, behavior: T.ui.motion.reduced() ? 'auto' : 'smooth' });
                    const f = target ? target.querySelector('[data-icefin-focus]') : d.querySelector('.icefin-d-actions [data-icefin-focus]');
                    if (f) T.ctx.focus(f);
                    for (const x of tabs.children) x.classList.toggle('pz-tab-on', x === b);
                });
                tabs.append(b);
                return b;
            };
            // the first tab is the top of the page: the tracks beside the art on an album or playlist, a person's biography
            const listed = item.Type === 'MusicAlbum' || item.Type === 'Playlist';
            tab(listed ? (item.Type === 'Playlist' ? 'Items' : 'Tracks') : item.Type === 'Person' ? 'Biography' : 'Overview', null).classList.add('pz-tab-on');
            for (const s of d.querySelectorAll('.icefin-d-section')) {
                if (listed && s.dataset.section === 'tracks') continue;
                const h = s.querySelector('h2');
                const label = h && (h.dataset.pzLabel || h.textContent.trim());
                if (label) tab(label, s);
            }
        };
        // Filmography with its count; an album's "More by" the artist (the walk's mock-ups)
        const finish = async () => {
            const film = d.querySelector('.icefin-d-section[data-section="filmography"]');
            if (film) { const h = film.querySelector('h2'); const n = film.querySelectorAll('.icefin-d-card').length; if (h && n) { h.dataset.pzLabel = 'Filmography'; h.textContent = `Filmography · ${n}`; } }
            const artist = item.Type === 'MusicAlbum' && (item.AlbumArtists || [])[0];
            if (artist && !d.querySelector('[data-section="moreby"]')) {
                const r = await P.safe(P.client().getItems(P.uid(), { AlbumArtistIds: artist.Id, IncludeItemTypes: 'MusicAlbum', Recursive: true, SortBy: 'ProductionYear,SortName', SortOrder: 'Descending', Limit: 24, Fields: 'PrimaryImageAspectRatio' }));
                const albums = P.items(r).filter((a) => a.Id !== item.Id);
                const sections = d.querySelector('.icefin-d-sections');
                if (albums.length && sections && root.isConnected) {
                    const sec = el('section', 'icefin-d-section');
                    sec.dataset.section = 'moreby';
                    const row = el('div', 'icefin-d-row');
                    for (const a of albums) {
                        const c = P.focusable(el('div', 'icefin-d-card square'));
                        c.dataset.id = a.Id;
                        const img = el('div', 'icefin-d-img');
                        P.bg(img, P.posterArt(a, 400));
                        c.append(img, el('div', 'icefin-d-name', a.Name || ''));
                        if (a.ProductionYear) c.append(el('div', 'icefin-d-sub', String(a.ProductionYear)));
                        c.addEventListener('click', () => P.details(a));
                        row.append(c);
                    }
                    sec.append(el('h2', '', `More by ${artist.Name}`), row);
                    const tracks = sections.querySelector('[data-section="tracks"]');
                    if (tracks && tracks.nextSibling) sections.insertBefore(sec, tracks.nextSibling); else sections.append(sec);
                }
            }
            drawTabs();
        };
        drawTabs();
        const obs = new MutationObserver(() => { if (root.hasAttribute('data-icefin-details-complete')) { obs.disconnect(); finish(); } });
        obs.observe(root, { attributes: true, attributeFilter: ['data-icefin-details-complete'] });
        // the tab of the section in view follows the scrolling
        if (scroll) scroll.addEventListener('scroll', () => {
            const secs = [...d.querySelectorAll('.icefin-d-section')];
            let i = 0;
            secs.forEach((s, k) => { if (s.offsetTop - scroll.offsetTop - scroll.scrollTop < scroll.clientHeight / 3) i = k + 1; });
            [...tabs.children].forEach((x, k) => x.classList.toggle('pz-tab-on', k === i));
        }, { passive: true });
    }

    // ≡ (Menu) on the page opens the item menu, except on a playlist's tracks, where it moves one (the engine's)
    const screen = T.ui.details.screen({ layout: 'banner', onReady });
    const onAction = screen.onAction;
    screen.onAction = function (action, ctx) {
        const self = this;
        if (action === 'menu' && P.itemMenu && !document.querySelector('.icefin-d-moving')) {
            const f = ctx.focused();
            const root = document.getElementById('icefin-theme-root');
            const page = root && root.plazaItem;
            if (page) {
                // a playlist's track: its menu offers to move it (the engine's lift) or remove it from the playlist
                if (f && f.classList.contains('icefin-d-track') && f.closest('[data-icefin-reorder]') && f.icefinTrack) {
                    P.itemMenu(f.icefinTrack, { playlist: page, playlistItemId: f.icefinTrack.PlaylistItemId, move: () => onAction.call(self, 'menu', ctx), removed: () => f.remove() });
                    return true;
                }
                // any other track or card: that item's own menu (inside a collection, with Remove from this collection)
                if (f && (f.classList.contains('icefin-d-track') || f.classList.contains('icefin-d-card')) && f.dataset.id) {
                    P.itemMenu({ Id: f.dataset.id }, page.Type === 'BoxSet' ? { collection: page, removed: () => f.remove() } : {});
                    return true;
                }
                P.itemMenu(page);
                return true;
            }
        }
        return onAction ? onAction.call(this, action, ctx) : false;
    };
    T.registerScreen('#/details', screen);
})();
