// Tide: the column engine (PLAN 9.48; the canvas's Home, Folder, DetailsMovie, DetailsSeries, MotionColumns boards).
// Every Tide screen is a stack of levels shown in one grammar:
//   - the root may be the cross bar: categories in a row through the fixed point, the current one's column under it
//     (left and right step categories, the bar sliding so the current one stays at the fixed point);
//   - a column: entries in a line through the fixed point, the focused one there, larger, with its facts beside it;
//   - opening a folder or an item pushes a level: the column it came from shrinks to its icon on the left (the trail),
//     the new column takes the fixed point; Back (or ◀) pops it, the entry you left focused again.
// Levels and entries are plain objects:
//   level: {title, icon, art, load() -> entries, letters, empty:{icon, text, way:{label, go}}, count, focus, hints,
//           onBack(), kind}
//   entry: {name, sub, line, icon, art, shape: 'icon'|'poster'|'wide'|'square'|'round', initials, progress, played,
//           item, open() -> level, go(), play(), menu(), letter, focusFirst}
// The stack lives in memory per route (D.memory), so Back from a details screen lands on the same entry.
//
// Motion (MotionColumns, MotionTimings; the six principles): a column step 180 ms, a category step 240 ms, opening a
// level 280 ms (the folder's icon flies to the trail; the new column slides in 40 px from the right, fading up; its
// facts 80 ms late), back 240 ms the other way, all on cubic-bezier(0.25, 0.8, 0.3, 1). Low motion: 120 ms
// cross-fades, no slides, no flights.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinTide;
    if (!T || !D) return;
    const el = D.el;
    const WINDOW = 8;  // entries kept above and below the focused one
    D.memory = D.memory || new Map();

    // ---- a flier: a copy of an element travelling from where it is to a rect (visual continuity) ----
    D.fly = (from, to, ms, done) => {
        if (!from || D.reduced()) { if (done) done(); return; }
        const r = from.getBoundingClientRect();
        if (!r.width) { if (done) done(); return; }
        const f = from.cloneNode(true);
        f.classList.add('td-flier');
        f.removeAttribute('data-icefin-focus');
        Object.assign(f.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', transformOrigin: '0 0', zIndex: 900, pointerEvents: 'none' });
        document.body.append(f);
        const sx = to.width / r.width, sy = to.height / r.height;
        const anim = f.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${to.left - r.left}px, ${to.top - r.top}px) scale(${sx}, ${sy})`, opacity: 0.85 }],
            { duration: D.dur(ms), easing: 'cubic-bezier(0.25, 0.8, 0.3, 1)' });
        const end = () => { f.remove(); if (done) done(); };
        anim.onfinish = end;
        setTimeout(() => { if (f.isConnected) end(); }, ms + 400);  // a flier never stays behind
    };

    // ---- the thumb for an entry ----
    function thumb(e) {
        const t = el('div', 'td-e-thumb');
        if (e.art) { t.style.backgroundImage = `url("${e.art}")`; t.classList.add('has-art'); }
        else if (e.initials) t.append(el('span', 'td-e-initials', D.initials(e.initials)));
        else t.append(D.svg(e.icon || 'item'));
        if (e.progress > 0 && e.progress < 1) { const p = el('i', 'td-e-prog'); const f = el('b'); f.style.width = `${Math.round(e.progress * 100)}%`; p.append(f); t.append(p); }
        if (e.played) t.append(el('i', 'td-e-played', '✓'));
        return t;
    }
    function entryEl(e) {
        const d = el('div', `td-e shape-${e.shape || 'icon'}`);
        const text = el('div', 'td-e-text');
        text.append(el('div', 'td-e-name', e.name || ''));
        if (e.sub) text.append(el('div', 'td-e-sub', e.sub));
        if (e.line) text.append(el('div', 'td-e-line', e.line));
        d.append(thumb(e), text);
        d.setAttribute('role', 'button');
        d.setAttribute('aria-label', [e.name, e.sub].filter(Boolean).join(', '));
        d.tdEntry = e;
        return d;
    }

    // ---- the screen ----
    // D.columns(root, {root: level | {bar: [categories], at}, key, onRoot(level)}) -> controller
    // A category of the bar: {label, icon, load() -> entries, empty, letters, hints}
    D.columns = function (rootEl, opts) {
        const key = opts.key || location.hash.split('?')[0];
        const saved = opts.fresh ? null : D.memory.get(key);
        const S = {
            key, rootEl, stack: saved ? saved.stack : [opts.root], drawn: new Map(), entries: [], loading: 0, alive: true,
            barIndex: saved ? saved.barIndex : (opts.root.at || 0), backdropTimer: 0
        };
        rootEl.setAttribute('data-td-screen', opts.name || 'columns');
        const wave = D.ground(rootEl);
        const back = el('div', 'td-backdrop');
        rootEl.prepend(back);
        const clock = D.clock(rootEl);
        D.pointerNav(rootEl, () => C.back(true));
        const trail = el('div', 'td-trail');
        const bar = el('div', 'td-bar');
        const col = el('div', 'td-col');
        const letters = el('div', 'td-letters');
        letters.setAttribute('aria-hidden', 'true');
        const empty = el('div', 'td-empty');
        rootEl.append(trail, bar, col, letters, empty);
        // the pointer: the wheel steps the column; a click on another entry brings it to the fixed point
        col.addEventListener('wheel', (ev) => { ev.preventDefault(); C.step(ev.deltaY > 0 ? 1 : -1); }, { passive: false });

        const top = () => S.stack[S.stack.length - 1];
        const isBar = () => !!top().bar;
        const cur = () => (isBar() ? top().bar[Math.max(0, Math.min(S.barIndex, top().bar.length - 1))] : top());
        const curIndex = () => { const c = cur(); return c.focus || 0; };
        const setIndex = (i) => { cur().focus = i; };

        function save() { D.memory.set(key, { stack: S.stack, barIndex: S.barIndex }); }

        // the cross bar: categories through the fixed point
        function drawBar() {
            bar.textContent = '';
            bar.hidden = !isBar();
            if (!isBar()) return;
            top().bar.forEach((c, i) => {
                const b = el('div', 'td-cat' + (i === S.barIndex ? ' current' : ''));
                b.style.setProperty('--td-i', String(i - S.barIndex));
                b.append(D.svg(c.icon || 'folder'), el('div', 'td-cat-label', c.label));
                b.setAttribute('role', 'button');
                b.setAttribute('aria-label', c.label);
                b.addEventListener('click', () => { if (i !== S.barIndex) C.category(i); });
                bar.append(b);
            });
            rootEl.setAttribute('data-td-cat', cur().label || '');
        }
        // the trail: the levels below the top, as icons on the left, the nearest with its name
        function drawTrail() {
            trail.textContent = '';
            // a details screen shows its own item in the trail too (its poster, where it came from)
            const below = opts.selfInTrail ? S.stack.slice() : S.stack.slice(0, -1);
            trail.hidden = !below.length;
            rootEl.classList.toggle('td-has-trail', !!below.length);
            const shown = below.slice(-3);
            shown.forEach((lv, k) => {
                const near = k === shown.length - 1;
                const src = lv.bar ? lv.bar[S.barIndex] : lv;
                const t = el('div', 'td-trail-step' + (near ? ' near' : ''));
                if (src.art) { const a = el('div', 'td-trail-art' + (src.round ? ' round' : '')); a.style.backgroundImage = `url("${src.art}")`; t.append(a); }
                else if (src.initials) t.append(el('div', 'td-trail-art round td-e-initials', D.initials(src.initials)));
                else t.append(D.svg(src.icon || 'folder'));
                const name = lv.bar ? src.label : (src.title || '');
                if (near && name) t.append(el('div', 'td-trail-name', name));
                t.setAttribute('role', 'button');
                t.setAttribute('aria-label', `Back to ${name}`);
                t.addEventListener('click', () => {
                    const n = S.stack.length - (shown.length - k) + (opts.selfInTrail ? 1 : 0);
                    if (n >= S.stack.length) return;
                    while (S.stack.length > n) C.back(false, true);
                    C.redraw('back');
                });
                trail.append(t);
            });
        }
        // the column: a window of entries around the focused one, each keyed by its index so steps glide
        function drawColumn(how) {
            const list = S.entries;
            const i = Math.max(0, Math.min(list.length - 1, curIndex()));
            setIndex(i);
            const keep = new Set();
            const lo = Math.max(0, i - WINDOW), hi = Math.min(list.length, i + WINDOW + 1);
            for (let k = lo; k < hi; k++) {
                keep.add(k);
                let d = S.drawn.get(k);
                if (!d || d.tdEntry !== list[k]) {
                    if (d) d.remove();
                    d = entryEl(list[k]);
                    d.classList.add('td-fresh');
                    d.addEventListener('click', () => {
                        const at = S.entries.indexOf(d.tdEntry);
                        if (at !== curIndex()) { setIndex(at); T.ctx.sound('focus'); drawColumn(); return; }
                        C.activate(d.tdEntry, d);
                    });
                    S.drawn.set(k, d);
                    col.append(d);
                }
                const off = k - i;
                d.style.setProperty('--td-off', String(off));
                d.classList.toggle('above', off < 0);
                d.classList.toggle('far', Math.abs(off) > 4);
                d.classList.toggle('focused', off === 0);
                d.dataset.off = String(off);
                if (off === 0) D.focusable(d); else { d.removeAttribute('data-icefin-focus'); d.classList.remove('icefin-focused'); }
            }
            for (const [k, d] of S.drawn) if (!keep.has(k)) { d.remove(); S.drawn.delete(k); }
            requestAnimationFrame(() => { for (const d of S.drawn.values()) d.classList.remove('td-fresh'); });
            const f = S.drawn.get(i);
            if (f) T.ctx.focus(f);
            rootEl.setAttribute('data-td-index', String(i));
            rootEl.setAttribute('data-td-count', String(list.length));
            // the count under the clock (Folder board), and the letter strip for lists sorted by name
            const c = cur();
            clock.extra.textContent = list.length > 1 && (c.count !== false) ? `${i + 1} of ${list.length}${c.countNote ? ` · ${c.countNote}` : ''}` : (c.countNote || '');
            drawLetters();
            // the hints (page-aware): only keys that do something on this entry
            const e = list[i];
            const h = [];
            if (e && (e.open || e.go || e.item)) h.push(['OK', e.open ? 'open' : (e.okLabel || 'choose')]);
            if (e && (e.play || (e.item && D.playable(e.item)))) h.push(['▶', 'play']);
            if (e && (e.menu || e.item)) h.push(['≡', 'options']);
            if (c.letters && list.length > 12) h.push(['L1 R1', 'letter']);
            if (S.stack.length > 1 || (c.onBack)) h.push(['Back', '']);
            D.screenHints = () => D.hints(h);
            if (!(D.panel && D.panel.isOpen())) D.hints(h);
            // the backdrop after a rest (Decisions board), never in low motion
            clearTimeout(S.backdropTimer);
            back.classList.remove('on');
            const it = e && e.item;
            if (it && !D.reduced() && opts.backdrops !== false) {
                const tag = it.BackdropImageTags && it.BackdropImageTags[0];
                const pid = tag ? it.Id : (it.ParentBackdropItemId || it.SeriesId);
                const ptag = tag || (it.ParentBackdropImageTags && it.ParentBackdropImageTags[0]);
                if (pid && ptag) S.backdropTimer = setTimeout(() => {
                    if (!S.alive || S.entries[curIndex()] !== e) return;
                    back.style.backgroundImage = `url("${D.client().getScaledImageUrl(pid, { type: 'Backdrop', maxWidth: 1280, tag: ptag })}")`;
                    back.classList.add('on');
                }, 1500);
            }
            if (opts.onFocus) opts.onFocus(e, C);
        }
        function drawLetters() {
            letters.textContent = '';
            const c = cur();
            if (!c.letters || S.entries.length <= 12) { letters.hidden = true; return; }
            letters.hidden = false;
            const at = letterOf(S.entries[curIndex()]);
            const seen = [];
            for (const e of S.entries) { const l = letterOf(e); if (seen[seen.length - 1] !== l) seen.push(l); }
            for (const l of seen) {
                const b = el('div', 'td-letter' + (l === at ? ' on' : ''), l);
                b.addEventListener('click', () => { const k = S.entries.findIndex((e) => letterOf(e) === l); if (k >= 0) { setIndex(k); T.ctx.sound('navigate'); drawColumn(); } });
                letters.append(b);
            }
        }
        const letterOf = (e) => { const s = ((e && (e.letter || e.name)) || '').replace(/^(the|a|an)\s+/i, '').trim().charAt(0).toUpperCase(); return /[A-Z]/.test(s) ? s : '#'; };
        function drawEmpty() {
            empty.textContent = '';
            const c = cur();
            const none = !S.loading && !S.entries.length;
            empty.hidden = !none;
            if (!none) return;
            const em = c.empty || {};
            empty.append(D.svg(em.icon || c.icon || 'folder', 'td-empty-icon'));
            empty.append(el('div', 'td-empty-title', em.title || 'Nothing here yet'));
            if (em.text) empty.append(el('div', 'td-empty-text', em.text));
            if (em.way) {
                const w = D.focusable(el('button', 'td-empty-way', `${em.way.label} ›`));
                w.type = 'button';
                w.addEventListener('click', () => { T.ctx.sound('select'); em.way.go(); });
                empty.append(w);
                T.ctx.focus(w);
            }
            clock.extra.textContent = '';
            D.screenHints = () => D.hints(em.way ? [['OK', em.way.label.toLowerCase()], ['Back', '']] : [['Back', '']]);
            D.screenHints();
        }
        // loads the current column's entries (cached on the level until it is reopened)
        async function load(how) {
            const c = cur();
            const ticket = ++S.loading;
            if (!c.entries || c.reload) {
                for (const d of S.drawn.values()) d.remove();
                S.drawn.clear();
                S.entries = [];
                empty.hidden = true;
                rootEl.setAttribute('data-td-loading', '1');
                let list = [];
                try { list = (await c.load()) || []; } catch (e) { console.error('tide: load', e); list = []; }
                if (!S.alive || ticket !== S.loading || cur() !== c) return;
                c.entries = list;
                c.reload = false;
                if (c.focus == null) { const f = list.findIndex((x) => x.focusFirst); c.focus = f >= 0 ? f : 0; }
            }
            S.loading = 0;
            rootEl.removeAttribute('data-td-loading');
            S.entries = c.entries;
            for (const d of S.drawn.values()) d.remove();
            S.drawn.clear();
            col.className = 'td-col' + (how ? ` td-col-${how}` : '');
            void col.offsetWidth;
            drawColumn(how);
            drawEmpty();
            rootEl.setAttribute('data-td-ready', String(S.stack.length));
            save();
        }

        const C = {
            S, rootEl,
            level: () => cur(),
            entry: () => S.entries[curIndex()],
            depth: () => S.stack.length,
            redraw(how) {
                if (isBar()) S.barIndex = Math.max(0, Math.min(S.barIndex, top().bar.length - 1));
                rootEl.classList.toggle('td-in-bar', isBar());
                rootEl.classList.toggle('td-nested', !isBar());
                drawBar();
                drawTrail();
                if (opts.onLevel) opts.onLevel(cur(), C);
                return load(how);
            },
            step(dir) {
                if (S.loading || !S.entries.length) return false;
                const i = curIndex() + dir;
                if (i < 0 || i >= S.entries.length) { T.ctx.sound('error'); return true; }
                setIndex(i);
                T.ctx.sound('focus');
                drawColumn();
                save();
                return true;
            },
            jump(dir) {  // the shoulder buttons: the next or previous letter on a sorted list, else ten entries
                if (!S.entries.length) return false;
                const i = curIndex();
                let n = i;
                if (cur().letters) {
                    const l = letterOf(S.entries[i]);
                    if (dir > 0) { n = S.entries.findIndex((e, k) => k > i && letterOf(e) !== l); if (n < 0) n = S.entries.length - 1; }
                    else { let k = i - 1; while (k > 0 && letterOf(S.entries[k]) === l) k--; const pl = letterOf(S.entries[Math.max(0, k)]); while (k > 0 && letterOf(S.entries[k - 1]) === pl) k--; n = Math.max(0, k); }
                } else n = Math.max(0, Math.min(S.entries.length - 1, i + dir * 10));
                if (n === i) { T.ctx.sound('error'); return true; }
                setIndex(n);
                T.ctx.sound('navigate');
                drawColumn();
                save();
                return true;
            },
            category(i) {
                if (!isBar()) return false;
                const n = top().bar.length;
                if (i < 0 || i >= n) { T.ctx.sound('error'); return true; }
                S.barIndex = i;
                T.ctx.sound('navigate');
                C.redraw('cat');
                return true;
            },
            async push(level, fromEl) {
                if (!level) return;
                const lv = await level;
                if (!lv || !S.alive) return;
                // the folder's icon flies to the trail's nearest slot (visual continuity)
                const thumbEl = fromEl && fromEl.querySelector('.td-e-thumb');
                S.stack.push(lv);
                T.ctx.sound('select');
                C.redraw('in');
                const slot = trail.querySelector('.td-trail-step.near > :first-child');
                if (thumbEl && slot) {
                    slot.style.opacity = '0';
                    D.fly(thumbEl, slot.getBoundingClientRect(), 280, () => { slot.style.opacity = ''; });
                }
            },
            back(sound, quiet) {
                if (S.stack.length <= 1) return false;
                S.stack.pop();
                if (sound !== false) T.ctx.sound('back');
                if (!quiet) C.redraw('back');
                return true;
            },
            replaceTop(level) { S.stack[S.stack.length - 1] = level; return C.redraw(); },
            reload() { cur().reload = true; return load(); },
            activate(e, d) {
                if (!e) return;
                if (e.open) { C.push(e.open(), d); return; }
                if (e.go) { T.ctx.sound('select'); e.go(C, d); return; }
                if (e.item) { T.ctx.sound('select'); D.openItem(e.item, d); }
            },
            onAction(a) {
                if (a === 'up') return C.step(-1);
                if (a === 'down') return C.step(1);
                if (a === 'step_backward') return C.jump(-1);
                if (a === 'step_forward') return C.jump(1);
                if (a === 'left') {
                    if (isBar()) return C.category(S.barIndex - 1);
                    if (S.stack.length > 1) return C.back();
                    return true;
                }
                if (a === 'right') {
                    if (isBar()) return C.category(S.barIndex + 1);
                    const e = C.entry();
                    if (e && e.open) { C.push(e.open(), S.drawn.get(curIndex())); return true; }
                    if (e && e.details) { T.ctx.sound('select'); e.details(); return true; }
                    return true;
                }
                if (a === 'back') {
                    if (S.stack.length > 1) return C.back();
                    if (cur().onBack) return cur().onBack(C) !== false;
                    if (top().onBack) return top().onBack(C) !== false;
                    // the root of a screen: Back leaves it, to where you came from
                    if (opts.leave !== false) { T.ctx.sound('back'); if (history.length > 1) history.back(); else T.ctx.navigate('#/home'); return true; }
                    return false;
                }
                if (a === 'menu') {
                    const e = C.entry();
                    if (!e) return false;
                    if (e.menu) { e.menu(C); return true; }
                    if (e.item && D.itemMenu) { D.itemMenu(e.item, { column: C }); return true; }
                    return false;
                }
                if (a === 'play_pause' || a === 'playpause') {
                    const e = C.entry();
                    if (!e) return false;
                    if (e.play) { e.play(C); return true; }
                    if (e.item && D.playable(e.item)) { T.ctx.sound('select'); D.playItem(e.item, true); return true; }
                    return false;
                }
                return false;
            },
            stop() {
                S.alive = false;
                clearTimeout(S.backdropTimer);
                wave.stop();
                clock.stop();
                D.screenHints = null;
                D.hintsOff();
                save();
            }
        };
        // back on a screen kept in memory: its column again, refreshed (progress, watched marks), the same entry focused
        if (saved) { const c0 = cur(); if (c0) c0.reload = true; }
        D.currentColumn = C;
        D.goLevel = (lv) => { if (D.currentColumn && D.currentColumn.S.alive) D.currentColumn.push(lv); };
        C.redraw(saved ? null : 'first');
        return C;
    };

    // A screen that is one column stack: register(path, {name, root(params) -> level|bar, key?})
    D.columnScreen = (path, spec) => {
        let C = null;
        D.register(path, Object.assign({
            mount(root) {
                const r = spec.root(D.params());
                C = D.columns(root, { root: r, name: spec.name, key: spec.key ? spec.key(D.params()) : location.hash, fresh: spec.fresh, onFocus: spec.onFocus, onLevel: spec.onLevel, backdrops: spec.backdrops,
                    selfInTrail: spec.selfInTrail, leave: spec.leave });
                if (spec.mounted) spec.mounted(C, root);
            },
            unmount() { if (C) C.stop(); C = null; if (spec.unmounted) spec.unmounted(); },
            onAction(a) { return C ? C.onAction(a) : false; },
            onBack() { return C ? C.onAction('back') : false; }
        }, spec.beforeSignIn ? { beforeSignIn: true } : {}));
    };
})();
