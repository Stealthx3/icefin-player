// Media Center: the player controls (PLAN 9.46, D30), drawn by the theme over video through ui.player (9.45): from the
// design canvas's "player controls", "audio, subtitles and settings over video", "playback info" and "up next and
// chapters" boards. Overlays the engine's compatibility archive reports (skip prompts, Up next) are drawn here too;
// anything it can't satisfy sends the session to the web controls, laid out by ui.osd below.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    // The web fallback's look (and the whole controls on an engine without ui.player): jellyfin-web's own, laid out here.
    if (T.ui.osd) T.ui.osd.set({ layout: 'panel', align: 'right' });
    if (!T.ui.player || !M) return;
    const { el, focusable, svg, ICON } = M;

    const HIDE_MS = 5000;
    const fmt = (ms) => {
        const s = Math.max(0, Math.floor((ms || 0) / 1000));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
        return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
    };
    const REPEAT = [['RepeatNone', 'off'], ['RepeatAll', 'all'], ['RepeatOne', 'this one']];

    let V = null;  // the mounted controls

    function button(cls, label, icon, fn) {
        const b = focusable(el('button', 'mc-tb ' + cls));
        b.type = 'button';
        b.setAttribute('aria-label', label);
        b.append(svg(icon));
        b.addEventListener('click', () => { T.ctx.sound('select'); fn(); activity(); });
        return b;
    }

    function activity() {
        if (!V) return;
        show(true);
        clearTimeout(V.hideT);
        V.hideT = setTimeout(() => { if (V && !V.panel && V.s && !V.s.paused) show(false); }, HIDE_MS);
    }
    function show(on) {
        if (!V || V.visible === on) return;
        V.visible = on;
        V.root.classList.toggle('mc-p-up', on);
        if (on && !V.root.contains(T.ctx.focused())) T.ctx.focus(V.pp);
    }

    // ---- the side panel: audio, subtitles, playback (one pivot), and playback info ----
    function closePanel() {
        if (!V || !V.panel) return;
        V.panel.el.remove();
        V.panel = null;
        T.ctx.focus(V.lastFocus && V.root.contains(V.lastFocus) ? V.lastFocus : V.pp);
        activity();
    }
    function openPanel(kind, tab) {
        if (!V) return;
        if (V.panel) V.panel.el.remove();
        V.lastFocus = T.ctx.focused();
        const box = el('div', 'mc-panel mc-p-panel');
        box.setAttribute('role', 'dialog');
        V.root.append(box);
        V.panel = { el: box, kind, tab: tab || 'audio' };
        if (kind === 'info') renderInfo(box); else renderMenu(box);
        show(true);
    }
    function row(label, value, cls) {
        const r = focusable(el('div', 'mc-li ' + (cls || '')));
        r.append(el('span', 'mc-li-label', label));
        if (value != null) r.append(el('span', 'mc-li-value', value));
        return r;
    }
    function radio(label, detail, on, fn) {
        const r = focusable(el('div', 'mc-li mc-radio-row'));
        const dot = el('span', 'mc-radio' + (on ? ' on' : ''));
        r.append(dot, el('span', 'mc-li-label', label));
        if (detail) r.append(el('span', 'mc-li-value', detail));
        r.addEventListener('click', () => { T.ctx.sound('select'); fn(); setTimeout(() => V && V.panel && renderMenu(V.panel.el, true), 250); });
        return r;
    }
    function spinner(label, values, current, fn) {
        const i = Math.max(0, values.findIndex((v) => v[0] === current));
        const r = row(label, `‹ ${(values[i] || ['', ''])[1]} ›`, 'mc-spin');
        r.mcStep = (d) => { const n = values[(i + d + values.length) % values.length]; if (n) { fn(n[0]); setTimeout(() => V && V.panel && renderMenu(V.panel.el, true), 250); } };
        return r;
    }
    function renderMenu(box, keepFocus) {
        const s = V.s || V.player.state();
        const focusIdx = keepFocus ? [...box.querySelectorAll('[data-icefin-focus]')].indexOf(T.ctx.focused()) : -1;
        box.textContent = '';
        const tabs = el('div', 'mc-pivot mc-p-tabs');
        for (const [id, label] of [['audio', 'audio'], ['subtitles', 'subtitles'], ['playback', 'playback']]) {
            const t = focusable(el('button', 'mc-pivot-item' + (V.panel.tab === id ? ' on' : ''), label));
            t.type = 'button';
            t.dataset.tab = id;
            t.addEventListener('click', () => { V.panel.tab = id; renderMenu(box); T.ctx.focus(box.querySelector(`[data-tab="${id}"]`)); });
            tabs.append(t);
        }
        box.append(tabs, el('div', 'mc-rule'));
        const list = el('div', 'mc-p-list');
        const p = V.player;
        if (V.panel.tab === 'audio') {
            if (!s.audio.length) list.append(el('div', 'mc-note', 'This video has no other audio tracks.'));
            for (const a of s.audio) list.append(radio(a.label, a.detail, a.selected, () => p.setAudio(a.index)));
        } else if (V.panel.tab === 'subtitles') {
            list.append(radio('Off', '', s.subtitleIndex === -1, () => p.setSubtitles(-1)));
            for (const t of s.subtitles) list.append(radio(t.label, t.detail, t.selected, () => p.setSubtitles(t.index)));
            if (s.subtitleIndex !== -1) {
                const off = Math.round((s.subtitleOffset || 0) * 10) / 10;
                const vals = []; for (let x = -5; x <= 5.001; x += 0.1) vals.push([Math.round(x * 10) / 10, `${x >= 0 ? '+' : ''}${(Math.round(x * 10) / 10).toFixed(1)} s`]);
                list.append(spinner('Subtitle offset', vals, off, (v) => p.setSubtitleOffset(v)));
            }
        } else {
            const speeds = s.speeds.map((x) => [x.id, x.name]);
            if (speeds.length) list.append(spinner('Speed', speeds, s.rate, (v) => p.setSpeed(v)));
            if (s.aspects.length) list.append(spinner('Aspect ratio', s.aspects.map((x) => [x.id, x.name.toLowerCase()]), s.aspect, (v) => p.setAspect(v)));
            list.append(spinner('Repeat', REPEAT, s.repeat, (v) => p.setRepeat(v)));
            const info = row('Playback info'); info.addEventListener('click', () => openPanel('info')); list.append(info);
            const wt = row('Watch together'); wt.addEventListener('click', () => { if (!p.watchTogether()) T.ctx.sound('error'); }); list.append(wt);
            const po = row('Play on another device'); po.addEventListener('click', () => { if (!p.playOn()) T.ctx.sound('error'); }); list.append(po);
            const web = row('Use the web player controls'); web.addEventListener('click', () => p.useWebControls('chosen in the controls')); list.append(web);
        }
        box.append(list);
        box.append(el('div', 'mc-note', 'Left and right change a value as you watch; Back closes.'));
        const all = [...box.querySelectorAll('[data-icefin-focus]')];
        T.ctx.focus(all[focusIdx] || box.querySelector('.mc-radio.on') && box.querySelector('.mc-radio.on').parentNode || all.find((x) => !x.classList.contains('mc-pivot-item')) || all[0]);
    }
    function renderInfo(box) {
        const i = V.player.info();
        box.classList.add('mc-p-info');
        box.textContent = '';
        box.append(el('div', 'mc-p-info-title', 'playback info'));
        const grid = el('div', 'mc-p-info-grid');
        const sect = (name, pairs) => {
            const c = el('div');
            c.append(el('div', 'mc-sec', name));
            const dl = el('dl');
            for (const [k, v] of pairs) if (v) { dl.append(el('dt', '', k), el('dd', '', String(v))); }
            c.append(dl);
            grid.append(c);
        };
        const v = i.video, a = i.audio;
        sect('player', [['Method', i.method], ['Renderer', i.renderer && (i.renderer === 'vulkan' ? 'Vulkan' : 'OpenGL')], ['Display', i.hdrDisplay && `HDR ${i.hdrDisplay}`], ['Output', i.output], ['Speed', i.speed !== 1 && `${i.speed}x`]]);
        sect('video', [['Source', [v.codec && v.codec.toUpperCase(), v.profile, v.range].filter(Boolean).join(' · ')], ['Size', v.width && `${v.width} × ${v.height}`], ['Frame rate', v.fps && v.fps.toFixed(3)], ['Bit depth', v.bitDepth], ['Bit rate', (v.bitrate || i.bitrate) && `${((v.bitrate || i.bitrate) / 1e6).toFixed(1)} Mb/s`]]);
        sect('audio', [['Track', a.title], ['Codec', a.codec && a.codec.toUpperCase()], ['Channels', a.layout || a.channels], ['Output', i.passthrough ? 'Passthrough' : 'Decoded']]);
        sect('subtitles', [['Track', i.subtitles]]);
        box.append(grid);
        const back = focusable(el('button', 'mc-btn', 'Close'));
        back.type = 'button';
        back.addEventListener('click', closePanel);
        box.append(back);
        T.ctx.focus(back);
    }

    // ---- chapters strip (Up on the controls) ----
    function toggleChapters(on) {
        if (!V) return;
        V.root.classList.toggle('mc-p-chapters-up', on);
        if (on) {
            const cur = V.chapters.querySelector('.mc-p-ch.now') || V.chapters.querySelector('.mc-p-ch');
            if (cur) { T.ctx.focus(cur); cur.scrollIntoView({ block: 'nearest', inline: 'center' }); }
        }
    }
    function buildChapters(s) {
        V.chapters.textContent = '';
        for (const ch of s.chapters) {
            const c = focusable(el('button', 'mc-p-ch'));
            c.type = 'button';
            const img = el('div', 'mc-p-ch-img');
            if (ch.image) img.style.backgroundImage = `url("${ch.image}")`;
            c.append(img, el('div', 'mc-p-ch-label', `${ch.index + 1} · ${ch.name}`), el('div', 'mc-p-ch-time', fmt(ch.start)));
            c.addEventListener('click', () => { V.player.chapter(ch.index); toggleChapters(false); activity(); });
            c.addEventListener('icefin-focus', () => c.scrollIntoView({ block: 'nearest', inline: 'center' }));
            V.chapters.append(c);
        }
        V.chBtn.hidden = !s.chapters.length;
    }

    // ---- state ----
    function update(s) {
        if (!V) return;
        const first = !V.s || V.s.itemId !== s.itemId;
        V.s = s;
        if (!s.active) return;
        if (first) {
            V.title.textContent = '';
            if (s.logo) { const im = el('img', 'mc-p-logo'); im.src = s.logo; im.alt = s.title; V.title.append(im); } else V.title.textContent = s.title;
            buildChapters(s);
            V.ticks.textContent = '';
            if (s.duration > 0) {
                for (const ch of s.chapters) if (ch.start > 0) { const t = el('i', 'mc-p-tick'); t.style.left = `${(ch.start / s.duration) * 100}%`; V.ticks.append(t); }
            }
        }
        if (s.duration > 0 && V.segs.childElementCount !== s.segments.length) {
            V.segs.textContent = '';
            for (const g of s.segments) { const b = el('i', 'mc-p-seg'); b.style.left = `${(g.start / s.duration) * 100}%`; b.style.width = `${((g.end - g.start) / s.duration) * 100}%`; V.segs.append(b); }
        }
        const ch = s.chapters[s.chapter];
        const ends = s.endsAt ? `ends at ${M.time(s.endsAt)}` : '';
        V.sub.textContent = [s.subtitle, ch && `Chapter ${ch.index + 1} · ${ch.name}`, ends].filter(Boolean).join(' · ');
        const pct = s.duration > 0 ? Math.min(100, (s.position / s.duration) * 100) : 0;
        V.fill.style.width = `${pct}%`;
        V.knob.style.left = `${pct}%`;
        V.pos.textContent = s.live ? 'live' : fmt(s.position);
        V.dur.textContent = s.live ? '' : `-${fmt(s.duration - s.position)}`;
        V.seek.classList.toggle('mc-p-live', !s.canSeek);
        V.pp.textContent = '';
        V.pp.append(svg(s.paused ? ICON.play : ICON.pause));
        V.pp.setAttribute('aria-label', s.paused ? 'Play' : 'Pause');
        V.root.classList.toggle('mc-p-paused', s.paused);
        if (s.paused) show(true);
        // The archive: a skip prompt as a glass button over the bar, Up next as a card at the bottom right.
        const skip = s.archive.find((a) => a.kind === 'skip');
        V.skip.hidden = !skip;
        if (skip) { V.skip.textContent = `${skip.label} ›`; V.skip.onclick = () => { T.ctx.sound('select'); skip.activate(); }; }
        const up = s.archive.find((a) => a.kind === 'upNext');
        V.next.hidden = !up;
        if (up) {
            V.nextTitle.textContent = up.title || (s.next ? s.next.Name : '');
            V.nextCount.textContent = up.countdown ? `up next · ${up.countdown}` : 'up next';
            V.nextNow.onclick = () => { T.ctx.sound('select'); up.activate(); };
            V.nextHide.onclick = () => { T.ctx.sound('back'); up.dismiss && up.dismiss(); };
            if (!V.nextShown) { V.nextShown = true; show(true); T.ctx.focus(V.nextNow); }
        } else V.nextShown = false;
        if (V.panel && V.panel.kind === 'menu' && first) renderMenu(V.panel.el);
    }

    T.ui.player.set({
        mount(root, player) {
            root.classList.add('mc-player');
            const top = el('div', 'mc-p-top');
            const c = M.chrome(top, '', { back: () => player.stop() });
            const bottom = el('div', 'mc-p-bottom');
            const meta = el('div', 'mc-p-meta');
            const title = el('div', 'mc-p-title');
            const sub = el('div', 'mc-p-sub');
            meta.append(title, sub);
            const seek = focusable(el('div', 'mc-p-seek'));
            seek.setAttribute('role', 'slider');
            seek.setAttribute('aria-label', 'Position');
            const track = el('div', 'mc-p-track');
            const segs = el('div', 'mc-p-segs');
            const fill = el('div', 'mc-p-fill');
            const ticks = el('div', 'mc-p-ticks');
            const knob = el('div', 'mc-p-knob');
            track.append(segs, fill, ticks, knob);
            const times = el('div', 'mc-p-times');
            const pos = el('span'), dur = el('span');
            times.append(pos, dur);
            seek.append(track, times);
            seek.addEventListener('click', (e) => {
                const r = track.getBoundingClientRect();
                if (V && V.s && V.s.canSeek && e.clientX >= r.left && e.clientX <= r.right) player.seek(((e.clientX - r.left) / r.width) * V.s.duration);
            });
            const transport = el('div', 'mc-p-transport');
            const pp = button('mc-tb-big mc-tb-on', 'Pause', ICON.pause, () => player.playPause());
            const chBtn = button('', 'Chapters', ICON.chapters, () => toggleChapters(!root.classList.contains('mc-p-chapters-up')));
            transport.append(
                button('', 'Previous chapter', ICON.prev, () => player.previousChapter()),
                button('', 'Back 10 seconds', ICON.rew, () => player.seekBy(-10000)),
                pp,
                button('', 'Forward 30 seconds', ICON.ff, () => player.seekBy(30000)),
                button('', 'Next chapter', ICON.next, () => player.nextChapter()),
                button('', 'Stop', ICON.stop, () => player.stop()),
                el('span', 'mc-p-gap'),
                button('', 'Audio, subtitles and settings', ICON.tracks, () => openPanel('menu', 'audio')),
                chBtn,
                button('', 'Playback info', ICON.info, () => openPanel('info')));
            bottom.append(meta, transport, seek);
            const skip = focusable(el('button', 'mc-btn mc-p-skip'));
            skip.type = 'button';
            skip.hidden = true;
            const next = el('div', 'mc-p-next');
            next.hidden = true;
            const nextTitle = el('div', 'mc-p-next-title'), nextCount = el('div', 'mc-p-next-count');
            const nextBtns = el('div', 'mc-p-next-btns');
            const nextNow = focusable(el('button', 'mc-btn', 'Play now')), nextHide = focusable(el('button', 'mc-btn', 'Watch the credits'));
            nextNow.type = nextHide.type = 'button';
            nextBtns.append(nextNow, nextHide);
            next.append(nextCount, nextTitle, nextBtns);
            const chapters = el('div', 'mc-p-chapters');
            root.append(el('div', 'mc-p-scrim-top'), el('div', 'mc-p-scrim-bottom'), chapters, top, bottom, skip, next);
            V = { root, player, top, bottom, title, sub, seek, fill, knob, ticks, segs, pos, dur, pp, chBtn, skip, next, nextTitle, nextCount, nextNow, nextHide,
                chapters, chrome: c, visible: false, panel: null, s: null };
            this.off = player.on(update);
            update(player.state());
            root.addEventListener('mousemove', () => activity());
            show(true);
            activity();
        },
        unmount() {
            if (this.off) this.off();
            if (V) { clearTimeout(V.hideT); V.chrome.stop(); }
            V = null;
        },
        onAction(action, player, ctx) {
            if (!V) return false;
            const f = ctx.focused();
            if (V.panel) {
                if (action === 'back') { ctx.sound('back'); closePanel(); return true; }
                if ((action === 'left' || action === 'right') && f && f.mcStep) { ctx.sound('focus'); f.mcStep(action === 'right' ? 1 : -1); return true; }
                if ((action === 'left' || action === 'right') && f && f.classList.contains('mc-pivot-item')) {
                    const tabs = [...V.panel.el.querySelectorAll('.mc-pivot-item')];
                    const n = tabs[tabs.indexOf(f) + (action === 'right' ? 1 : -1)];
                    if (n) n.click();
                    return true;
                }
                if (action === 'up' || action === 'down' || action === 'left' || action === 'right') { ctx.move(action, V.panel.el); return true; }
                return false;  // enter: the engine clicks the focused row
            }
            const wasHidden = !V.visible;
            if (['up', 'down', 'left', 'right', 'enter', 'select'].includes(action)) activity();
            if (wasHidden) {
                // Hidden controls: the first press shows them; left/right also skip, OK also plays or pauses.
                if (action === 'left') player.seekBy(-10000);
                else if (action === 'right') player.seekBy(30000);
                else if (action === 'enter' || action === 'select') player.playPause();
                else if (action === 'up') toggleChapters(V.s && V.s.chapters.length > 0);
                if (action === 'back') return false;  // leave the video, as jellyfin-web does
                return ['up', 'down', 'left', 'right', 'enter', 'select'].includes(action);
            }
            if (V.root.classList.contains('mc-p-chapters-up') && f && f.classList.contains('mc-p-ch')) {
                if (action === 'left' || action === 'right') { ctx.move(action, V.chapters); return true; }
                if (action === 'down') { toggleChapters(false); ctx.focus(V.chBtn.hidden ? V.pp : V.chBtn); return true; }
            }
            if (f === V.seek && (action === 'left' || action === 'right')) {
                if (V.s && V.s.canSeek) { ctx.sound('focus'); player.seekBy(action === 'right' ? 30000 : -10000); }
                return true;
            }
            if (action === 'up' && f && V.top.contains(f)) return true;  // nothing above the top row
            // up from the transport row: Skip when it shows, else Back at the top left (spatial focus wandered into the
            // chapter strip and the seek bar's neighbours on films with chapters: the host walk)
            if (action === 'up' && f && f.closest('.mc-p-transport')) {
                ctx.sound('focus');
                ctx.focus(!V.skip.hidden ? V.skip : V.chrome.back);
                return true;
            }
            return false;  // spatial focus between the controls; Enter clicks
        },
        onBack() {
            if (!V) return false;
            if (V.root.classList.contains('mc-p-chapters-up')) { toggleChapters(false); return true; }
            if (V.visible && V.s && !V.s.paused) { show(false); return true; }
            return false;
        }
    });
})();
