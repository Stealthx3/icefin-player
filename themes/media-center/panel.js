// Media Center: the side panel and the notice (PLAN 9.60, the "Pass 9.60" boards: "menus slide from their edge").
// One panel, from the right edge, for the item menu and its dialogs, Play on and Watch together, pickers and sort: it
// lives off the edge, so it travels in from there (260 ms, decelerating) and back out (200 ms, accelerating) with a dim
// over the screen; the opener gets the focus back as it starts to leave. A dialog opened from the panel replaces the
// panel's content in place (a 120 ms cross-fade) rather than stacking a second panel. It is the engine's modal
// overlay while it is up, so the remote stays inside it on any screen. Low motion: it appears and goes at once.
//
//   M.panel.show({title, sub, wide, render(body, panel)})   opens the panel, or swaps its content when one is up
//   M.panel.close()                                         closes it
//   M.panel.isOpen()
//   M.notice(text, bad)                                     a notice at the bottom right for 4 s, with the select or error sound
//   M.row(label, {sub, value, go, danger, on, icon})        a focusable panel row (.mc-li)
//   M.button(label, go, main)                               a focusable button (.mc-btn)
//   M.field(label, value, {type, multiline, placeholder})   a labelled text field (the on-screen keyboard opens on it)
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    if (!T || !T.ui || !T.ui.overlay || !M) return;
    const ui = T.ui;
    const el = M.el;
    if (ui.keyboard) ui.keyboard.enable();  // every text field, themed or jellyfin-web's (checklist 1.12)

    let host = null, pending = null, current = null;
    const HOST = {
        mount(h) { host = h; build(); if (pending) draw(pending, false); pending = null; },
        unmount() { host = null; current = null; ui.overlay.set(null); },
        leave(h) { h.classList.add('mc-sp-out'); return ui.motion.duration(200); }
    };
    function build() {
        host.className = 'mc-sp' + (/^#\/video\b/.test(location.hash) ? ' mc-sp-video' : '');
        const dim = el('div', 'mc-sp-dim');
        dim.addEventListener('click', () => M.panel.close());  // a click outside closes it (checklist 2.5)
        const box = el('div', 'mc-panel mc-sp-panel');
        box.setAttribute('role', 'dialog');
        host.append(dim, box);
    }
    function draw(spec, swap) {
        current = spec;
        const box = host.querySelector('.mc-sp-panel');
        box.classList.toggle('mc-sp-wide', !!spec.wide);
        box.setAttribute('aria-label', spec.title || '');
        box.textContent = '';
        const head = el('div', 'mc-sp-head');
        head.append(el('div', 'mc-sp-title', spec.title || ''));
        if (spec.sub) head.append(el('div', 'mc-sp-sub', spec.sub));
        const body = el('div', 'mc-sp-body' + (swap ? ' mc-sp-swap' : ''));
        box.append(head, body);
        // focus the first thing, once the content has loaded (some panels fetch their lists first)
        const focusFirst = () => {
            if (!body.isConnected || box.querySelector('.icefin-focused')) return;
            const f = body.querySelector('[data-icefin-focus]');
            if (f) T.ctx.focus(f);
        };
        Promise.resolve(spec.render(body, M.panel)).then(focusFirst, (e) => { console.error('media-center: panel', e); M.notice('That didn’t work', true); });
        focusFirst();
    }
    M.panel = {
        show(spec) {
            if (host) { draw(spec, true); return; }
            pending = spec;
            ui.overlay.set(HOST);
            ui.overlay.open();
        },
        close() { if (host) ui.overlay.close(); },
        isOpen: () => !!host,
        current: () => current
    };

    // ---- the notice (the Kit board: bottom right, 4 s) ----
    M.notice = (text, bad) => {
        if (!text) return;
        for (const old of document.querySelectorAll('.mc-notice')) old.remove();
        const n = el('div', 'mc-notice' + (bad ? ' mc-notice-bad' : ''), text);
        n.setAttribute('role', 'status');
        document.body.append(n);
        T.ctx.sound(bad ? 'error' : 'select');
        setTimeout(() => n.classList.add('mc-notice-out'), 4000);
        setTimeout(() => n.remove(), 4000 + ui.motion.duration(200));
    };

    // ---- building blocks ----
    M.row = (label, o) => {
        o = o || {};
        const r = M.focusable(el('div', 'mc-li mc-sp-row' + (o.danger ? ' mc-sp-danger' : '') + (o.on ? ' mc-sp-on' : '')));
        if (o.icon) r.append(M.svg(o.icon, 'mc-sp-icon'));
        const t = el('span', 'mc-sp-label');
        t.append(el('span', '', label));
        if (o.sub) t.append(el('small', 'mc-sp-rowsub', o.sub));
        r.append(t);
        if (o.value) r.append(el('span', 'mc-li-value', o.value));
        if (o.on) r.append(M.svg(M.ICON.check, 'mc-sp-check'));
        r.setAttribute('role', 'button');
        r.setAttribute('aria-label', [label, o.sub, o.value].filter(Boolean).join(', '));
        if (o.go) r.addEventListener('click', o.go);
        return r;
    };
    M.button = (label, go, main) => {
        const b = M.focusable(el('button', 'mc-btn mc-sp-btn' + (main ? ' mc-sp-main' : ''), label));
        b.type = 'button';
        b.addEventListener('click', go);
        return b;
    };
    M.field = (label, value, o) => {
        o = o || {};
        const l = el('label', 'mc-sp-field');
        const i = el(o.multiline ? 'textarea' : 'input', 'mc-sp-input');
        if (!o.multiline) i.type = o.type || 'text';
        i.value = value == null ? '' : String(value);
        if (o.placeholder) i.placeholder = o.placeholder;
        M.focusable(i);
        l.append(el('span', 'mc-sp-flabel', label), i);
        l.input = i;
        return l;
    };
    // A stepper row: ‹ value ›, ◀ and ▶ step it, select steps forward (checklist 2.4). values: [[value, label], …]
    M.stepper = (label, values, at, changed) => {
        let i = Math.max(0, values.findIndex((x) => x[0] === at));
        const r = M.row(label, { value: ' ' });
        const v = r.querySelector('.mc-li-value');
        const show = () => { v.textContent = `‹ ${values[i][1]} ›`; r.setAttribute('aria-label', `${label}: ${values[i][1]}`); };
        r.mcStep = (dir) => { i = (i + dir + values.length) % values.length; show(); T.ctx.sound('navigate'); if (changed) changed(values[i][0]); };
        r.addEventListener('click', () => r.mcStep(1));
        r.value = () => values[i][0];
        show();
        return r;
    };
    if (T._engine && T._engine.addActionHook && !window.icefinMediaCenterStepKey) {
        window.icefinMediaCenterStepKey = true;
        T._engine.addActionHook((a) => {
            if (a !== 'left' && a !== 'right') return false;
            const f = document.querySelector('#icefin-theme-overlay .icefin-focused');
            if (!f || typeof f.mcStep !== 'function') return false;
            f.mcStep(a === 'right' ? 1 : -1);
            return true;
        });
    }
    M.foot = (...buttons) => { const f = el('div', 'mc-sp-foot'); f.append(...buttons); return f; };
    M.sec = (text) => el('div', 'mc-sec', text);
    M.note = (text) => el('div', 'mc-note mc-sp-note', text);
})();
