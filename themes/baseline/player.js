// Baseline: the video player as stock's TV OSD draws it (D30's ui.player). At the top, Back and the title; at the
// bottom the title again with the episode and "Ends at", the position slider with chapter ticks, the times, then
// stock's buttons: previous, rewind, play/pause, fast-forward, next on the left; subtitles, audio, settings and
// volume on the right. Settings is stock's sheet (aspect ratio, playback speed, repeat mode, playback info) plus the
// subtitle offset and chapters. The OSD fades after 3 s while playing (stock's timing); any input brings it back;
// while it is hidden ◀ ▶ skip −10 / +30 s (on Live TV they change the channel). Stock's Skip Intro button and Next Up
// card come from the engine's compatibility archive.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinBaseline;
    if (!T || !T.ui || !T.ui.player || !T.ui.player.set || !D) return;
    D.ownPlayer = true;
    const el = D.el;
    const HIDE_MS = 3000;
    const two = (n) => String(n).padStart(2, '0');
    const fmt = (ms) => { const s = Math.max(0, Math.floor((ms || 0) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`; };
    let S = null;

    function build(root, player, ctx) {
        const box = el('div', 'bl-pl');
        const top = el('div', 'bl-pl-top');
        const backB = D.btn('bl-np-btn', null); backB.append(D.icon('arrow_back')); backB.setAttribute('aria-label', 'Back');
        backB.addEventListener('click', () => { ctx.sound('back'); player.stop(); });
        const topTitle = el('h3', 'bl-pl-toptitle');
        top.append(backB, topTitle);
        const text = el('div', 'bl-pl-text');
        const title = el('div', 'bl-pl-title');
        const sub = el('div', 'bl-pl-sub');
        text.append(title, sub);
        const bottom = el('div', 'bl-pl-bottom');
        const times = el('div', 'bl-pl-times');
        const pos = el('span', '', '0:00'), rest = el('span', '', '');
        const bar = D.focusable(el('div', 'bl-pl-bar'));
        bar.setAttribute('role', 'slider');
        bar.setAttribute('aria-label', 'Time line: ◀ ▶ seek');
        const fill = el('div', 'bl-pl-fill');
        const knob = el('i', 'bl-pl-knob');
        const ticks = el('div', 'bl-pl-ticks');
        bar.append(ticks, fill, knob);
        let drag = false;
        const at = (e) => { const r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
        bar.addEventListener('pointerdown', (e) => { const s = player.state(); if (!s.canSeek) return; drag = true; bar.setPointerCapture(e.pointerId); player.seek(at(e) * s.duration); e.preventDefault(); poke(); });
        bar.addEventListener('pointermove', (e) => { if (drag) { const s = player.state(); player.seek(at(e) * s.duration); poke(); } });
        bar.addEventListener('pointerup', () => { drag = false; });
        const tr = el('div', 'bl-pl-transport');
        const left = el('div', 'bl-pl-left'), right = el('div', 'bl-pl-right');
        const btn = (label, icon, go, side) => { const b = D.btn('bl-np-btn', null); b.append(D.icon(icon)); b.title = label; b.setAttribute('aria-label', label); b.addEventListener('click', () => { ctx.sound('select'); go(); poke(); }); (side || left).append(b); return b; };
        const prev = btn('Previous Track', 'skip_previous', () => { const s = player.state(); if (s.live) player.channelDown(); else if (player.previousItem) player.previousItem(); else player.seek(0); });
        const back10 = btn('Rewind', 'fast_rewind', () => { const s = player.state(); if (s.live) player.channelDown(); else player.seekBy(-10000); });
        const pp = btn('Pause', 'pause', () => player.playPause());
        const fwd = btn('Fast Forward', 'fast_forward', () => { const s = player.state(); if (s.live) player.channelUp(); else player.seekBy(30000); });
        const next = btn('Next Track', 'skip_next', () => { const s = player.state(); if (s.live) player.channelUp(); else if (s.next) player.nextItem(); else player.nextChapter(); });
        const subsB = btn('Subtitles', 'closed_caption', () => options('subtitles'), right);
        const audioB = btn('Audio', 'audiotrack', () => options('audio'), right);
        btn('Settings', 'settings', () => options(), right);
        const ends = el('div', 'bl-pl-ends');
        left.append(ends);
        const favB = btn('Favorite', 'favorite', async () => { const it = ctx.nowPlaying && ctx.nowPlaying() && ctx.nowPlaying().item; if (!it) return; const now = !(it.UserData || {}).IsFavorite; try { await D.client().updateFavoriteStatus(D.uid(), it.Id, now); it.UserData = Object.assign({}, it.UserData, { IsFavorite: now }); favB.classList.toggle('on', now); } catch (e) { D.notice('That didn’t work', true); } }, right);
        right.insertBefore(favB, subsB);
        const muteB = btn('Mute', 'volume_up', () => { if (player.toggleMute) player.toggleMute(); }, right);
        const vol = D.focusable(el('div', 'bl-np-bar bl-np-vol'));
        vol.setAttribute('role', 'slider'); vol.setAttribute('aria-label', 'Volume');
        vol.blHints = [['◀ ▶', 'volume'], ['Back', 'hide']];
        const volFill = el('div', 'bl-np-fill'), volKnob = el('i', 'bl-np-knob');
        vol.append(volFill, volKnob);
        vol.addEventListener('pointerdown', (e) => { const r = vol.getBoundingClientRect(); if (player.setVolume) player.setVolume(Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100)); poke(); });
        right.append(vol, right.querySelector('[aria-label="Settings"]'));
        tr.append(left, right);
        times.append(pos, bar, rest);
        bottom.append(times, tr);
        const archive = el('div', 'bl-pl-archive');
        box.append(el('div', 'bl-pl-shade-top'), el('div', 'bl-pl-shade-bottom'), top, bottom, archive);
        root.append(box);
        S = { root, box, player, ctx, title, topTitle, sub, ends, pos, rest, bar, fill, knob, ticks, pp, prev, back10, fwd, next, subsB, audioB, muteB, favB, vol, volFill, volKnob, archive, shown: false, timer: 0, archiveKey: '', ticksKey: '' };
    }

    function draw(s) {
        if (!S || !s) return;
        S.topTitle.textContent = [s.title, s.subtitle].filter(Boolean).join(' - ');
        S.ends.textContent = s.live ? 'Live' : (s.endsAt ? `Ends at ${D.time(new Date(s.endsAt))}` : '');
        const vol = s.muted ? 0 : (s.volume == null ? 100 : s.volume);
        S.volFill.style.width = `${vol}%`;
        S.volKnob.style.left = `${vol}%`;
        const frac = s.duration ? Math.min(1, s.position / s.duration) : 0;
        S.fill.style.width = `${frac * 100}%`;
        S.knob.style.left = `${frac * 100}%`;
        S.pos.textContent = s.live ? 'Live' : fmt(s.position);
        S.rest.textContent = s.live ? '' : (s.duration ? `-${fmt(s.duration - s.position)}` : '');
        S.box.classList.toggle('bl-pl-live', !s.canSeek);
        const ic = (b, name) => { const i = b.querySelector('.bl-ic'); if (i && i.textContent !== name) i.textContent = name; };
        ic(S.pp, s.paused ? 'play_arrow' : 'pause');
        S.pp.setAttribute('aria-label', s.paused ? 'Play' : 'Pause');
        ic(S.muteB, s.muted ? 'volume_off' : 'volume_up');
        S.back10.hidden = S.fwd.hidden = !!s.live;
        S.prev.hidden = !s.live && !(s.playlistIndex > 0);
        S.next.hidden = !s.live && !s.next;
        S.subsB.hidden = !(s.subtitles || []).length;
        S.audioB.hidden = (s.audio || []).length < 2;
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
                const c = S.archive.querySelector(`[data-bl-arch="${a.id}"] .bl-pl-count`);
                if (c && a.countdown != null) c.textContent = a.kind === 'upNext' ? `Starting in ${a.countdown} seconds` : '';
                const ln = S.archive.querySelector(`[data-bl-arch="${a.id}"] .bl-pl-skipline b`);
                if (ln && a.countdown != null && a.total) ln.style.width = `${(a.countdown / a.total) * 100}%`;
            }
            return;
        }
        const had = S.archive.contains(S.ctx.focused());
        S.archiveKey = key;
        S.archive.textContent = '';
        for (const a of list) {
            if (a.kind === 'upNext') {
                const card = el('div', 'bl-pl-upnext');
                card.dataset.blArch = a.id;
                card.append(el('h2', 'bl-pl-upnext-head', 'Next Up'));
                card.append(el('div', 'bl-pl-count', a.countdown != null ? `Starting in ${a.countdown} seconds` : ''));
                if (a.image) { const im = el('div', 'bl-pl-upnext-img'); im.style.backgroundImage = `url("${a.image}")`; card.append(im); }
                card.append(el('div', 'bl-pl-upnext-title', a.title || a.label || ''));
                const row = el('div', 'bl-pl-upnext-row');
                const go = D.focusable(el('button', 'bl-raised', 'Start Now'));
                go.type = 'button';
                go.addEventListener('click', () => { a.activate(); S.ctx.sound('select'); });
                row.append(go);
                if (a.dismiss) { const no = D.focusable(el('button', 'bl-raised', 'Hide')); no.type = 'button'; no.addEventListener('click', () => { a.dismiss(); S.ctx.sound('back'); }); row.append(no); }
                card.append(row);
                S.archive.append(card);
            } else {
                const b = D.focusable(el('button', 'bl-pl-skip'));
                b.type = 'button';
                b.dataset.blArch = a.id;
                b.append(el('span', '', a.label || 'Skip'), el('span', 'bl-pl-skipline'));
                b.classList.add('bl-raised');
                b.lastChild.append(el('b'));
                b.addEventListener('click', () => { a.activate(); S.ctx.sound('select'); });
                S.archive.append(b);
            }
        }
        // a new prompt takes focus while the controls are hidden, so OK answers it
        const first = S.archive.querySelector('[data-icefin-focus]');
        if (first && (!S.shown || had) && !(D.panel && D.panel.isOpen())) S.ctx.focus(first);
        S.box.classList.toggle('bl-pl-prompt', !!list.length);
    }

    function show(focusIt) {
        if (!S) return;
        S.shown = true;
        S.box.classList.add('bl-pl-shown');
        D.hints([['OK', 'choose'], ['▶', 'pause'], ['≡', 'settings'], ['Back', 'hide']]);
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
        S.box.classList.remove('bl-pl-shown');
        D.hints(s.live ? [['◀ ▶', 'channel'], ['OK', 'controls']] : [['◀ ▶', 'skip'], ['OK', 'controls']]);
        const f = S.archive.querySelector('[data-icefin-focus]');
        if (f) S.ctx.focus(f);
    }
    function poke() { if (!S) return; clearTimeout(S.timer); if (S.shown) S.timer = setTimeout(() => hide(false), HIDE_MS); }

    // ---- stock's sheets: Settings (aspect ratio, playback speed, repeat mode, subtitle offset, playback info) and
    // the Audio and Subtitles pickers (each track, the chosen one checked) ----
    function options(open) {
        const p = S.player, s = p.state();
        const list = (title, values, set, push) => {
            const spec = { title, path: 'Options', render(body) { for (const v of values) { const r = D.row(v.label, { sub: v.detail, on: v.on, go: () => { set(v.id); D.panel.close(); } }); if (v.on) r.classList.add('bl-row-focus-first'); body.append(r); } } };
            if (push) D.panel.push(spec); else D.panel.show(spec);
        };
        const subs = s.subtitles || [];
        if (open === 'audio') { list('Audio', (s.audio || []).map((a) => ({ id: a.index, label: a.label, detail: a.detail, on: a.selected })), (i) => p.setAudio(i)); return; }
        if (open === 'subtitles') { list('Subtitles', [{ id: -1, label: 'Off', on: s.subtitleIndex < 0 }].concat(subs.map((x) => ({ id: x.index, label: x.label, detail: x.detail, on: x.index === s.subtitleIndex }))), (i) => p.setSubtitles(i)); return; }
        const nameOf = (vals, at) => ((vals.find((x) => x[0] === at) || [])[1]) || '';
        D.panel.show({
            title: 'Settings', path: 'Options',
            render(body) {
                const entry = (label, vals, at, set) => body.append(D.row(label, { value: nameOf(vals, at), go: () => list(label, vals.map(([id, name]) => ({ id, label: name, on: id === at })), set, true) }));
                if ((s.aspects || []).length > 1) entry('Aspect Ratio', s.aspects.map((x) => [x.id, x.name]), s.aspect, (v) => p.setAspect(v));
                if ((s.speeds || []).length > 1) entry('Playback Speed', s.speeds.map((x) => [Number(x.id), x.name]), Number(s.rate) || 1, (v) => p.setSpeed(v));
                entry('Repeat Mode', [['RepeatNone', 'Repeat none'], ['RepeatAll', 'Repeat all'], ['RepeatOne', 'Repeat one']], s.repeat || 'RepeatNone', (v) => p.setRepeat(v));
                if (s.subtitleIndex >= 0) {
                    const offs = []; for (let v = -5; v <= 5.001; v += 0.1) offs.push([Math.round(v * 10) / 10, `${v > 0.05 ? '+' : ''}${(Math.round(v * 10) / 10).toFixed(1)} s`]);
                    body.append(D.stepper('Subtitle Offset', offs, Math.round((s.subtitleOffset || 0) * 10) / 10, (v) => p.setSubtitleOffset(v)));
                }
                body.append(D.row('Playback Info', { go: () => { D.panel.close(); p.info(); } }));
            }
        });
    }

    T.ui.player.set({
        mount(root, player, ctx) {
            build(root, player, ctx);
            document.documentElement.classList.add('bl-pl-up');
            S.off = player.on((s) => draw(s));
            draw(player.state());
            show(true);
        },
        unmount() {
            document.documentElement.classList.remove('bl-pl-up');
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
            if (action === 'menu') { options(); return true; }  // ≡: stock's Settings sheet
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
            if (f === S.vol && (action === 'left' || action === 'right')) { const st = player.state(); if (player.setVolume) player.setVolume(((st.muted ? 0 : st.volume) || 0) + (action === 'right' ? 5 : -5)); ctx.sound('focus'); return true; }
            if (f === S.bar && (action === 'left' || action === 'right')) { player.seekBy(action === 'left' ? -10000 : 10000); ctx.sound('focus'); return true; }
            return false;
        },
        onBack() {
            if (!S) return false;
            if (S.shown && !S.player.state().paused) { hide(true); return true; }
            return false;  // jellyfin-web's own Back: leave the video
        }
    });
    // the mouse brings the OSD back (one listener for the app's life)
    D.playerPointer = (e) => { if (S && (e.movementX || e.movementY)) { if (!S.shown) show(); else poke(); } };
    if (!window.icefinBaselinePointer) {
        window.icefinBaselinePointer = true;
        window.addEventListener('pointermove', (e) => { const K = window.icefinBaseline; if (K && K.playerPointer) K.playerPointer(e); }, true);
    }
})();
