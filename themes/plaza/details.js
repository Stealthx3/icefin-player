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
        name.append(el('span', 'pz-mname-text', NAME[item.Type] || 'Details'), clock);
        const tabs = el('div', 'pz-tabs pz-d-tabs');
        head.append(name, tabs);
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
            const kicker = info.querySelector('.icefin-d-kicker');
            const k = el('div', 'pz-kicker pz-d-kicker', [P.typeName(item), item.ProductionYear].filter(Boolean).join(' · ').toUpperCase());
            if (kicker && kicker.textContent.trim()) kicker.classList.add('pz-d-sub'); else if (kicker) kicker.remove();
            info.prepend(k);
            const actions = info.querySelector('.icefin-d-actions');
            const options = info.querySelector('.icefin-d-options');
            if (actions) main.append(actions);
            if (options) main.append(options);
        }
        // ---- More options opens Plaza's own item menu (itemmenu.js), not jellyfin-web's page ----
        const more = d.querySelector('.icefin-d-btn[data-action="more"]');
        if (more && P.itemMenu) more.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); P.itemMenu(item); }, true);
        root.plazaItem = item;
                // ---- the focus line, and the section tabs once the lists are in ----
        root.addEventListener('icefin-focus', (e) => {
            const t = e.target;
            const label = t.getAttribute('aria-label') || (t.querySelector('.icefin-d-name') || t).textContent;
            focusLine.textContent = (label || '').replace(/\s+/g, ' ').trim().slice(0, 90);
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
            tab('Overview', null).classList.add('pz-tab-on');
            for (const s of d.querySelectorAll('.icefin-d-section')) {
                const h = s.querySelector('h2');
                if (h && h.textContent.trim()) tab(h.textContent.trim(), s);
            }
        };
        drawTabs();
        const obs = new MutationObserver(() => { if (root.hasAttribute('data-icefin-details-complete')) { obs.disconnect(); drawTabs(); } });
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
        if (action === 'menu' && P.itemMenu) {
            const f = ctx.focused();
            const root = document.getElementById('icefin-theme-root');
            if (!(f && f.classList.contains('icefin-d-track') && f.closest('[data-icefin-reorder]')) && !document.querySelector('.icefin-d-moving') && root && root.plazaItem) { P.itemMenu(root.plazaItem); return true; }
        }
        return onAction ? onAction.call(this, action, ctx) : false;
    };
    T.registerScreen('#/details', screen);
})();
