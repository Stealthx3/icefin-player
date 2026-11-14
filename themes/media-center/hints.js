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
    let lastKey = 0;
    if (!window.icefinMediaCenterInput) {
        window.icefinMediaCenterInput = true;
        // arrows go through the same actions as a pad: a keydown just before an action means the keyboard
        window.addEventListener('keydown', () => { lastKey = Date.now(); const K = window.icefinMediaCenter; if (K && K.inputMode) K.inputMode('keys'); }, true);
        window.addEventListener('mousemove', (e) => { const K = window.icefinMediaCenter; if ((e.movementX || e.movementY) && K && K.inputMode) K.inputMode('pointer'); }, true);
    }
    M.inputMode = mode;

    const itemOf = (f) => (f && (f.mcItem || (f.dataset && (f.dataset.id || f.dataset.itemId) ? { Id: f.dataset.id || f.dataset.itemId } : null))) || null;
    const PLAYABLE = new Set(['Movie', 'Episode', 'Video', 'MusicVideo', 'Audio', 'Series', 'Season', 'MusicAlbum', 'MusicArtist', 'BoxSet', 'Playlist', 'TvChannel']);

    // ---- the bar ----
    let bar = null;
    function key(k, label) {
        const h = el('span', 'mc-hint');
        h.append(el('span', 'mc-hint-key', k), el('span', 'mc-hint-label', label));
        return h;
    }
    function hintsNow() {
        const overlay = document.querySelector('#icefin-theme-overlay');
        const f = (overlay && overlay.querySelector('.icefin-focused')) || (T._engine && T._engine.focused && T._engine.focused());
        if (overlay) {
            const list = [['A', 'select']];
            if (f && typeof f.mcStep === 'function') list.push(['◀▶', 'change']);
            list.push(['B', 'close']);
            return list;
        }
        if (document.getElementById('icefin-osk')) return [['A', 'type'], ['B', 'close keyboard']];
        if (html.hasAttribute('data-icefin-stock')) return [['A', 'select'], ['B', 'back']];
        const route = (T.active() && T.active().route) || '';
        const it = itemOf(f);
        const list = [['A', route === '#/livetv' ? 'watch' : 'open']];
        if (it) list.push(['≡', 'more']);
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

    if (T._engine && T._engine.addActionHook && !window.icefinMediaCenterHints) {
        window.icefinMediaCenterHints = true;
        T._engine.addActionHook((a) => {
            const K = window.icefinMediaCenter;
            if (!K || !T.active() || T.active().id !== 'media-center') return false;
            if (Date.now() - lastKey > 120 && K.inputMode) K.inputMode('pad');
            setTimeout(() => K.hints && K.hints(), 30);  // after the action has moved the focus
            // Play/Pause on a focused item plays it (not in the player or a panel: theirs)
            if ((a === 'play_pause' || a === 'playpause') && !/^#\/video\b/.test(location.hash) && !document.querySelector('#icefin-theme-overlay')) {
                const it = itemOf(T._engine.focused && T._engine.focused());
                if (it && it.Id && (!it.Type || PLAYABLE.has(it.Type))) { T.ctx.sound('select'); T.ctx.play({ ids: [it.Id], serverId: M.sid() }); return true; }
            }
            return false;
        });
        if (T._engine.onRoute) T._engine.onRoute(() => setTimeout(() => { const K = window.icefinMediaCenter; if (K && K.hints) K.hints(); }, 60));
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
    if (T._engine && T._engine.onRoute) T._engine.onRoute(() => { if (cap) cap.hidden = true; });
    draw();
})();
