// Plaza's own Now playing, Queue and Lyrics (PLAN 9.44; the design canvas's NowPlaying, Queue and Lyrics) on #/queue
// and #/lyrics, in place of jellyfin-web's pages: the Music channel's frame with the three as tabs.
//   Now playing: the cover on its record (turning while it plays), the title, artist and album, the time line, the
//     transport with Shuffle and Repeat, and what comes next.
//   Queue: what plays beside the list; Ⓐ plays from a song, ≡ on one lifts it (▲▼ carry it, Ⓐ places it, Ⓑ puts it
//     back) or removes it; Save as playlist and Clear under the list.
//   Lyrics: the song's lines with the one being sung large in the middle (timed lyrics follow the song).
// The queue, repeat and shuffle come from the engine's ctx (9.44); without them those parts stay out.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const P = window.icefinPlaza;
    if (!T || !P || !P.frame) return;
    const el = P.el;
    const ui = T.ui;
    const two = (n) => String(n).padStart(2, '0');
    const fmt = (ms) => { const s = Math.max(0, Math.floor((ms || 0) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`; };
    const svg = (d) => `<svg viewBox="0 0 24 24" width="58%" height="58%" fill="currentColor" aria-hidden="true">${d}</svg>`;
    const ICON = { prev: '<path d="M6 5h2.4v14H6zM19 5 9.5 12l9.5 7z"/>', next: '<path d="M15.6 5H18v14h-2.4zM5 5l9.5 7L5 19z"/>',
        play: '<path d="M7 4.5 19.5 12 7 19.5z"/>', pause: '<path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/>' };
    const TABS = [['now', 'Now playing'], ['queue', 'Queue'], ['lyrics', 'Lyrics']];
    const hasQueue = () => typeof T.ctx.queueItems === 'function';

    // what plays now: {item, player, pos, dur, paused} or null
    function now() {
        const n = T.ctx.nowPlaying();
        if (!n || !n.item) return null;
        const p = n.player;
        let pos = 0, dur = 0, paused = false;
        try { pos = p.currentTime ? p.currentTime() || 0 : 0; dur = (p.duration ? p.duration() : 0) || (n.item.RunTimeTicks ? n.item.RunTimeTicks / 10000 : 0); paused = !!(p.paused && p.paused()); } catch (e) { /* the player went away */ }
        return { item: n.item, player: p, pos, dur, paused };
    }
    const ctl = (fn) => { const n = T.ctx.nowPlaying(); if (n && n.player) try { fn(n.player); } catch (e) { /* the player went away */ } };
    const artistOf = (it) => (it.Artists || [])[0] || it.AlbumArtist || '';

    function screen(start) {
        let F = null, view = '', timer = 0, V = null, lift = null, lyrics = null;
        const S = {
            mount(root) {
                ui.pointerFirst(true);
                F = P.frame(root, { view: 'music-now', kind: 'music', name: 'Music', hints: 'Ⓐ Select · ▶ Play/Pause · Ⓑ Back' });
                const tabs = TABS.filter(([id]) => id !== 'queue' || hasQueue()).map(([id, label]) => ({ id, label }));
                F.setTabs(tabs, start, (id) => show(id));
                show(start, true);
                timer = setInterval(tick, 500);
            },
            onAction(a, ctx) {
                P.sawAction();
                if (a === 'play_pause' || a === 'playpause') { ctl((p) => (p.paused && p.paused() ? p.unpause() : p.pause())); tick(); return true; }
                if (lift) {
                    if (a === 'up' || a === 'down') { moveLift(a === 'up' ? -1 : 1); return true; }
                    if (a === 'enter' || a === 'select' || a === 'menu') { dropLift(); return true; }
                    return true;
                }
                if (a === 'menu' && view === 'queue') { const f = ctx.focused(); if (f && f.pzEntry) { entryMenu(f); return true; } }
                return P.common(a, ctx);
            },
            onBack() {
                if (lift) { cancelLift(); return true; }
                if (P.sheet && document.querySelector('#icefin-theme-overlay .pz-sheet-card')) return false;
                P.goBack();
                return true;
            },
            unmount() { clearInterval(timer); if (F) F.stop(); ui.pointerFirst(false); F = null; V = null; lift = null; }
        };

        function show(id, first) {
            view = id;
            lift = null;
            F.body.textContent = '';
            F.root.setAttribute('data-pz-music', id);
            F.focusText('');
            const n = now();
            if (!n) {
                V = { kind: 'empty' };
                F.body.append(P.emptyState('Nothing is playing', 'Pick an album, a song or a playlist in Music.', { label: 'Open Music', go: () => T.ctx.navigate('#/home') }, 'music'));
                const go = F.body.querySelector('[data-icefin-focus]');
                if (go) T.ctx.focus(go);
                return;
            }
            if (id === 'now') drawNow(n);
            else if (id === 'queue') drawQueue(n);
            else drawLyrics(n);
            F.hints(id === 'queue' ? 'Ⓐ Play from here · ≡ Move or remove · Ⓑ Back' : id === 'lyrics' ? '▶ Play/Pause · Ⓑ Back' : 'Ⓐ Select · ▶ Play/Pause · Ⓑ Back');
            if (!first) return;
            const f = F.body.querySelector('.pz-mu-pp, .pz-mu-entry.pz-mu-current, [data-icefin-focus]');
            if (f) T.ctx.focus(f);
        }

        // ---- Now playing ----
        function record(it, cls) {
            const r = el('div', 'pz-mu-art ' + (cls || ''));
            const disc = el('div', 'pz-mu-disc');
            const label = el('div', 'pz-mu-disc-label');
            P.bg(label, P.posterArt(it, 300));
            disc.append(label);
            const cover = el('div', 'pz-mu-cover');
            P.bg(cover, P.posterArt(it, 600));
            r.append(disc, cover);
            return r;
        }
        function line() {
            const l = el('div', 'pz-mu-line');
            const pos = el('span', 'pz-mu-time'), bar = el('div', 'pz-mu-bar'), fill = el('div', 'pz-mu-fill'), dur = el('span', 'pz-mu-time');
            bar.append(fill);
            l.append(pos, bar, dur);
            bar.addEventListener('click', (e) => { const n = now(); if (!n || !n.dur) return; const r = bar.getBoundingClientRect(); ctl((p) => p.currentTime(((e.clientX - r.left) / r.width) * n.dur)); });
            return { el: l, pos, fill, dur };
        }
        function drawNow(n) {
            const box = el('div', 'pz-mu-now');
            const art = record(n.item);
            const info = el('div', 'pz-mu-info');
            const title = el('div', 'pz-mu-title'), sub = el('div', 'pz-mu-sub');
            const tl = line();
            const row = el('div', 'pz-mu-row');
            const round = (cls, label, html, go) => { const b = P.focusable(el('div', 'pz-pl-round ' + cls)); b.setAttribute('aria-label', label); b.innerHTML = html; b.addEventListener('click', () => { go(); T.ctx.sound('select'); setTimeout(tick, 80); }); return b; };
            const prev = round('', 'Previous', svg(ICON.prev), () => ctl((p) => p.previousTrack && p.previousTrack()));
            const pp = round('pz-pl-pp pz-mu-pp', 'Play or pause', svg(ICON.pause), () => ctl((p) => (p.paused && p.paused() ? p.unpause() : p.pause())));
            const next = round('', 'Next', svg(ICON.next), () => ctl((p) => p.nextTrack && p.nextTrack()));
            row.append(prev, pp, next);
            let shuffle = null, repeat = null;
            if (T.ctx.playMode) {
                shuffle = P.focusable(el('div', 'pz-pl-pill', 'Shuffle'));
                shuffle.addEventListener('click', () => { const m = T.ctx.playMode() || {}; T.ctx.setShuffle(!m.shuffle).then(tick); T.ctx.sound('select'); });
                repeat = P.focusable(el('div', 'pz-pl-pill', 'Repeat'));
                const order = ['RepeatNone', 'RepeatAll', 'RepeatOne'];
                repeat.addEventListener('click', () => { const m = T.ctx.playMode() || {}; T.ctx.setRepeat(order[(order.indexOf(m.repeat) + 1) % order.length]).then(tick); T.ctx.sound('select'); });
                row.append(shuffle, repeat);
            }
            const nxt = el('div', 'pz-mu-next');
            info.append(el('div', 'pz-kicker', 'NOW PLAYING'), title, sub, tl.el, row, nxt);
            box.append(art, info);
            F.body.append(box);
            V = { kind: 'now', art, title, sub, tl, pp, shuffle, repeat, nxt, id: '' };
            tick();
        }

        // ---- Queue ----
        function drawQueue(n) {
            const box = el('div', 'pz-mu-queue');
            const side = el('div', 'pz-mu-side');
            const art = el('div', 'pz-mu-cover pz-mu-side-cover');
            const title = el('div', 'pz-mu-side-title'), sub = el('div', 'pz-mu-side-sub');
            const tl = line();
            side.append(art, title, sub, tl.el);
            const list = el('div', 'pz-mu-list');
            const foot = el('div', 'pz-mu-foot');
            const save = P.focusable(el('div', 'pz-pl-pill', 'Save as playlist'));
            save.addEventListener('click', () => saveAsPlaylist());
            const clear = P.focusable(el('div', 'pz-pl-pill', 'Clear'));
            clear.addEventListener('click', () => { T.ctx.clearQueue().then(() => show('queue', true)); T.ctx.sound('select'); });
            foot.append(save, clear);
            const right = el('div', 'pz-mu-right');
            right.append(list, foot);
            box.append(side, right);
            F.body.append(box);
            V = { kind: 'queue', art, title, sub, tl, list, id: '', key: '' };
            drawEntries(true);
            tick();
        }
        async function drawEntries(focusCurrent) {
            if (!V || V.kind !== 'queue') return;
            const q = await T.ctx.queueItems();
            if (!V || V.kind !== 'queue') return;
            const key = q ? q.items.map((x) => x.playlistItemId).join() + ':' + q.index : '';
            if (key === V.key) return;
            V.key = key;
            const had = V.list.contains(T.ctx.focused()) ? T.ctx.focused().pzEntry : null;
            V.list.textContent = '';
            if (!q) { V.list.append(el('div', 'pz-empty', 'The queue is empty')); return; }
            q.items.forEach((x, i) => {
                const r = P.focusable(el('div', 'pz-mu-entry' + (i === q.index ? ' pz-mu-current' : '')));
                r.pzEntry = x;
                const dot = el('span', 'pz-mu-dot');
                if (x.image) P.bg(dot, x.image);
                r.append(dot, el('span', 'pz-mu-entry-name', (i === q.index ? '▶ ' : '') + x.name), el('span', 'pz-mu-entry-artist', x.artist), el('span', 'pz-mu-entry-time', x.runtime ? fmt(x.runtime) : ''), el('span', 'pz-mu-handle', '≡'));
                r.addEventListener('click', () => { if (lift) { dropLift(); return; } T.ctx.playQueueAt(x.playlistItemId).then(() => drawEntries()); T.ctx.sound('select'); });
                r.addEventListener('icefin-focus', () => { F.focusText([x.name, x.artist].filter(Boolean).join(' · ')); r.scrollIntoView({ block: 'nearest' }); });
                V.list.append(r);
            });
            const back = had && [...V.list.children].find((r) => r.pzEntry && r.pzEntry.playlistItemId === had.playlistItemId);
            const cur = V.list.querySelector('.pz-mu-current');
            if (back) T.ctx.focus(back); else if (focusCurrent && cur) T.ctx.focus(cur);
        }
        function entryMenu(row) {
            const x = row.pzEntry;
            if (!P.sheet) { startLift(row); return; }
            P.sheet.show({
                title: x.name, kind: 'music',
                render(body) {
                    const rows = el('div', 'pz-sheet-rows');
                    const r = (label, go) => { const b = P.focusable(el('div', 'pz-sheet-row')); b.append(el('span', 'pz-sheet-row-label', label)); b.addEventListener('click', go); rows.append(b); };
                    r('Play from here', () => { P.sheet.close(); T.ctx.playQueueAt(x.playlistItemId).then(() => drawEntries()); });
                    r('Move', () => { P.sheet.close(); setTimeout(() => startLift(row), 60); });
                    r('Remove from the queue', () => { P.sheet.close(); T.ctx.removeFromQueue([x.playlistItemId]).then(() => { V.key = ''; drawEntries(); }); });
                    body.append(rows);
                }
            });
        }
        // moving an entry: the row lifts, ▲▼ carry it, Ⓐ places it, Ⓑ puts it back
        function startLift(row) {
            const rows = [...V.list.querySelectorAll('.pz-mu-entry')];
            lift = { row, from: rows.indexOf(row) };
            row.classList.add('pz-mu-lifted');
            T.ctx.focus(row);
            F.hints('▲▼ Move · Ⓐ Place · Ⓑ Put back');
            T.ctx.sound('select');
        }
        function moveLift(d) {
            const rows = [...V.list.querySelectorAll('.pz-mu-entry')];
            const i = rows.indexOf(lift.row), j = i + d;
            if (j < 0 || j >= rows.length) { T.ctx.sound('error'); return; }
            if (d < 0) V.list.insertBefore(lift.row, rows[j]); else V.list.insertBefore(lift.row, rows[j].nextSibling);
            lift.row.scrollIntoView({ block: 'nearest' });
            T.ctx.sound('focus');
        }
        function dropLift() {
            const rows = [...V.list.querySelectorAll('.pz-mu-entry')];
            const to = rows.indexOf(lift.row), x = lift.row.pzEntry, from = lift.from;
            lift.row.classList.remove('pz-mu-lifted');
            lift = null;
            F.hints('Ⓐ Play from here · ≡ Move or remove · Ⓑ Back');
            T.ctx.sound('select');
            if (to !== from) T.ctx.moveInQueue(x.playlistItemId, to).then(() => { V.key = ''; drawEntries(); });
        }
        function cancelLift() {
            const rows = [...V.list.querySelectorAll('.pz-mu-entry')];
            const r = lift.row, from = lift.from;
            r.classList.remove('pz-mu-lifted');
            rows.splice(rows.indexOf(r), 1);
            V.list.insertBefore(r, rows[from] || null);
            lift = null;
            F.hints('Ⓐ Play from here · ≡ Move or remove · Ⓑ Back');
            T.ctx.sound('back');
        }
        function saveAsPlaylist() {
            if (!P.sheet) return;
            P.sheet.show({
                title: 'Save as a playlist', kind: 'playlists',
                render(body) {
                    const l = el('label', 'pz-field');
                    const i = el('input', 'pz-input');
                    i.type = 'text';
                    i.placeholder = 'Name';
                    P.focusable(i);
                    l.append(el('span', 'pz-field-label', 'Name'), i);
                    const f = el('div', 'pz-panel-foot');
                    const ok = P.focusable(el('div', 'pz-tab pz-tab-on', 'Save'));
                    ok.addEventListener('click', async () => {
                        const name = i.value.trim();
                        if (!name) { T.ctx.focus(i); T.ctx.sound('error'); return; }
                        const done = await T.ctx.saveQueueAsPlaylist(name);
                        P.sheet.close();
                        if (P.toast) P.toast(done ? `Saved as ${name}` : 'That didn’t work', !done);
                    });
                    const no = P.focusable(el('div', 'pz-tab', 'Cancel'));
                    no.addEventListener('click', () => P.sheet.close());
                    f.append(ok, no);
                    body.append(l, f);
                }
            });
        }

        // ---- Lyrics ----
        async function drawLyrics(n) {
            const box = el('div', 'pz-mu-lyrics');
            const lines = el('div', 'pz-mu-lines');
            const tl = line();
            tl.el.classList.add('pz-mu-lyrics-line');
            box.append(lines, tl.el);
            F.body.append(box);
            V = { kind: 'lyrics', lines, tl, id: n.item.Id, timed: false, cur: -1 };
            await loadLyrics(n.item);
            tick();
        }
        async function loadLyrics(it) {
            if (!V || V.kind !== 'lyrics') return;
            V.lines.textContent = '';
            V.cur = -1;
            V.id = it.Id;
            let r = null;
            const c = P.client();
            try { r = await c.getJSON(c.getUrl(`Audio/${it.Id}/Lyrics`)); } catch (e) { r = null; }
            if (!V || V.kind !== 'lyrics' || V.id !== it.Id) return;
            const list = (r && r.Lyrics) || [];
            lyrics = list.map((x) => ({ text: x.Text || '', start: x.Start != null ? x.Start / 10000 : null }));
            V.timed = lyrics.some((x) => x.start != null);
            if (!lyrics.length) { V.lines.append(P.emptyState('No lyrics for this song', 'The server has none for it.', null, 'music')); return; }
            for (const x of lyrics) V.lines.append(el('div', 'pz-mu-lyric', x.text || '♪'));
        }

        // ---- the clock: what plays, where it is ----
        function tick() {
            if (!F || !V) return;
            const n = now();
            if (!n) { if (V.kind !== 'empty') show(view); return; }
            if (V.kind === 'empty') { show(view, true); return; }
            const it = n.item;
            const frac = n.dur ? Math.min(1, n.pos / n.dur) : 0;
            if (V.tl) { V.tl.fill.style.width = `${frac * 100}%`; V.tl.pos.textContent = fmt(n.pos); V.tl.dur.textContent = n.dur ? fmt(n.dur) : ''; }
            F.root.classList.toggle('pz-mu-paused', n.paused);
            if (V.kind === 'now') {
                if (V.id !== it.Id) {
                    V.id = it.Id;
                    const fresh = record(it);
                    V.art.replaceWith(fresh);
                    V.art = fresh;
                    V.title.textContent = it.Name || '';
                    V.sub.textContent = [artistOf(it), it.Album].filter(Boolean).join(' · ');
                }
                V.pp.innerHTML = svg(n.paused ? ICON.play : ICON.pause);
                const m = T.ctx.playMode ? T.ctx.playMode() : null;
                if (m && V.shuffle) {
                    V.shuffle.classList.toggle('pz-pl-accent', !!m.shuffle);
                    V.shuffle.textContent = m.shuffle ? 'Shuffle: on' : 'Shuffle';
                    V.repeat.classList.toggle('pz-pl-accent', m.repeat !== 'RepeatNone');
                    V.repeat.textContent = m.repeat === 'RepeatOne' ? 'Repeat: this song' : m.repeat === 'RepeatAll' ? 'Repeat: all' : 'Repeat';
                }
                if (hasQueue() && !V.nextBusy) {
                    V.nextBusy = true;
                    T.ctx.queueItems().then((q) => {
                        if (!V) return;
                        V.nextBusy = false;
                        const x = q && q.items[q.index + 1];
                        V.nxt.textContent = x ? `Next: ${x.name}${x.artist ? ' · ' + x.artist : ''}` : '';
                    });
                }
            } else if (V.kind === 'queue') {
                if (V.id !== it.Id) {
                    V.id = it.Id;
                    P.bg(V.art, P.posterArt(it, 500));
                    V.title.textContent = it.Name || '';
                    V.sub.textContent = artistOf(it);
                }
                if (!lift) drawEntries();
            } else if (V.kind === 'lyrics') {
                if (V.id !== it.Id) { loadLyrics(it); return; }
                if (!lyrics || !lyrics.length || !V.timed) return;
                let k = -1;
                lyrics.forEach((x, i) => { if (x.start != null && x.start <= n.pos + 250) k = i; });
                if (k === V.cur) return;
                V.cur = k;
                [...V.lines.children].forEach((e, i) => { e.classList.toggle('pz-mu-sung', i < k); e.classList.toggle('pz-mu-now-line', i === k); });
                const e = V.lines.children[Math.max(0, k)];
                if (e) V.lines.scrollTo({ top: e.offsetTop - V.lines.clientHeight / 2 + e.offsetHeight / 2, behavior: T.ui.motion && T.ui.motion.reduced && T.ui.motion.reduced() ? 'auto' : 'smooth' });
            }
        }
        return S;
    }

    T.registerScreen('#/queue', { mount(r, c) { const m = /[?&]tab=(queue|lyrics)/.exec(location.hash); return (this.s = screen(m ? m[1] : 'now')).mount(r, c); },
        onAction(a, c) { return this.s.onAction(a, c); }, onBack() { return this.s.onBack(); }, unmount() { if (this.s) this.s.unmount(); this.s = null; } });
    T.registerScreen('#/lyrics', { mount(r, c) { return (this.s = screen('lyrics')).mount(r, c); },
        onAction(a, c) { return this.s.onAction(a, c); }, onBack() { return this.s.onBack(); }, unmount() { if (this.s) this.s.unmount(); this.s = null; } });
})();
