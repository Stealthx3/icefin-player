// Media Center: the slide show and the book reader (PLAN 9.46), from the design canvas's "slide show" board. Both stay
// jellyfin-web's own viewers with every function (the remote, swiping, the reader's table of contents and text size);
// Media Center lays them out:
//   - the slide show: the picture full screen with a slow pan and zoom (none with less motion), and while the controls
//     are up the picture's name, its date, its album and "12 of 204" at the bottom left over a scrim, round glass
//     buttons at the bottom right (previous, pause, next) and round Back at the top left. The controls fade with
//     jellyfin-web's own idle timer;
//   - the book reader: the book's title where a page title goes, round Back at the top left, the reader's buttons as
//     round glass buttons along the bottom right (dark glass: the page under them is often white).
// The picture's name and date come from the server (the item the visible slide shows).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    if (!T || !M) return;
    const { el } = M;
    const mine = () => window.icefinMediaCenter === M && !!T.active() && T.active().id === 'media-center';

    // ---- the slide show ----
    const items = new Map();
    const itemOf = (img) => { const m = /\/Items\/([0-9a-f]{32})\//i.exec((img && (img.currentSrc || img.src)) || ''); return m ? m[1] : null; };
    async function fetchItem(id) {
        if (items.has(id)) return items.get(id);
        const p = M.client().getItem(M.client().getCurrentUserId(), id).catch(() => null);
        items.set(id, p);
        return p;
    }
    const dateOf = (it) => { const d = it && (it.PremiereDate || it.DateCreated); return d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
    function slideshow(dlg) {
        if (dlg.hasAttribute('data-mc-ss')) return;
        dlg.setAttribute('data-mc-ss', '');
        const info = el('div', 'mc-ss-info');
        const name = el('div', 'mc-ss-name');
        const line = el('div', 'mc-ss-line');
        info.append(name, line);
        dlg.append(el('div', 'mc-ss-scrim'), info);
        // previous and next join pause in one row at the bottom right; download and full screen go (the window is the
        // viewer); Back is the exit button, at the top left.
        const bar = dlg.querySelector('.slideshowBottomBar');
        const prev = dlg.querySelector('.btnSlideshowPrevious');
        const next = dlg.querySelector('.btnSlideshowNext');
        const pause = dlg.querySelector('.btnSlideshowPause');
        if (bar && pause) { if (prev) pause.before(prev); if (next) pause.after(next); }
        let shown = null;
        const update = async () => {
            if (!dlg.isConnected) { obs.disconnect(); return; }
            const slide = dlg.querySelector('.swiper-slide-active');
            if (!slide) return;
            const id = itemOf(slide.querySelector('img'));
            // the position in the whole show: the swiper renders a window of slides, and their labels count only those
            const sw = (dlg.querySelector('.slideshowSwiperContainer') || {}).swiper;
            const total = sw ? ((sw.virtual && sw.virtual.slides && sw.virtual.slides.length) || sw.slides.length) : 0;
            const count = sw && total ? `${sw.activeIndex + 1} of ${total}` : '';
            const key = id + '|' + count;
            if (key === shown) return;
            shown = key;
            line.textContent = count;
            name.textContent = '';
            const it = id ? await fetchItem(id) : null;
            if (shown !== key) return;
            name.textContent = it ? it.Name || '' : '';
            line.textContent = [dateOf(it), it && (it.Album || ''), count].filter(Boolean).join(' · ');
        };
        const obs = new MutationObserver(() => { clearTimeout(obs.t); obs.t = setTimeout(update, 80); });
        obs.observe(dlg, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'src', 'aria-label'] });
        update();
    }

    // ---- the book reader ----
    function reader(dlg) {
        const osd = dlg.querySelector('.bookOsd');
        if (!osd || osd.hasAttribute('data-mc-book')) return;
        osd.setAttribute('data-mc-book', '');
        dlg.setAttribute('data-mc-reader', '');
    }

    const VIEWERS = '.slideshowDialog, #bookPlayer, #pdfPlayer, #comicsPlayer';
    const scan = () => {
        if (!mine()) { watch.disconnect(); return; }
        for (const d of document.querySelectorAll(VIEWERS)) {
            if (d.classList.contains('slideshowDialog')) slideshow(d); else reader(d);
        }
    };
    const watch = new MutationObserver(() => { clearTimeout(watch.t); watch.t = setTimeout(scan, 60); });
    watch.observe(document.body, { childList: true, subtree: true });
})();
