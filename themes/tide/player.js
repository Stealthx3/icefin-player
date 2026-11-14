// Tide: the player (PLAN 9.48; the canvas's Player and PlayerExtras boards; D30's ui.player). Two thin overlays: the
// title with what plays (ends at, audio, subtitles) at the top, the time line at the bottom (chapter ticks, a pointer
// can seek) with a small transport under it, a soft shade under each so they read over any picture. Everything else
// is in the options panel from the right: audio, subtitles and their timing, speed, aspect, chapters, repeat and
// shuffle, Play on, Watch together, playback info. The overlays fade and slide away after 3 s while playing (250 ms);
// any input brings them back; while they are hidden ◀ ▶ skip −10 / +30 s (on Live TV they change the channel).
// Skip prompts and Up next come from the engine's compatibility archive: a skip is a glowing word bottom right with a
// line counting its window (it takes focus while the controls are hidden, so OK answers it); Up next comes in from
// the right edge with the next item's still and a countdown, Play now focused.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinTide;
    if (!T || !T.ui || !T.ui.player || !T.ui.player.set || !D) return;
    D.ownPlayer = true;
    const el = D.el;
    const HIDE_MS = 3000;
    const two = (n) => String(n).padStart(2, '0');
    const fmt = (ms) => { const s = Math.max(0, Math.floor((ms || 0) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`; };
    let S = null;

    function build(root, player, ctx) {
        const box = el('div', 'td-pl');
        const top = el('div', 'td-pl-top');
        const title = el('div', 'td-pl-title');
        const sub = el('div', 'td-pl-sub');
        top.append(title, sub);
        const bottom = el('div', 'td-pl-bottom');
        const times = el('div', 'td-pl-times');
        const pos = el('span', '', '0:00'), rest = el('span', '', '');
        times.append(pos, rest);
        const bar = D.focusable(el('div', 'td-pl-bar'));
        bar.setAttribute('role', 'slider');
        bar.setAttribute('aria-label', 'Time line: ◀ ▶ seek');
        const fill = el('div', 'td-pl-fill');
        const knob = el('i', 'td-pl-knob');
        const ticks = el('div', 'td-pl-ticks');
        bar.append(ticks, fill, knob);
        let drag = false;
        const at = (e) => { const r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
        bar.addEventListener('pointerdown', (e) => { const s = player.state(); if (!s.canSeek) return; drag = true; bar.setPointerCapture(e.pointerId); player.seek(at(e) * s.duration); e.preventDefault(); poke(); });
        bar.addEventListener('pointermove', (e) => { if (drag) { const s = player.state(); player.seek(at(e) * s.duration); poke(); } });
        bar.addEventListener('pointerup', () => { drag = false; });
        const tr = el('div', 'td-pl-transport');
        const btn = (label, text, go) => { const b = D.focusable(el('button', 'td-pl-btn', text)); b.type = 'button'; b.setAttribute('aria-label', label); b.addEventListener('click', () => { ctx.sound('select'); go(); poke(); }); tr.append(b); return b; };
        const back10 = btn('Back 10 seconds', '◀◀ 10', () => { const s = player.state(); if (s.live) player.channelDown(); else player.seekBy(-10000); });
        const pp = btn('Pause', '❚❚', () => player.playPause());
        const fwd = btn('Forward 30 seconds', '30 ▶▶', () => { const s = player.state(); if (s.live) player.channelUp(); else player.seekBy(30000); });
        const next = btn('Next chapter', 'chapter ▶|', () => { const s = player.state(); if (s.next && !(s.chapters || []).length) player.nextItem(); else player.nextChapter(); });
        btn('Audio', 'audio', () => options('audio'));
        btn('Subtitles', 'subtitles', () => options('subtitles'));
        const opt = btn('Options and settings: speed, aspect, chapters, Play on', '≡ options', () => options());
        opt.title = 'Options and settings';
        bottom.append(times, bar, tr);
        const archive = el('div', 'td-pl-archive');
        box.append(el('div', 'td-pl-shade-top'), el('div', 'td-pl-shade-bottom'), top, bottom, archive);
        root.append(box);
        S = { root, box, player, ctx, title, sub, pos, rest, bar, fill, knob, ticks, pp, back10, fwd, next, archive, shown: false, timer: 0, archiveKey: '', ticksKey: '' };
    }

    function draw(s) {
        if (!S || !s) return;
        S.title.textContent = s.title || '';
        const audio = (s.audio || []).find((a) => a.selected);
        const sub = s.subtitleIndex >= 0 ? ((s.subtitles || []).find((x) => x.index === s.subtitleIndex) || {}).label : 'Subtitles off';
        S.sub.textContent = [s.subtitle, s.live ? 'Live' : (s.endsAt ? `ends at ${D.time(new Date(s.endsAt))}` : ''), audio ? audio.label : '', sub].filter(Boolean).join(' · ');
        const frac = s.duration ? Math.min(1, s.position / s.duration) : 0;
        S.fill.style.width = `${frac * 100}%`;
        S.knob.style.left = `${frac * 100}%`;
        S.pos.textContent = s.live ? 'Live' : fmt(s.position);
        S.rest.textContent = s.live ? '' : (s.duration ? `−${fmt(s.duration - s.position)}` : '');
        S.box.classList.toggle('td-pl-live', !s.canSeek);
        S.pp.textContent = s.paused ? '▶' : '❚❚';
        S.pp.setAttribute('aria-label', s.paused ? 'Play' : 'Pause');
        S.back10.textContent = s.live ? '◀ channel' : '◀◀ 10';
        S.fwd.textContent = s.live ? 'channel ▶' : '30 ▶▶';
        S.next.hidden = s.live || !((s.chapters || []).length > 1 || s.next);
        // chapter ticks along the line
        const key = (s.chapters || []).map((c) => c.start).join(',') + '/' + s.duration;
        if (key !== S.ticksKey) {
            S.ticksKey = key;
            S.ticks.textContent = '';
            if (s.duration) for (const c of (s.chapters || []).slice(1)) { const t = el('i'); t.style.left = `${(c.start / s.duration) * 100}%`; S.ticks.append(t); }
        }
        drawArchive(s);
        if (s.paused && !S.shown) show();
    }
    // skip prompts and Up next (PlayerExtras board)
    function drawArchive(s) {
        const list = s.archive || [];
        const key = list.map((a) => a.id + ':' + (a.label || a.title || '')).join('|');
        if (key === S.archiveKey) {
            for (const a of list) {
                const c = S.archive.querySelector(`[data-td-arch="${a.id}"] .td-pl-count`);
                if (c && a.countdown != null) c.textContent = a.kind === 'upNext' ? `Up next in ${a.countdown} s` : '';
                const ln = S.archive.querySelector(`[data-td-arch="${a.id}"] .td-pl-skipline b`);
                if (ln && a.countdown != null && a.total) ln.style.width = `${(a.countdown / a.total) * 100}%`;
            }
            return;
        }
        const had = S.archive.contains(S.ctx.focused());
        S.archiveKey = key;
        S.archive.textContent = '';
        for (const a of list) {
            if (a.kind === 'upNext') {
                const card = el('div', 'td-pl-upnext');
                card.dataset.tdArch = a.id;
                card.append(el('div', 'td-pl-count', a.countdown != null ? `Up next in ${a.countdown} s` : 'Up next'));
                if (a.image) { const im = el('div', 'td-pl-upnext-img'); im.style.backgroundImage = `url("${a.image}")`; card.append(im); }
                card.append(el('div', 'td-pl-upnext-title', a.title || a.label || ''));
                const row = el('div', 'td-pl-upnext-row');
                const go = D.focusable(el('button', 'td-pl-word', 'Play now'));
                go.type = 'button';
                go.addEventListener('click', () => { a.activate(); S.ctx.sound('select'); });
                row.append(go);
                if (a.dismiss) { const no = D.focusable(el('button', 'td-pl-word', 'Hide')); no.type = 'button'; no.addEventListener('click', () => { a.dismiss(); S.ctx.sound('back'); }); row.append(no); }
                card.append(row);
                S.archive.append(card);
            } else {
                const b = D.focusable(el('button', 'td-pl-skip'));
                b.type = 'button';
                b.dataset.tdArch = a.id;
                b.append(el('span', '', `${a.label || 'Skip'} ›`), el('span', 'td-pl-skipline'));
                b.lastChild.append(el('b'));
                b.addEventListener('click', () => { a.activate(); S.ctx.sound('select'); });
                S.archive.append(b);
            }
        }
        // a new prompt takes focus while the controls are hidden, so OK answers it
        const first = S.archive.querySelector('[data-icefin-focus]');
        if (first && (!S.shown || had) && !(D.panel && D.panel.isOpen())) S.ctx.focus(first);
        S.box.classList.toggle('td-pl-prompt', !!list.length);
    }

    function show(focusIt) {
        if (!S) return;
        S.shown = true;
        S.box.classList.add('td-pl-shown');
        D.hints([['OK', 'choose'], ['▶', 'pause'], ['≡', 'options'], ['Back', 'hide']]);
        // the options panel keeps its focus: the controls behind it never take it back
        if (!(D.panel && D.panel.isOpen()) && (focusIt || !S.box.contains(S.ctx.focused()))) S.ctx.focus(S.pp);
        poke();
    }
    function hide(now) {
        if (!S) return;
        clearTimeout(S.timer);
        const s = S.player.state();
        if (!now && (s.paused || (D.panel && D.panel.isOpen()))) return;
        S.shown = false;
        S.box.classList.remove('td-pl-shown');
        D.hints(s.live ? [['◀ ▶', 'channel'], ['OK', 'controls']] : [['◀ ▶', 'skip'], ['OK', 'controls']]);
        const f = S.archive.querySelector('[data-icefin-focus]');
        if (f) S.ctx.focus(f);
    }
    function poke() { if (!S) return; clearTimeout(S.timer); if (S.shown) S.timer = setTimeout(() => hide(false), HIDE_MS); }

    // ---- the options panel (Player board) ----
    function options(open) {
        const p = S.player, s = p.state();
        const pick = (title, values, set) => D.panel.push({
            title, path: s.title,
            render(body) { for (const v of values) { const r = D.row(v.label, { sub: v.detail, on: v.on, go: () => { set(v.id); D.panel.pop(); } }); if (v.on) r.classList.add('td-row-focus-first'); body.append(r); } }
        });
        D.panel.show({
            title: s.title || 'Playing', path: 'Options',
            render(body) {
                const audio = (s.audio || []);
                if (audio.length) body.append(D.row('Audio', { value: `${(audio.find((a) => a.selected) || audio[0]).label} ›`, go: () => pick('Audio', audio.map((a) => ({ id: a.index, label: a.label, detail: a.detail, on: a.selected })), (i) => p.setAudio(i)) }));
                const subs = s.subtitles || [];
                body.append(D.row('Subtitles', { value: `${s.subtitleIndex >= 0 ? ((subs.find((x) => x.index === s.subtitleIndex) || {}).label || 'On') : 'Off'} ›`,
                    go: () => pick('Subtitles', [{ id: -1, label: 'Off', on: s.subtitleIndex < 0 }].concat(subs.map((x) => ({ id: x.index, label: x.label, detail: x.detail, on: x.index === s.subtitleIndex }))), (i) => p.setSubtitles(i)) }));
                if (s.subtitleIndex >= 0) {
                    const offs = []; for (let v = -5; v <= 5.001; v += 0.1) offs.push([Math.round(v * 10) / 10, `${v > 0.05 ? '+' : ''}${(Math.round(v * 10) / 10).toFixed(1)} s`]);
                    body.append(D.stepper('Subtitle timing', offs, Math.round((s.subtitleOffset || 0) * 10) / 10, (v) => p.setSubtitleOffset(v)));
                }
                if ((s.speeds || []).length > 1) body.append(D.stepper('Speed', s.speeds.map((x) => [Number(x.id), x.name]), Number(s.rate) || 1, (v) => p.setSpeed(v)));
                if ((s.aspects || []).length > 1) body.append(D.stepper('Aspect', s.aspects.map((x) => [x.id, x.name]), s.aspect, (v) => p.setAspect(v)));
                if ((s.chapters || []).length > 1) body.append(D.row('Chapters', { value: `${s.chapters.length} ›`, go: () => D.panel.push({
                    title: 'Chapters', path: s.title,
                    render(b) { for (const c of s.chapters) { const r = D.row(c.name || `Chapter ${c.index + 1}`, { value: fmt(c.start), on: c.index === s.chapter, go: () => { p.chapter(c.index); D.panel.close(); } }); if (c.index === s.chapter) r.classList.add('td-row-focus-first'); b.append(r); } }
                }) }));
                if (s.next || s.playlistIndex > 0) {
                    body.append(D.stepper('Repeat', [['RepeatNone', 'Off'], ['RepeatAll', 'All'], ['RepeatOne', 'This one']], s.repeat || 'RepeatNone', (v) => p.setRepeat(v)));
                    body.append(D.toggle('Shuffle', s.shuffle === 'Shuffle' || s.shuffle === true, () => p.toggleShuffle()));
                }
                body.append(el('div', 'td-rule'),
                    D.row('Play on…', { go: () => { if (D.playOn) D.playOn('play', null); else p.playOn(); } }),
                    D.row('Watch together…', { go: () => { if (D.playOn) D.playOn('together', null); else p.watchTogether(); } }),
                    D.row('Playback info', { go: () => { D.panel.close(); p.info(); } }),
                    D.row('Jellyfin’s own controls', { sub: 'for the rest of this video', go: () => { D.panel.close(); p.useWebControls('the user chose them'); } }),
                    D.row('Stop', { go: () => { D.panel.close(); p.stop(); } }));
                // the transport's Audio and Subtitles words open their pickers straight away
                if (open) setTimeout(() => { const r = [...body.querySelectorAll('.td-row')].find((x) => x.textContent.toLowerCase().startsWith(open)); if (r) r.click(); }, 0);
            }
        });
    }

    T.ui.player.set({
        mount(root, player, ctx) {
            build(root, player, ctx);
            document.documentElement.classList.add('td-pl-up');
            S.off = player.on((s) => draw(s));
            draw(player.state());
            show(true);
        },
        unmount() {
            document.documentElement.classList.remove('td-pl-up');
            D.hintsOff();
            if (!S) return;
            clearTimeout(S.timer);
            if (S.off) S.off();
            S = null;
        },
        onAction(action, player, ctx) {
            if (!S) return false;
            D.sawAction(action);
            const f = ctx.focused();
            if (action === 'play_pause' || action === 'playpause') { player.playPause(); show(); return true; }
            if (action === 'menu') { options(); return true; }
            if (action === 'back') return false;
            if (!S.shown) {
                const s = player.state();
                if ((action === 'left' || action === 'right') && s.live) { if (action === 'left') player.channelDown(); else player.channelUp(); ctx.sound('navigate'); show(); return true; }
                if ((action === 'left' || action === 'right') && s.canSeek) { player.seekBy(action === 'left' ? -10000 : 30000); ctx.sound('focus'); show(); return true; }
                if ((action === 'enter' || action === 'select') && f && S.archive.contains(f)) return false;
                show(true);
                return true;
            }
            poke();
            if (f === S.bar && (action === 'left' || action === 'right')) { player.seekBy(action === 'left' ? -10000 : 10000); ctx.sound('focus'); return true; }
            return false;
        },
        onBack() {
            if (!S) return false;
            if (S.shown && !S.player.state().paused) { hide(true); return true; }
            return false;  // jellyfin-web's own Back: leave the video
        }
    });
    // the mouse brings the overlays back (one listener for the app's life; it asks whichever Tide is loaded)
    D.playerPointer = (e) => { if (S && (e.movementX || e.movementY)) { if (!S.shown) show(); else poke(); } };
    if (!window.icefinTidePointer) {
        window.icefinTidePointer = true;
        window.addEventListener('pointermove', (e) => { const K = window.icefinTide; if (K && K.playerPointer) K.playerPointer(e); }, true);
    }
})();
