// Media Center: where you are (PLAN 9.60, the "Pass 9.60" board "Where you are"; checklist 2.3, 2.4, 2.5).
//
//   Controller hints: drawn keys in Media Center's glass at the bottom right, saying what each key does here (open,
//   more, play, back; in a panel select and close, and change on a stepper). Only for a pad or remote: the mouse or a
//   typed key hides them; Couch Mode (html[data-icefin-couch]) always shows them. html[data-mc-input] says which input
//   was used last ('pad' | 'keys' | 'pointer'). Never over the player or the server dashboard.
//   Play/Pause on a focused item plays it (checklist 2.4).
//   Hover moves the focus (ui.pointerFirst, checklist 2.5).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    if (!T || !T.ui || !M) return;
    const el = M.el;
    if (T.ui.pointerFirst) T.ui.pointerFirst(true);

    const html = document.documentElement;
    const mode = (m) => { if (html.getAttribute('data-mc-input') !== m) { html.setAttribute('data-mc-input', m); draw(); } };
    let lastKey = 0, lastMouse = 0;
    if (!window.icefinMediaCenterInput) {
        window.icefinMediaCenterInput = true;
        // arrows go through the same actions as a pad: a keydown just before an action means the keyboard
        window.addEventListener('keydown', () => { lastKey = Date.now(); const K = window.icefinMediaCenter; if (K && K.inputMode) K.inputMode('keys'); }, true);
        window.addEventListener('mousemove', (e) => { const K = window.icefinMediaCenter; if ((e.movementX || e.movementY) && K && K.inputMode) { lastMouse = Date.now(); K.inputMode('pointer'); } }, true);
        // on jellyfin-web's framed pages the pad's moves are the engine's: a focus move with no key or mouse just
        // before it is a pad or remote
        document.addEventListener('focusin', () => { const K = window.icefinMediaCenter; if (K && K.sawFocus) K.sawFocus(); }, true);
    }
    M.inputMode = mode;
    M.sawFocus = () => { if (html.hasAttribute('data-icefin-stock') && Date.now() - lastKey > 150 && Date.now() - lastMouse > 400) mode('pad'); else draw(); };

    const itemOf = (f) => (f && (f.mcItem || (f.dataset && (f.dataset.id || f.dataset.itemId) ? { Id: f.dataset.id || f.dataset.itemId } : null))) || null;
    const PLAYABLE = new Set(['Movie', 'Episode', 'Video', 'MusicVideo', 'Audio', 'Series', 'Season', 'MusicAlbum', 'MusicArtist', 'BoxSet', 'Playlist', 'TvChannel']);

    // ---- the bar ----
    let bar = null;
    function key(k, label) {
        const h = el('span', 'mc-hint');
        h.append(el('span', 'mc-hint-key', k), el('span', 'mc-hint-label', label));
        return h;
    }
    // Only the keys that do something here, and what they do (the user, 2026-11-14: glass orbs, page-aware).
    const isText = (e) => !!e && (e.tagName === 'TEXTAREA' || (e.tagName === 'INPUT' && /^(text|search|password|email|url|tel|number|)$/i.test(e.type || '')));
    // the item the screen itself is about: a details screen's (not program info, which has no menu)
    M.screenItem = () => {
        const d = document.querySelector('#icefin-theme-root .icefin-details[data-type]');
        if (!d || !/^#\/details\b/.test(location.hash)) return null;
        const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
        return id ? { Id: id, Type: d.dataset.type } : null;
    };
    function hintsNow() {
        const overlay = document.querySelector('#icefin-theme-overlay');
        const f = (overlay && overlay.querySelector('.icefin-focused')) || T.ctx.focused() || document.activeElement;
        if (document.getElementById('icefin-osk')) return [['A', 'type'], ['B', 'close keyboard']];
        if (overlay) {
            const list = [];
            if (isText(f)) list.push(['A', 'type']);
            else if (f && typeof f.mcStep === 'function') list.push(['A', 'next'], ['◀▶', 'change']);
            else if (f) list.push(['A', 'select']);
            list.push(['B', 'close']);
            return list;
        }
        if (document.querySelector('#icefin-theme-root .icefin-d-picker')) return [['A', 'choose'], ['B', 'close']];
        if (html.hasAttribute('data-icefin-stock')) {
            const a = document.activeElement;
            const list = [];
            if (isText(a)) list.push(['A', 'type']);
            else if (a && a.tagName === 'SELECT') list.push(['A', 'choose']);
            else if (a && a.type === 'checkbox') list.push(['A', 'switch']);
            else if (a && a !== document.body) list.push(['A', 'select']);
            list.push(['B', 'back']);
            return list;
        }
        const route = (T.active() && T.active().route) || '';
        const mc = (document.getElementById('icefin-theme-root') || { getAttribute: () => '' }).getAttribute('data-mc') || '';
        const list = [];
        if (f && f.classList && f.classList.contains('mc-qc-box')) return [['0–9', 'digit'], ['▲▼', 'change'], ['B', 'back']];
        if (isText(f)) list.push(['A', 'type']);
        else if (f) {
            const it = itemOf(f);
            const tile = !!it || (f.classList && (f.classList.contains('mc-tile') || f.classList.contains('mc-lib-tile')));
            const label = f.classList && f.classList.contains('mc-pivot-item') ? (f.classList.contains('mc-lib-sort') ? 'open' : 'show')
                : route === '#/livetv' ? 'watch' : tile ? 'open' : 'select';
            list.push(['A', label]);
        }
        const it = itemOf(f) || (mc === 'programme' ? null : M.screenItem());
        const track = !!(f && f.closest && f.closest('[data-icefin-reorder], .icefin-d-track'));
        if (track) list.push(['≡', 'move']);
        else if (it && M.itemMenu) list.push(['≡', 'more']);
        if (it && (!it.Type || PLAYABLE.has(it.Type))) list.push(['▶', 'play']);
        list.push(['B', route === '#/home' ? 'close' : 'back']);
        return list;
    }
    function draw() {
        const on = T.active() && T.active().id === 'media-center' && !/^#\/video\b/.test(location.hash) && !html.hasAttribute('data-icefin-dashboard')
            && (html.getAttribute('data-mc-input') === 'pad' || html.hasAttribute('data-icefin-couch'));
        if (!on) { if (bar) bar.hidden = true; return; }
        if (!bar || !bar.isConnected) {
            bar = el('div', 'mc-hints');
            bar.setAttribute('aria-hidden', 'true');  // the keys' effect is announced by the controls themselves
            document.body.append(bar);
        }
        bar.hidden = false;
        const list = hintsNow();
        const sig = JSON.stringify(list);
        if (bar.dataset.sig === sig) return;
        bar.dataset.sig = sig;
        bar.textContent = '';
        for (const [k, label] of list) bar.append(key(k, label));
    }
    M.hints = draw;

    M.onAction((a, ctx) => {
        if (Date.now() - lastKey > 120) mode('pad');
        setTimeout(draw, 30);  // after the action has moved the focus
        // Play/Pause on a focused item plays it (the player's own controls take it there)
        if (a === 'play_pause' || a === 'playpause') {
            const it = itemOf(ctx.focused()) || M.screenItem();
            if (it && it.Id && (!it.Type || PLAYABLE.has(it.Type))) { ctx.sound('select'); ctx.play({ ids: [it.Id], serverId: M.sid() }); return true; }
        }
        return false;
    });
    if (!window.icefinMediaCenterRoute) {
        window.icefinMediaCenterRoute = true;
        window.addEventListener('hashchange', () => setTimeout(() => { const K = window.icefinMediaCenter; if (K && K.hints) K.hints(); if (K && K.stockCaption) K.stockCaption(document.body); }, 80));
    }

    // ---- the caption on jellyfin-web's framed pages: the focused setting's name (its label, the switch's label or a
    // drop-down's aria-labelledby), never its value; it cross-fades like the library's (motion.js) ----
    let cap = null, capFill = null;
    const nameOf = (e) => {
        if (!e || e === document.body) return '';
        const by = e.getAttribute('aria-labelledby');
        if (by) { const l = document.getElementById(by.split(' ')[0]); if (l && l.textContent.trim()) return l.textContent.trim(); }
        if (e.id) { const l = document.querySelector(`label[for="${CSS.escape(e.id)}"]`); if (l && l.textContent.trim()) return l.textContent.trim(); }
        const lab = e.closest('label');
        if (lab && lab.textContent.trim()) return lab.textContent.trim();
        return (e.getAttribute('aria-label') || (e.tagName === 'BUTTON' || e.tagName === 'A' ? e.textContent : '') || '').trim();
    };
    if (!window.icefinMediaCenterCaption) {
        window.icefinMediaCenterCaption = true;
        document.addEventListener('focusin', (e) => { const K = window.icefinMediaCenter; if (K && K.stockCaption) K.stockCaption(e.target); }, true);
    }
    M.stockCaption = (target) => {
        if (!T.active() || T.active().id !== 'media-center' || !html.hasAttribute('data-icefin-stock') || html.hasAttribute('data-icefin-dashboard')) { if (cap) cap.hidden = true; return; }
        if (target === document.body) { if (cap) cap.hidden = true; return; }
        if (target.closest && (target.closest('#icefin-stock-chrome') || target.closest('#icefin-osk') || target.closest('.dialogContainer'))) return;
        if (!cap || !cap.isConnected) {
            cap = el('div', 'mc-sc-caption');
            document.body.append(cap);
            capFill = M.caption ? M.caption(cap, (node, text) => { node.textContent = text; }) : (text) => { cap.textContent = text; };
        }
        const text = nameOf(target).replace(/\s+/g, ' ').slice(0, 120);
        cap.hidden = !text;
        if (text) capFill(text);
    };
    draw();
})();
