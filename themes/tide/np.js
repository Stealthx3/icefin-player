// Tide: Now playing, the queue and lyrics (PLAN 9.48; the canvas's NowPlaying and HomeMusic boards), on #/queue and
// #/lyrics in place of jellyfin-web's pages. The song's art with its title, artist and album, a time line a pointer
// can seek, the transport (shuffle, previous, play/pause, next, repeat, favourite); the queue as a column above it
// (OK plays from a song, ≡ moves it with the reorder model, removes it, clears or saves the queue); the lyrics on the
// right when the song has them, the sung line larger and glowing, the rest scrolling smoothly. The Music column on the
// home starts with Now playing while music plays (D.nowPlayingEntry).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinTide;
    if (!T || !D) return;
    const ui = T.ui;
    const el = D.el;
    const ctx = T.ctx;
    const two = (n) => String(n).padStart(2, '0');
    const fmt = (ms) => { const s = Math.max(0, Math.floor((ms || 0) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`; };
    const player = () => (ui.player && ui.player.controls ? ui.player.controls() : null);
    const state = () => { const p = player(); try { return p && p.state ? p.state() : null; } catch (e) { return null; } };
    const audioNow = () => { const n = ctx.nowPlaying && ctx.nowPlaying(); return n && n.item && (n.item.MediaType === 'Audio' || n.item.Type === 'Audio') ? n.item : null; };
    const artistOf = (it) => (it.Artists || [])[0] || it.AlbumArtist || '';

    // the home's Music column starts with Now playing while music plays (HomeMusic board)
    D.nowPlayingEntry = () => {
        const it = audioNow();
        if (!it) return null;
        return Object.assign(D.entry(it), { name: 'Now playing', sub: [it.Name, artistOf(it)].filter(Boolean).join(' · '), focusFirst: true, okLabel: 'open',
            go: () => ctx.navigate('#/queue'), play: () => { const p = player(); if (p && p.playPause) p.playPause(); } });
    };

    function screen(start) {
        let S = null;
        return {
            mount(root) {
                root.setAttribute('data-td-screen', 'music');
                const me = S = { root, lift: null, lines: [], timed: false, lyricId: null };
                me.wave = D.ground(root);
                me.clock = D.clock(root);
                D.pointerNav(root);
                // the queue (Up next) above the song
                me.queueHead = el('div', 'td-np-qhead', 'Up next');
                me.queue = el('div', 'td-np-queue');
                // the song
                const song = el('div', 'td-np-song');
                me.art = el('div', 'td-np-art');
                const info = el('div', 'td-np-info');
                me.title = el('div', 'td-np-title');
                me.sub = el('div', 'td-np-sub');
                const tl = el('div', 'td-np-time');
                me.pos = el('span', '', '0:00');
                me.bar = D.focusable(el('div', 'td-np-bar'));
                me.bar.setAttribute('role', 'slider');
                me.bar.setAttribute('aria-label', 'Time line: ◀ ▶ seek');
                me.fill = el('div', 'td-np-fill');
                me.knob = el('i', 'td-np-knob');
                me.fill.append(me.knob);
                me.bar.append(me.fill);
                me.dur = el('span', '', '');
                tl.append(me.pos, me.bar, me.dur);
                me.bar.addEventListener('pointerdown', (e) => { const p = player(), s = state(); if (!p || !s || !s.duration) return; const r = me.bar.getBoundingClientRect(); p.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * s.duration); });
                const tr = el('div', 'td-np-transport');
                const btn = (label, glyph, go) => { const b = D.focusable(el('button', 'td-np-btn', glyph)); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', () => { ctx.sound('select'); go(); tick(); }); tr.append(b); return b; };
                me.shuffle = btn('Shuffle', '⇄', () => { const p = player(); if (p && p.toggleShuffle) p.toggleShuffle(); else if (ctx.setShuffle) { const m = ctx.playMode(); ctx.setShuffle(!(m && m.shuffle)); } });
                btn('Previous', '◀◀', () => { const p = player(); if (p) p.previousItem(); });
                me.pp = btn('Play or pause', '❚❚', () => { const p = player(); if (p) p.playPause(); });
                btn('Next', '▶▶', () => { const p = player(); if (p) p.nextItem(); });
                me.repeat = btn('Repeat', '↻', () => { const m = ctx.playMode ? ctx.playMode() : null; const nxt = !m || m.repeat === 'RepeatNone' ? 'RepeatAll' : m.repeat === 'RepeatAll' ? 'RepeatOne' : 'RepeatNone'; if (ctx.setRepeat) ctx.setRepeat(nxt); });
                me.fav = btn('Favourite', '♡', async () => { const it = audioNow(); if (!it) return; const now = !(it.UserData || {}).IsFavorite; try { await D.client().updateFavoriteStatus(D.uid(), it.Id, now); it.UserData = Object.assign({}, it.UserData, { IsFavorite: now }); D.notice(now ? 'Added to favourites' : 'Taken out of favourites'); } catch (e) { D.notice('That didn’t work', true); } });
                info.append(me.title, me.sub, tl, tr);
                song.append(me.art, info);
                // lyrics on the right
                me.lyrics = el('div', 'td-np-lyrics');
                me.empty = el('div', 'td-np-nothing');
                root.append(me.queueHead, me.queue, song, me.lyrics, me.empty);
                me.timer = setInterval(tick, 500);
                tick(true);
                drawQueue();
                setTimeout(() => { if (S === me) ctx.focus(start === 'lyrics' ? me.bar : me.pp); }, 60);
                if (start === 'lyrics') root.classList.add('td-np-lyrics-first');
                D.hints([['OK', 'choose'], ['▶', 'pause'], ['◀ ▶', 'seek on the line'], ['≡', 'queue options'], ['Back', '']]);
            },
            unmount() { if (S) { clearInterval(S.timer); S.wave.stop(); S.clock.stop(); } S = null; D.hintsOff(); },
            onAction(a, c2) {
                if (!S) return false;
                if (a === 'play_pause' || a === 'playpause') { const p = player(); if (p) p.playPause(); tick(); return true; }
                if (S.lift) {
                    if (a === 'up' || a === 'down') { moveLift(a === 'up' ? -1 : 1); return true; }
                    if (a === 'enter' || a === 'select' || a === 'menu') { dropLift(); return true; }
                    if (a === 'back') { cancelLift(); return true; }
                    return true;
                }
                const f = c2.focused();
                if ((a === 'left' || a === 'right') && f === S.bar) { const p = player(); if (p) p.seekBy(a === 'right' ? 10000 : -10000); ctx.sound('navigate'); tick(); return true; }
                if (a === 'menu') { queueMenu(f && f.tdQueue ? f : null); return true; }
                if (a === 'back') { ctx.sound('back'); if (history.length > 1) history.back(); else ctx.navigate('#/home'); return true; }
                return false;
            },
            onBack() { return false; }
        };

        async function drawQueue() {
            if (!S || !ctx.queueItems) return;
            const me = S;
            let q = null;
            try { q = await ctx.queueItems(); } catch (e) { q = null; }
            if (S !== me) return;
            me.queue.textContent = '';
            me.q = q;
            if (!q || !q.items.length) { me.queueHead.textContent = 'Up next · nothing queued'; return; }
            const after = q.items.slice(q.index + 1);
            me.queueHead.textContent = `Up next · ${after.length}`;
            const show = q.items.slice(Math.max(0, q.index - 1), q.index + 6);
            for (const it of show) {
                const at = q.items.indexOf(it);
                const r = D.focusable(el('div', 'td-np-qrow' + (at === q.index ? ' playing' : '') + (at < q.index ? ' past' : '')));
                const a = el('i', 'td-np-qart');
                if (it.image) a.style.backgroundImage = `url("${it.image}")`;
                r.append(a, el('span', 'td-np-qname', `${at === q.index ? '▶ ' : ''}${it.name || ''}`), el('span', 'td-np-qsub', at === q.index ? 'playing' : (it.runtime ? fmt(it.runtime / 1e4) : '')));
                r.tdQueue = it;
                r.setAttribute('role', 'button');
                r.setAttribute('aria-label', `${it.name}${it.artist ? `, ${it.artist}` : ''}`);
                r.addEventListener('click', () => { if (ctx.playQueueAt) ctx.playQueueAt(it.playlistItemId); ctx.sound('select'); setTimeout(drawQueue, 600); });
                me.queue.append(r);
            }
        }
        // ≡ on a song of the queue (or anywhere here): Move, Remove, Clear, Save as a playlist (checklist 1.7)
        function queueMenu(row) {
            const it = row && row.tdQueue;
            D.panel.show({
                title: it ? it.name : 'The queue', path: 'Now playing',
                render(body) {
                    if (it && ctx.moveInQueue) body.append(D.row('Move', { sub: '▲ ▼ to carry it, OK to place it', go: () => { D.panel.close(); setTimeout(() => startLift(row), 260); } }));
                    if (it && ctx.removeFromQueue) body.append(D.row('Remove from the queue', { go: async () => { await ctx.removeFromQueue([it.playlistItemId]); D.panel.close(); drawQueue(); } }));
                    if (ctx.saveQueueAsPlaylist) body.append(D.row('Save the queue as a playlist…', { go: () => D.panel.push({ title: 'Save as a playlist', path: 'The queue', render(b) {
                        const name = D.field('Name', '', { placeholder: '[Road trip]' });
                        b.append(name, D.foot(D.button('Save', async () => { const n = name.input.value.trim(); if (!n) { ctx.sound('error'); return; } const ok = await ctx.saveQueueAsPlaylist(n); D.panel.close(); D.notice(ok ? `Saved as ${n}` : 'That didn’t work', !ok); }, true)));
                    } }) }));
                    if (ctx.clearQueue) body.append(D.row('Clear the queue', { danger: true, go: () => D.panel.ask({ push: true, title: 'Clear the queue?', path: 'Now playing', choices: [{ label: 'Keep it', safe: true }, { label: 'Clear', danger: true, run: async () => { await ctx.clearQueue(); drawQueue(); } }] }) }));
                    const song = audioNow();
                    if (song) body.append(el('div', 'td-rule'), D.row('Options for this song…', { go: () => D.itemMenu(song, {}) }));
                }
            });
        }
        // the reorder model (checklist 2.6): lifted, ▲ ▼ carry it, OK places it, Back puts it back
        function startLift(row) {
            if (!S || !row || !row.isConnected) return;
            S.lift = { row, from: [...S.queue.children].indexOf(row) };
            row.classList.add('td-lifted');
            ctx.focus(row);
            ctx.sound('select');
            D.hints([['▲ ▼', 'carry'], ['OK', 'place'], ['Back', 'put it back']]);
        }
        function moveLift(dir) {
            const r = S.lift.row, sib = dir < 0 ? r.previousElementSibling : r.nextElementSibling;
            if (!sib || sib.classList.contains('playing') || sib.classList.contains('past')) { ctx.sound('error'); return; }
            if (dir < 0) S.queue.insertBefore(r, sib); else S.queue.insertBefore(sib, r);
            ctx.sound('focus');
        }
        async function dropLift() {
            const r = S.lift.row;
            const at = [...S.queue.children].indexOf(r);
            const base = S.q ? S.q.items.indexOf(S.q.items.find((x) => x === S.queue.children[0].tdQueue)) : 0;
            S.lift = null;
            r.classList.remove('td-lifted');
            ctx.sound('select');
            try { await ctx.moveInQueue(r.tdQueue.playlistItemId, base + at); } catch (e) { D.notice('That didn’t work', true); }
            drawQueue();
        }
        function cancelLift() { if (!S.lift) return; S.lift.row.classList.remove('td-lifted'); S.lift = null; ctx.sound('back'); drawQueue(); }

        async function loadLyrics(it) {
            const me = S;
            me.lyricId = it.Id;
            me.lyrics.textContent = '';
            me.lines = [];
            let r = null;
            const c = D.client();
            try { r = await c.getJSON(c.getUrl(`Audio/${it.Id}/Lyrics`)); } catch (e) { r = null; }
            if (S !== me || me.lyricId !== it.Id) return;
            const list = (r && r.Lyrics) || [];
            me.timed = list.some((x) => x.Start != null);
            me.root.classList.toggle('td-np-has-lyrics', !!list.length);
            for (const x of list) { const l = el('div', 'td-np-line', x.Text || '♪'); l.tdStart = x.Start != null ? x.Start / 10000 : null; me.lyrics.append(l); me.lines.push(l); }
        }
        function tick(first) {
            if (!S) return;
            const it = audioNow();
            S.empty.hidden = !!it;
            S.root.classList.toggle('td-np-idle', !it);
            if (!it) { S.empty.textContent = 'Nothing is playing. Music you play shows here.'; return; }
            if (S.id !== it.Id) {
                S.id = it.Id;
                S.title.textContent = it.Name || '';
                S.sub.textContent = [artistOf(it), it.Album].filter(Boolean).join(' · ');
                const art = D.artOf(it, 500);
                S.art.style.backgroundImage = art ? `url("${art}")` : '';
                S.art.classList.toggle('none', !art);
                loadLyrics(it);
                if (!first) drawQueue();
            }
            const s = state();
            const pos = s ? s.position : 0, dur = s ? s.duration : 0;
            S.fill.style.width = dur ? `${Math.min(100, (pos / dur) * 100)}%` : '0%';
            S.pos.textContent = fmt(pos);
            S.dur.textContent = dur ? fmt(dur) : '';
            S.pp.textContent = s && s.paused ? '▶' : '❚❚';
            S.pp.setAttribute('aria-label', s && s.paused ? 'Play' : 'Pause');
            const m = ctx.playMode ? ctx.playMode() : null;
            if (m) { S.shuffle.classList.toggle('on', !!m.shuffle); S.repeat.classList.toggle('on', m.repeat !== 'RepeatNone'); S.repeat.textContent = m.repeat === 'RepeatOne' ? '↻1' : '↻'; }
            S.fav.textContent = (it.UserData || {}).IsFavorite ? '♥' : '♡';
            // the sung line: the last whose start has passed; it grows and the lines scroll it to the middle
            if (S.timed && S.lines.length) {
                let k = -1;
                for (let i = 0; i < S.lines.length; i++) if (S.lines[i].tdStart != null && S.lines[i].tdStart <= pos) k = i;
                if (k !== S.cur) {
                    S.cur = k;
                    S.lines.forEach((l, i) => { l.classList.toggle('now', i === k); l.classList.toggle('near', Math.abs(i - k) === 1); });
                    if (k >= 0) S.lyrics.scrollTo({ top: S.lines[k].offsetTop - S.lyrics.clientHeight / 2 + S.lines[k].offsetHeight / 2, behavior: D.reduced() ? 'auto' : 'smooth' });
                }
            }
        }
    }
    D.register('#/queue', screen('now'));
    D.register('#/lyrics', screen('lyrics'));
})();
