// Media Center: the details screen (Icefin reference theme, PLAN 8.6, 9.18, 9.46). The engine's details screen (every
// feature of the stock page: play, resume, versions, tracks, trailer, seasons and episodes, chapters, cast, more like
// this) laid out as the design canvas's "movie details": the actions in a column at the left, the poster, then the
// facts; the page chrome (round Back and the server-icon Home, the page title, the clock) from kit.js. The look is in
// styles.css, "Details".
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    if (!T || !T.ui || !T.ui.details || !M) return;
    const base = T.ui.details.screen({ layout: 'poster' });
    const KIND = { Movie: 'movie details', Episode: 'episode details', Series: 'series', Season: 'season', MusicAlbum: 'album details',
        MusicArtist: 'artist', Person: 'person', BoxSet: 'collection', Playlist: 'playlist', Audio: 'song', MusicVideo: 'music video',
        Video: 'video details', Trailer: 'trailer', TvChannel: 'channel', Folder: 'folder' };

    function decorate(root) {
        const d = root.querySelector('.icefin-details');
        if (!d || !d.dataset.type) return false;  // the item is still loading
        if (d.dataset.mcDecorated) return true;
        d.dataset.mcDecorated = '1';
        const nav = d.querySelector('.icefin-d-nav');
        if (nav) {
            nav.classList.add('mc-nav');
            for (const b of nav.querySelectorAll('.icefin-d-navbtn')) {
                const home = b.dataset.action === 'home';
                b.classList.add('mc-round', home ? 'mc-round-home' : 'mc-round-back');
                b.setAttribute('aria-label', home ? 'Home' : 'Back');
                b.textContent = '';
                if (home) M.brandMark(b); else b.append(M.svg(M.ICON.back));
            }
        }
        d.append(M.el('div', 'mc-title', KIND[d.dataset.type] || 'details'));
        const clock = M.el('div', 'mc-clock');
        d.append(clock);
        root.mcClock = M.clock(clock);
        return true;
    }

    T.registerScreen('#/details', Object.assign({}, base, {
        mount(root, ctx) {
            const r = base.mount.call(this, root, ctx);
            let n = 0;
            const t = setInterval(() => { if (decorate(root) || ++n > 60) clearInterval(t); }, 50);
            return r;
        },
        unmount() {
            const r = document.getElementById('icefin-theme-root');
            if (r && r.mcClock) { clearInterval(r.mcClock); r.mcClock = null; }
            if (base.unmount) return base.unmount.call(this);
        }
    }));
})();
