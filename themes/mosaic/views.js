// Mosaic: the screens engine (PLAN 9.56; the "Mosaic Screens" canvas: LibMovies, LibLists, LibLiveTV, LibMore,
// DetailsMovie, DetailsSeries, DetailsMore, Settings, Motion). Every Mosaic screen is the target's grammar: the page's
// name top left, the account top right, slate panels over the sky, the focused row a lime bar, the hints bottom
// left. A screen is a stack of levels (data.js makes them); opening a folder or an item pushes one, Back pops it with
// the entry you left focused again.
//
//   level: {title, load() -> entries, letters, empty:{title, text, way:{label, go}}, focus, onBack(), sortable, query,
//           pane, details (an item's own screen: the deck), itemsLabel, countNote}
//   entry: {name, sub, line, art, shape, icon, initials, item, progress, played, open() -> level, go(C, el), play(),
//           menu(), letter, focusFirst, okLabel, row (a section label), asRow, cellName, cellSub, synthetic, muted}
//
// Browse (most screens): tabs on top (a bar's categories, or a level whose entries are all folders: a library's
// sections), the main panel (a poster grid when the entries are mostly posters or squares, else a list), an A-Z rail
// on long lists sorted by name, and the side panel describing the focused entry (a setting's description, an item's
// picture, facts and overview).
// Deck (an item's details, DetailsMovie board): the item's own panel in front (its picture, facts and actions), its
// other panels (seasons, episodes, songs, chapters, cast, more like this) receding to the right like the home's
// channel; ◀ ▶ step between panels in 370 ms, ▲ ▼ move inside one.
//
// Motion (Motion board, the six principles): grids turn pages in 450 ms toward the turn; tabs move the content 40 px
// toward the tab picked (220 ms); into a level the panels fly in from the right 40 ms apart (420 ms), Back reverses
// it (340 ms); the deck steps in 370 ms, fast at first; the side panel cross-fades 120 ms. Low motion: none of it.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinMosaic;
    if (!T || !D) return;
    const ui = T.ui;
    const el = D.el;
    D.memory = D.memory || new Map();
    D.fly = (from, to, ms, done) => { if (done) done(); };

    const letterOf = (e) => { const s = ((e && (e.letter || e.name)) || '').replace(/^(the|a|an)\s+/i, '').trim().charAt(0).toUpperCase(); return /[A-Z]/.test(s) ? s : '#'; };
    D.letterOf = letterOf;
    const isFolder = (e) => !!e && (e.asRow || (e.open && !e.item));
    const GRIDSHAPES = new Set(['poster', 'square', 'round']);
    const vh = () => window.innerHeight / 100;

    // ---- one entry, drawn as a tile (grids) or a row (lists) ----
    function thumb(e, cls) {
        const t = el('span', cls);
        if (e.art) t.style.backgroundImage = `url("${e.art}")`;
        else if (e.initials) { t.classList.add('ms-ini'); t.textContent = D.initials(e.initials); }
        else t.append(D.svg(e.icon || (e.item ? D.kindIcon(e.item.Type) : 'item')));
        if (e.shape === 'round') t.classList.add('round');
        return t;
    }
    function rightOf(e) {
        if (e.value != null) return e.value;
        const it = e.item;
        if (!it) return isFolder(e) ? '›' : '';
        if (it.Type === 'Audio' && it.RunTimeTicks) return D.clockTicks(it.RunTimeTicks);
        if (e.progress > 0 && e.progress < 1) return D.left(it);
        if (it.Type === 'Playlist' || it.Type === 'BoxSet') return it.ChildCount ? String(it.ChildCount) : '';
        if (it.RunTimeTicks && ['Movie', 'Episode', 'Video', 'MusicVideo'].includes(it.Type)) return D.ticks(it.RunTimeTicks);
        return '';
    }
    function tileEl(e, kind) {
        if (kind === 'card' || kind === 'action') return cardEl(e, kind);
        const b = D.focusable(el('button', 'ms-t ms-t-' + (e.shape || 'poster') + (e.muted ? ' muted' : '')));
        b.type = 'button';
        b.append(thumb(e, 'ms-t-art'));
        if (!e.art || e.shape === 'icon') b.append(el('span', 'ms-t-name', e.cellName || e.name || ''));
        if (e.progress > 0 && e.progress < 1) { const p = el('i', 'ms-prog'); const f = el('b'); f.style.width = `${Math.round(e.progress * 100)}%`; p.append(f); b.append(p); }
        if (e.played) b.append(el('span', 'ms-played', '✓'));
        b.setAttribute('aria-label', [e.name, e.sub].filter(Boolean).join(', '));
        b.orEntry = e;
        return b;
    }
    // Mosaic's two other tiles (the canvas's DetailsMovie and DetailsSeries boards): an item's own actions as white
    // tiles (an icon top right, the word bottom left, a value under it), and the strip's white cards (a picture on top,
    // the name, a line of facts, the overview).
    function cardEl(e, kind) {
        const b = D.focusable(el('button', `ms-t ms-${kind}` + (e.muted ? ' muted' : '') + (e.danger ? ' danger' : '')));
        b.type = 'button';
        if (kind === 'action') {
            b.append(D.svg(e.icon || 'item', 'ms-act-ic'));
            const tx = el('span', 'ms-act-tx');
            tx.append(el('span', 'ms-act-name', e.cellName || e.name || ''));
            const sub = e.cellSub != null ? e.cellSub : (e.sub || rightOf(e));
            if (sub) tx.append(el('span', 'ms-act-sub', sub));
            b.append(tx);
        } else {
            b.append(thumb(e, 'ms-card-art'));
            const tx = el('span', 'ms-card-tx');
            tx.append(el('span', 'ms-card-name', e.cellName || e.name || ''));
            const sub = e.cellSub != null ? e.cellSub : e.sub;
            if (sub) tx.append(el('span', 'ms-card-sub', sub));
            const line = e.line || (e.item && e.item.Overview) || '';
            if (line) tx.append(el('span', 'ms-card-line', line.replace(/\s+/g, ' ')));
            b.append(tx);
            if (e.played) b.append(el('span', 'ms-played', '✓'));
        }
        if (e.progress > 0 && e.progress < 1) { const p = el('i', 'ms-prog'); const f = el('b'); f.style.width = `${Math.round(e.progress * 100)}%`; p.append(f); b.append(p); }
        b.setAttribute('aria-label', [e.name, e.sub].filter(Boolean).join(', '));
        b.orEntry = e;
        return b;
    }
    function rowEl(e) {
        const b = D.focusable(el('button', 'ms-li' + (e.muted ? ' muted' : '') + (e.danger ? ' danger' : '')));
        b.type = 'button';
        const two = !!(e.cellSub != null ? e.cellSub : e.sub);
        if (two) b.classList.add('two');
        if (e.art || e.initials || e.icon || e.item) b.append(thumb(e, 'ms-li-th' + (e.shape === 'wide' ? ' wide' : '')));
        const tx = el('span', 'ms-li-tx');
        tx.append(el('span', 'ms-li-name', e.cellName || e.name || ''));
        if (two) tx.append(el('span', 'ms-li-sub', e.cellSub != null ? e.cellSub : e.sub));
        b.append(tx);
        const r = rightOf(e);
        if (e.played) b.append(el('span', 'ms-li-r', '✓'));
        else if (r) b.append(el('span', 'ms-li-r', r));
        if (e.progress > 0 && e.progress < 1) { const p = el('i', 'ms-prog'); const f = el('b'); f.style.width = `${Math.round(e.progress * 100)}%`; p.append(f); b.append(p); }
        b.setAttribute('aria-label', [e.name, e.sub].filter(Boolean).join(', '));
        b.orEntry = e;
        return b;
    }

    // ---- a view: a grid or a list of entries in a box, paged, with its own focus ----
    // V.move(dir) -> true (moved), or 'up' | 'down' | 'left' | 'right' (an edge the caller handles)
    function makeView(box, entries, o) {
        const V = { box, entries, at: 0, page: 0, mode: o.mode, alive: true };
        const sections = o.mode === 'list' && o.sections !== false && entries.some((e) => e.row);
        const inner = el('div', 'ms-view ms-view-' + o.mode);
        const foot = el('div', 'ms-foot');
        const count = el('span', 'ms-count');
        const marks = el('span', 'ms-marks');
        foot.append(count, marks);
        box.append(inner, foot);
        let rail = null, railAt = -1;
        const letters = o.letters && entries.length > 24 ? [...new Set(entries.filter((e) => e.item).map(letterOf))] : [];
        if (letters.length > 3) {
            rail = el('div', 'ms-az');
            box.classList.add('has-az');
            for (const L of letters) {
                const b = D.focusable(el('button', 'ms-az-l', L));
                b.type = 'button';
                b.setAttribute('aria-label', `Jump to ${L}`);
                b.addEventListener('click', () => { V.jumpLetter(L); T.ctx.sound('navigate'); });
                rail.append(b);
            }
            box.append(rail);
        }
        function geom() {
            const r = inner.getBoundingClientRect();
            if (o.mode === 'grid' && (o.kind === 'action' || o.kind === 'card')) {
                const gap = 0.56 * vh();
                const tw = (o.kind === 'action' ? 24.4 : 25.8) * vh();
                const th = o.kind === 'action' ? 12.4 * vh() : r.height;
                const cols = o.kind === 'action' ? 2 : Math.max(1, Math.floor((r.width + gap) / (tw + gap)));
                const rows = o.kind === 'action' ? Math.max(1, Math.floor((r.height + gap) / (th + gap))) : 1;
                inner.style.setProperty('--ms-cols', String(cols));
                inner.style.setProperty('--ms-tw', `${tw}px`);
                inner.style.setProperty('--ms-th', `${th}px`);
                inner.classList.add('ms-' + o.kind + 's');
                return { cols, rows, per: cols * rows };
            }
            if (o.mode === 'grid') {
                const sq = entries.filter((e) => e.shape === 'square' || e.shape === 'round').length > entries.length / 2;
                const th = (o.tileH || 25.4) * vh();
                const tw = sq ? th * 0.82 : th * 0.667;
                const gap = 0.56 * vh();
                const cols = Math.max(2, Math.floor((r.width + gap) / (tw + gap)));
                const rows = Math.max(1, Math.floor((r.height + gap) / ((sq ? tw : th) + gap)));
                inner.style.setProperty('--ms-cols', String(cols));
                inner.style.setProperty('--ms-tw', `${tw}px`);
                inner.style.setProperty('--ms-th', `${sq ? tw : th}px`);
                return { cols, rows, per: cols * rows };
            }
            const rh = (o.rowH || (entries.some((e) => e.sub || e.cellSub) ? 5.6 : 3.9)) * vh();
            let rows = Math.max(3, Math.floor(r.height / rh));
            // section labels take about two thirds of a row each: fewer rows a page when the list has them
            if (sections) rows = Math.max(3, rows - Math.ceil(Math.min(new Set(entries.map((e) => e.row)).size, rows / 2) * 0.7));
            inner.style.setProperty('--ms-rh', `${rh}px`);
            // a scrolling list (an item's own actions): every row is in the page, the focused one kept in view
            if (o.scroll) { inner.classList.add('ms-scroll'); return { cols: 1, rows, per: Math.max(1, entries.length) }; }
            return { cols: 1, rows, per: rows };
        }
        V.g = geom();
        let els = [];
        function draw(how) {
            V.g = geom();
            const per = V.g.per;
            V.page = Math.floor(V.at / per);
            const from = V.page * per;
            inner.textContent = '';
            els = [];
            let lastRow = null;
            for (let k = from; k < Math.min(entries.length, from + per); k++) {
                const e = entries[k];
                if (sections && e.row && e.row !== lastRow) { inner.append(el('div', 'ms-sec', e.row)); }
                lastRow = e.row;
                const b = o.mode === 'grid' ? tileEl(e, o.kind) : rowEl(e);
                b.addEventListener('click', () => { V.at = k; o.activate(e, b); });
                b.addEventListener('mouseenter', () => { if (document.documentElement.getAttribute('data-ms-input') !== 'pointer' || V.at === k) return; V.at = k; V.focus(true); });
                inner.append(b);
                els.push(b);
            }
            const pages = Math.max(1, Math.ceil(entries.length / per));
            count.textContent = entries.length ? `${V.at + 1} of ${entries.length.toLocaleString()}` : '';
            marks.textContent = pages > 1 ? `page ${V.page + 1} of ${pages}` : '';
            box.classList.toggle('more-up', V.page > 0);
            box.classList.toggle('more-down', V.page < pages - 1);
            if (how) { inner.classList.remove('ms-turn-l', 'ms-turn-r'); void inner.offsetWidth; inner.classList.add(how === 'next' ? 'ms-turn-r' : 'ms-turn-l'); }
            if (rail) {
                const L = entries[V.at] ? letterOf(entries[V.at]) : '';
                [...rail.children].forEach((b) => b.classList.toggle('on', b.textContent === L));
            }
        }
        V.draw = draw;
        V.current = () => entries[V.at] || null;
        V.el = () => els[V.at - V.page * V.g.per] || null;
        V.focus = (quiet) => {
            const b = V.el();
            const busy = (D.panel && D.panel.isOpen()) || (ui.keyboard && ui.keyboard.isOpen && ui.keyboard.isOpen());
            if (b && !busy) T.ctx.focus(b);
            if (b && o.scroll) b.scrollIntoView({ block: 'nearest', behavior: D.reduced() ? 'auto' : 'smooth' });
            if (!quiet) T.ctx.sound('focus');
            if (rail) { const L = entries[V.at] ? letterOf(entries[V.at]) : ''; [...rail.children].forEach((x) => x.classList.toggle('on', x.textContent === L)); }
            count.textContent = entries.length ? `${V.at + 1} of ${entries.length.toLocaleString()}` : '';
            if (o.onFocus) o.onFocus(V.current());
        };
        V.set = (i, how) => {
            const n = Math.max(0, Math.min(entries.length - 1, i));
            const page = Math.floor(n / V.g.per);
            V.at = n;
            if (page !== V.page) draw(how || (page > V.page ? 'next' : 'prev'));
            V.focus(true);
        };
        V.jumpLetter = (L) => { const k = entries.findIndex((e) => e.item && letterOf(e) === L); if (k >= 0) V.set(k); };
        V.inRail = () => railAt >= 0;
        V.move = (dir) => {
            if (!entries.length) return dir;
            if (railAt >= 0) {
                if (dir === 'left') { railAt = -1; V.focus(); return true; }
                if (dir === 'right') return 'right';
                const n = railAt + (dir === 'down' ? 1 : -1);
                if (n < 0 || n >= rail.children.length) return dir;
                railAt = n; T.ctx.focus(rail.children[n]); V.jumpLetter(rail.children[n].textContent); T.ctx.focus(rail.children[n]); T.ctx.sound('focus');
                return true;
            }
            const { cols, per } = V.g;
            const k = V.at, inPage = k - V.page * per, col = inPage % cols;
            if (o.mode === 'list') {
                if (dir === 'up') { if (k === 0) return 'up'; V.set(k - 1, 'prev'); T.ctx.sound('focus'); return true; }
                if (dir === 'down') { if (k >= entries.length - 1) return 'down'; V.set(k + 1, 'next'); T.ctx.sound('focus'); return true; }
                if (dir === 'right' && rail) { const L = letterOf(entries[k]); railAt = Math.max(0, [...rail.children].findIndex((b) => b.textContent === L)); T.ctx.focus(rail.children[railAt]); T.ctx.sound('focus'); return true; }
                return dir;
            }
            if (dir === 'left') {
                if (col > 0) { V.set(k - 1); T.ctx.sound('focus'); return true; }
                if (V.page === 0) return 'left';
                V.set(Math.min(entries.length - 1, k - per + cols - 1), 'prev'); T.ctx.sound('navigate'); return true;  // the page before, same row
            }
            if (dir === 'right') {
                if (col < cols - 1 && k + 1 < entries.length) { V.set(k + 1); T.ctx.sound('focus'); return true; }
                if (rail) { const L = letterOf(entries[k]); railAt = Math.max(0, [...rail.children].findIndex((b) => b.textContent === L)); T.ctx.focus(rail.children[railAt]); T.ctx.sound('focus'); return true; }
                if ((V.page + 1) * per >= entries.length) return 'right';
                V.set(Math.min(entries.length - 1, k + per - cols + 1), 'next'); T.ctx.sound('navigate'); return true;  // the page after, same row
            }
            if (dir === 'up') { if (k - cols < 0) return 'up'; V.set(k - cols, 'prev'); T.ctx.sound('focus'); return true; }
            if (dir === 'down') {
                if (k + cols >= entries.length) { const last = entries.length - 1; if (Math.floor(last / cols) > Math.floor(k / cols)) { V.set(last, 'next'); T.ctx.sound('focus'); return true; } return 'down'; }
                V.set(k + cols, 'next'); T.ctx.sound('focus'); return true;
            }
            return dir;
        };
        V.pageBy = (dir) => {
            const n = V.at + dir * V.g.per;
            if (n < 0 && V.at === 0) return false;
            if (n >= entries.length && V.page === Math.floor((entries.length - 1) / V.g.per)) return false;
            V.set(Math.max(0, Math.min(entries.length - 1, n)), dir > 0 ? 'next' : 'prev');
            T.ctx.sound('navigate');
            return true;
        };
        V.letterBy = (dir) => {
            if (!letters.length) return false;
            const L = letterOf(entries[V.at]);
            const i = letters.indexOf(L) + dir;
            if (i < 0 || i >= letters.length) return false;
            V.jumpLetter(letters[i]); T.ctx.sound('navigate');
            return true;
        };
        V.sync = (f) => {
            if (rail && rail.contains(f)) { railAt = [...rail.children].indexOf(f); return true; }
            const i = els.indexOf(f);
            if (i >= 0) { V.at = V.page * V.g.per + i; railAt = -1; return true; }
            return false;
        };
        const ro = new ResizeObserver(() => { if (!V.alive || !box.isConnected) return; const old = V.g.per; const g = geom(); if (g.per !== old) { draw(); V.focus(true); } });
        ro.observe(inner);
        V.stop = () => { V.alive = false; ro.disconnect(); };
        draw();
        return V;
    }
    D.makeView = makeView;
    const modeOf = (entries, lv) => {
        if (lv.mode) return lv.mode;
        const items = entries.filter((e) => e.item && !e.synthetic);
        if (items.length < 3) return 'list';
        const g = items.filter((e) => GRIDSHAPES.has(e.shape) && e.art !== '' && e.item.Type !== 'Audio').length;
        return g >= items.length * 0.6 ? 'grid' : 'list';
    };

    // ---- the side panel: what the focused entry is ----
    function drawSide(side, e, lv) {
        side.textContent = '';
        side.classList.remove('ms-fresh'); void side.offsetWidth; side.classList.add('ms-fresh');
        const it = e && e.item && !e.synthetic ? e.item : (lv.pane || null);
        const pic = el('span', 'ms-side-art');
        const art = (e && e.art) || (it ? D.artOf(it, 400) : '');
        const shape = (e && e.shape) || 'poster';
        pic.classList.add(shape === 'wide' ? 'wide' : shape === 'square' || shape === 'round' ? 'square' : 'poster');
        if (art) pic.style.backgroundImage = `url("${art}")`;
        else if (e && e.initials) { pic.classList.add('ms-ini'); pic.textContent = D.initials(e.initials); }
        else pic.append(D.svg((e && e.icon) || (it ? D.kindIcon(it.Type) : lv.icon || 'item')));
        const tx = el('div', 'ms-side-tx');
        tx.append(el('div', 'ms-side-name', (e && e.name) || (it && it.Name) || lv.title || ''));
        const facts = it ? D.subOf(it, {}) : '';
        const sub = (e && e.sub) || facts;
        if (sub) tx.append(el('div', 'ms-side-facts', sub));
        if (it && (it.Genres || []).length) { const ch = el('div', 'ms-chips'); for (const g of it.Genres.slice(0, 3)) ch.append(el('span', 'ms-chip', g)); tx.append(ch); }
        const line = (e && e.line) || (it && it.Overview) || '';
        if (line) tx.append(el('div', 'ms-side-line', String(line).replace(/\s+/g, ' ')));
        const ud = it && it.UserData;
        if (ud && (ud.IsFavorite || ud.Played || ud.PlayedPercentage)) tx.append(el('div', 'ms-side-marks', [ud.PlayedPercentage ? `▮ ${Math.round(ud.PlayedPercentage)}% watched` : '', ud.Played ? '✓ Watched' : '', ud.IsFavorite ? '♥ Favourite' : ''].filter(Boolean).join(' · ')));
        side.append(pic, tx);
        side.classList.toggle('no-art', !art && !(e && e.initials) && !it);
    }

    // ---- the screen ----
    // D.columns(root, {root: level | {bar: [levels], at, onBack}, key, name, fresh, leave, nav, onFocus, onLevel})
    D.columns = function (rootEl, opts) {
        const key = opts.key || location.hash.split('?')[0];
        const saved = opts.fresh ? null : D.memory.get(key);
        const S = { key, rootEl, stack: saved ? saved.stack : [opts.root], entries: [], loading: 0, alive: true, barIndex: saved ? saved.barIndex : (opts.root.at || 0), zone: 'main', tabAt: 0 };
        rootEl.setAttribute('data-ms-screen', opts.name || 'browse');
        rootEl.classList.add('ms-screen');
        const ttl = el('div', 'ms-ttl');
        const ttlName = el('div', 'ms-ttl-name');
        const ttlPath = el('div', 'ms-ttl-path');
        ttl.append(ttlName, ttlPath);
        const tabs = el('div', 'ms-tabs');
        tabs.setAttribute('role', 'tablist');
        const stage = el('div', 'ms-stage');
        const mark = el('div', 'ms-mark');
        rootEl.append(ttl, tabs, stage, mark);
        const clock = D.clock(rootEl);
        D.pointerNav(rootEl, () => C.back(true), opts.nav);
        stage.addEventListener('wheel', (ev) => { ev.preventDefault(); C.onAction(ev.deltaY > 0 ? 'down' : 'up'); }, { passive: false });

        const top = () => S.stack[S.stack.length - 1];
        const isBar = () => !!top().bar;
        const cur = () => (isBar() ? top().bar[Math.max(0, Math.min(S.barIndex, top().bar.length - 1))] : top());
        function save() { D.memory.set(key, { stack: S.stack, barIndex: S.barIndex }); }

        // the level shown in the panels: a level marked tabs (a library's root) whose entries are all folders shows the
        // chosen folder's level under its tabs
        const folderTabs = (lv) => !!lv.tabs && !lv.details && lv.entries && lv.entries.length >= 2 && lv.entries.every((e) => e.open && !e.item && !e.asRow);
        let V = null;          // the main view (browse) or the current deck panel's view
        let deck = null;       // {panels:[{el, title, view, entries, level}], at}
        let tabEls = [];
        let content = null;    // the level whose entries are in the main panel
        let tabLevels = null;  // folder tabs' levels (loaded on demand)

        function drawTabs(list, at) {
            tabs.textContent = '';
            tabEls = [];
            (list || []).forEach((t, i) => {
                const b = D.focusable(el('button', 'ms-tab' + (i === at ? ' on' : ''), t.label));
                b.type = 'button';
                b.setAttribute('role', 'tab');
                b.setAttribute('aria-selected', i === at ? 'true' : 'false');
                b.addEventListener('click', () => { T.ctx.sound('navigate'); t.go(); });
                tabs.append(b);
                tabEls.push(b);
            });
            S.tabAt = at || 0;
            tabs.hidden = !tabEls.length;
            rootEl.classList.toggle('ms-has-tabs', !!tabEls.length);
        }
        D.redrawTabs = () => {};
        function drawTitle() {
            const lv = cur();
            const names = S.stack.map((x) => (x.bar ? x.bar[S.barIndex].label : x.title)).filter(Boolean);
            ttlName.textContent = (content && content !== lv && !folderTabs(lv) ? content.title : null) || lv.headTitle || lv.title || (isBar() ? cur().label : '') || '';
            ttlPath.textContent = names.length > 1 ? names.slice(0, -1).join(' › ') : (lv.countNote || '');
        }
        function hintsFor(e) {
            const h = [];
            if (S.zone === 'tabs') { h.push(['OK', 'open'], ['◀ ▶', 'tab'], ['▼', 'into the list']); h.push(['Back', '']); D.screenHints = () => D.hints(h); if (!(D.panel && D.panel.isOpen())) D.hints(h); return; }
            if (e && (e.open || e.go || (e.item && !e.synthetic))) h.push(['OK', e.okLabel || (e.open ? 'open' : (e.item ? (e.item.Type === 'TvChannel' ? 'watch' : 'details') : 'select'))]);
            if (e && !e.synthetic && (e.play || (e.item && D.playable(e.item)))) h.push(['▶', 'play']);
            if (e && !e.synthetic && (e.menu || e.item)) h.push(['≡', 'options']);
            else if (content && content.sortable) h.push(['≡', 'sort and filter']);
            if (deck && deck.panels.length > 1) h.push(['◀ ▶', 'panels']);
            if (tabEls.length) h.push(['L1 R1', 'sections']);
            else if (V && V.letterBy && content && content.letters && S.entries.length > 24) h.push(['L1 R1', 'letter']);
            h.push(['Back', '']);
            D.screenHints = () => D.hints(h);
            if (!(D.panel && D.panel.isOpen())) D.hints(h);
        }

        // ---- browse ----
        let side = null;
        function browse(lv, entries, how) {
            stage.textContent = '';
            stage.className = 'ms-stage ms-browse';
            deck = null;
            const main = el('div', 'ms-p ms-main');
            side = el('div', 'ms-p ms-side');
            stage.append(main, side);
            const mode = modeOf(entries, lv);
            main.classList.add(mode === 'grid' ? 'is-grid' : 'is-list');
            rootEl.setAttribute('data-ms-mode', mode);
            if (V) V.stop();
            if (!entries.length) { V = null; drawEmpty(lv, main); drawSide(side, null, lv); return; }
            V = makeView(main, entries, { mode, letters: lv.letters, activate: (e, b) => C.activate(e, b), onFocus: (e) => { drawSide(side, e, lv); hintsFor(e); if (opts.onFocus) opts.onFocus(e, C); rootEl.setAttribute('data-ms-index', String(V ? V.at : 0)); } });
            const p = lv.pos || 0;
            V.set(Math.max(0, Math.min(entries.length - 1, typeof p === 'number' ? p : 0)), 'none');
            if (how && how !== 'none') { stage.classList.remove('ms-in', 'ms-back', 'ms-first'); void stage.offsetWidth; stage.classList.add(`ms-${how}`); }
        }
        function drawEmpty(lv, main) {
            const em = Object.assign({}, lv.empty || {});
            if (!em.way) em.way = S.stack.length > 1 ? { label: 'Go back', go: () => C.back() } : { label: 'Go back', go: () => { if (history.length > 1) history.back(); else T.ctx.navigate('#/home'); } };
            const box = el('div', 'ms-empty');
            box.append(el('span', 'ms-empty-pic'), el('div', 'ms-empty-title', em.title || 'Nothing here yet'));
            if (em.text) box.append(el('div', 'ms-empty-text', em.text));
            const w = D.focusable(el('button', 'ms-btn on', em.way.label));
            w.type = 'button';
            w.addEventListener('click', () => { T.ctx.sound('select'); em.way.go(); });
            box.append(w);
            main.append(box);
            if (S.zone !== 'tabs') T.ctx.focus(w);
            D.screenHints = () => D.hints([['OK', em.way.label.toLowerCase()], ['Back', '']]);
            if (!(D.panel && D.panel.isOpen())) D.screenHints();
        }

        // ---- deck (an item's details) ----
        function deckPanels(lv, entries) {
            const front = [], panels = [], items = [];
            let seasons = null;
            for (const e of entries) {
                if (e.asRow && e.item && e.item.Type === 'Season') { panels.push({ title: e.item.Name || e.name, entry: e, focusFirst: !seasons && ((e.item.UserData || {}).UnplayedItemCount > 0) }); seasons = seasons || true; continue; }
                if (isFolder(e)) { panels.push({ title: e.name, entry: e }); continue; }
                if (e.item && !/^Next up/.test(e.name || '')) { items.push(e); continue; }
                front.push(e);
            }
            if (items.length) panels.unshift({ title: lv.itemsLabel || 'More', entries: items });
            return [{ title: 'overview', front: true, entries: front }].concat(panels);
        }
        function deckOpen(lv, entries, how) {
            stage.textContent = '';
            stage.className = 'ms-stage ms-deck';
            rootEl.setAttribute('data-ms-mode', 'deck');
            if (V) V.stop();
            V = null;
            side = null;
            const it = lv.pane;
            if (it) {
                const bd = D.client() && it.BackdropImageTags && it.BackdropImageTags[0] ? D.client().getScaledImageUrl(it.Id, { type: 'Backdrop', maxWidth: 1280, tag: it.BackdropImageTags[0] }) : '';
                const g = el('div', 'ms-deck-bd');
                if (bd) g.style.backgroundImage = `url("${bd}")`;
                stage.append(g);
            }
            deck = { panels: deckPanels(lv, entries).map((p) => Object.assign(p, { el: null, view: null })), at: Math.min(lv.deckAt || 0, 99) };
            deck.at = Math.max(0, Math.min(deck.panels.length - 1, deck.at));
            deck.panels.forEach((p, i) => {
                const pe = el('div', 'ms-p ms-dp' + (p.front ? ' front' : ''));
                pe.style.setProperty('--ms-i', String(i));
                pe.addEventListener('click', (ev) => { if (deck && deck.at !== i && !ev.target.closest('.ms-li,.ms-t,.ms-btn,.ms-tab')) { deckGo(i); } }, true);
                if (p.front) {
                    const head = el('div', 'ms-dp-head');
                    const pic = el('span', 'ms-dp-art' + (lv.round ? ' round' : ''));
                    if (lv.poster || lv.art) pic.style.backgroundImage = `url("${lv.poster || lv.art}")`;
                    else if (lv.initials) { pic.classList.add('ms-ini'); pic.textContent = D.initials(lv.initials); }
                    else pic.append(D.svg(lv.icon || 'item'));
                    const tx = el('div', 'ms-dp-tx');
                    tx.append(el('div', 'ms-dp-name', lv.title || ''));
                    if (lv.paneSub) tx.append(el('div', 'ms-dp-facts', lv.paneSub));
                    if (it && (it.Genres || []).length) { const ch = el('div', 'ms-chips'); for (const g of it.Genres.slice(0, 3)) ch.append(el('span', 'ms-chip', g)); tx.append(ch); }
                    if (it && it.Overview) tx.append(el('div', 'ms-dp-line', it.Overview.replace(/\s+/g, ' ')));
                    head.append(pic, tx);
                    pe.append(head);
                } else {
                    pe.append(el('div', 'ms-dp-title', p.title || ''));
                }
                const body = el('div', 'ms-dp-body');
                pe.append(body);
                stage.append(pe);
                p.el = pe;
                p.body = body;
            });
            const cnt = el('div', 'ms-deck-count');
            const heads = el('div', 'ms-dk-pivot');
            const row = el('div', 'ms-dk-heads');
            deck.panels.forEach((p, i) => {
                const h = el('button', 'ms-dk-head', (p.title || '').toLowerCase());
                h.type = 'button';
                h.tabIndex = -1;
                h.addEventListener('click', () => deckGo(i));
                row.append(h);
            });
            heads.append(row);
            const name = el('div', 'ms-dk-name', lv.title || '');
            if (lv.paneSub) name.append(el('small', '', lv.paneSub));
            stage.append(name, heads, cnt);
            deck.count = cnt;
            deck.heads = row;
            deck.panels.forEach((p, i) => { if ((i - deck.at <= 3 && i - deck.at >= -1) || p.front) fillPanel(p); });
            place(how);
            focusDeck(true);
        }
        async function fillPanel(p, seasonAt) {
            if (p.filled && seasonAt == null) return;
            p.filled = true;
            let entries = p.entries;
            if (p.seasons) {
                const si = seasonAt != null ? seasonAt : (p.sAt != null ? p.sAt : Math.max(0, p.seasons.findIndex((s) => s.focusFirst || ((s.item.UserData || {}).UnplayedItemCount > 0))));
                p.sAt = si;
                if (!p.tabsEl) {
                    p.tabsEl = el('div', 'ms-dp-tabs');
                    p.el.insertBefore(p.tabsEl, p.body);
                }
                p.tabsEl.textContent = '';
                p.seasons.forEach((s, k) => {
                    const b = el('button', 'ms-tab' + (k === si ? ' on' : ''), s.item.Name || s.name);
                    b.type = 'button';
                    b.tabIndex = -1;
                    b.addEventListener('click', () => { T.ctx.sound('navigate'); fillPanel(p, k).then(() => { if (deck && deck.panels[deck.at] === p) focusDeck(true); }); });
                    p.tabsEl.append(b);
                });
                const lvS = await p.seasons[si].open();
                p.level = lvS;
                try { entries = (await lvS.load()) || []; } catch (e) { entries = []; }
                p.focusAt = Math.max(0, entries.findIndex((e) => e.focusFirst));
            } else if (p.entry) {
                let lvP = null;
                try { lvP = await p.entry.open(); } catch (e) { lvP = null; }
                p.level = lvP;
                try { entries = lvP ? ((lvP.entries && !lvP.reload ? lvP.entries : await lvP.load(C)) || []) : []; } catch (e) { entries = []; }
                if (lvP) lvP.entries = entries;
                p.focusAt = Math.max(0, entries.findIndex((e) => e.focusFirst));
            }
            if (!S.alive || !deck || !deck.panels.includes(p)) return;
            p.entries = entries;
            if (p.view) p.view.stop();
            p.body.textContent = '';
            if (!entries.length) {
                p.body.append(el('div', 'ms-empty-text', (p.level && p.level.empty && p.level.empty.title) || 'Nothing here'));
                p.view = null;
                // an empty section leaves the pivot (the target shows only sections with something in them)
                if (!p.front) {
                    p.empty = true;
                    const i = deck.panels.indexOf(p);
                    if (deck.heads && deck.heads.children[i]) deck.heads.children[i].hidden = true;
                    if (deck.at === i) { deck.at = 0; place(); focusDeck(true); }
                }
                return;
            }
            // the overview's actions as white tiles two across; every other section a strip of white cards
            p.view = makeView(p.body, entries, { mode: 'grid', kind: p.front ? 'action' : 'card', letters: false, activate: (e, b) => { deckGo(deck.panels.indexOf(p), true); C.activate(e, b); },
                onFocus: (e) => { hintsFor(e); if (opts.onFocus) opts.onFocus(e, C); } });
            const ff = p.front ? Math.max(0, entries.findIndex((e) => e.focusFirst)) : (p.focusAt || 0);
            p.view.at = Math.max(0, Math.min(entries.length - 1, p.memo != null ? p.memo : ff));
            p.view.draw();
        }
        function place(how) {
            const n = deck.panels.length;
            deck.panels.forEach((p, i) => {
                const d = i - deck.at;
                p.el.style.setProperty('--ms-d', String(d));
                p.el.classList.toggle('cur', d === 0);
                p.el.classList.toggle('gone', d < 0 || d > 3);
                p.el.style.zIndex = String(50 - Math.abs(d));
            });
            deck.count.textContent = '';
            if (deck.heads) {
                const hs = [...deck.heads.children];
                hs.forEach((h, k) => h.classList.toggle('on', k === deck.at));
                const off = hs[deck.at] ? hs[deck.at].offsetLeft - (hs[0] ? hs[0].offsetLeft : 0) : 0;
                deck.heads.style.transform = `translateX(${-off}px)`;
            }
            rootEl.setAttribute('data-ms-panel', String(deck.at));
            if (how && how !== 'none') { stage.classList.remove('ms-in', 'ms-back', 'ms-first'); void stage.offsetWidth; stage.classList.add(`ms-${how}`); }
        }
        function focusDeck(quiet) {
            const p = deck.panels[deck.at];
            cur().deckAt = deck.at;
            if (!p.filled) fillPanel(p).then(() => { if (deck && deck.panels[deck.at] === p) focusDeck(true); });
            V = p.view;
            if (V) { V.draw(); V.focus(quiet); } else hintsFor(null);
            for (const q of deck.panels.slice(Math.max(0, deck.at - 1), deck.at + 4)) if (q && !q.filled) fillPanel(q);
        }
        function deckGo(i, quiet) {
            if (deck && deck.panels[i] && deck.panels[i].empty) { const d = i > deck.at ? 1 : -1; let k = i; while (deck.panels[k] && deck.panels[k].empty) k += d; i = k; }
            if (!deck || i < 0 || i >= deck.panels.length) return false;
            const p0 = deck.panels[deck.at];
            if (p0.view) p0.memo = p0.view.at;
            if (i === deck.at) return true;
            deck.at = i;
            place();
            if (!quiet) T.ctx.sound('navigate');
            focusDeck(true);
            return true;
        }

        // ---- loading and drawing a level ----
        async function show(how) {
            const lv = cur();
            const ticket = ++S.loading;
            rootEl.setAttribute('data-ms-loading', '1');
            if (!lv.entries || lv.reload) {
                let list = [];
                try { list = (await lv.load(C)) || []; } catch (e) { console.error('mosaic: load', e); list = []; }
                if (!S.alive || ticket !== S.loading || cur() !== lv) return;
                lv.entries = list;
                lv.reload = false;
                if (lv.focus != null) { lv.pos = lv.focus; lv.focus = null; } else if (lv.pos == null) { const k = list.findIndex((x) => x.focusFirst); lv.pos = k >= 0 ? k : 0; }
            }
            // a level of folders: its folders are the tabs, the chosen one's level fills the panels
            content = lv;
            let entries = lv.entries;
            if (isBar()) drawTabs(top().bar.map((b, i) => ({ label: b.label || b.title, go: () => C.category(i) })), S.barIndex);
            else if (folderTabs(lv)) {
                if (lv.tabAt == null) { const k = lv.entries.findIndex((e) => /^All /.test(e.name || '')); lv.tabAt = k >= 0 ? k : 0; }
                if (!lv.tabLevels) lv.tabLevels = [];
                const i = lv.tabAt;
                drawTabs(lv.entries.map((e, k) => ({ label: e.name, go: () => C.tab(k) })), i);
                let sub = lv.tabLevels[i];
                if (!sub) { try { sub = await lv.entries[i].open(); } catch (e) { sub = null; } lv.tabLevels[i] = sub; }
                if (!S.alive || ticket !== S.loading || cur() !== lv) return;
                content = sub || { title: lv.entries[i].name, entries: [] };
                if (!content.entries || content.reload) {
                    let list = [];
                    try { list = (await content.load(C)) || []; } catch (e) { list = []; }
                    if (!S.alive || ticket !== S.loading || cur() !== lv) return;
                    content.entries = list;
                    content.reload = false;
                    if (content.focus != null) { content.pos = content.focus; content.focus = null; } else if (content.pos == null) { const k = list.findIndex((x) => x.focusFirst); content.pos = k >= 0 ? k : 0; }
                }
                entries = content.entries;
            } else drawTabs([], 0);
            S.loading = 0;
            rootEl.removeAttribute('data-ms-loading');
            S.entries = entries;
            drawTitle();
            if (opts.onLevel) opts.onLevel(lv, C);
            if (lv.details) deckOpen(lv, entries, how);
            else browse(content, entries, how);
            if (S.zone === 'tabs' && tabEls.length) focusTab(S.tabAt, true);
            else S.zone = 'main';
            rootEl.setAttribute('data-ms-ready', String(S.stack.length));
            rootEl.setAttribute('data-ms-count', String(entries.length));
            save();
        }
        function focusTab(i, quiet) {
            if (!tabEls.length) return false;
            S.tabAt = Math.max(0, Math.min(tabEls.length - 1, i));
            S.zone = 'tabs';
            T.ctx.focus(tabEls[S.tabAt]);
            if (!quiet) T.ctx.sound('focus');
            hintsFor(null);
            return true;
        }
        function sync() {
            const f = T.ctx.focused && T.ctx.focused();
            if (!f) return;
            const ti = tabEls.indexOf(f);
            if (ti >= 0) { S.zone = 'tabs'; S.tabAt = ti; return; }
            if (deck) {
                const i = deck.panels.findIndex((p) => p.el && p.el.contains(f));
                if (i >= 0 && i !== deck.at) { deck.at = i; place(); V = deck.panels[i].view; }
            }
            if (V && V.sync(f)) S.zone = 'main';
        }
        function remember() { if (V && content && !deck) content.pos = V.at; }

        const C = {
            S, rootEl,
            level: () => content || cur(),
            entry: () => (S.zone === 'main' && V ? V.current() : null),
            depth: () => S.stack.length,
            redraw(how) { if (isBar()) S.barIndex = Math.max(0, Math.min(S.barIndex, top().bar.length - 1)); return show(how); },
            category(i) {
                if (!isBar()) return false;
                if (i < 0 || i >= top().bar.length) { T.ctx.sound('error'); return true; }
                remember();
                const dir = i > S.barIndex ? 'r' : 'l';
                S.barIndex = i;
                T.ctx.sound('navigate');
                const z = S.zone;
                C.redraw('none').then(() => { stage.classList.remove('ms-tab-l', 'ms-tab-r'); void stage.offsetWidth; stage.classList.add(`ms-tab-${dir}`); if (z === 'tabs') focusTab(i, true); });
                return true;
            },
            tab(i) {  // a folder level's tabs
                const lv = cur();
                if (!folderTabs(lv)) return C.category(i);
                if (i < 0 || i >= lv.entries.length) { T.ctx.sound('error'); return true; }
                remember();
                const dir = i > lv.tabAt ? 'r' : 'l';
                lv.tabAt = i;
                const z = S.zone;
                return C.redraw('none').then(() => { stage.classList.remove('ms-tab-l', 'ms-tab-r'); void stage.offsetWidth; stage.classList.add(`ms-tab-${dir}`); if (z === 'tabs') focusTab(i, true); });
            },
            async push(level) {
                if (!level) return;
                const lv = await level;
                if (!lv || !S.alive) return;
                remember();
                S.stack.push(lv);
                S.zone = 'main';
                T.ctx.sound('select');
                return C.redraw('in');
            },
            back(sound, quiet) {
                if (S.stack.length <= 1) return false;
                S.stack.pop();
                S.zone = 'main';
                if (sound !== false) T.ctx.sound('back');
                if (!quiet) C.redraw('back');
                return true;
            },
            replaceTop(level) {
                const old = top();
                level.pos = old.pos; level.deckAt = deck ? deck.at : old.deckAt;
                S.stack[S.stack.length - 1] = level;
                return C.redraw('none');
            },
            refocus() { if (S.alive && V && !(T.ctx.focused && T.ctx.focused())) V.focus(true); },
            reload() { const lv = content || cur(); lv.reload = true; if (lv !== cur()) { /* a folder tab's level */ } return show('none'); },
            activate(e, d) {
                if (!e) return;
                if (e.synthetic && !e.open && !e.go) { T.ctx.sound('error'); return; }
                remember();
                if (e.open) { C.push(e.open()); return; }
                if (e.go) { T.ctx.sound('select'); e.go(C, d); return; }
                if (e.item) { T.ctx.sound('select'); D.openItem(e.item, d); }
            },
            onAction(a) {
                sync();
                if (S.zone === 'tabs') {
                    if (a === 'left' || a === 'right') {
                        const n = S.tabAt + (a === 'right' ? 1 : -1);
                        if (n < 0 || n >= tabEls.length) { T.ctx.sound('error'); return true; }
                        tabEls[n].click();
                        return true;
                    }
                    if (a === 'down') { S.zone = 'main'; if (V) V.focus(); return true; }
                    if (a === 'up') { T.ctx.sound('error'); return true; }
                    if (a === 'step_backward' || a === 'step_forward') { const n = S.tabAt + (a === 'step_forward' ? 1 : -1); if (n >= 0 && n < tabEls.length) tabEls[n].click(); else T.ctx.sound('error'); return true; }
                    if (a !== 'back' && a !== 'menu') return false;  // OK: the engine clicks the tab
                }
                if (['up', 'down', 'left', 'right'].includes(a)) {
                    if (deck) {
                        const p = deck.panels[deck.at];
                        const r = p.view ? p.view.move(a) : a;
                        if (r === true) { p.memo = p.view.at; return true; }
                        if (r === 'left' || r === 'right') { if (!deckGo(deck.at + (r === 'right' ? 1 : -1))) T.ctx.sound('error'); return true; }
                        if (r === 'up' && p.tabsEl) { T.ctx.sound('error'); return true; }
                        T.ctx.sound('error');
                        return true;
                    }
                    if (!V) { if (a === 'up' && tabEls.length) return focusTab(S.tabAt); return true; }
                    const r = V.move(a);
                    if (r === true) { remember(); return true; }
                    if (r === 'up' && tabEls.length) return focusTab(S.tabAt);
                    T.ctx.sound('error');
                    return true;
                }
                if (a === 'step_backward' || a === 'step_forward') {
                    const dir = a === 'step_forward' ? 1 : -1;
                    if (deck) {
                        const p = deck.panels[deck.at];
                        if (p.seasons) { const n = p.sAt + dir; if (n >= 0 && n < p.seasons.length) { T.ctx.sound('navigate'); fillPanel(p, n).then(() => focusDeck(true)); } else T.ctx.sound('error'); return true; }
                        if (!deckGo(deck.at + dir)) T.ctx.sound('error');
                        return true;
                    }
                    if (tabEls.length) { const n = S.tabAt + dir; if (n < 0 || n >= tabEls.length) { T.ctx.sound('error'); return true; } tabEls[n].click(); return true; }
                    if (V && ((content && content.letters && V.letterBy(dir)) || V.pageBy(dir))) return true;
                    T.ctx.sound('error');
                    return true;
                }
                if (a === 'back') {
                    if (S.stack.length > 1) return C.back();
                    const lv = cur();
                    if (lv.onBack) return lv.onBack(C) !== false;
                    if (top().onBack) return top().onBack(C) !== false;
                    if (opts.leave !== false) { T.ctx.sound('back'); if (history.length > 1) history.back(); else T.ctx.navigate('#/home'); return true; }
                    return false;
                }
                if (a === 'menu') {
                    const e = C.entry();
                    if (deck && (!e || e.synthetic) && cur().pane && D.itemMenu) { D.itemMenu(cur().pane, {}); return true; }  // an empty panel: the item's own menu
                    if (!e || e.synthetic) { if (content && content.sortable && D.sortPanel) { D.sortPanel(C); return true; } return false; }
                    if (e.menu) { e.menu(C); return true; }
                    if (e.item && D.itemMenu) { D.itemMenu(e.item, { column: C }); return true; }
                    return false;
                }
                if (a === 'play_pause' || a === 'playpause') {
                    const e = C.entry();
                    if (!e || e.synthetic) return false;
                    if (e.play) { e.play(C); return true; }
                    if (e.item && D.playable(e.item)) { T.ctx.sound('select'); D.playItem(e.item, true); return true; }
                    return false;
                }
                return false;
            },
            stop() {
                remember();
                S.alive = false;
                if (V) V.stop();
                if (deck) for (const p of deck.panels) if (p.view) p.view.stop();
                clock.stop();
                D.screenHints = null;
                D.hintsOff();
                save();
            }
        };
        if (saved) { const c0 = cur(); if (c0) c0.reload = true; }
        D.currentColumn = C;
        D.goLevel = (lv) => { if (D.currentColumn && D.currentColumn.S.alive) D.currentColumn.push(lv); };
        C.redraw(saved ? 'none' : 'first');
        return C;
    };

    // A screen that is one stack of levels: register(path, {name, root(params) -> level|bar, key?})
    D.columnScreen = (path, spec) => {
        let C = null;
        D.register(path, Object.assign({
            mount(root) {
                const r = spec.root(D.params());
                C = D.columns(root, { root: r, name: spec.name, key: spec.key ? spec.key(D.params()) : location.hash, fresh: spec.fresh, onFocus: spec.onFocus, onLevel: spec.onLevel,
                    leave: spec.leave, nav: spec.nav ? spec.nav() : null });
                if (spec.mounted) spec.mounted(C, root);
            },
            unmount() { if (C) C.stop(); C = null; if (spec.unmounted) spec.unmounted(); },
            onAction(a) { return C ? C.onAction(a) : false; },
            onBack() { return C ? C.onAction('back') : false; }
        }, spec.beforeSignIn ? { beforeSignIn: true } : {}));
    };

    // ---- the app's places (the guide's Library blade) ----
    const ROUTE = { movies: 'movies', tvshows: 'tv', music: 'music', playlists: 'playlists', homevideos: 'homevideos', photos: 'photos', books: 'books', musicvideos: 'musicvideos', boxsets: 'boxsets', mixed: 'mixed' };
    D.viewRoute = (v) => (v.CollectionType === 'livetv' ? '#/livetv' : `#/${ROUTE[v.CollectionType] || 'list'}?${ROUTE[v.CollectionType] ? 'topParentId' : 'parentId'}=${v.Id}&serverId=${D.sid()}`);
    D.views = [];
    D.loadViews = async () => { try { D.views = await ui.userViews(); } catch (e) { D.views = []; } return D.views; };
    D.navTabs = () => {
        const prefs = D.homePrefs ? D.homePrefs() : { order: [], hidden: [] };
        const views = D.orderedViews ? D.orderedViews(D.views, prefs) : D.views;
        const out = [{ label: 'Home', go: () => T.ctx.navigate('#/home') }];
        for (const v of views) if (!(prefs.hidden || []).includes(v.Id)) out.push({ label: v.Name, go: () => T.ctx.navigate(D.viewRoute(v)) });
        out.push({ label: 'Search', go: () => T.ctx.navigate('#/search') }, { label: 'Settings', go: () => T.ctx.navigate('#/mypreferencesmenu') });
        return out;
    };
    D.loadViews();
})();
