// Media Center: now playing and lyrics (PLAN 9.46), from the design canvas's "now playing (music)" and "lyrics" boards,
// on ui.player.controls() (9.46: the player's state and commands outside the video screen). Now playing: the actions in
// a column at the left, the album art, the song and what's next, the progress and the round transport. Lyrics: the art
// and progress at the left, timed lines scrolling with the current one lit.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    if (!T || !M || !T.ui.player || !T.ui.player.controls) return;
    const { el, focusable, svg, ICON } = M;
    const fmt = (ms) => { const s = Math.max(0, Math.floor((ms || 0) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const REPEAT = { RepeatNone: 'off', RepeatAll: 'all', RepeatOne: 'this song' };
    const NEXT_REPEAT = { RepeatNone: 'RepeatAll', RepeatAll: 'RepeatOne', RepeatOne: 'RepeatNone' };

    function art(s) {
        const it = s.item || {}, c = M.client();
        const id = it.AlbumId && it.AlbumPrimaryImageTag ? it.AlbumId : it.Id;
        const tag = it.AlbumId && it.AlbumPrimaryImageTag ? it.AlbumPrimaryImageTag : (it.ImageTags || {}).Primary;
        return tag ? c.getScaledImageUrl(id, { type: 'Primary', maxHeight: 600, tag }) : null;
    }
    function nothing(root) {
        const box = el('div', 'mc-np-empty');
        box.append(el('div', 'mc-band-title', 'Nothing is playing'), el('div', 'mc-note', 'Pick an album or a playlist from the music library.'));
        const go = focusable(el('button', 'mc-btn', 'Music library'));
        go.type = 'button';
        go.addEventListener('click', () => T.ctx.navigate('#/home'));
        box.append(go);
        root.append(box);
        T.ctx.focus(go);
    }

    let N = null;
    T.registerScreen('#/queue', {
        onAction(action, ctx) {
            if (M.band.open && ['up', 'down', 'left', 'right'].includes(action)) { ctx.move(action, M.band.open.el); return true; }
            return false;
        },
        onBack() { if (M.band.open) { M.band.open.close(); return true; } return false; },
        mount(root) {
            root.setAttribute('data-mc', 'nowplaying');
            const field = el('div', 'mc-field');
            field.append(el('div', 'mc-ribbon one'), el('div', 'mc-ribbon two'));
            root.append(field);
            const chrome = M.chrome(root, 'now playing');
            const p = T.ui.player.controls();
            N = { root, chrome, p };
            if (!p.state().active) { nothing(root); return; }
            if (/[?&]view=queue\b/.test(location.hash) && typeof T.ctx.queueItems === 'function') { queue(root); return; }
            const col = el('div', 'mc-np-actions');
            const btn = (label, fn) => { const b = focusable(el('button', 'mc-btn', label)); b.type = 'button'; b.addEventListener('click', () => { T.ctx.sound('select'); fn(b); }); col.append(b); return b; };
            btn('View queue', () => T.ctx.navigate(typeof T.ctx.queueItems === 'function' ? '#/queue?view=queue' : '#/queue?icefin=stock'));
            N.shuffle = btn('Shuffle', () => p.toggleShuffle());
            N.repeat = btn('Repeat', () => p.setRepeat(NEXT_REPEAT[p.state().repeat] || 'RepeatNone'));
            btn('Lyrics', () => T.ctx.navigate('#/lyrics'));
            btn('Instant mix', () => { const s = p.state(); if (s.item) T.ctx.instantMix(s.item); });
            N.art = el('div', 'mc-np-art');
            const info = el('div', 'mc-np-info');
            N.title = el('div', 'mc-np-title');
            N.artist = el('div', 'mc-np-artist');
            N.album = el('div', 'mc-np-album');
            N.next = el('div', 'mc-np-next');
            info.append(N.title, N.artist, N.album, el('div', 'mc-sec', 'next'), N.next);
            const bar = el('div', 'mc-np-bar');
            N.fill = el('div', 'mc-p-fill');
            const track = el('div', 'mc-p-track');
            track.append(N.fill);
            const times = el('div', 'mc-p-times');
            N.pos = el('span'); N.dur = el('span');
            times.append(N.pos, N.dur);
            bar.append(track, times);
            const tr = el('div', 'mc-np-transport');
            const tb = (label, icon, fn, big) => { const b = focusable(el('button', 'mc-tb' + (big ? ' mc-tb-big' : ''))); b.type = 'button'; b.setAttribute('aria-label', label); b.append(svg(icon)); b.addEventListener('click', () => { T.ctx.sound('select'); fn(); }); tr.append(b); return b; };
            tb('Previous', ICON.prev, () => p.previousItem());
            N.pp = tb('Pause', ICON.pause, () => p.playPause(), true);
            tb('Next', ICON.next, () => p.nextItem());
            tb('Stop', ICON.stop, () => p.stop());
            root.append(col, N.art, info, bar, tr);
            let lastItem = '';
            const update = (s) => {
                if (!N || N.root !== root) return;
                if (!s.active) { T.ctx.navigate('#/home'); return; }
                if (s.itemId !== lastItem) {
                    lastItem = s.itemId;
                    const a = art(s);
                    N.art.style.backgroundImage = a ? `url("${a}")` : 'none';
                    N.title.textContent = s.item.Name || '';
                    N.artist.textContent = (s.item.Artists || []).join(', ') || s.item.AlbumArtist || '';
                    N.album.textContent = [s.item.Album, s.item.ProductionYear].filter(Boolean).join(' · ');
                }
                N.next.textContent = s.next ? [s.next.Name, (s.next.Artists || [])[0]].filter(Boolean).join(' · ') : 'the end of the queue';
                N.fill.style.width = `${s.duration ? Math.min(100, (s.position / s.duration) * 100) : 0}%`;
                N.pos.textContent = fmt(s.position);
                N.dur.textContent = fmt(s.duration);
                N.pp.textContent = '';
                N.pp.append(svg(s.paused ? ICON.play : ICON.pause));
                N.pp.setAttribute('aria-label', s.paused ? 'Play' : 'Pause');
                N.shuffle.textContent = `Shuffle: ${s.shuffle === 'Shuffle' ? 'on' : 'off'}`;
                N.repeat.textContent = `Repeat: ${REPEAT[s.repeat] || 'off'}`;
            };
            N.off = p.on(update);
            update(p.state());
            T.ctx.focus(col.firstChild);
            root.setAttribute('data-mc-ready', '1');
        },
        unmount() { if (N) { if (N.off) N.off(); N.chrome.stop(); } N = null; }
    });

    // ---- the queue (9.44 ctx.queueItems and friends): the canvas's "the queue" ----
    async function queue(root) {
        N.root.dataset.mc = 'queue';
        N.chrome.head.textContent = 'queue';
        const col = el('div', 'mc-np-actions');
        const list = el('div', 'mc-q-list');
        const count = el('div', 'mc-count');
        root.append(col, list, count);
        const b = (label, fn) => { const x = focusable(el('button', 'mc-btn', label)); x.type = 'button'; x.addEventListener('click', () => { T.ctx.sound('select'); fn(); }); col.append(x); return x; };
        b('Now playing', () => T.ctx.navigate('#/queue'));
        b('Shuffle', async () => { const m = await T.ctx.playMode(); await T.ctx.setShuffle(!(m && m.shuffle === 'Shuffle')); draw(); });
        b('Save as playlist', async () => { const ok = await T.ctx.saveQueueAsPlaylist(`Queue ${new Date().toLocaleDateString()}`); T.ctx.sound(ok === false ? 'error' : 'select'); });
        b('Clear queue', () => M.band(root, { title: 'Clear the queue?', text: 'What plays now stops.', choices: [{ label: 'Clear it', run: async () => { await T.ctx.clearQueue(); T.ctx.navigate('#/home'); } }, { label: 'Keep it', safe: true }] }));
        async function draw(focusId) {
            const q = await T.ctx.queueItems();
            if (!N || N.root !== root) return;
            list.textContent = '';
            const items = (q && q.items) || [];
            items.forEach((it, i) => {
                const r = focusable(el('div', 'mc-li mc-q-row' + (i === q.index ? ' now' : '')));
                const mins = it.runtime ? `${Math.floor(it.runtime / 60000)}:${String(Math.floor(it.runtime / 1000) % 60).padStart(2, '0')}` : '';
                r.append(el('b', 'mc-q-n', i === q.index ? '▶' : String(i + 1)), el('span', 'mc-li-label', [it.name, it.artist].filter(Boolean).join(' · ')), el('span', 'mc-li-value', mins));
                r.addEventListener('icefin-focus', () => { count.textContent = `${i + 1} | ${items.length}`; });
                r.addEventListener('click', () => {
                    T.ctx.sound('select');
                    M.band(root, { title: it.name, text: [it.artist, it.album].filter(Boolean).join(' · '), choices: [
                        { label: 'Play from here', run: async () => { await T.ctx.playQueueAt(it.playlistItemId); draw(it.playlistItemId); } },
                        { label: 'Move up', run: async () => { await T.ctx.moveInQueue(it.playlistItemId, Math.max(0, i - 1)); draw(it.playlistItemId); } },
                        { label: 'Move down', run: async () => { await T.ctx.moveInQueue(it.playlistItemId, Math.min(items.length - 1, i + 1)); draw(it.playlistItemId); } },
                        { label: 'Remove', run: async () => { await T.ctx.removeFromQueue([it.playlistItemId]); draw(); } },
                        { label: 'Cancel', safe: true }] }).then(() => { if (!M.band.open) { const f = list.querySelector(`[data-pid="${focusId || it.playlistItemId}"]`); if (f) T.ctx.focus(f); } });
                });
                r.dataset.pid = it.playlistItemId;
                list.append(r);
            });
            if (!items.length) list.append(el('div', 'mc-lib-empty', 'The queue is empty.'));
            const f = (focusId && list.querySelector(`[data-pid="${focusId}"]`)) || list.querySelector('.mc-q-row.now') || col.firstChild;
            if (f) { T.ctx.focus(f); f.scrollIntoView({ block: 'center' }); }
            root.setAttribute('data-mc-ready', '1');
        }
        await draw();
    }

    let Y = null;
    T.registerScreen('#/lyrics', {
        async mount(root) {
            root.setAttribute('data-mc', 'lyrics');
            const field = el('div', 'mc-field');
            field.append(el('div', 'mc-ribbon one'), el('div', 'mc-ribbon two'));
            root.append(field);
            const chrome = M.chrome(root, 'lyrics');
            const p = T.ui.player.controls();
            Y = { root, chrome };
            const s0 = p.state();
            if (!s0.active) { nothing(root); return; }
            const side = el('div', 'mc-ly-side');
            const a = el('div', 'mc-np-art mc-ly-art');
            const t = el('div', 'mc-np-title'), ar = el('div', 'mc-np-artist');
            const track = el('div', 'mc-p-track'), fill = el('div', 'mc-p-fill');
            track.append(fill);
            const tm = el('div', 'mc-p-times');
            side.append(a, t, ar, track, tm);
            const lines = el('div', 'mc-ly-lines');
            const back = focusable(el('button', 'mc-btn mc-ly-back', 'Now playing'));
            back.type = 'button';
            back.addEventListener('click', () => T.ctx.navigate('#/queue'));
            side.append(back);
            root.append(side, lines);
            T.ctx.focus(back);
            let item = '', timed = false, rows = [];
            async function load(s) {
                item = s.itemId;
                const im = art(s);
                a.style.backgroundImage = im ? `url("${im}")` : 'none';
                t.textContent = s.item.Name || '';
                ar.textContent = (s.item.Artists || []).join(', ');
                lines.textContent = '';
                rows = [];
                const c = M.client();
                let ly = null;
                try { ly = await c.getJSON(c.getUrl(`Audio/${s.itemId}/Lyrics`)); } catch (e) { ly = null; }
                if (!Y || Y.root !== root || item !== s.itemId) return;
                const list = (ly && ly.Lyrics) || [];
                if (!list.length) { lines.append(el('div', 'mc-note', 'No lyrics for this song.')); return; }
                timed = list.some((l) => l.Start != null);
                rows = list.map((l) => { const r = el('p', 'mc-ly-line', l.Text || ' '); r.mcStart = l.Start != null ? l.Start / 10000 : null; lines.append(r); return r; });
            }
            const update = (s) => {
                if (!Y || Y.root !== root) return;
                if (!s.active) return;
                if (s.itemId !== item) load(s);
                fill.style.width = `${s.duration ? Math.min(100, (s.position / s.duration) * 100) : 0}%`;
                tm.textContent = `${fmt(s.position)} / ${fmt(s.duration)}`;
                if (!timed || !rows.length) return;
                let k = -1;
                rows.forEach((r, i) => { if (r.mcStart != null && r.mcStart <= s.position + 200) k = i; });
                rows.forEach((r, i) => r.classList.toggle('now', i === k));
                if (k >= 0) lines.style.transform = `translateY(${Math.round(lines.parentNode.offsetHeight * 0.4 - rows[k].offsetTop)}px)`;
            };
            Y.off = p.on(update);
            update(s0);
            root.setAttribute('data-mc-ready', '1');
        },
        unmount() { if (Y) { if (Y.off) Y.off(); Y.chrome.stop(); } Y = null; }
    });
})();
