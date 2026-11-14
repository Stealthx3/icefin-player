// Tide: the options panel and the notice (PLAN 9.48; the canvas's ItemOptions, MenuDialog, MediaInfo, SortFilter,
// ExitPanel, Notices and MotionPanel boards). One dark panel from the right edge for an item's options, a library's
// sort and filter, the player's options, Play on, the exit question and every dialog. It is the engine's modal overlay
// while it is up (ui.overlay), so the pad stays inside it on any screen and the page has its focus back as it leaves.
//
// Motion (MotionPanel, the six principles): in 260 ms from the edge, decelerating (cubic-bezier(0.2, 0.8, 0.2, 1)),
// the screen dims to 75 % with it; a next level slides over the current one from the right (220 ms) and the level
// under it steps back to a faint trail on the panel's edge; Back slides a level out (180 ms) to the one under it, the
// row you chose still focused; the panel leaves the way it came (220 ms, accelerating). Low motion: 100 ms fades.
//
//   D.panel.show({title, path, wide, hints, render(body, panel)})   opens the panel at its first level, or replaces the top level
//   D.panel.push({...})                                               a next level over the current one
//   D.panel.pop()                                                     back to the level under it (or closes the last)
//   D.panel.close() / D.panel.isOpen()
//   D.panel.ask({title, path, text, choices:[{label, run, safe}]})   a question in the panel, the safe choice focused
//   D.notice(text, bad)                                               a notice under the clock for 3 s, with the select or error sound
//   D.row(label, {sub, value, go, danger, on, icon})                  a focusable panel row
//   D.stepper(label, values, at, changed)                             a row whose value ◀ ▶ step in place
//   D.field(label, value, {type, multiline, placeholder})             a labelled text field (the on-screen keyboard opens on it)
//   D.toggle(label, on, changed)                                      a switch row
//   D.button(label, go, main) / D.foot(...buttons) / D.sec(text) / D.note(text)
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinTide;
    if (!T || !T.ui || !T.ui.overlay || !D) return;
    const ui = T.ui;
    const el = D.el;

    let host = null, stack = [], pendingSpec = null;
    const HOST = {
        mount(h) { host = h; build(); if (pendingSpec) { stack = []; draw(pendingSpec, 'open'); } pendingSpec = null; },
        unmount() { host = null; stack = []; ui.overlay.set(null); if (D.screenHints) D.screenHints(); },
        leave(h) { h.classList.add('td-panel-leave'); return ui.motion.duration(220); },
        onAction(a, f0) {
            D.sawAction(a);
            // the focused row of the top level (a level under it keeps its last row marked, for the way back)
            const f = (host && host.querySelector('.td-panel-level:last-child .icefin-focused')) || f0;
            if ((a === 'left' || a === 'right') && f && typeof f.tdStep === 'function') { f.tdStep(a === 'right' ? 1 : -1); return true; }
            if (a === 'back' && stack.length > 1) { D.panel.pop(); return true; }
            if ((a === 'left') && stack.length > 1 && !(f && f.closest && f.closest('.td-tabs'))) { D.panel.pop(); return true; }
            if (a === 'step_backward' || a === 'step_forward') {  // a wide panel's sections, by the shoulder buttons
                const tabs = host && host.querySelector('.td-panel-level:last-child .td-tabs');
                if (tabs) {
                    const list = [...tabs.querySelectorAll('[data-icefin-focus]')];
                    const i = list.findIndex((b) => b.classList.contains('on'));
                    const n = list[Math.max(0, Math.min(list.length - 1, i + (a === 'step_forward' ? 1 : -1)))];
                    if (n && n !== list[i]) { n.click(); T.ctx.sound('navigate'); }
                    return true;
                }
            }
            return false;
        }
    };
    function build() {
        host.className = 'td-panel-host' + (/^#\/video\b/.test(location.hash) ? ' td-panel-video' : '');
        const dim = el('div', 'td-panel-dim');
        dim.addEventListener('click', () => D.panel.close());  // a click outside closes it (checklist 2.5)
        const box = el('div', 'td-panel');
        box.setAttribute('role', 'dialog');
        host.append(dim, box);
    }
    function draw(spec, how) {
        const box = host.querySelector('.td-panel');
        box.classList.toggle('td-panel-wide', !!spec.wide || stack.some((s) => s.wide));
        box.setAttribute('aria-label', spec.title || '');
        const level = el('div', 'td-panel-level' + (how === 'push' ? ' td-level-in' : ''));
        const head = el('div', 'td-panel-head');
        if (spec.path) head.append(el('div', 'td-panel-path', spec.path));
        head.append(el('div', 'td-panel-title', spec.title || ''));
        const body = el('div', 'td-panel-body');
        level.append(head, body);
        if (how === 'replace' && stack.length) { const old = box.lastElementChild; if (old) old.remove(); stack.pop(); }
        const under = box.lastElementChild;
        if (under && how === 'push') {
            under.classList.add('td-level-under');
            for (const x of under.querySelectorAll('.icefin-focused')) { x.classList.remove('icefin-focused'); x.classList.add('td-chosen'); }
        }
        box.append(level);
        spec.el = level;
        stack.push(spec);
        D.hints(spec.hints || [['OK', 'choose'], ['Back', stack.length > 1 ? 'to the options' : 'close']]);
        const focusFirst = () => {
            if (!body.isConnected || level.querySelector('.icefin-focused')) return;
            const f = body.querySelector('.td-row-focus-first') || body.querySelector('[data-icefin-focus]');
            if (f) T.ctx.focus(f);
        };
        Promise.resolve(spec.render(body, D.panel)).then(focusFirst, (e) => { console.error('tide: panel', e); D.notice('That didn’t work', true); });
        focusFirst();
    }
    D.panel = {
        show(spec) {
            // an overlay still playing its closing animation is not open: the engine finishes it and opens ours anew
            if (host && ui.overlay.isOpen()) { stack.length ? draw(spec, 'replace') : draw(spec, 'open'); return; }
            pendingSpec = spec;
            ui.overlay.set(HOST);
            ui.overlay.open();
        },
        push(spec) { if (!host || !ui.overlay.isOpen()) { D.panel.show(spec); return; } draw(spec, 'push'); T.ctx.sound('navigate'); },
        pop() {
            if (!host) return;
            if (stack.length <= 1) { D.panel.close(); return; }
            const top = stack.pop();
            const prev = stack[stack.length - 1];
            top.el.classList.add('td-level-out');
            setTimeout(() => top.el.remove(), ui.motion.duration(180));
            prev.el.classList.remove('td-level-under');
            const box = host.querySelector('.td-panel');
            box.classList.toggle('td-panel-wide', stack.some((s) => s.wide));
            const back = prev.el.querySelector('.td-chosen') || prev.el.querySelector('[data-icefin-focus]');
            if (back) T.ctx.focus(back);
            D.hints(prev.hints || [['OK', 'choose'], ['Back', stack.length > 1 ? 'to the options' : 'close']]);
            T.ctx.sound('back');
        },
        close() { if (host) ui.overlay.close(); },
        isOpen: () => !!host && ui.overlay.isOpen(),
        depth: () => stack.length,
        // A question in the panel (ExitPanel board): the safe choice is focused, so a second Back or a stray OK keeps you
        ask({ title, path, text, choices, push }) {
            const spec = {
                title, path,
                hints: [['OK', 'choose'], ['Back', 'cancel']],
                render(body) {
                    if (text) body.append(D.note(text));
                    for (const c of choices) {
                        const r = D.row(c.label, { danger: c.danger, go: () => { if (!c.keepOpen) D.panel.close(); if (c.run) c.run(); } });
                        if (c.safe) r.classList.add('td-row-focus-first');
                        body.append(r);
                    }
                }
            };
            if (push && host) D.panel.push(spec); else D.panel.show(spec);
        }
    };

    // ---- the notice (Notices board): under the clock, a thin light line on its left, 3 s ----
    D.notice = (text, bad) => {
        if (!text) return;
        for (const old of document.querySelectorAll('.td-notice')) old.remove();
        const n = el('div', 'td-notice' + (bad ? ' td-notice-bad' : ''), text);
        n.setAttribute('role', 'status');
        document.body.append(n);
        T.ctx.sound(bad ? 'error' : 'select');
        setTimeout(() => n.classList.add('td-notice-out'), 3000);
        setTimeout(() => n.remove(), 3000 + ui.motion.duration(200));
    };

    // ---- building blocks ----
    D.row = (label, o) => {
        o = o || {};
        const r = D.focusable(el('div', 'td-row' + (o.danger ? ' td-row-danger' : '') + (o.on ? ' td-row-on' : '')));
        if (o.icon) r.append(D.svg(o.icon, 'td-row-icon'));
        const t = el('span', 'td-row-label');
        t.append(el('span', '', label));
        if (o.sub) t.append(el('small', 'td-row-sub', o.sub));
        r.append(t);
        if (o.value != null && o.value !== '') r.append(el('span', 'td-row-value', o.value));
        if (o.on) r.append(D.svg('check', 'td-row-check'));
        r.setAttribute('role', 'button');
        r.setAttribute('aria-label', [label, o.sub, o.value].filter(Boolean).join(', '));
        if (o.go) r.addEventListener('click', () => { for (const x of (r.parentElement || r).querySelectorAll('.td-chosen')) x.classList.remove('td-chosen'); r.classList.add('td-chosen'); o.go(); });
        return r;
    };
    D.stepper = (label, values, at, changed) => {
        let i = Math.max(0, values.findIndex((x) => x[0] === at));
        const r = D.row(label, { value: ' ' });
        const v = r.querySelector('.td-row-value');
        const show = () => { v.textContent = `◀ ${values[i][1]} ▶`; r.setAttribute('aria-label', `${label}: ${values[i][1]}`); };
        r.tdStep = (dir) => { i = (i + dir + values.length) % values.length; show(); T.ctx.sound('navigate'); if (changed) changed(values[i][0]); };
        r.addEventListener('click', () => r.tdStep(1));
        r.value = () => values[i][0];
        show();
        return r;
    };
    D.toggle = (label, on, changed, o) => {
        const r = D.row(label, Object.assign({ value: ' ' }, o || {}));
        const v = r.querySelector('.td-row-value');
        const sw = el('span', 'td-switch' + (on ? ' on' : ''));
        sw.append(el('i'));
        v.textContent = '';
        v.append(sw);
        r.setAttribute('aria-pressed', String(!!on));
        r.addEventListener('click', () => {
            on = !on;
            sw.classList.toggle('on', on);
            r.setAttribute('aria-pressed', String(on));
            T.ctx.sound('select');
            if (changed) changed(on);
        });
        r.isOn = () => on;
        return r;
    };
    D.button = (label, go, main) => {
        const b = D.focusable(el('button', 'td-btn' + (main ? ' td-btn-main' : ''), label));
        b.type = 'button';
        b.addEventListener('click', go);
        return b;
    };
    D.field = (label, value, o) => {
        o = o || {};
        const l = el('label', 'td-field');
        const i = el(o.multiline ? 'textarea' : 'input', 'td-input');
        if (!o.multiline) i.type = o.type || 'text';
        i.value = value == null ? '' : String(value);
        if (o.placeholder) i.placeholder = o.placeholder;
        if (o.autocomplete) i.autocomplete = o.autocomplete;
        D.focusable(i);
        l.append(el('span', 'td-field-label', label), i);
        l.input = i;
        return l;
    };
    D.foot = (...buttons) => { const f = el('div', 'td-foot'); f.append(...buttons); return f; };
    D.sec = (text) => el('div', 'td-sec', text);
    D.note = (text) => el('div', 'td-note', text);
    // A panel's sections along its top (the wide panel's Details · Images · Identify · …); the shoulder buttons step them
    D.tabs = (list, at, pick) => {
        const t = el('div', 'td-tabs');
        for (const [id, label] of list) {
            const b = D.focusable(el('button', 'td-tab' + (id === at ? ' on' : ''), label));
            b.type = 'button';
            b.addEventListener('click', () => { if (id !== at) pick(id); });
            t.append(b);
        }
        return t;
    };
})();
