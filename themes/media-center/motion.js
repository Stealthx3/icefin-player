// Media Center: motion between screens (PLAN 9.60, the "Pass 9.60" boards; the six principles of UX animation).
//
//   An item into its details, and back (visual continuity, spatial orientation): Enter on a poster records where it
//   was; the details screen flies a copy of it into its own poster's place (360 ms, decelerating) while the page's
//   text fades in after it (240 ms from 120 ms). Back records the details poster; the screen it returns to flies it
//   home to the item's tile (320 ms) and puts the focus back on it. A flier never stays: it goes after 600 ms
//   whatever happens. No picture, no flight: the plain screen change.
//   M.flyFrom(el, id)       record a tile about to open its details (the click capture below does it for every tile)
//   M.flyIn(root)           the details screen, once its poster is laid out
//   M.flyOut(root)          the details screen, as it leaves
//   M.flyHome(tileOf)       the screen Back returned to: tileOf(id) finds the item's tile there (null: no flight)
//
//   The caption (directing focus): M.caption(el, render) cross-fades the focused item's name and facts in 120 ms, and
//   while the D-pad repeats (moves under 150 ms apart) it holds the last text until the press stops: no flicker.
//
// Low motion: no flights, cuts instead; the caption swaps without a fade.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    if (!T || !T.ui || !M) return;
    const reduced = () => T.ui.motion.reduced();
    const FLY_IN = 360, FLY_BACK = 320, SAFETY = 600, FRESH = 2500;
    let from = null, back = null;

    const artOf = (el) => {
        for (const e of [el, ...el.querySelectorAll('*')]) {
            const bg = getComputedStyle(e).backgroundImage;
            if (bg && bg.startsWith('url(')) return { el: e, bg };
        }
        return null;
    };
    M.flyFrom = (el, id) => {
        const a = artOf(el);
        from = a && id ? { id, rect: a.el.getBoundingClientRect(), bg: a.bg, at: Date.now() } : null;
    };
    // every tile Enter or a click opens (the engine clicks the focused one): where it was, before the screen changes
    document.addEventListener('click', (e) => {
        if (!T.active() || T.active().id !== 'media-center') return;
        const t = e.target.closest && e.target.closest('#icefin-theme-root [data-icefin-focus]');
        if (!t) return;
        const id = (t.mcItem && t.mcItem.Id) || (t.dataset && t.dataset.id);
        if (id) M.flyFrom(t, id);
    }, true);

    function flier(rect, bg) {
        const f = M.el('div', 'mc-flier');
        f.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;background-image:${bg}`;
        document.body.append(f);
        setTimeout(() => f.remove(), SAFETY);
        return f;
    }
    function flyTo(f, rect, ms) {
        f.style.transition = `left ${ms}ms cubic-bezier(.2,.8,.2,1), top ${ms}ms cubic-bezier(.2,.8,.2,1), width ${ms}ms cubic-bezier(.2,.8,.2,1), height ${ms}ms cubic-bezier(.2,.8,.2,1)`;
        requestAnimationFrame(() => requestAnimationFrame(() => Object.assign(f.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })));
    }
    M.flyIn = (root) => {
        const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
        const src = from;
        from = null;
        const poster = root.querySelector('.icefin-d-poster');
        if (reduced() || !src || src.id !== id || Date.now() - src.at > FRESH || !poster) return;
        const to = poster.getBoundingClientRect();
        if (!to.width) return;
        root.classList.add('mc-arriving');
        const f = flier(src.rect, src.bg);
        flyTo(f, to, FLY_IN);
        setTimeout(() => { root.classList.remove('mc-arriving'); f.remove(); }, FLY_IN + 20);
    };
    M.flyOut = (root) => {
        const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
        const p = root && root.querySelector('.icefin-d-poster');
        const a = p && artOf(p);
        back = a && id && !reduced() ? { id, rect: p.getBoundingClientRect(), bg: a.bg, at: Date.now() } : null;
    };
    M.flyHome = (tileOf) => {
        const b = back;
        back = null;
        if (!b || Date.now() - b.at > FRESH) return null;
        const tile = tileOf(b.id);
        if (!tile) return null;
        const a = artOf(tile);
        const to = (a ? a.el : tile).getBoundingClientRect();
        if (to.width && !reduced()) {
            tile.classList.add('mc-landing');
            const f = flier(b.rect, b.bg);
            flyTo(f, to, FLY_BACK);
            setTimeout(() => { tile.classList.remove('mc-landing'); f.remove(); }, FLY_BACK + 20);
        }
        return tile;
    };

    // ---- the caption: a cross-fade, held while the D-pad repeats ----
    M.caption = (el, render) => {
        let last = 0, timer = null, pending = null;
        const swap = () => {
            timer = null;
            const fill = pending;
            pending = null;
            if (reduced()) { el.textContent = ''; fill(el); return; }
            el.classList.add('mc-cap-out');
            setTimeout(() => { el.textContent = ''; fill(el); el.classList.remove('mc-cap-out'); }, 60);
        };
        return (...args) => {
            const now = Date.now(), quick = now - last < 150;
            last = now;
            pending = (e) => render(e, ...args);
            clearTimeout(timer);
            timer = setTimeout(swap, quick ? 160 : 0);
        };
    };
})();
