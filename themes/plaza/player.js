// Plaza's own player controls (PLAN 9.44, D30, drawn on the engine's ui.player of 9.45; the design canvas's
// "NativePlayerControls"): the name pill with when it ends on top; a capsule at the bottom with the time line and the
// transport (previous, −10, play or pause, +30, next), then Audio, Subtitles, Chapters, Watch together, Play on and
// More (speed, aspect, subtitle timing, repeat, playback info, jellyfin-web's own controls). Skip prompts and Up next
// from the engine's compatibility archive sit above the capsule. Pickers open as Plaza cards over the video. While it
// plays the controls fade after a few seconds; any key or the mouse brings them back. Whatever the engine's archive
// can't satisfy falls back to jellyfin-web's own controls, laid out by ui.osd (plaza.js).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const P = window.icefinPlaza;
    if (!T || !T.ui || !T.ui.player || !P) return;
    const el = P.el;
    const HIDE_MS = 4000;
    const svg = (d, size) => `<svg viewBox="0 0 24 24" width="${size || '58%'}" height="${size || '58%'}" fill="currentColor" aria-hidden="true">${d}</svg>`;
    const ICON = {
        prev: '<path d="M6 5h2.4v14H6zM19 5 9.5 12l9.5 7z"/>',
        next: '<path d="M15.6 5H18v14h-2.4zM5 5l9.5 7L5 19z"/>',
        play: '<path d="M7 4.5 19.5 12 7 19.5z"/>',
        pause: '<path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/>',
        together: '<circle cx="8" cy="8" r="3.2"/><circle cx="16" cy="8" r="3.2" opacity=".7"/><path d="M2 19c.6-3.6 3-5.4 6-5.4s5.4 1.8 6 5.4zM12 19c.5-2.6 2-4.4 4-4.4 2.9 0 5.2 1.8 6 4.4z"/>',
        playon: '<rect x="2.5" y="4" width="19" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8 21h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    };
    const two = (n) => String(n).padStart(2, '0');
    const fmt = (ms) => {
        const s = Math.max(0, Math.floor((ms || 0) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
    };
    const kindOf = (s) => (s.type === 'Episode' ? 'tvshows' : s.type === 'TvChannel' || s.live ? 'livetv' : s.mediaType === 'Audio' ? 'music'
        : s.type === 'Movie' || s.type === 'Trailer' ? 'movies' : 'homevideos');

    let S = null;   // the controls while they are up

    function build(root, player, ctx) {
        const box = el('div', 'pz-pl');
        const shade = el('div', 'pz-pl-shade');
        // the name pill: what plays, and when it ends
        const name = el('div', 'pz-mname pz-pl-name');
        const nameText = el('span', 'pz-mname-text');
        const ends = el('span', 'pz-mclock pz-pl-ends');
        name.append(nameText, ends);
        // the capsule: the time line over the transport and the rest
        const cap = el('div', 'pz-pl-cap');
        const line = el('div', 'pz-pl-line');
        const pos = el('span', 'pz-pl-time'), dur = el('span', 'pz-pl-time');
        const bar = P.focusable(el('div', 'pz-pl-bar'));
        bar.setAttribute('aria-label', 'Time line: ◀▶ to move through it');
        const fill = el('div', 'pz-pl-fill'), knob = el('div', 'pz-pl-knob'), ticks = el('div', 'pz-pl-ticks');
        bar.append(ticks, fill, knob);
        line.append(pos, bar, dur);
        const row = el('div', 'pz-pl-row');
        const round = (cls, label, html, go) => {
            const b = P.focusable(el('div', 'pz-pl-round ' + cls));
            b.setAttribute('aria-label', label);
            b.innerHTML = html;
            b.addEventListener('click', () => { go(); ctx.sound('select'); poke(); });
            return b;
        };
        const pill = (cls, label, icon, go) => {
            const b = P.focusable(el('div', 'pz-pl-pill ' + cls));
            if (icon) b.innerHTML = svg(icon, '1.1em');
            b.append(document.createTextNode(label));
            b.setAttribute('aria-label', label);
            b.addEventListener('click', () => { go(); ctx.sound('select'); });
            return b;
        };
        const st = () => player.state();
        const prev = round('pz-pl-prev', 'Previous', svg(ICON.prev), () => {
            const s = st();
            if (s.live) player.channelDown(); else if (s.chapters.length > 1 && !(s.playlistIndex > 0)) player.previousChapter(); else player.previousItem();
        });
        const back10 = round('pz-pl-skip', 'Back 10 seconds', '−10', () => player.seekBy(-10000));
        const pp = round('pz-pl-pp', 'Play or pause', svg(ICON.pause), () => player.playPause());
        const fwd30 = round('pz-pl-skip', 'Forward 30 seconds', '+30', () => player.seekBy(30000));
        const next = round('pz-pl-next', 'Next', svg(ICON.next), () => {
            const s = st();
            if (s.live) player.channelUp(); else if (s.next) player.nextItem(); else if (s.chapters.length > 1) player.nextChapter();
        });
        const audio = pill('', 'Audio', null, () => picker('Audio', st().audio.map((a) => ({ label: a.label, sub: a.detail, on: a.selected, go: () => player.setAudio(a.index) }))));
        const subs = pill('', 'Subtitles', null, () => {
            const s = st();
            picker('Subtitles', [{ label: 'Off', on: s.subtitleIndex === -1, go: () => player.setSubtitles(-1) }]
                .concat(s.subtitles.map((x) => ({ label: x.label, sub: x.detail, on: x.selected, go: () => player.setSubtitles(x.index) }))));
        });
        const chapters = pill('', 'Chapters', null, () => chapterStrip());
        // Plaza's own Play on card (playon.js) where the engine has its calls, else jellyfin-web's menus over the video
        const together = pill('pz-pl-accent', 'Watch together', ICON.together, () => { if (P.playOn && P.playOn('together')) return; hide(true); player.watchTogether(); });
        const playon = pill('pz-pl-accent', 'Play on', ICON.playon, () => { if (P.playOn && P.playOn('devices')) return; hide(true); player.playOn(); });
        const more = pill('pz-pl-more', '⋯', null, () => moreCard());
        more.setAttribute('aria-label', 'More');
        const transport = el('div', 'pz-pl-transport');
        transport.append(prev, back10, pp, fwd30, next);
        const tools = el('div', 'pz-pl-tools');
        tools.append(audio, subs, chapters, together, playon, more);
        row.append(transport, tools);
        cap.append(line, row);
        const archive = el('div', 'pz-pl-archive');
        box.append(shade, name, archive, cap);
        root.append(box);
        // the time line moves with ◀▶ while it has focus; a click or a drag goes to that point
        const at = (e) => { const r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
        let drag = false;
        bar.addEventListener('pointerdown', (e) => { const s = st(); if (!s.canSeek) return; drag = true; bar.setPointerCapture(e.pointerId); show(st(), at(e)); e.preventDefault(); });
        bar.addEventListener('pointermove', (e) => { if (drag) show(st(), at(e)); poke(); });
        bar.addEventListener('pointerup', (e) => { if (!drag) return; drag = false; const s = st(); player.seek(at(e) * s.duration); S.preview = null; ctx.sound('select'); });
        box.addEventListener('pointermove', () => poke());
        S = { root, player, ctx, box, shade, name, nameText, ends, cap, bar, fill, knob, ticks, pos, dur, prev, back10, pp, fwd30, next, audio, subs, chapters, together, playon, more,
            archive, archiveKey: '', ticksKey: '', shown: false, timer: 0, card: null, preview: null, off: null, kind: '' };
        function show(s, frac) { S.preview = frac; draw(s); }
    }

    // ---- what the controls show ----
    function draw(s) {
        if (!S) return;
        if (!s || !s.active) return;
        const k = kindOf(s);
        if (k !== S.kind) { S.box.className = `pz-pl pz-k-${k}${S.shown ? ' pz-pl-shown' : ''}${S.card ? ' pz-pl-carded' : ''}`; S.kind = k; }
        S.nameText.textContent = [s.title, s.subtitle].filter(Boolean).join(' · ');
        S.ends.textContent = s.live ? 'Live' : s.endsAt ? `Ends at ${new Date(s.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '';
        const frac = S.preview != null ? S.preview : (s.duration ? s.position / s.duration : 0);
        S.fill.style.width = `${frac * 100}%`;
        S.knob.style.left = `${frac * 100}%`;
        S.pos.textContent = fmt(S.preview != null ? S.preview * s.duration : s.position);
        S.dur.textContent = s.live ? '' : fmt(s.duration);
        S.cap.classList.toggle('pz-pl-live', !s.canSeek);
        S.pp.innerHTML = svg(s.paused ? ICON.play : ICON.pause);
        S.pp.setAttribute('aria-label', s.paused ? 'Play' : 'Pause');
        S.audio.hidden = !(s.audio && s.audio.length > 1);
        S.subs.hidden = !(s.subtitles && s.subtitles.length);
        S.chapters.hidden = !(s.chapters && s.chapters.length > 1);
        // the chapter marks on the time line
        const tk = s.duration ? s.chapters.map((c) => c.start).join() : '';
        if (tk !== S.ticksKey) {
            S.ticksKey = tk;
            S.ticks.textContent = '';
            if (s.duration) for (const c of s.chapters.slice(1)) { const t = el('i'); t.style.left = `${(c.start / s.duration) * 100}%`; S.ticks.append(t); }
        }
        drawArchive(s);
        // paused: the controls stay
        if (s.paused && !S.shown) showControls();
        S.box.classList.toggle('pz-pl-paused', !!s.paused);
    }
    // the archive: skip prompts and Up next, above the capsule (and on their own when the controls are hidden)
    function drawArchive(s) {
        const list = s.archive || [];
        const key = list.map((a) => a.id + ':' + (a.label || a.title || '')).join('|');
        if (key === S.archiveKey) {
            for (const a of list) { const c = S.archive.querySelector(`[data-pz-arch="${a.id}"] .pz-pl-count`); if (c && a.countdown != null) c.textContent = `in ${a.countdown} s`; }
            return;
        }
        const had = S.archive.contains(S.ctx.focused());
        S.archiveKey = key;
        S.archive.textContent = '';
        for (const a of list) {
            if (a.kind === 'upNext') {
                const card = el('div', 'pz-pl-upnext');
                card.dataset.pzArch = a.id;
                const t = el('div', 'pz-pl-upnext-text');
                t.append(el('span', 'pz-kicker', 'UP NEXT'), el('span', 'pz-pl-upnext-title', a.title || a.label || ''), el('span', 'pz-pl-count', a.countdown != null ? `in ${a.countdown} s` : ''));
                const go = P.focusable(el('div', 'pz-pl-pill pz-pl-accent', 'Play now'));
                go.addEventListener('click', () => { a.activate(); S.ctx.sound('select'); });
                card.append(t, go);
                if (a.dismiss) { const no = P.focusable(el('div', 'pz-pl-pill', 'Keep watching')); no.addEventListener('click', () => { a.dismiss(); S.ctx.sound('back'); }); card.append(no); }
                S.archive.append(card);
            } else {
                const b = P.focusable(el('div', 'pz-pl-pill pz-pl-skipnow', `${a.label || 'Skip'} ▸`));
                b.dataset.pzArch = a.id;
                b.addEventListener('click', () => { a.activate(); S.ctx.sound('select'); });
                S.archive.append(b);
            }
        }
        // a new prompt takes focus while the controls are hidden, so OK answers it
        const first = S.archive.querySelector('[data-icefin-focus]');
        if (first && (!S.shown || had) && !S.card) S.ctx.focus(first);
        S.box.classList.toggle('pz-pl-prompt', !!list.length);
    }

    // ---- shown and hidden ----
    function showControls(focusIt) {
        if (!S) return;
        S.shown = true;
        S.box.classList.add('pz-pl-shown');
        if (focusIt || !S.box.contains(S.ctx.focused())) S.ctx.focus(S.pp);
        poke();
    }
    function hide(now) {
        if (!S) return;
        clearTimeout(S.timer);
        const s = S.player.state();
        if (!now && (s.paused || S.card)) return;
        S.shown = false;
        S.box.classList.remove('pz-pl-shown');
        const f = S.archive.querySelector('[data-icefin-focus]');
        if (f) S.ctx.focus(f);
    }
    function poke() {
        if (!S) return;
        clearTimeout(S.timer);
        if (S.shown) S.timer = setTimeout(() => hide(false), HIDE_MS);
    }

    // ---- pickers: Plaza cards over the video ----
    function closeCard() {
        if (!S || !S.card) return false;
        S.card.host.remove();
        const back = S.card.back;
        S.card = null;
        S.box.classList.remove('pz-pl-carded');
        if (back && back.isConnected) S.ctx.focus(back); else S.ctx.focus(S.pp);
        poke();
        return true;
    }
    function card(title, render, wide) {
        closeCard();
        const host = el('div', 'pz-sheet-host pz-pl-host');
        const dim = el('div', 'pz-sheet-dim');
        dim.addEventListener('click', () => closeCard());
        const c = el('div', `pz-sheet-card pz-k-${S.kind}${wide ? ' pz-sheet-wide' : ''}`);
        c.setAttribute('role', 'dialog');
        c.setAttribute('aria-label', title);
        c.append(el('div', 'pz-dlg-tab pz-sheet-tab', title));
        const body = el('div', 'pz-sheet-body');
        c.append(body);
        host.append(dim, c);
        S.box.append(host);
        S.card = { host, el: c, back: S.ctx.focused() };
        S.box.classList.add('pz-pl-carded');
        clearTimeout(S.timer);
        render(body);
        const f = body.querySelector('.pz-sheet-row-on[data-icefin-focus], .pz-pl-chap-on[data-icefin-focus]') || body.querySelector('[data-icefin-focus]');
        if (f) S.ctx.focus(f);
    }
    function picker(title, rows) {
        card(title, (body) => {
            const list = el('div', 'pz-sheet-rows pz-sheet-scroll');
            for (const r of rows) {
                const x = P.focusable(el('div', 'pz-sheet-row' + (r.on ? ' pz-sheet-row-on' : '')));
                x.append(el('span', 'pz-sheet-row-label', (r.on ? '✓ ' : '') + r.label));
                if (r.sub) x.append(el('span', 'pz-sheet-row-sub', r.sub));
                x.addEventListener('click', () => { r.go(); S.ctx.sound('select'); closeCard(); });
                list.append(x);
            }
            body.append(list);
        });
    }
    function chapterStrip() {
        const s = S.player.state();
        card('Chapters', (body) => {
            const strip = el('div', 'pz-pl-chapters');
            for (const c of s.chapters) {
                const x = P.focusable(el('div', 'pz-pl-chap' + (c.index === s.chapter ? ' pz-pl-chap-on' : '')));
                const img = el('div', 'pz-pl-chap-img');
                if (c.image) P.bg(img, c.image);
                x.append(img, el('div', 'pz-pl-chap-name', c.name), el('div', 'pz-pl-chap-time', fmt(c.start)));
                x.addEventListener('click', () => { S.player.chapter(c.index); S.ctx.sound('select'); closeCard(); });
                x.addEventListener('icefin-focus', () => x.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }));
                strip.append(x);
            }
            body.append(strip);
        }, true);
    }
    function moreCard() {
        const s = S.player.state();
        const p = S.player;
        card('More', (body) => {
            const list = el('div', 'pz-sheet-rows pz-sheet-scroll');
            const row = (label, sub, go, keep) => {
                const x = P.focusable(el('div', 'pz-sheet-row'));
                x.append(el('span', 'pz-sheet-row-label', label));
                if (sub) x.append(el('span', 'pz-sheet-row-sub', sub));
                x.addEventListener('click', () => { go(x); S.ctx.sound('select'); if (!keep) closeCard(); });
                list.append(x);
                return x;
            };
            if (s.speeds && s.speeds.length > 1) {
                const now = (s.speeds.find((x) => Number(x.id) === Number(s.rate)) || { name: `${s.rate}×` }).name;
                row('Speed', now, () => picker('Speed', s.speeds.map((x) => ({ label: x.name, on: Number(x.id) === Number(s.rate), go: () => p.setSpeed(Number(x.id)) }))), true);
            }
            if (s.aspects && s.aspects.length > 1) {
                const now = (s.aspects.find((x) => x.id === s.aspect) || { name: s.aspect || 'Auto' }).name;
                row('Aspect ratio', now, () => picker('Aspect ratio', s.aspects.map((x) => ({ label: x.name, on: x.id === s.aspect, go: () => p.setAspect(x.id) }))), true);
            }
            if (s.subtitleIndex !== -1) {
                const off = (n) => `${n > 0 ? '+' : ''}${(Math.round(n * 10) / 10).toFixed(1)} s`;
                const timing = row('Subtitle timing', `${off(s.subtitleOffset || 0)} · Ⓐ later, ◀ earlier`, () => {
                    const v = (S.player.state().subtitleOffset || 0) + 0.1; p.setSubtitleOffset(v);
                    timing.querySelector('.pz-sheet-row-sub').textContent = `${off(v)} · Ⓐ later, ◀ earlier`;
                }, true);
                timing.dataset.pzOffset = '1';
            }
            if (s.next || s.playlistIndex > 0) {
                const modes = [['RepeatNone', 'Off'], ['RepeatAll', 'All'], ['RepeatOne', 'This one']];
                row('Repeat', (modes.find((m) => m[0] === s.repeat) || modes[0])[1], () => picker('Repeat', modes.map(([id, n]) => ({ label: n, on: id === s.repeat, go: () => p.setRepeat(id) }))), true);
                row('Shuffle', s.shuffle === 'Shuffle' ? 'On' : 'Off', () => p.toggleShuffle());
            }
            row('Playback info', 'What plays, and how', () => p.info());
            row('Jellyfin’s own controls', 'For the rest of this video', () => p.useWebControls('the user chose them'));
            body.append(list);
        });
    }

    T.ui.player.set({
        mount(root, player, ctx) {
            build(root, player, ctx);
            S.off = player.on((s) => draw(s));
            draw(player.state());
            showControls(true);
        },
        unmount() {
            if (!S) return;
            clearTimeout(S.timer);
            if (S.off) S.off();
            S = null;
        },
        onAction(action, player, ctx) {
            if (!S) return false;
            P.sawAction();
            const f = ctx.focused();
            if (S.card) {
                // the subtitle timing row: ◀ makes them earlier
                if (action === 'left' && f && f.dataset.pzOffset) { player.setSubtitleOffset((player.state().subtitleOffset || 0) - 0.1); f.querySelector('.pz-sheet-row-sub').textContent = `${((player.state().subtitleOffset || 0) - 0.1).toFixed(1)} s · Ⓐ later, ◀ earlier`; return true; }
                if (['up', 'down', 'left', 'right'].includes(action)) { ctx.move(action, S.card.el); return true; }
                return false;  // OK clicks the row
            }
            if (action === 'play_pause' || action === 'playpause') { player.playPause(); showControls(); return true; }
            if (!S.shown) {
                // hidden: ◀▶ skip back and forward, anything else brings the controls back (OK answers a skip prompt)
                if ((action === 'left' || action === 'right') && player.state().canSeek) { player.seekBy(action === 'left' ? -10000 : 30000); ctx.sound('focus'); showControls(); return true; }
                if ((action === 'enter' || action === 'select') && f && S.archive.contains(f)) return false;
                showControls(true);
                return true;
            }
            poke();
            // the time line has focus: ◀▶ move through it
            if (f === S.bar && (action === 'left' || action === 'right')) { player.seekBy(action === 'left' ? -10000 : 10000); ctx.sound('focus'); return true; }
            return false;  // spatial focus over the controls; OK clicks
        },
        onBack() {
            if (!S) return false;
            if (closeCard()) return true;
            if (S.shown && !S.player.state().paused) { hide(true); return true; }
            return false;  // jellyfin-web's own Back: leave the video
        }
    });
})();
