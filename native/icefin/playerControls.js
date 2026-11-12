// Icefin theme engine: theme-native player controls (D30, PLAN 9.45). Appended after osdLayout.js.
//
//   T.ui.player.set({ mount(el, player, ctx), unmount?(), onAction?(action, player, ctx), onBack?(player) })
//
// Three parts, so no function is ever lost:
//
// 1. Themed controls. The theme draws the controls over video from `player` (below): a snapshot of everything playback
//    shows (state, position, chapters, tracks, speed, aspect, volume, the queue's next item, segments) and the commands
//    jellyfin-web's own controls have. jellyfin-web's video page stays mounted under the theme's screen (the player
//    lives in it), hidden; media keys and anything the screen doesn't use still reach jellyfin-web's input manager.
//
// 2. The compatibility archive (ARCHIVE): overlays that jellyfin-web and known plugins put over video, which the theme
//    draws itself from their state: MediaSegment skips (jellyfin-web's skip button, fed by the server's segments, Intro
//    Skipper included when it provides segments), Intro Skipper's own button (its older versions), Up next, and
//    SyncPlay / Play on (opened through jellyfin-web's own menus, which 9.38 themes). `player.state().archive` lists
//    the ones up now, each with activate() (and dismiss() for Up next).
//
// 3. The web fallback. When something appears that the archive can't satisfy (a plugin injecting its own button or
//    panel into the player, a player that isn't Icefin's local mpv, a theme script that fails), this playback session
//    falls back to jellyfin-web's own controls, restyled by ui.osd as before (9.19), with a short notice saying why.
//    The theme's controls come back with the next session. `player.useWebControls()` does the same on request.
//
// jellyfin-web's names (playback manager calls, class names) live only here, so a jellyfin-web change is absorbed in
// one place; themes reach none of them (theme-lint rule 4).
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (!T || !T._engine || !T.ui || T.ui.player) return;
    const E = T._engine;
    const TPM = 10000;  // ticks per millisecond
    const pm = () => window.icefinPlaybackManager;
    const onVideo = () => /^#\/video\b/.test(location.hash);
    const client = () => window.ApiClient;
    const NOTICE_ID = 'icefin-player-notice';

    let spec = null;      // the theme's controls
    let session = null;   // {key, fallback: {reason} | null, present: Set, buttons: Set}
    let mounted = null;   // {el, timer}
    const subs = new Set();
    const segCache = new Map();   // itemId -> [{type, start, end}] (ms)

    const safe = (fn, d) => { try { const v = fn(); return v === undefined ? d : v; } catch (e) { return d; } };
    function cur() { const m = pm(); return m ? safe(() => m.getCurrentPlayer(), null) : null; }

    // ---- the compatibility archive ----
    const shown = (el) => !!(el && el.isConnected && el.getClientRects().length && !el.closest('.hide, .skip-button-hidden'));
    const ARCHIVE = [
        {   // jellyfin-web's MediaSegment skip prompt (intro, outro, recap, preview, commercial)
            id: 'media-segment', kind: 'skip', sel: '.skip-button',
            read: (el) => ({ label: (el.textContent || '').replace(/skip_next/g, '').trim() || 'Skip' }),
            activate: (el) => el.click()
        },
        {   // Intro Skipper's own button (versions before it provided MediaSegments)
            id: 'intro-skipper', kind: 'skip', sel: '#skipIntro, .skipIntro',
            read: (el) => ({ label: (el.textContent || '').trim() || 'Skip intro' }),
            activate: (el) => { const b = el.matches('button') ? el : el.querySelector('button'); (b || el).click(); }
        },
        {   // jellyfin-web's Up next card
            id: 'up-next', kind: 'upNext', sel: '.upNextDialog',
            read: (el) => ({
                title: ((el.querySelector('.upNextDialog-title') || {}).textContent || '').trim(),
                countdown: ((el.querySelector('.upNextDialog-countdownText') || {}).textContent || '').trim()
            }),
            activate: (el) => { const b = el.querySelector('.btnStartNow'); if (b) b.click(); },
            dismiss: (el) => { const b = el.querySelector('.btnHide'); if (b) b.click(); }
        }
    ];
    // jellyfin-web's own nodes that come and go over video, and the engine's: never a reason to fall back.
    const KNOWN = ['.dialogContainer', '.skip-button-container', '.upNextContainer', '.toastContainer', '.toast', '.iconOsd',
        '.docspinner', '.mdl-spinner', '.loading-spinner', '.backdropContainer', '.backgroundContainer', '.videoPlayerContainer',
        '.htmlvideoplayer', '.videoSubtitles', '.chapterThumbContainer', '.sliderBubble', '[data-icefin-overlay]',
        '[id^="icefin-"]', '#skipIntro', '.skipIntro', 'script', 'style', 'link', 'noscript', 'audio', 'video', 'template'];
    const KNOWN_SEL = KNOWN.join(', ');
    const known = (el) => !!(el.matches && (el.matches(KNOWN_SEL) || el.closest(KNOWN_SEL)));

    function archiveNow() {
        const out = [];
        for (const a of ARCHIVE) {
            const el = [...document.querySelectorAll(a.sel)].find(shown);
            if (!el) continue;
            const o = Object.assign({ id: a.id, kind: a.kind }, safe(() => a.read(el), {}));
            o.activate = () => { safe(() => a.activate(el)); tick(); };
            if (a.dismiss) o.dismiss = () => { safe(() => a.dismiss(el)); tick(); };
            out.push(o);
        }
        return out;
    }

    // ---- the web fallback ----
    function osdPage() {
        return [...document.querySelectorAll('#videoOsdPage')].filter((p) => p.getClientRects().length).pop()
            || [...document.querySelectorAll('#videoOsdPage')].pop() || null;
    }
    function startSession(key) {
        const page = osdPage();
        // What is there as the session starts is jellyfin-web's (or a plugin's on every page, not the player's). jellyfin-web
        // finishes building its player page just after playback starts: whatever arrives in the first moments joins the
        // starting set instead of counting as an injection.
        session = {
            key, fallback: null, graceUntil: Date.now() + 2500,
            present: new Set(document.body ? [...document.body.children] : []),
            buttons: new Set(page ? [...page.querySelectorAll('button, input, select, [role="button"]')] : [])
        };
        const p = cur();
        if (p && !(p.isLocalPlayer && /mpv/i.test(`${p.id || ''} ${p.name || ''}`))) fallBack(`playing on ${p.name || 'another player'}`);
    }
    function describe(el) {
        const id = el.id ? '#' + el.id : '';
        const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
        return `${el.tagName.toLowerCase()}${id}${cls}`;
    }
    const injections = new MutationObserver((records) => {
        if (!session || session.fallback || !spec || !onVideo()) return;
        const page = osdPage();
        const grace = Date.now() < session.graceUntil;
        for (const r of records) {
            for (const n of r.addedNodes) {
                if (n.nodeType !== 1 || known(n)) continue;
                if (grace) {
                    if (n.parentNode === document.body) session.present.add(n);
                    if (n.querySelectorAll) [n, ...n.querySelectorAll('button, input, select, [role="button"]')].forEach((b) => session.buttons.add(b));
                    continue;
                }
                // Something new straight on <body> while video plays, visible: a plugin's own overlay.
                if (n.parentNode === document.body && !session.present.has(n)) {
                    setTimeout(() => { if (n.isConnected && n.getClientRects().length && !known(n)) fallBack(`a plugin added ${describe(n)} over the video`); }, 400);
                    continue;
                }
                // A control added into jellyfin-web's player that it didn't have at the start: a plugin's button.
                if (page && page.contains(n)) {
                    const ctl = n.matches('button, input, select, [role="button"]') ? [n] : [...n.querySelectorAll('button, input, select, [role="button"]')];
                    const extra = ctl.find((b) => !session.buttons.has(b) && !known(b));
                    if (extra) fallBack(`a plugin added ${describe(extra)} to the player`);
                }
            }
        }
    });
    function fallBack(reason) {
        if (!session || session.fallback) return;
        session.fallback = { reason, at: Date.now() };
        console.info('icefinTheme: player controls fall back to the web controls for this session:', reason);
        E.reroute();
        notice(`Showing the web player controls for this video: ${reason}.`);
    }
    function notice(text) {
        if (!document.body) return;
        let n = document.getElementById(NOTICE_ID);
        if (!n) {
            n = document.createElement('div');
            n.id = NOTICE_ID;
            n.setAttribute('role', 'status');
            n.style.cssText = 'position:fixed;left:3vw;top:3vh;z-index:1001;max-width:46vw;padding:0.7em 1.1em;font-size:1.05em;'
                + 'background:var(--icefin-color-surfaceRaised, var(--icefin-color-surface));color:var(--icefin-color-text);border-radius:var(--icefin-shape-cardRadius);'
                + 'box-shadow:0 0 1.5em rgb(var(--icefin-color-background-channel) / 0.6);pointer-events:none;transition:opacity 400ms';
            document.body.append(n);
        }
        n.textContent = text;
        n.style.opacity = '1';
        clearTimeout(notice.t);
        notice.t = setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 450); }, 6000);
    }

    // ---- state ----
    function image(item, type, tag, opts) {
        const c = client();
        return c && tag ? safe(() => c.getScaledImageUrl(item, Object.assign({ type, tag }, opts)), null) : null;
    }
    function logoOf(item) {
        if (!item) return null;
        if (item.ImageTags && item.ImageTags.Logo) return image(item.Id, 'Logo', item.ImageTags.Logo, { maxHeight: 240 });
        if (item.ParentLogoItemId && item.ParentLogoImageTag) return image(item.ParentLogoItemId, 'Logo', item.ParentLogoImageTag, { maxHeight: 240 });
        return null;
    }
    function track(s, sel) {
        const bits = [s.Language, s.Codec && s.Codec.toUpperCase(), s.ChannelLayout || (s.Channels ? `${s.Channels} ch` : ''), s.IsExternal ? 'external' : '', s.IsForced ? 'forced' : ''].filter(Boolean);
        return { index: s.Index, label: s.DisplayTitle || s.Title || bits.join(' · ') || `Track ${s.Index}`, language: s.Language || '', codec: s.Codec || '', channels: s.Channels || 0, detail: bits.join(' · '), selected: s.Index === sel };
    }
    function segmentsFor(id) {
        if (!id || segCache.has(id)) return segCache.get(id) || [];
        segCache.set(id, []);
        const c = client();
        if (c) safe(() => c.getJSON(c.getUrl(`MediaSegments/${id}`)).then((r) => {
            segCache.set(id, ((r && r.Items) || []).map((s) => ({ type: s.Type, start: s.StartTicks / TPM, end: s.EndTicks / TPM })));
        }, () => {}));
        return [];
    }
    function snapshot() {
        const m = pm(), p = cur();
        if (!m || !p) return { active: false, archive: [], fallback: session && session.fallback };
        const item = safe(() => m.currentItem(p), null) || {};
        const src = safe(() => m.currentMediaSource(p), null) || {};
        const pos = safe(() => m.currentTime(p), 0) || 0;
        const durTicks = safe(() => m.duration(p), 0) || 0;
        const dur = durTicks / TPM;
        const rate = safe(() => m.getPlaybackRate(p), 1) || 1;
        const paused = !!safe(() => m.paused(p), false);
        const live = item.Type === 'TvChannel' || !!src.IsInfiniteStream || !dur;
        const aSel = safe(() => m.getAudioStreamIndex(p), null), sSel = safe(() => m.getSubtitleStreamIndex(p), -1);
        const c = client();
        const chapters = (item.Chapters || []).map((ch, i) => ({ index: i, name: ch.Name || `Chapter ${i + 1}`, start: ch.StartPositionTicks / TPM,
            image: ch.ImageTag ? image(item.Id, 'Chapter', ch.ImageTag, { index: i, maxWidth: 400 }) : null }));
        const ep = item.Type === 'Episode' ? [item.ParentIndexNumber != null ? `S${item.ParentIndexNumber}` : '', item.IndexNumber != null ? `E${item.IndexNumber}` : ''].join(' ').trim() : '';
        const program = item.CurrentProgram || null;
        return {
            active: true,
            item, itemId: item.Id, type: item.Type || '', mediaType: item.MediaType || '',
            title: item.Type === 'Episode' ? (item.SeriesName || item.Name) : (item.Name || ''),
            subtitle: item.Type === 'Episode' ? [ep, item.Name].filter(Boolean).join(' · ') : (program ? program.Name : (item.ProductionYear ? String(item.ProductionYear) : '')),
            logo: logoOf(item),
            poster: item.ImageTags && item.ImageTags.Primary ? image(item.Id, 'Primary', item.ImageTags.Primary, { maxHeight: 360 }) : null,
            paused, live, canSeek: !live && dur > 0,
            position: pos, duration: dur, rate,
            endsAt: dur > 0 ? new Date(Date.now() + Math.max(0, dur - pos) / rate) : null,
            chapter: chapters.reduce((k, ch) => (ch.start <= pos + 500 ? ch.index : k), -1),
            chapters,
            segments: segmentsFor(item.Id),
            audio: safe(() => m.audioTracks(p), []).map((s) => track(s, aSel)),
            subtitles: safe(() => m.subtitleTracks(p), []).map((s) => track(s, sSel)),
            subtitleIndex: sSel == null ? -1 : sSel,
            subtitleOffset: safe(() => m.getPlayerSubtitleOffset(p), 0) || 0,
            speeds: safe(() => m.getSupportedPlaybackRates(p), []).map((s) => ({ id: s.id, name: s.name })),
            aspect: safe(() => m.getAspectRatio(p), ''),
            aspects: safe(() => m.getSupportedAspectRatios(p), []).map((a) => ({ id: a.id, name: a.name })),
            volume: safe(() => m.getVolume(p), 100), muted: !!safe(() => m.isMuted(p), false),
            repeat: safe(() => m.getRepeatMode(p), 'RepeatNone'), shuffle: safe(() => m.getQueueShuffleMode(p), 'Sorted'),
            playlistIndex: safe(() => m.getCurrentPlaylistIndex(p), 0),
            next: (safe(() => m.getNextItem(), null) || {}).item || null,
            method: safe(() => m.playMethod(p), ''),
            server: c ? safe(() => (c.serverInfo() || {}).Name, '') : '',
            archive: archiveNow(),
            fallback: session && session.fallback
        };
    }

    // ---- commands ----
    const run = (fn) => { const m = pm(), p = cur(); if (!m || !p) return false; safe(() => fn(m, p)); setTimeout(tick, 60); return true; };
    const player = {
        state: () => snapshot(),
        // fn(state) on every change of position or state, about four times a second while the controls are mounted
        on(fn) { subs.add(fn); return () => subs.delete(fn); },
        playPause: () => run((m, p) => m.playPause(p)),
        play: () => run((m, p) => m.unpause(p)),
        pause: () => run((m, p) => m.pause(p)),
        stop: () => run((m, p) => m.stop(p)),
        seek: (ms) => run((m, p) => m.seek(Math.max(0, Math.round(ms * TPM)), p)),
        seekBy: (ms) => run((m, p) => m.seek(Math.max(0, Math.round((m.currentTime(p) + ms) * TPM)), p)),
        nextChapter: () => run((m, p) => m.nextChapter(p)),
        previousChapter: () => run((m, p) => m.previousChapter(p)),
        chapter: (i) => run((m, p) => { const ch = (m.currentItem(p).Chapters || [])[i]; if (ch) m.seek(ch.StartPositionTicks, p); }),
        nextItem: () => run((m, p) => m.nextTrack(p)),
        previousItem: () => run((m, p) => m.previousTrack(p)),
        channelUp: () => run((m, p) => m.channelUp(p)),
        channelDown: () => run((m, p) => m.channelDown(p)),
        setAudio: (index) => run((m, p) => m.setAudioStreamIndex(index, p)),
        setSubtitles: (index) => run((m, p) => m.setSubtitleStreamIndex(index == null ? -1 : index, p)),
        setSubtitleOffset: (seconds) => run((m, p) => m.setSubtitleOffset(seconds, p)),
        setSpeed: (rate) => run((m, p) => m.setPlaybackRate(rate, p)),
        setAspect: (id) => run((m, p) => m.setAspectRatio(id, p)),
        setVolume: (v) => run((m, p) => m.setVolume(Math.max(0, Math.min(100, v)), p)),
        toggleMute: () => run((m, p) => m.toggleMute(undefined, p)),
        setRepeat: (mode) => run((m, p) => m.setRepeatMode(mode, p)),
        toggleShuffle: () => run((m, p) => m.toggleQueueShuffleMode(p)),
        // Playback info for an info panel: what plays and how, from the item, the session and the capability model.
        info() {
            const s = snapshot();
            const src = safe(() => pm().currentMediaSource(cur()), null) || {};
            const streams = src.MediaStreams || [];
            const v = streams.find((x) => x.Type === 'Video') || {};
            const a = streams.find((x) => x.Type === 'Audio' && s.audio.some((t) => t.selected && t.index === x.Index)) || streams.find((x) => x.Type === 'Audio') || {};
            const sys = T.system || {};
            return {
                method: s.method, container: src.Container || '', bitrate: src.Bitrate || 0, size: src.Size || 0,
                video: { codec: v.Codec || '', profile: v.Profile || '', width: v.Width || 0, height: v.Height || 0, fps: v.RealFrameRate || v.AverageFrameRate || 0,
                    range: v.VideoRangeType || v.VideoRange || '', bitDepth: v.BitDepth || 0, bitrate: v.BitRate || 0 },
                audio: { codec: a.Codec || '', channels: a.Channels || 0, layout: a.ChannelLayout || '', language: a.Language || '', title: a.DisplayTitle || '' },
                subtitles: (s.subtitles.find((t) => t.selected) || {}).label || 'Off',
                renderer: sys.renderer || '', hdrDisplay: (sys.hdr || {}).display || '', output: sys.video ? (sys.video[/dovi|dolby/i.test(v.VideoRangeType || '') ? 'dolbyVision58' : /hlg/i.test(v.VideoRangeType || '') ? 'hlg' : /hdr|pq/i.test(v.VideoRangeType || v.VideoRange || '') ? 'hdr10' : 'sdr'] || '') : '',
                passthrough: ((sys.audio || {}).passthrough || []).includes((a.Codec || '').toLowerCase()),
                speed: s.rate, position: s.position, duration: s.duration
            };
        },
        // jellyfin-web's own SyncPlay and Play on menus (dialogs the engine themes, 9.38). False when not available.
        watchTogether: () => clickHeader('.headerSyncButton, [aria-label*="SyncPlay" i]'),
        playOn: () => clickHeader('.headerCastButton, [aria-label*="Play On" i], [aria-label*="Cast" i]'),
        // This session uses jellyfin-web's own controls instead (a theme's "web controls" entry, or its own failure).
        useWebControls: (reason) => fallBack(reason || 'chosen in the controls')
    };
    function clickHeader(sel) {
        const b = [...document.querySelectorAll(sel)].find((x) => !x.closest('#icefin-theme-root'));
        if (!b) return false;
        b.click();
        return true;
    }

    // ---- the screen over #/video ----
    let last = '';
    function tick() {
        if (!mounted) return;
        const s = snapshot();
        const sig = JSON.stringify([s.active, s.paused, Math.round(s.position / 250), s.duration, s.itemId, s.audio.map((t) => t.selected), s.subtitleIndex,
            s.rate, s.aspect, s.volume, s.muted, s.repeat, s.archive.map((x) => x.id + (x.label || x.countdown || '')), s.segments.length, s.subtitleOffset]);
        if (sig === last) return;
        last = sig;
        for (const fn of [...subs]) safe(() => fn(s));
    }
    function sessionKey() {
        const m = pm(), p = cur();
        if (!m || !p) return null;
        const it = safe(() => m.currentItem(p), null);
        return it ? `${it.Id}:${safe(() => m.playSessionId(p), '')}` : null;
    }
    // Sessions follow playback, not the screen: a new item or play session is a new session; leaving video ends one.
    setInterval(() => {
        if (!spec) return;
        const k = onVideo() ? sessionKey() : null;
        if (k && (!session || session.key !== k)) {
            const was = session && session.fallback;
            startSession(k);
            if (was && !session.fallback) E.reroute();  // the theme's controls come back with the next session
        } else if (!k && session && !onVideo()) {
            session = null;
        }
    }, 500);

    function transparent(on) {
        const h = document.documentElement;
        if (!h) return;
        h.toggleAttribute('data-icefin-player-up', on);
        if (on && !document.getElementById('icefin-player-style')) {
            const st = document.createElement('style');
            st.id = 'icefin-player-style';
            st.textContent = 'html[data-icefin-player-up], html[data-icefin-player-up] body { background: transparent !important; }'
                + ' html[data-icefin-player-up] body::before, html[data-icefin-player-up] body::after { display: none !important; }';
            (document.head || h).append(st);
        }
    }

    const screen = {
        declines: () => !spec || !!(session && session.fallback),
        mount(root, ctx) {
            if (!session) { const k = sessionKey(); if (k) startSession(k); }
            if (session && session.fallback) throw new Error('fell back');
            root.setAttribute('data-icefin-player', '');
            root.style.background = 'transparent';
            root.style.overflow = 'hidden';
            // The video is under the web view: nothing of the document may paint over it while the theme's controls
            // are up. jellyfin-web's video page, which normally keeps its own ground clear, is hidden under the screen,
            // so the document's own background (and a theme's body ground) would show instead of the picture.
            transparent(true);
            mounted = { el: root, timer: setInterval(tick, 250) };
            last = '';
            try {
                spec.mount(root, player, ctx);
            } catch (e) {
                console.error('icefinTheme: the theme\'s player controls failed', e);
                if (session) session.fallback = { reason: 'the theme\'s controls failed', at: Date.now() };
                throw e;
            }
            tick();
        },
        unmount() {
            transparent(false);
            if (!mounted) return;
            clearInterval(mounted.timer);
            mounted = null;
            subs.clear();
            safe(() => spec && spec.unmount && spec.unmount());
        },
        onAction: (action, ctx) => !!(spec && spec.onAction && safe(() => spec.onAction(action, player, ctx), false)),
        onBack: () => !!(spec && spec.onBack && safe(() => spec.onBack(player), false))
    };

    const startWatch = () => injections.observe(document.body, { childList: true, subtree: true });
    if (document.body) startWatch(); else document.addEventListener('DOMContentLoaded', startWatch);
    E.onReset(() => { spec = null; session = null; });

    T.ui.player = {
        // While the theme's scripts load: the theme draws the player controls (D30). Without it, a theme keeps
        // jellyfin-web's own controls, laid out and styled by ui.osd (9.19).
        set(o) {
            if (!o || typeof o.mount !== 'function') return false;
            spec = o;
            return E.registerScreen('#/video', screen);
        },
        // For tests and diagnostics: is the theme drawing the controls, and if not, why
        status: () => ({ themed: !!spec, session: session ? session.key : null, fallback: session && session.fallback ? session.fallback.reason : null }),
        archive: () => ARCHIVE.map((a) => ({ id: a.id, kind: a.kind }))
    };
})();
