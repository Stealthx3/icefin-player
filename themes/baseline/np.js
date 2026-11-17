// Baseline: Now playing (#/queue) and Lyrics (#/lyrics), as stock's TV layout draws its remote-control page.
//   #/queue: the art on the left; on the right the song, the artist and album, the time line with the times, then the
//   transport (repeat, previous, rewind, play/pause, stop, fast-forward, next, shuffle) and a second row (mute, Lyrics,
//   ⋮); below, the Playlist heading with Save and Clear, then the queue as list items (OK plays from a song; ≡ moves or
//   removes it with the reorder model). #/lyrics: the lines centred, the sung line white and the rest dimmed.
//   Augmentations only: ▶ plays or pauses anywhere here, hints say what OK and ≡ do, sounds on every move.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const B = window.icefinBaseline;
    if (!T || !B || !B.panel) return;
    const ui = T.ui;
    const el = B.el;
    const ctx = T.ctx;
    const two = (n) => String(n).padStart(2, '0');
    const fmt = (ms) => { const s = Math.max(0, Math.floor((ms || 0) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`; };
    const player = () => (ui.player && ui.player.controls ? ui.player.controls() : null);
    const state = () => { const p = player(); try { return p && p.state ? p.state() : null; } catch (e) { return null; } };
    const nowItem = () => { const n = ctx.nowPlaying && ctx.nowPlaying(); return n && n.item ? n.item : null; };
    const artistOf = (it) => (it.Artists || []).join(', ') || it.AlbumArtist || '';
    const artFor = (it) => B.artOf(it, 'square', 600) || (it.AlbumId && it.AlbumPrimaryImageTag ? B.image(it.AlbumId, 'Primary', it.AlbumPrimaryImageTag, 600) : '');
    const ib = (icon, label, go, cls) => { const b = B.btn('bl-np-btn' + (cls ? ` ${cls}` : ''), null); b.append(B.icon(icon)); b.title = label; b.setAttribute('aria-label', label); b.addEventListener('click', () => { ctx.sound('select'); go(); }); return b; };

    function nowScreen() {
        let S = null;
        return {
            first: true,
            mount(root) {
                root.setAttribute('data-bl-screen', 'nowplaying');
                const page = B.page(root, 'bl-np');
                const h = B.header(root, {});
                h.querySelector('.bl-header-right').hidden = true;  // stock's Now Playing header: Back and Home only
                const me = S = { root, lift: null };
                const top = el('div', 'bl-np-top');
                me.art = el('div', 'bl-np-art');
                const info = el('div', 'bl-np-info');
                me.title = el('div', 'bl-np-title');
                me.artist = el('div', 'bl-np-sub');
                me.album = el('div', 'bl-np-sub');
                const tl = el('div', 'bl-np-time');
                me.pos = el('span', 'bl-np-pos', '0:00');
                me.bar = B.focusable(el('div', 'bl-np-bar'));
                me.bar.setAttribute('role', 'slider');
                me.bar.setAttribute('aria-label', 'Seek');
                me.bar.blHints = [['◀ ▶', 'seek'], ['▶', 'pause'], ['Back', '']];
                me.fill = el('div', 'bl-np-fill');
                me.knob = el('i', 'bl-np-knob');
                me.bar.append(me.fill, me.knob);
                me.dur = el('span', 'bl-np-dur', '');
                tl.append(me.pos, me.bar, me.dur);
                me.bar.addEventListener('pointerdown', (e) => { const p = player(), s = state(); if (!p || !s || !s.duration) return; const r = me.bar.getBoundingClientRect(); p.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * s.duration); });
                const p = () => player() || {};
                // stock's one row: rewind, previous, play/pause, stop, next, fast-forward; favourite, lyrics, shuffle,
                // repeat, mute and the volume slider on the right
                const row = el('div', 'bl-np-transport');
                const left = el('div', 'bl-np-group'), right = el('div', 'bl-np-group');
                me.pp = ib('pause', 'Pause', () => { if (p().playPause) p().playPause(); tick(); }, 'main');
                left.append(ib('replay_10', 'Rewind', () => p().seekBy && p().seekBy(-10000)), ib('skip_previous', 'Previous Track', () => p().previousItem && p().previousItem()),
                    me.pp, ib('stop', 'Stop', () => { if (p().stop) p().stop(); }), ib('skip_next', 'Next Track', () => p().nextItem && p().nextItem()),
                    ib('forward_30', 'Fast Forward', () => p().seekBy && p().seekBy(30000)));
                me.fav = ib('favorite', 'Favorite', async () => { const it = nowItem(); if (!it) return; const now = !(it.UserData || {}).IsFavorite; try { await B.client().updateFavoriteStatus(B.uid(), it.Id, now); it.UserData = Object.assign({}, it.UserData, { IsFavorite: now }); tick(); } catch (e) { B.notice('That didn’t work', true); } });
                me.lyr = ib('lyrics', 'Lyrics', () => B.go('#/lyrics'));
                me.shuffle = ib('shuffle', 'Shuffle', () => { if (p().toggleShuffle) p().toggleShuffle(); else if (ctx.setShuffle) { const m = ctx.playMode(); ctx.setShuffle(!(m && m.shuffle)); } tick(); });
                me.repeat = ib('repeat', 'Repeat', () => { const m = ctx.playMode ? ctx.playMode() : null; const nxt = !m || m.repeat === 'RepeatNone' ? 'RepeatAll' : m.repeat === 'RepeatAll' ? 'RepeatOne' : 'RepeatNone'; if (ctx.setRepeat) ctx.setRepeat(nxt); tick(); });
                me.mute = ib('volume_up', 'Mute', () => { if (p().toggleMute) p().toggleMute(); tick(); });
                me.vol = B.focusable(el('div', 'bl-np-bar bl-np-vol'));
                me.vol.setAttribute('role', 'slider');
                me.vol.setAttribute('aria-label', 'Volume');
                me.vol.blHints = [['◀ ▶', 'volume'], ['Back', '']];
                me.volFill = el('div', 'bl-np-fill');
                me.volKnob = el('i', 'bl-np-knob');
                me.vol.append(me.volFill, me.volKnob);
                me.vol.addEventListener('pointerdown', (e) => { const r = me.vol.getBoundingClientRect(); if (p().setVolume) p().setVolume(Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100)); tick(); });
                right.append(me.fav, me.lyr, me.shuffle, me.repeat, me.mute, me.vol);
                row.append(left, right);
                const row2 = el('div', 'bl-np-row2');
                if (ctx.saveQueueAsPlaylist) row2.append(ib('save', 'Save', () => savePlaylist()));
                row2.append(ib('more_vert', 'More', () => moreMenu()));
                info.append(me.title, me.album, me.artist, tl, row, row2);  // stock's order: the song, its album, the artist
                top.append(me.art, info);
                me.queue = el('div', 'bl-np-queue');
                me.empty = el('div', 'bl-np-nothing', 'Nothing is playing.');
                page.append(top, me.queue, me.empty);
                me.timer = setInterval(tick, 500);
                tick();
                drawQueue();
                B.arrive(root, me.pp);
                root.setAttribute('data-bl-ready', '1');
            },
            unmount() { if (S) clearInterval(S.timer); S = null; B.hintsOff(); },
            onAction(a, c2) {
                if (!S) return false;
                if (a === 'play_pause' || a === 'playpause') { const p = player(); if (p && p.playPause) p.playPause(); tick(); return true; }
                if (S.lift) {
                    if (a === 'up' || a === 'down') { moveLift(a === 'up' ? -1 : 1); return true; }
                    if (a === 'enter' || a === 'select' || a === 'menu') { dropLift(); return true; }
                    if (a === 'back') { cancelLift(); return true; }
                    return true;
                }
                const f = c2.focused();
                if ((a === 'left' || a === 'right') && f === S.vol) { const p = player(), st = state(); if (p && p.setVolume) p.setVolume(((st && st.volume) || 0) + (a === 'right' ? 5 : -5)); ctx.sound('navigate'); tick(); return true; }
                if ((a === 'left' || a === 'right') && f === S.bar) { const p = player(); if (p && p.seekBy) p.seekBy(a === 'right' ? 10000 : -10000); ctx.sound('navigate'); tick(); return true; }
                if (a === 'menu' && f && f.blQueue) { queueMenu(f); return true; }
                return false;
            }
        };

        async function drawQueue() {
            if (!S || !ctx.queueItems) return;
            const me = S;
            let q = null;
            try { q = await ctx.queueItems(); } catch (e) { q = null; }
            if (S !== me) return;
            me.queue.textContent = '';
            me.q = q;
            if (!q || !q.items.length) return;
            q.items.forEach((it, at) => {
                const r = B.btn('bl-listitem bl-np-qrow' + (at === q.index ? ' playing' : ''), null);
                const a = el('div', 'bl-li-image bl-np-qimg');
                if (at === q.index) { a.classList.add('blank'); a.append(B.icon('equalizer')); } else if (it.image) a.style.backgroundImage = `url("${it.image}")`; else { a.classList.add('blank'); a.append(B.icon('audiotrack')); }
                const t = el('div', 'bl-li-body');
                t.append(el('div', 'bl-li-title', it.name || ''));
                const end = el('div', 'bl-li-aside', it.runtime ? fmt(it.runtime) : '');
                r.append(a, t, end);
                r.blQueue = it;
                r.blHints = [['OK', 'play'], ['≡', 'move or remove'], ['Back', '']];
                r.addEventListener('click', () => { if (ctx.playQueueAt) ctx.playQueueAt(it.playlistItemId); ctx.sound('select'); setTimeout(drawQueue, 600); });
                me.queue.append(r);
            });
        }
        function savePlaylist() {
            B.panel.show({ title: 'Save Playlist', form: true, render(b) {
                const name = B.field('Name', '');
                b.append(name, B.foot(B.button('Save', async () => { const n = name.input.value.trim(); if (!n) { ctx.sound('error'); return; } const ok = await ctx.saveQueueAsPlaylist(n); B.panel.close(); B.notice(ok ? 'Playlist saved.' : 'That didn’t work', !ok); }, true)));
            } });
        }
        function moreMenu() {
            const it = nowItem();
            B.panel.show({ title: it ? it.Name : 'Now Playing', path: 'Options', render(body) {
                if (ctx.clearQueue) body.append(B.row('Clear Playlist', { go: async () => { B.panel.close(); await ctx.clearQueue(); drawQueue(); } }));
                if (it && B.itemMenu) body.append(B.row('More…', { go: () => { B.panel.close(); setTimeout(() => B.itemMenu(it, {}), 260); } }));
            } });
        }
        // ≡ on a song of the playlist: Move (Icefin's reorder model) and Remove from playlist
        function queueMenu(row) {
            const it = row.blQueue;
            B.panel.show({ title: it.name, path: 'Options', render(body) {
                if (ctx.moveInQueue) body.append(B.row('Move', { go: () => { B.panel.close(); setTimeout(() => startLift(row), 260); } }));
                if (ctx.removeFromQueue) body.append(B.row('Remove from playlist', { go: async () => { await ctx.removeFromQueue([it.playlistItemId]); B.panel.close(); drawQueue(); } }));
            } });
        }
        function startLift(row) {
            if (!S || !row || !row.isConnected) return;
            S.lift = { row };
            row.classList.add('bl-lifted');
            ctx.focus(row);
            ctx.sound('select');
            B.hints([['▲ ▼', 'move'], ['OK', 'place'], ['Back', 'cancel']]);
        }
        function moveLift(dir) {
            const r = S.lift.row, sib = dir < 0 ? r.previousElementSibling : r.nextElementSibling;
            if (!sib) { ctx.sound('error'); return; }
            if (dir < 0) S.queue.insertBefore(r, sib); else S.queue.insertBefore(sib, r);
            ctx.sound('focus');
        }
        async function dropLift() {
            const r = S.lift.row;
            const at = [...S.queue.children].indexOf(r);
            S.lift = null;
            r.classList.remove('bl-lifted');
            ctx.sound('select');
            try { await ctx.moveInQueue(r.blQueue.playlistItemId, at); } catch (e) { B.notice('That didn’t work', true); }
            B.hintsFor(r);
            drawQueue();
        }
        function cancelLift() { if (!S.lift) return; S.lift.row.classList.remove('bl-lifted'); S.lift = null; ctx.sound('back'); drawQueue(); }

        function tick() {
            if (!S) return;
            const it = nowItem();
            S.empty.hidden = !!it;
            S.root.classList.toggle('bl-np-idle', !it);
            if (!it) return;
            if (S.id !== it.Id) {
                S.id = it.Id;
                S.title.textContent = it.Name || '';
                S.artist.textContent = artistOf(it);
                S.album.textContent = it.Album || '';
                const art = artFor(it);
                S.art.style.backgroundImage = art ? `url("${art}")` : '';
                S.art.textContent = '';
                if (!art) S.art.append(B.icon('album', 'bl-card-icon'));
                drawQueue();
            }
            const s = state();
            const pos = s ? s.position : 0, dur = s ? s.duration : 0;
            const frac = dur ? Math.min(1, pos / dur) : 0;
            S.fill.style.width = `${frac * 100}%`;
            S.knob.style.left = `${frac * 100}%`;
            const vol = s ? (s.muted ? 0 : (s.volume == null ? 100 : s.volume)) : 100;
            S.volFill.style.width = `${vol}%`;
            S.volKnob.style.left = `${vol}%`;
            S.fav.classList.toggle('on', !!(it.UserData || {}).IsFavorite);
            S.pos.textContent = fmt(pos);
            S.dur.textContent = dur ? fmt(dur) : '';
            const ic = (b, name) => { const i = b.querySelector('.bl-ic'); if (i && i.textContent !== name) i.textContent = name; };
            ic(S.pp, s && s.paused ? 'play_arrow' : 'pause');
            S.pp.setAttribute('aria-label', s && s.paused ? 'Play' : 'Pause');
            ic(S.mute, s && s.muted ? 'volume_off' : 'volume_up');
            const m = ctx.playMode ? ctx.playMode() : null;
            if (m) { S.shuffle.classList.toggle('on', !!m.shuffle); S.repeat.classList.toggle('on', m.repeat !== 'RepeatNone'); ic(S.repeat, m.repeat === 'RepeatOne' ? 'repeat_one' : 'repeat'); }
        }
    }

    function lyricsScreen() {
        let S = null;
        return {
            first: true,
            async mount(root) {
                root.setAttribute('data-bl-screen', 'lyrics');
                const page = B.page(root, 'bl-lyrics');
                B.header(root, { title: 'Lyrics' }).querySelector('.bl-header-right').hidden = true;
                const me = S = { root, lines: [], timed: false };
                me.box = el('div', 'bl-lyrics-box');
                page.append(me.box);
                me.timer = setInterval(tick, 300);
                await load();
                if (S !== me) return;
                B.arrive(root, me.box.querySelector('.bl-lyric') || root.querySelector('.bl-header .bl-hbtn'));
                root.setAttribute('data-bl-ready', '1');
            },
            unmount() { if (S) clearInterval(S.timer); S = null; B.hintsOff(); },
            onAction(a) { if (S && (a === 'play_pause' || a === 'playpause')) { const p = player(); if (p && p.playPause) p.playPause(); return true; } return false; }
        };
        async function load() {
            const me = S;
            const it = nowItem();
            me.id = it ? it.Id : null;
            me.box.textContent = '';
            me.lines = [];
            if (!it) { me.box.append(el('div', 'bl-lyrics-none', 'This item has no lyrics.')); return; }
            let r = null;
            const c = B.client();
            try { r = await c.getJSON(c.getUrl(`Audio/${it.Id}/Lyrics`)); } catch (e) { r = null; }
            if (S !== me) return;
            const list = (r && r.Lyrics) || [];
            me.timed = list.some((x) => x.Start != null);
            if (!list.length) { me.box.append(el('div', 'bl-lyrics-none', 'This item has no lyrics.')); return; }
            for (const x of list) {
                const l = B.btn('bl-lyric', x.Text || '');
                l.blStart = x.Start != null ? x.Start / 10000 : null;
                l.blHints = me.timed ? [['OK', 'seek here'], ['▶', 'pause'], ['Back', '']] : [['▶', 'pause'], ['Back', '']];
                if (me.timed) l.addEventListener('click', () => { const p = player(); if (p && p.seek && l.blStart != null) p.seek(l.blStart); });
                me.box.append(l);
                me.lines.push(l);
            }
            me.root.classList.toggle('bl-lyrics-timed', me.timed);
        }
        function tick() {
            if (!S || S.loading) return;
            const it = nowItem();
            if ((it ? it.Id : null) !== S.id) { S.loading = true; load().finally(() => { if (S) S.loading = false; }); return; }
            if (!S.timed || !S.lines.length) return;
            const s = state(), pos = s ? s.position : 0;
            let k = -1;
            for (let i = 0; i < S.lines.length; i++) if (S.lines[i].blStart != null && S.lines[i].blStart <= pos) k = i;
            if (k === S.cur) return;
            S.cur = k;
            S.lines.forEach((l, i) => { l.classList.toggle('now', i === k); l.classList.toggle('past', i < k); });
            if (k >= 0) { const l = S.lines[k], pg = S.root.querySelector('.bl-page'); if (pg) pg.scrollTo({ top: l.offsetTop - pg.clientHeight / 2 + l.offsetHeight / 2, behavior: B.reduced() ? 'auto' : 'smooth' }); }
        }
    }
    B.register('#/queue', nowScreen());
    B.register('#/lyrics', lyricsScreen());

    // ---- stock's now playing bar (checklist 1.1 and 1.2, QA pre-pass: music started from a library or an album
    // showed nothing at all): while music plays, along the bottom of every Baseline screen, not over video and not on
    // Now Playing or Lyrics. The progress line on top, the picture and the song (OK opens Now Playing), then Previous,
    // Play/Pause, Stop and Next. Its controls are the screen's, so the D-pad reaches them; when the bar goes while it
    // has focus, the screen's own arrival takes it back.
    let bar = null;
    function buildBar() {
        const b = el('div', 'bl-npbar');
        b.setAttribute('role', 'region');
        b.setAttribute('aria-label', 'Now playing');
        const line = el('div', 'bl-npbar-line');
        const fill = el('div', 'bl-npbar-fill');
        line.append(fill);
        const info = B.btn('bl-npbar-info', null);
        const img = el('div', 'bl-npbar-img');
        const text = el('div', 'bl-npbar-text');
        const t1 = el('div', 'bl-npbar-title'), t2 = el('div', 'bl-npbar-sub');
        text.append(t1, t2);
        info.append(img, text);
        info.blHints = [['OK', 'now playing'], ['▶', 'play or pause'], ['Back', '']];
        info.addEventListener('click', () => { ctx.sound('select'); B.go('#/queue'); });
        const mid = el('div', 'bl-npbar-buttons');
        const p = () => player() || {};
        const pp = ib('pause', 'Pause', () => { if (p().playPause) p().playPause(); setTimeout(updateBar, 80); });
        mid.append(ib('skip_previous', 'Previous Track', () => p().previousItem && p().previousItem()), pp,
            ib('stop', 'Stop', () => { if (p().stop) p().stop(); setTimeout(updateBar, 300); }), ib('skip_next', 'Next Track', () => p().nextItem && p().nextItem()));
        b.append(line, info, mid);
        b.parts = { fill, img, t1, t2, pp, info, id: null };
        return b;
    }
    function updateBar() {
        const r = document.getElementById('icefin-theme-root');
        const s = state();
        const on = !!(r && !r.hidden && r.classList.contains('bl-screen') && s && s.active && s.mediaType === 'Audio'
            && !/^#\/(queue|lyrics|video)\b/.test(location.hash));
        document.documentElement.classList.toggle('bl-np-up', on);
        if (!on) {
            if (bar && bar.isConnected) {
                const had = bar.contains(ctx.focused && ctx.focused());
                bar.remove();
                if (had && r && !r.hidden) B.arrive(r);
            }
            return;
        }
        if (!bar) bar = buildBar();
        if (bar.parentElement !== r) r.append(bar);
        const q = bar.parts, it = s.item || {};
        if (q.id !== it.Id) {
            q.id = it.Id;
            const art = artFor(it) || s.poster || '';
            q.img.style.backgroundImage = art ? `url("${art}")` : '';
            q.img.textContent = '';
            if (!art) q.img.append(B.icon('audiotrack'));
            q.t1.textContent = it.Name || '';
            q.t2.textContent = artistOf(it);
            q.info.setAttribute('aria-label', [it.Name, artistOf(it)].filter(Boolean).join(', '));
        }
        q.fill.style.width = `${s.duration ? Math.min(100, (s.position / s.duration) * 100) : 0}%`;
        const icon = s.paused ? 'play_arrow' : 'pause';
        const ic = q.pp.querySelector('.bl-ic');
        if (ic && ic.textContent !== icon) { ic.textContent = icon; q.pp.title = s.paused ? 'Play' : 'Pause'; q.pp.setAttribute('aria-label', q.pp.title); }
    }
    if (window.icefinBaselineNpBar) clearInterval(window.icefinBaselineNpBar);  // the theme loaded again: one timer
    window.icefinBaselineNpBar = setInterval(() => { try { updateBar(); } catch (e) { console.warn('baseline: now playing bar', e); } }, 500);
})();
