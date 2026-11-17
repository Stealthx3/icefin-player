// Almanac: the rows engine (PLAN 9.49; the "Almanac Screens" canvas: Home, Library, Listing, DetailsMovie,
// DetailsSeries, MotionScreens, MotionPanel). Every Almanac screen is the guide's grammar: the info pane at the top
// (what the lime cell is, its picture in the corner), the tab strip, a header, and rows like channels: a label in the
// channel column and cells running right like programmes. A screen is a stack of levels; opening a folder or an item
// pushes one, Back pops it with the cell you left lit again.
//
// Levels and entries are the same plain objects the other Almanac scripts make (data.js):
//   level: {title, load() -> entries, letters, empty:{title, text, way:{label, go}}, focus, onBack(), sortable, query,
//           pane (an item the info pane describes when the lit cell is an action), countNote}
//   entry: {name, sub, line, art, item, open() -> level, go(C, el), play(), menu(), letter, focusFirst, okLabel,
//           row (a row label: entries with the same label share a row), asRow (an item that is a row of its own)}
// How entries become rows: an entry that opens a level (a folder: Recently added, Genres, a season) is a row of its
// own, its cells the level's first entries and an "All" cell at the end; the other entries run in rows of their
// kind: actions under the level's name, items by letter on a long list sorted by name, else in rows of six.
//
// Motion (MotionScreens, MotionPanel, MotionTimings; the six principles): the frame never moves; the lime fill
// moves cell to cell in 90 ms; rows move by whole rows; into a level the rows slide up out 160 ms and the new rows
// rise in 220 ms, 30 ms apart; Back reverses it; the info pane cross-fades 120 ms after 80 ms; the corner's picture
// arrives after 1.5 s still. Low motion: cross-fades only.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinAlmanac;
    if (!T || !D) return;
    const ui = T.ui;
    const el = D.el;
    const VIS = 8;        // rows visible (the reference's eight channel rows)
    const COLS = 4;       // cells visible in a row
    const ROWMAX = 40;    // cells a folder row shows before its "All" cell
    const CHUNK = 6;      // items per row when a list isn't by letter
    D.memory = D.memory || new Map();

    // ---- a flier (kept for the scripts that call it; Almanac cuts between screens, MotionScreens) ----
    D.fly = (from, to, ms, done) => { if (done) done(); };

    const letterOf = (e) => { const s = ((e && (e.letter || e.name)) || '').replace(/^(the|a|an)\s+/i, '').trim().charAt(0).toUpperCase(); return /[A-Z]/.test(s) ? s : '#'; };
    D.letterOf = letterOf;
    const isFolder = (e) => !!e && (e.asRow || (e.open && !e.item));

    // ---- entries to rows ----
    function buildRows(lv, entries) {
        const rows = [];
        let run = null;
        const flush = () => {
            if (!run) return;
            const r = run; run = null;
            if (r.kind === 'items' && !r.label && r.cells.length > 12) {
                if (lv.letters) {
                    let cur = null;
                    for (const e of r.cells) {
                        const l = letterOf(e);
                        if (!cur || cur.letter !== l) { cur = { kind: 'cells', label: l, letter: l, cells: [], offset: 0 }; rows.push(cur); }
                        cur.cells.push(e);
                    }
                    for (const x of rows) if (x.letter && !x.sub) x.sub = String(x.cells.length);
                    return;
                }
                for (let k = 0; k < r.cells.length; k += CHUNK) rows.push({ kind: 'cells', label: k === 0 ? (lv.itemsLabel || lv.title || '') : '', sub: `${k + 1}–${Math.min(r.cells.length, k + CHUNK)}`, cells: r.cells.slice(k, k + CHUNK), offset: 0 });
                return;
            }
            rows.push({ kind: 'cells', label: r.label || (r.kind === 'actions' ? (lv.title || '') : (lv.itemsLabel || (rows.length ? 'More' : lv.title || ''))), cells: r.cells, offset: 0 });
        };
        for (const e of entries) {
            if (isFolder(e)) {
                flush();
                rows.push({ kind: 'folder', label: e.name, sub: e.sub || '', entry: e, level: null, cells: null, offset: 0 });
                continue;
            }
            const key = e.row || (e.item ? '#items' : '#actions');
            if (!run || run.key !== key) { flush(); run = { key, kind: e.row ? 'named' : (e.item ? 'items' : 'actions'), label: e.row || '', cells: [] }; }
            run.cells.push(e);
        }
        flush();
        return rows;
    }

    // the cells a row shows now
    function cellsOf(row) {
        if (row.kind !== 'folder') return row.cells;
        if (!row.cells) return row.loading ? [{ name: 'One moment…', muted: true, synthetic: true }] : [{ name: '', muted: true, synthetic: true }];
        if (!row.cells.length) {
            const em = (row.level && row.level.empty) || {};
            const way = em.way;
            return [{ name: em.title || 'Nothing here yet', sub: em.text || '', muted: true, synthetic: true, wide: true, okLabel: way ? way.label.toLowerCase() : '', go: way ? way.go : null }];
        }
        const list = row.cells.slice(0, ROWMAX);
        // the "All" cell opens the row's whole list: when there is more than a screen of it, or it can be sorted
        if (row.cells.length >= COLS || (row.level && row.level.sortable)) list.push({ name: row.cells.length > ROWMAX ? `All ${row.cells.length} ›` : 'All ›', sub: row.label, synthetic: true, more: true, okLabel: 'open the list', open: () => row.level });
        return list;
    }

    // ---- the screen ----
    // D.columns(root, {root: level | {bar: [categories], at, onBack}, key, name, fresh, leave, nav, onFocus, onLevel})
    D.columns = function (rootEl, opts) {
        const key = opts.key || location.hash.split('?')[0];
        const saved = opts.fresh ? null : D.memory.get(key);
        const entry = D.entryKey ? D.entryKey() : '';
        // Back to this history entry: the control that opened the next screen gets focus again (a tab, or a button on
        // the pointer's line; a cell is the lit cell already). A new visit starts on the rows.
        const back = saved && saved.opener && D.isReturn && D.isReturn(saved.entry) ? saved.opener : null;
        const S = { key, rootEl, stack: saved ? saved.stack : [opts.root], entries: [], loading: 0, alive: true, barIndex: saved ? saved.barIndex : (opts.root.at || 0),
            zone: back && back.zone === 'tabs' ? 'tabs' : 'rows', tabAt: 0, timers: [], entry, opener: null, back };
        rootEl.setAttribute('data-al-screen', opts.name || 'rows');
        rootEl.classList.add('al-screen');
        const pane = el('div', 'al-pane');
        const crumb = el('div', 'al-crumb');
        const title = el('div', 'al-title');
        const when = el('div', 'al-when');
        const desc = el('div', 'al-desc');
        const poster = el('div', 'al-poster');
        poster.hidden = true;
        pane.append(crumb, title, when, desc);
        const pv = el('div', 'al-pv');
        const pvLabel = el('span', 'al-pv-label');
        pv.append(pvLabel);
        const tabs = el('div', 'al-tabs');
        const hdr = el('div', 'al-hdr');
        const rowsEl = el('div', 'al-rows');
        rootEl.append(poster, pane, pv, tabs, hdr, rowsEl);
        const clock = D.clock(crumb);
        D.pointerNav(rootEl, () => C.back(true), opts.nav);
        rowsEl.addEventListener('wheel', (ev) => { ev.preventDefault(); C.onAction(ev.deltaY > 0 ? 'down' : 'up'); }, { passive: false });

        const top = () => S.stack[S.stack.length - 1];
        const isBar = () => !!top().bar;
        const cur = () => (isBar() ? top().bar[Math.max(0, Math.min(S.barIndex, top().bar.length - 1))] : top());
        const rows = () => cur().rows || [];
        const pos = () => { const c = cur(); if (!c.pos) c.pos = { r: 0, c: 0 }; return c.pos; };
        function save() { D.memory.set(key, { stack: S.stack, barIndex: S.barIndex, entry: S.entry, opener: S.opener }); }
        // what opened the next screen, filed as it is clicked (the engine's OK clicks too)
        const labelOf = (e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim();
        rootEl.addEventListener('click', (ev) => {
            const t = ev.target && ev.target.closest ? ev.target.closest('button, [data-icefin-focus]') : null;
            if (!t || !rootEl.contains(t)) return;
            if (tabEls.includes(t)) S.opener = { zone: 'tabs', label: labelOf(t) };
            else if (t.matches('.al-pnav-btn, .al-server') && !/^(Back|Home)$/.test(labelOf(t))) S.opener = { zone: 'extra', cls: t.classList[0], label: labelOf(t) };
            else S.opener = null;
            save();
        }, true);

        // ---- the tab strip: the bar's categories, or the app's places (D.navTabs) ----
        let tabEls = [];
        function drawTabs() {
            tabs.textContent = '';
            const had = tabEls.includes(T.ctx.focused && T.ctx.focused());
            const list = isBar() ? top().bar.map((b, i) => ({ label: b.label, current: i === S.barIndex, go: () => C.category(i) })) : (D.navTabs ? D.navTabs() : []);
            tabEls = [];
            list.forEach((t, i) => {
                const b = D.focusable(el('button', 'al-tab al-menu-item' + (t.current ? ' current' : ''), t.label));
                b.type = 'button';
                // the tab you are on: OK goes into its rows (to the top level from a nested one), not nowhere
                b.addEventListener('click', () => { T.ctx.sound('select'); if (t.current && !isBar()) C.home(); else t.go(); });
                // a pointer that moves onto a tab takes the strip (a row that loads late then leaves it focused)
                b.addEventListener('mousemove', (ev) => { if ((ev.movementX || ev.movementY) && (S.zone !== 'tabs' || S.tabAt !== i)) focusTab(i); });
                tabs.append(b);
                tabEls.push(b);
                if (t.current) S.tabAt = i;
            });
            // Back to this screen: the tab that opened the next one (the list grows when the libraries arrive)
            if (S.back && S.back.zone === 'tabs') { const i = list.findIndex((t) => t.label === S.back.label); if (i >= 0) S.tabAt = i; }
            tabs.hidden = !tabEls.length;
            // the strip redrawn under a focused tab: the same place keeps focus
            if (had && S.zone === 'tabs' && tabEls.length) focusTab(S.tabAt);
        }
        D.redrawTabs = () => { if (S.alive) drawTabs(); };

        // ---- the info pane: what the lit cell is ----
        let pvTimer = 0, lastPane = null;
        function drawPane(e) {
            const lv = cur();
            const it = e && e.item && !e.synthetic ? e.item : null;
            const about = it || (lv.pane && !(e && e.item) ? lv.pane : null);
            const show = about && about !== it ? { name: about.Name, sub: lv.paneSub || '', line: lv.paneLine || about.Overview || '' } : e;
            const sig = show ? `${show.name}|${show.sub}` : '';
            if (sig !== lastPane) {
                lastPane = sig;
                pane.classList.remove('al-fresh');
                void pane.offsetWidth;
                pane.classList.add('al-fresh');
            }
            title.textContent = (show && show.name) || lv.title || '';
            when.textContent = (show && (show.when || show.sub)) || '';
            const d = (show && (show.line || (show.item && show.item.Overview))) || (it && it.Overview) || '';
            desc.textContent = String(d).replace(/\s+/g, ' ');
            // the poster on the left on an item's own screen (DetailsMovie board)
            const pa = lv.poster || '';
            poster.hidden = !pa;
            rootEl.classList.toggle('al-has-poster', !!pa);
            if (pa) poster.style.backgroundImage = `url("${pa}")`;
            // the corner: the item's backdrop after a rest (1.5 s), its own picture if it has none
            clearTimeout(pvTimer);
            pv.classList.remove('on');
            pvLabel.textContent = '';
            const pic = it || about;
            if (!pic) return;
            const url = backdropOf(pic) || (e && e.art) || '';
            if (!url) return;
            const now = lv.pane && pic === lv.pane;
            pvTimer = setTimeout(() => {
                if (!S.alive) return;
                pv.style.backgroundImage = `url("${url}")`;
                pvLabel.textContent = pic.Name || '';
                pv.classList.add('on');
            }, now || D.reduced() ? 0 : 1500);
        }
        function backdropOf(it) {
            const tag = it.BackdropImageTags && it.BackdropImageTags[0];
            const pid = tag ? it.Id : (it.ParentBackdropItemId || '');
            const ptag = tag || (it.ParentBackdropImageTags && it.ParentBackdropImageTags[0]);
            if (pid && ptag) return D.client().getScaledImageUrl(pid, { type: 'Backdrop', maxWidth: 800, tag: ptag });
            if (it.Type === 'TvChannel' && it.ImageTags && it.ImageTags.Primary) return D.image(it.Id, 'Primary', it.ImageTags.Primary, 480);
            return '';
        }

        // ---- rows ----
        const rowEls = new Map();
        function cellEl(e, row, k) {
            const b = D.focusable(el('button', 'al-c' + (e.muted ? ' muted' : '') + (e.more ? ' more' : '') + (e.wide ? ' wide' : '')));
            b.type = 'button';
            const n = el('span', 'al-c-name', e.cellName || e.name || '');
            b.append(n);
            const small = e.cellSub != null ? e.cellSub : cellSubOf(e);
            if (small) b.append(el('small', 'al-c-sub', small));
            if (e.progress > 0 && e.progress < 1) { const p = el('i', 'al-c-prog'); const f = el('b'); f.style.width = `${Math.round(e.progress * 100)}%`; p.append(f); b.append(p); }
            if (e.played) b.classList.add('played');
            b.setAttribute('aria-label', [e.name, e.sub].filter(Boolean).join(', '));
            b.alEntry = e;
            b.addEventListener('click', () => { const at = whereIs(b); if (at) setPos(at.r, at.c, true); C.activate(b.alEntry, b); });
            // a pointer that moves lights the cell; a screen drawn under a resting pointer (Back) keeps its own cell (QA pre)
            b.addEventListener('mousemove', (ev) => { if (!(ev.movementX || ev.movementY) || document.documentElement.getAttribute('data-al-input') !== 'pointer') return; const at = whereIs(b); if (at && (at.r !== pos().r || at.c !== pos().c || S.zone !== 'rows')) setPos(at.r, at.c, false); });
            return b;
        }
        const cellSubOf = (e) => {
            if (!e.item) return '';
            const it = e.item;
            if (e.progress > 0 && e.progress < 1 && D.left) return D.left(it);
            if (it.Type === 'Episode') return it.ParentIndexNumber != null && it.IndexNumber != null ? `S${it.ParentIndexNumber} E${it.IndexNumber}` : '';
            if (it.Type === 'TvChannel') return e.sub ? e.sub.split(' · ')[0] : '';
            return it.ProductionYear ? String(it.ProductionYear) : '';
        };
        function whereIs(b) {
            const rs = rows();
            for (let r = 0; r < rs.length; r++) { const x = rowEls.get(rs[r]); if (x && x.cells.includes(b)) return { r, c: x.cells.indexOf(b) + (x.from || 0) }; }
            return null;
        }
        function rowEl(row) {
            let x = rowEls.get(row);
            if (x) return x;
            const d = el('div', 'al-gr' + (row.kind === 'folder' ? ' folder' : ''));
            const ch = el('div', 'al-ch');
            ch.append(el('span', 'al-ch-label', row.label || ''));
            if (row.sub) ch.append(el('small', 'al-ch-sub', row.sub));
            if (row.kind === 'folder') { ch.classList.add('opens'); ch.addEventListener('click', () => { T.ctx.sound('select'); C.push(row.entry.open()); }); }
            const lane = el('div', 'al-lane');
            d.append(ch, lane);
            x = { d, lane, cells: [], sig: '' };
            rowEls.set(row, x);
            return x;
        }
        // folder rows load their level as they come into view
        function loadRow(row) {
            if (row.kind !== 'folder' || row.cells || row.loading) return;
            row.loading = true;
            Promise.resolve().then(async () => {
                let lv = null;
                try { lv = await row.entry.open(); } catch (e) { lv = null; }
                row.level = lv;
                let list = [];
                if (lv) {
                    try { list = lv.entries && !lv.reload ? lv.entries : ((await lv.load(C)) || []); } catch (e) { console.error('almanac: row', row.label, e && e.status ? e.status + ' ' + e.url : e); list = []; }
                    lv.entries = list;
                    lv.reload = false;
                }
                row.cells = list;
                row.loading = false;
                if (row.label !== (lv && lv.title) && lv && lv.title && !row.entry.name) row.label = lv.title;
                if (S.alive && rows().includes(row)) drawRows();
            });
        }
        function drawRows(how) {
            const rs = rows();
            const p = pos();
            const lv = cur();
            if (lv.top == null) lv.top = 0;
            if (p.r < lv.top) lv.top = p.r;
            if (p.r > lv.top + VIS - 1) lv.top = p.r - VIS + 1;
            lv.top = Math.max(0, Math.min(lv.top, Math.max(0, rs.length - VIS)));
            const keep = new Set();
            for (let r = Math.max(0, lv.top - 1); r < Math.min(rs.length, lv.top + VIS + 1); r++) {
                const row = rs[r];
                if (r >= lv.top - 1 && r <= lv.top + VIS + 1) loadRow(row);
                const x = rowEl(row);
                keep.add(row);
                if (!x.d.isConnected) rowsEl.append(x.d);
                x.d.style.setProperty('--al-r', String(r - lv.top));
                x.d.classList.toggle('out', r < lv.top || r >= lv.top + VIS);
                x.d.classList.toggle('lit', r === p.r && S.zone === 'rows');
                const list = cellsOf(row);
                // a folder row still loading shows one placeholder: the position kept for it waits for its cells
                const waiting = row.kind === 'folder' && !row.cells;
                // the cells: rebuilt when the row's list changes, else moved
                const sig = `${list.length}:${list.map((e) => e.name).join('|').length}:${row.cells ? 1 : 0}`;
                if (x.sig !== sig || x.list !== list) {
                    x.lane.textContent = '';
                    x.cells = list.map((e, k) => cellEl(e, row, k));
                    x.cells.forEach((b) => x.lane.append(b));
                    x.sig = sig;
                    x.list = list;
                    x.from = 0;
                }
                if (r === p.r && !waiting) {
                    p.c = Math.max(0, Math.min(p.c, list.length - 1));
                    if (p.c < row.offset) row.offset = p.c;
                    if (p.c > row.offset + COLS - 1) row.offset = p.c - COLS + 1;
                }
                if (!waiting) row.offset = Math.max(0, Math.min(row.offset, Math.max(0, list.length - COLS)));
                const from = waiting ? 0 : row.offset;
                x.lane.classList.toggle('has-more-right', list.length > from + COLS);
                x.lane.classList.toggle('has-more-left', from > 0);
                x.cells.forEach((b, k) => {
                    const off = k - from;
                    b.style.setProperty('--al-x', String(off));
                    const span = list[k] && list[k].wide ? COLS : 1;
                    b.style.setProperty('--al-w', String(span));
                    b.classList.toggle('gone', off < 0 || off >= COLS);
                    const lit = r === p.r && k === (waiting ? 0 : p.c) && S.zone === 'rows';
                    b.classList.toggle('lit', lit);
                    if (!lit) b.classList.remove('icefin-focused');
                });
            }
            for (const [row, x] of rowEls) if (!keep.has(row)) { x.d.remove(); rowEls.delete(row); }
            rowsEl.setAttribute('data-al-rows', String(rs.length));
            rootEl.setAttribute('data-al-index', `${p.r}:${p.c}`);
            rootEl.setAttribute('data-al-count', String(rs.length));
            if (how) { rowsEl.classList.remove('al-in', 'al-back', 'al-first'); void rowsEl.offsetWidth; rowsEl.classList.add(`al-${how === 'in' ? 'in' : how === 'back' ? 'back' : 'first'}`); }
            if (S.zone === 'rows') focusLit();
        }
        const colIn = (row, p) => (row && row.kind === 'folder' && !row.cells ? 0 : p.c);
        function litEntry() {
            const rs = rows();
            const p = pos();
            const row = rs[p.r];
            if (!row) return null;
            return cellsOf(row)[colIn(row, p)] || null;
        }
        function focusLit() {
            const rs = rows();
            const p = pos();
            const row = rs[p.r];
            const x = row && rowEls.get(row);
            const b = x && x.cells[colIn(row, p)];
            // never take focus from the list box or the keyboard (a row that loads late redraws under them)
            const busy = (D.panel && D.panel.isOpen()) || (ui.keyboard && ui.keyboard.isOpen && ui.keyboard.isOpen());
            // nor from a button on the pointer's line the pointer rests on (a row that loads late redraws)
            const f = T.ctx.focused && T.ctx.focused();
            const onLine = !!(f && f.closest && f.closest('.al-pnav, .al-server')) && document.documentElement.getAttribute('data-al-input') === 'pointer';
            if (b && !busy && !onLine) T.ctx.focus(b);
            const e = litEntry();
            drawPane(e);
            hintsFor(e, row);
            if (opts.onFocus) opts.onFocus(e, C);
        }
        function hintsFor(e, row) {
            const h = [];
            if (e && (e.open || e.go || (e.item && !e.synthetic))) h.push(['OK', e.okLabel || (e.open ? 'open' : (e.item ? (e.item.Type === 'TvChannel' ? 'watch' : 'details') : 'choose'))]);
            if (e && !e.synthetic && (e.play || (e.item && D.playable(e.item)))) h.push(['▶', 'play']);
            if (e && !e.synthetic && (e.menu || e.item)) h.push(['≡', 'options']);
            else if (cur().sortable) h.push(['≡', 'sort and filter']);
            if (row && cellsOf(row).length > 1) h.push(['◀ ▶', 'along the row']);
            if (cur().letters && rows().length > 3) h.push(['L1 R1', 'letter']);
            else if (isBar()) h.push(['L1 R1', 'tab']);
            h.push(['Back', S.stack.length > 1 ? `to ${(S.stack[S.stack.length - 2].bar ? S.stack[S.stack.length - 2].bar[S.barIndex].label : S.stack[S.stack.length - 2].title) || 'the last screen'}` : (top().backLabel || cur().backLabel || '')]);
            D.screenHints = () => D.hints(h);
            if (!(D.panel && D.panel.isOpen())) D.hints(h);
        }
        function setPos(r, c, quiet) {
            const p = pos();
            p.r = r; p.c = c;
            S.zone = 'rows';
            S.opener = null;
            if (!quiet) T.ctx.sound('focus');
            drawRows();
            save();
        }
        function drawHeader() {
            const lv = cur();
            hdr.textContent = '';
            const t = el('span', 'al-hdr-title', lv.headTitle || lv.title || (isBar() ? cur().label : '') || '');
            hdr.append(t);
            const n = lv.entries ? lv.entries.filter((e) => e.item).length : 0;
            if (n > 1 && lv.count !== false) hdr.append(el('span', 'al-hdr-count', `${n}${lv.countNote ? ` · ${lv.countNote}` : ''}`));
            if (lv.sortable && lv.query) { const s = el('button', 'al-hdr-sort', '≡ sort and filter'); s.type = 'button'; s.addEventListener('click', () => D.sortPanel && D.sortPanel(C)); hdr.append(s); }
            // the path in the pane's small line (Movies › Recently added), the clock at the root
            const path = S.stack.map((x) => (x.bar ? x.bar[S.barIndex].label : x.title)).filter(Boolean);
            clock.extra.textContent = S.stack.length > 1 ? path.join(' › ') : '';
            rootEl.classList.toggle('al-nested', S.stack.length > 1);
        }
        function drawEmpty() {
            const lv = cur();
            const none = !S.loading && !(lv.rows && lv.rows.length);
            rootEl.querySelectorAll('.al-empty').forEach((x) => x.remove());
            if (!none) return;
            const em = Object.assign({}, lv.empty || {});
            // never a dead end: an empty screen always offers a way on, so a pad has something to press
            if (!em.way) em.way = S.stack.length > 1 ? { label: 'Go back', go: () => C.back() } : { label: 'Go back', go: () => { if (history.length > 1) history.back(); else T.ctx.navigate('#/home'); } };
            const box = el('div', 'al-empty');
            const row = el('div', 'al-gr');
            const ch = el('div', 'al-ch');
            ch.append(el('span', 'al-ch-label', lv.title || ''));
            const lane = el('div', 'al-lane');
            const w = D.focusable(el('button', 'al-c lit al-empty-way', em.way.label));
            w.type = 'button';
            w.addEventListener('click', () => { T.ctx.sound('select'); em.way.go(); });
            const m = el('div', 'al-c muted wide al-empty-text', [em.title || 'Nothing here yet', em.text].filter(Boolean).join(' · '));
            lane.append(w, m);
            row.append(ch, lane);
            box.append(row);
            rowsEl.append(box);
            title.textContent = em.title || 'Nothing here yet';
            when.textContent = '';
            desc.textContent = em.text || '';
            T.ctx.focus(w);
            D.screenHints = () => D.hints([['OK', em.way.label.toLowerCase()], ['Back', '']]);
            D.screenHints();
        }
        // loads the current level's entries (cached on the level until it is reopened)
        async function load(how) {
            const lv = cur();
            const ticket = ++S.loading;
            if (!lv.entries || lv.reload) {
                rootEl.setAttribute('data-al-loading', '1');
                let list = [];
                try { list = (await lv.load(C)) || []; } catch (e) { console.error('almanac: load', e); list = []; }
                if (!S.alive || ticket !== S.loading || cur() !== lv) return;
                lv.entries = list;
                lv.reload = false;
                const old = lv.rows;
                lv.rows = buildRows(lv, list);
                // folder rows already loaded keep their cells until they reload in view
                if (old) for (const r of lv.rows) { const o = old.find((x) => x.kind === 'folder' && x.label === r.label); if (o && r.kind === 'folder') { r.offset = o.offset; } }
                if (lv.focus != null || !lv.pos) placeFocus(lv, list);
            } else if (!lv.rows) lv.rows = buildRows(lv, lv.entries);
            S.loading = 0;
            rootEl.removeAttribute('data-al-loading');
            S.entries = lv.entries;
            for (const [, x] of rowEls) x.d.remove();
            rowEls.clear();
            drawHeader();
            drawTabs();
            if (opts.onLevel) opts.onLevel(lv, C);
            if (S.zone === 'tabs' && tabEls.length) { drawRows(how); drawPane(litEntry()); focusTab(S.tabAt); } else { S.zone = 'rows'; drawRows(how); }
            drawEmpty();
            // Back to this screen from what a button on the pointer's line or the server button opened: that button again
            if (S.back && S.back.zone === 'extra') {
                const b = [...rootEl.querySelectorAll(`.${S.back.cls}`)].find((x) => labelOf(x) === S.back.label);
                if (b && !(D.panel && D.panel.isOpen())) T.ctx.focus(b);
            }
            S.back = null;
            rootEl.setAttribute('data-al-ready', String(S.stack.length));
            save();
        }
        // where focus starts: the entry a script names (lv.focus = index), else the first marked focusFirst
        function placeFocus(lv, list) {
            let k = typeof lv.focus === 'number' ? lv.focus : list.findIndex((x) => x.focusFirst);
            lv.focus = null;
            if (!lv.pos) lv.pos = { r: 0, c: 0 };
            if (k < 0) return;
            const e = list[k];
            lv.rows.forEach((row, r) => {
                if (row.kind === 'folder' && row.entry === e) { lv.pos = { r, c: 0 }; }
                else if (row.cells && row.cells.includes(e)) { lv.pos = { r, c: row.cells.indexOf(e) }; }
            });
        }
        function focusTab(i) {
            if (!tabEls.length) return false;
            S.tabAt = Math.max(0, Math.min(tabEls.length - 1, i));
            S.zone = 'tabs';
            for (const [, x] of rowEls) x.d.classList.remove('lit');
            rowsEl.querySelectorAll('.al-c.lit').forEach((b) => b.classList.remove('lit'));
            T.ctx.focus(tabEls[S.tabAt]);
            D.screenHints = () => D.hints(isBar() ? [['◀ ▶', 'tab'], ['▼', 'rows'], ['Back', '']] : [['OK', 'open'], ['◀ ▶', 'tab'], ['▼', 'rows'], ['Back', '']]);
            if (!(D.panel && D.panel.isOpen())) D.screenHints();
            return true;
        }
        // the engine's focus may have moved by the pointer: read where it is before a key moves it
        function sync() {
            const f = T.ctx.focused && T.ctx.focused();
            if (!f) return;
            const ti = tabEls.indexOf(f);
            if (ti >= 0) { S.zone = 'tabs'; S.tabAt = ti; return; }
            if (f.classList && f.classList.contains('al-c')) { const at = whereIs(f); if (at) { const p = pos(); p.r = at.r; p.c = at.c; S.zone = 'rows'; } }
        }

        const C = {
            S, rootEl,
            level: () => cur(),
            entry: () => litEntry(),
            depth: () => S.stack.length,
            redraw(how) {
                if (isBar()) S.barIndex = Math.max(0, Math.min(S.barIndex, top().bar.length - 1));
                for (const lv of [cur()]) if (lv.entries && !lv.rows) lv.rows = buildRows(lv, lv.entries);
                if (cur().focus != null && cur().entries && cur().rows) placeFocus(cur(), cur().entries);
                return load(how);
            },
            step(dir) {  // up and down: row to row, the column of cells kept where it was on screen
                const rs = rows();
                if (S.loading || !rs.length) return false;
                const p = pos();
                const n = p.r + dir;
                if (n < 0) { if (focusTab(S.tabAt)) { T.ctx.sound('focus'); return true; } T.ctx.sound('error'); return true; }
                if (n >= rs.length) { T.ctx.sound('error'); return true; }
                const vis = p.c - (rs[p.r] ? rs[p.r].offset : 0);
                const target = rs[n];
                const len = cellsOf(target).length;
                setPos(n, Math.max(0, Math.min(len - 1, target.offset + vis)));
                return true;
            },
            along(dir) {
                const rs = rows();
                const p = pos();
                const row = rs[p.r];
                if (!row) return false;
                const n = p.c + dir;
                if (n < 0 || n >= cellsOf(row).length) { T.ctx.sound('error'); return true; }
                setPos(p.r, n);
                return true;
            },
            jump(dir) {  // the shoulders: a page of rows, a letter on a list by name, or the bar's next tab
                if (isBar()) return C.category(S.barIndex + dir);
                const rs = rows();
                if (!rs.length) return false;
                const p = pos();
                const n = Math.max(0, Math.min(rs.length - 1, p.r + dir * (cur().letters ? 1 : VIS)));
                if (n === p.r) { T.ctx.sound('error'); return true; }
                setPos(n, 0, true);
                T.ctx.sound('navigate');
                return true;
            },
            category(i) {
                if (!isBar()) return false;
                const n = top().bar.length;
                if (i < 0 || i >= n) { T.ctx.sound('error'); return true; }
                S.barIndex = i;
                T.ctx.sound('navigate');
                const z = S.zone;
                C.redraw('first').then(() => { if (z === 'tabs') focusTab(i); });
                return true;
            },
            async push(level) {
                if (!level) return;
                const lv = await level;
                if (!lv || !S.alive) return;
                S.stack.push(lv);
                S.zone = 'rows';
                T.ctx.sound('select');
                return C.redraw('in');
            },
            back(sound, quiet) {
                if (S.stack.length <= 1) return false;
                S.stack.pop();
                S.zone = 'rows';
                if (sound !== false) T.ctx.sound('back');
                if (!quiet) C.redraw('back');
                return true;
            },
            // the current tab's OK: the rows of its top level, the lit cell focused
            home() {
                S.opener = null;
                if (S.stack.length > 1) { S.stack.length = 1; S.zone = 'rows'; return C.redraw('back'); }
                if (rows().length) { S.zone = 'rows'; T.ctx.sound('focus'); drawRows(); }
                return null;
            },
            // focus back where the screen has it (a panel closed after the cell it left from was redrawn)
            refocus() {
                if (!S.alive) return;
                if (S.zone === 'tabs' && tabEls.length) focusTab(S.tabAt); else if (rows().length) { S.zone = 'rows'; focusLit(); }
            },
            replaceTop(level) { const old = top(); level.pos = old.pos; level.top = old.top; S.stack[S.stack.length - 1] = level; return C.redraw(); },
            reload() { cur().reload = true; return load(); },
            activate(e, d) {
                if (!e) return;
                if (e.synthetic && !e.open && !e.go) { T.ctx.sound('error'); return; }
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
                        if (isBar()) { C.category(n); return true; }
                        focusTab(n); T.ctx.sound('focus'); return true;
                    }
                    if (a === 'down') { if (rows().length) { S.zone = 'rows'; T.ctx.sound('focus'); drawRows(); } return true; }
                    if (a === 'up') return true;
                    if (a === 'step_backward' || a === 'step_forward') return C.jump(a === 'step_forward' ? 1 : -1);
                    if (a !== 'back' && a !== 'menu') return false;  // OK: the engine clicks the tab
                }
                if (a === 'up') return C.step(-1);
                if (a === 'down') return C.step(1);
                if (a === 'left') return C.along(-1);
                if (a === 'right') return C.along(1);
                if (a === 'step_backward') return C.jump(-1);
                if (a === 'step_forward') return C.jump(1);
                if (a === 'back') {
                    if (S.stack.length > 1) return C.back();
                    if (cur().onBack) return cur().onBack(C) !== false;
                    if (top().onBack) return top().onBack(C) !== false;
                    if (opts.leave !== false) { T.ctx.sound('back'); if (history.length > 1) history.back(); else T.ctx.navigate('#/home'); return true; }
                    return false;
                }
                if (a === 'menu') {
                    const e = C.entry();
                    if (!e || e.synthetic) { if (cur().sortable && D.sortPanel) { D.sortPanel(C); return true; } return false; }
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
                S.alive = false;
                clearTimeout(pvTimer);
                clock.stop();
                D.screenHints = null;
                D.hintsOff();
                save();
            }
        };
        // back on a screen kept in memory: its rows again, refreshed (progress, watched marks), the same cell lit
        if (saved) { const c0 = cur(); if (c0) { c0.reload = true; } }
        D.currentColumn = C;
        D.goLevel = (lv) => { if (D.currentColumn && D.currentColumn.S.alive) D.currentColumn.push(lv); };
        if (saved || !opts.root.deferred) C.redraw(saved ? null : 'first');
        else drawTabs();
        return C;
    };

    // A screen that is one stack of rows: register(path, {name, root(params) -> level|bar, key?})
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

    // ---- the app's places for the tab strip: Home, Guide, the libraries, Search, Settings ----
    const ROUTE = { movies: 'movies', tvshows: 'tv', music: 'music', playlists: 'playlists', homevideos: 'homevideos', photos: 'photos', books: 'books', musicvideos: 'musicvideos', boxsets: 'boxsets', mixed: 'mixed' };
    D.viewRoute = (v) => (v.CollectionType === 'livetv' ? '#/livetv?al=rows' : `#/${ROUTE[v.CollectionType] || 'list'}?${ROUTE[v.CollectionType] ? 'topParentId' : 'parentId'}=${v.Id}&serverId=${D.sid()}`);
    D.views = [];
    D.loadViews = async () => { try { D.views = await ui.userViews(); } catch (e) { D.views = []; } if (D.redrawTabs) D.redrawTabs(); return D.views; };
    D.navTabs = () => {
        const h = location.hash;
        const route = h.split('?')[0];
        const p = D.params();
        const prefs = D.homePrefs ? D.homePrefs() : { order: [], hidden: [] };
        const views = D.orderedViews ? D.orderedViews(D.views, prefs) : D.views;
        const at = (test) => test;
        const out = [{ label: 'Home', current: route === '#/home' && !p.get('al'), go: () => T.ctx.navigate('#/home') }];
        const live = views.find((v) => v.CollectionType === 'livetv');
        if (live) out.push({ label: 'Guide', current: route === '#/livetv' && p.get('al') !== 'rows', go: () => T.ctx.navigate('#/livetv') });
        for (const v of views) {
            if ((prefs.hidden || []).includes(v.Id)) continue;
            const id = p.get('topParentId') || p.get('parentId');
            const mine = v.CollectionType === 'livetv' ? (route === '#/livetv' && p.get('al') === 'rows') : (id === v.Id || (!id && route === `#/${ROUTE[v.CollectionType]}`));
            out.push({ label: v.Name, current: at(mine), go: () => T.ctx.navigate(D.viewRoute(v)) });
        }
        out.push({ label: 'Search', current: route === '#/search', go: () => T.ctx.navigate('#/search') });
        out.push({ label: 'Settings', current: route === '#/home' && p.get('al') === 'settings', go: () => T.ctx.navigate('#/home?al=settings') });
        return out;
    };
    D.loadViews();
})();
