// Baseline: stock's dialogs and action sheet, drawn with the engine (PLAN 9.51; forked from Tide's options panel,
// restyled as stock jellyfin-web's TV dialogs: the action sheet's list with the focused row filled, the form dialog's
// header and fields, the confirm's buttons). The API is the panel's (show, push, pop, close, ask, row, field, …).
// Was: Tide: the options panel and the notice (PLAN 9.48; the canvas's ItemOptions, MenuDialog, MediaInfo, SortFilter,
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
    const D = window.icefinBaseline;
    if (!T || !T.ui || !T.ui.overlay || !D) return;
    const ui = T.ui;
    const el = D.el;

    let host = null, stack = [], pendingSpec = null, openedAt = null;
    // the history entry the panel opened on: its index (Navigation API) and hash
    const entry = () => ({ index: window.navigation && navigation.currentEntry ? navigation.currentEntry.index : -1, hash: location.hash });
    const HOST = {
        mount(h) { host = h; openedAt = entry(); build(); if (pendingSpec) { stack = []; draw(pendingSpec, 'open'); } pendingSpec = null; },
        unmount() { host = null; stack = []; ui.overlay.set(null); if (D.screenHints) D.screenHints(); setTimeout(() => { if (!host && D.screenHints) D.screenHints(); }, ui.motion.duration(260)); },
        leave(h) { h.classList.add('bl-panel-leave'); return ui.motion.duration(220); },
        onAction(a, f0) {
            D.sawAction(a);
            // the focused row of the top level (a level under it keeps its last row marked, for the way back)
            const f = (host && host.querySelector('.bl-panel-level:last-child .icefin-focused')) || f0;
            if ((a === 'left' || a === 'right') && f && typeof f.blStep === 'function') { f.blStep(a === 'right' ? 1 : -1); return true; }
            if (a === 'back' && stack.length > 1) { D.panel.pop(); return true; }
            if ((a === 'left') && stack.length > 1 && !(f && f.closest && f.closest('.bl-ptabs'))) { D.panel.pop(); return true; }
            if (a === 'step_backward' || a === 'step_forward') {  // a wide panel's sections, by the shoulder buttons
                const tabs = host && host.querySelector('.bl-panel-level:last-child .bl-ptabs');
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
    // ---- Back from outside the controller (QA pre-pass: the mouse's Back button, which the app turns into the page's
    // Back, and the browser's): stock's dialogs live in a history entry of their own, so that Back closes the dialog and
    // the page stays. The panel has no entry, so the step back is undone before the router sees it (the popstate and
    // hashchange of both steps are held back) and the panel closes: the same page, its focus back on the opener.
    let undo = null;
    const hold = (e) => {
        if (undo) {
            e.stopImmediatePropagation();
            if (e.type === 'popstate' && location.hash === undo.hash) setTimeout(() => { undo = null; }, 60);  // back where it was: its hashchange follows
            return;
        }
        if (!host || !ui.overlay.isOpen() || !openedAt) return;
        if (e.type === 'hashchange') {
            // a new page while the panel is up (a row that goes somewhere): the panel doesn't stay over it
            if (location.hash !== openedAt.hash) D.panel.close();
            return;
        }
        const now = entry();
        const delta = openedAt.index >= 0 && now.index >= 0 ? now.index - openedAt.index : -1;
        if (!delta || location.hash === openedAt.hash) return;
        e.stopImmediatePropagation();
        undo = { hash: openedAt.hash };
        setTimeout(() => { undo = null; }, 1500);
        D.panel.close();
        history.go(-delta);
    };
    if (window.icefinBaselinePanelBackOff) window.icefinBaselinePanelBackOff();  // the theme loaded again: one set of listeners
    window.addEventListener('popstate', hold, true);
    window.addEventListener('hashchange', hold, true);
    window.icefinBaselinePanelBackOff = () => { window.removeEventListener('popstate', hold, true); window.removeEventListener('hashchange', hold, true); };

    function build() {
        host.className = 'bl-panel-host' + (/^#\/video\b/.test(location.hash) ? ' bl-panel-video' : '');
        const dim = el('div', 'bl-panel-dim');
        dim.addEventListener('click', () => D.panel.close());  // a click outside closes it (checklist 2.5)
        const box = el('div', 'bl-panel');
        box.setAttribute('role', 'dialog');
        host.append(dim, box);
    }
    function draw(spec, how) {
        const box = host.querySelector('.bl-panel');
        box.classList.toggle('bl-panel-wide', !!spec.wide || stack.some((s) => s.wide));
        box.setAttribute('aria-label', spec.title || '');
        const level = el('div', 'bl-panel-level' + (how === 'push' ? ' bl-level-in' : ''));
        const head = el('div', 'bl-panel-head');
        const hb = D.button && el('button', 'bl-panel-back');
        if (hb) { hb.type = 'button'; hb.append(D.icon('arrow_back')); hb.setAttribute('aria-label', 'Back'); hb.addEventListener('click', () => D.panel.pop()); head.append(hb); }
        if (spec.path) head.append(el('div', 'bl-panel-path', spec.path));
        head.append(el('div', 'bl-panel-title', spec.title || ''));
        const body = el('div', 'bl-panel-body');
        level.append(head, body);
        if (how === 'replace' && stack.length) { const old = box.lastElementChild; if (old) old.remove(); stack.pop(); }
        const under = box.lastElementChild;
        if (under && how === 'push') {
            under.classList.add('bl-level-under');
            for (const x of under.querySelectorAll('.icefin-focused')) { x.classList.remove('icefin-focused'); x.classList.add('bl-chosen'); }
        }
        box.append(level);
        spec.el = level;
        stack.push(spec);
        D.hints(spec.hints || [['OK', 'choose'], ['Back', 'close']]);
        const focusFirst = () => {
            if (!body.isConnected || level.querySelector('.icefin-focused')) return;
            const f = body.querySelector('.bl-row-focus-first') || body.querySelector('[data-icefin-focus]');
            if (f) T.ctx.focus(f);
        };
        // stock's two kinds: the action sheet (a centred list) and the form dialog (a header bar over fields)
        const form = () => { if (spec.wide || spec.form || body.querySelector('.bl-field, .bl-images')) level.classList.add('form'); };
        if (spec.path === 'Options' && !spec.form) level.classList.add('no-title');
        Promise.resolve(spec.render(body, D.panel)).then(() => { form(); focusFirst(); }, (e) => { console.error('baseline: panel', e); D.notice('That didn’t work', true); });
        form();
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
            top.el.classList.add('bl-level-out');
            setTimeout(() => top.el.remove(), ui.motion.duration(180));
            prev.el.classList.remove('bl-level-under');
            const box = host.querySelector('.bl-panel');
            box.classList.toggle('bl-panel-wide', stack.some((s) => s.wide));
            const back = prev.el.querySelector('.bl-chosen') || prev.el.querySelector('[data-icefin-focus]');
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
                        if (c.safe) r.classList.add('bl-row-focus-first');
                        body.append(r);
                    }
                }
            };
            if (push && host) D.panel.push(spec); else D.panel.show(spec);
        }
    };

    // ---- building blocks ----
    D.row = (label, o) => {
        o = o || {};
        const r = D.focusable(el('div', 'bl-row' + (o.danger ? ' bl-row-danger' : '') + (o.on ? ' bl-row-on' : '')));
        if (o.icon) r.append(D.svg(o.icon, 'bl-row-icon'));
        const t = el('span', 'bl-row-label');
        t.append(el('span', '', label));
        if (o.sub) t.append(el('small', 'bl-row-sub', o.sub));
        r.append(t);
        if (o.value != null && o.value !== '') r.append(el('span', 'bl-row-value', o.value));
        if (o.on) r.append(D.svg('check', 'bl-row-check'));
        r.setAttribute('role', 'button');
        r.setAttribute('aria-label', [label, o.sub, o.value].filter(Boolean).join(', '));
        if (o.go) r.addEventListener('click', () => { for (const x of (r.parentElement || r).querySelectorAll('.bl-chosen')) x.classList.remove('bl-chosen'); r.classList.add('bl-chosen'); o.go(); });
        return r;
    };
    D.stepper = (label, values, at, changed) => {
        let i = Math.max(0, values.findIndex((x) => x[0] === at));
        const r = D.row(label, { value: ' ' });
        const v = r.querySelector('.bl-row-value');
        const show = () => { v.textContent = `◀ ${values[i][1]} ▶`; r.setAttribute('aria-label', `${label}: ${values[i][1]}`); };
        r.blStep = (dir) => { i = (i + dir + values.length) % values.length; show(); T.ctx.sound('navigate'); if (changed) changed(values[i][0]); };
        r.addEventListener('click', () => r.blStep(1));
        r.value = () => values[i][0];
        show();
        return r;
    };
    D.toggle = (label, on, changed, o) => {
        const r = D.row(label, Object.assign({ value: ' ' }, o || {}));
        const v = r.querySelector('.bl-row-value');
        const sw = el('span', 'bl-switch' + (on ? ' on' : ''));
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
        const b = D.focusable(el('button', 'bl-btn' + (main ? ' bl-btn-main' : ''), label));
        b.type = 'button';
        b.addEventListener('click', go);
        return b;
    };
    D.field = (label, value, o) => {
        o = o || {};
        const l = el('label', 'bl-field');
        const i = el(o.multiline ? 'textarea' : 'input', 'bl-input');
        if (!o.multiline) i.type = o.type || 'text';
        i.value = value == null ? '' : String(value);
        if (o.placeholder) i.placeholder = o.placeholder;
        if (o.autocomplete) i.autocomplete = o.autocomplete;
        D.focusable(i);
        l.append(el('span', 'bl-field-label', label), i);
        l.input = i;
        return l;
    };
    D.foot = (...buttons) => { const f = el('div', 'bl-foot'); f.append(...buttons); return f; };
    D.sec = (text) => el('div', 'bl-sec', text);
    D.note = (text) => el('div', 'bl-note', text);
    // A panel's sections along its top (the wide panel's Details · Images · Identify · …); the shoulder buttons step them
    D.tabs = (list, at, pick) => {
        const t = el('div', 'bl-ptabs');
        for (const [id, label] of list) {
            const b = D.focusable(el('button', 'bl-ptab' + (id === at ? ' on' : ''), label));
            b.type = 'button';
            b.addEventListener('click', () => { if (id !== at) pick(id); });
            t.append(b);
        }
        return t;
    };
})();
