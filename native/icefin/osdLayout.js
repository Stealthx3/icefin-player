// Icefin theme engine: themed player controls (PLAN 9.19). Appended after capabilities.js.
//
//   T.ui.osd.set({ layout: 'bar' | 'panel' | 'minimal', align: 'left' | 'center' | 'right' })
//
// The single surface keeps jellyfin-web's own player controls (SPEC "Native OSD": no native OSD, no input bridge), so
// every function stays: transport, the seek bar with chapter marks and trickplay, MediaSegment skip buttons, audio,
// subtitle, speed and quality menus, Up next, plugin overlays, and the controller map. This restyles them for the
// theme. The theme picks a layout here and sets its look with osd.* tokens (TOKENS.md):
//   osd.barBackground, osd.panelBackground, osd.panelRadius, osd.panelBlur, osd.buttonRadius, osd.buttonSize,
//   osd.buttonBackground, osd.focusFill, osd.focusText, osd.focusRing, osd.progress, osd.progressTrack,
//   osd.progressHeight, osd.marker, osd.titleSize, osd.titleWeight, osd.titleTransform, osd.text, osd.textSecondary,
//   osd.menuBackground, osd.menuRadius, osd.headerBackground (the title bar over the video)
// Every one has a default from the colour tokens. jellyfin-web's class names live only here, so a jellyfin-web change
// is absorbed in one place. html[data-icefin-osd] carries the layout, html[data-icefin-osd-align] the alignment.
//
// Overlay lane (user feedback on the first alpha: the controls covered the Skip Intro button): while the controls are
// up, buttons that plugins and jellyfin-web put over the video (MediaSegment and Intro Skipper skip buttons, OVERLAYS)
// move into a lane just above the controls, wherever the theme's layout puts them, and come back when the controls
// hide. With a remote or controller, Up from the controls' top row goes to the overlay, Down comes back.
//
// Size (alpha feedback: on a 4K TV the controls were too small to read from the couch): the controls over video scale
// by --icefin-osd-scale, in every theme and in the stock look. Auto sizes them by the screen's height (CSS px / 1080,
// never below 1, so 4K at 100% desktop scaling gets twice the size); Couch Mode adds COUCH_FACTOR, thicker focus
// outlines and html[data-icefin-couch] (themes show their controller hints); Client Settings -> Video -> Player
// Controls Size takes a percentage of that. Couch Mode is on when its switch is, or when Detect Couch Displays is on
// and the capability model calls this display a couch display (TV-sized, or Gamescope / Big Picture).
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (!T || !T._engine || !T.ui || T.ui.osd) return;
    const E = T._engine;
    const P = 'html[data-icefin-osd] #videoOsdPage';
    const V = (name, fallback) => `var(--icefin-osd-${name}, ${fallback})`;
    const BTN = `${P} .videoOsdBottom .paper-icon-button-light, ${P} .videoOsdBottom .btnVideoOsdSettings`;
    const FOC = `${P} .videoOsdBottom .paper-icon-button-light:focus, ${P} .videoOsdBottom .paper-icon-button-light:hover`;
    const STYLE = `
/* every layout */
/* the bar with the title and Back over the video fades into the picture instead of the theme's solid header */
/* Scrims: on a layer behind the bar that reaches well past it, with an eased fade, so they melt into the picture
   instead of ending in an edge (a gradient inside a 60 px bar can only fade over those 60 px). */
html[data-icefin-osd][data-icefin-osd-playing] .skinHeader.osdHeader { background: none !important; box-shadow: none !important; isolation: isolate;
  overflow: visible !important; contain: none !important;  /* the scrim reaches past the bar: nothing may clip it at the bar's edge */
  color: ${V('text', 'var(--icefin-color-text)')}; }
html[data-icefin-osd][data-icefin-osd-playing] .skinHeader.osdHeader::before { content: ''; position: absolute; left: 0; right: 0; top: 0; bottom: -10vh; z-index: -1; pointer-events: none;
  background: ${V('headerBackground', 'linear-gradient(180deg, rgb(var(--icefin-color-background-channel) / 0.8) 0%, rgb(var(--icefin-color-background-channel) / 0.7) 18%, rgb(var(--icefin-color-background-channel) / 0.48) 36%, rgb(var(--icefin-color-background-channel) / 0.28) 54%, rgb(var(--icefin-color-background-channel) / 0.12) 72%, rgb(var(--icefin-color-background-channel) / 0.04) 88%, transparent 100%)')}; }
${P} .videoOsdBottom { color: ${V('text', 'var(--icefin-color-text)')}; }
${P} .osdTitle { font-size: ${V('titleSize', '1.6em')}; font-weight: ${V('titleWeight', '500')}; text-transform: ${V('titleTransform', 'none')}; }
${P} .osdSecondaryMediaInfo, ${P} .osdPositionText, ${P} .osdDurationText, ${P} .osdTimeText, ${P} .endsAtText { color: ${V('textSecondary', 'var(--icefin-color-textSecondary)')}; }
${BTN} { border-radius: ${V('buttonRadius', '50%')}; background: ${V('buttonBackground', 'transparent')}; color: inherit; transition: background 150ms, color 150ms, box-shadow 150ms, transform 150ms; }
${P} .videoOsdBottom .xlargePaperIconButton, ${P} .videoOsdBottom .largePaperIconButton { font-size: ${V('buttonSize', '2.2em')}; }
${FOC} { background: ${V('focusFill', 'var(--icefin-color-focus)')}; color: ${V('focusText', 'var(--icefin-color-onFocus)')}; box-shadow: 0 0 0 0.12em ${V('focusRing', 'transparent')}; outline: none; }
${P} .osdPositionSlider ~ .mdl-slider-background-flex-container .mdl-slider-background-lower,
${P} .osdVolumeSlider ~ .mdl-slider-background-flex-container .mdl-slider-background-lower { background: ${V('progress', 'var(--icefin-color-accent)')}; }
${P} .mdl-slider-background-upper { background: ${V('progressTrack', 'rgb(var(--icefin-color-text-channel) / 0.25)')}; }
${P} .sliderContainer .mdl-slider-background-flex { height: ${V('progressHeight', '0.3em')}; margin-top: calc(${V('progressHeight', '0.3em')} / -2); }
${P} .osdPositionSlider::-webkit-slider-thumb { background: ${V('progress', 'var(--icefin-color-accent)')}; }
/* chapter marks on the seek bar */
${P} .sliderMarkerContainer .sliderMarker { background: ${V('marker', 'rgb(var(--icefin-color-text-channel) / 0.8)')}; width: 0.18em; }
/* Up next and the skip buttons (intro, credits: MediaSegments) */
${P} .upNextContainer .upNextDialog, html[data-icefin-osd] .upNextDialog { background: ${V('menuBackground', 'var(--icefin-color-surfaceRaised, var(--icefin-color-surface))')}; color: var(--icefin-color-text); border-radius: ${V('menuRadius', '0.6em')}; }
html[data-icefin-osd] .skip-button { background: ${V('menuBackground', 'var(--icefin-color-surfaceRaised, var(--icefin-color-surface))')}; color: var(--icefin-color-text); border-radius: ${V('buttonRadius', '0.4em')}; }
html[data-icefin-osd] .skip-button:focus, html[data-icefin-osd] .upNextDialog button:focus { background: ${V('focusFill', 'var(--icefin-color-focus)')}; color: ${V('focusText', 'var(--icefin-color-onFocus)')}; }
/* the track, speed and quality menus (action sheets) while video plays */
html[data-icefin-osd][data-icefin-osd-playing] .actionSheet { background: ${V('menuBackground', 'var(--icefin-color-surfaceRaised, var(--icefin-color-surface))')}; border-radius: ${V('menuRadius', '0.6em')}; }
html[data-icefin-osd][data-icefin-osd-playing] .actionSheet .listItem:focus { background: ${V('focusFill', 'var(--icefin-color-focus)')}; color: ${V('focusText', 'var(--icefin-color-onFocus)')}; }
/* bar: the full width along the bottom */
html[data-icefin-osd="bar"] #videoOsdPage .videoOsdBottom, html[data-icefin-osd="minimal"] #videoOsdPage .videoOsdBottom { background: none !important; isolation: isolate;
  overflow: visible !important; contain: none !important; }
html[data-icefin-osd="bar"] #videoOsdPage .videoOsdBottom::before { content: ''; position: absolute; left: 0; right: 0; bottom: 0; top: -16vh; z-index: -1; pointer-events: none;
  background: ${V('barBackground', 'linear-gradient(0deg, rgb(var(--icefin-color-background-channel) / 0.88) 0%, rgb(var(--icefin-color-background-channel) / 0.7) 18%, rgb(var(--icefin-color-background-channel) / 0.48) 36%, rgb(var(--icefin-color-background-channel) / 0.28) 54%, rgb(var(--icefin-color-background-channel) / 0.12) 72%, rgb(var(--icefin-color-background-channel) / 0.04) 88%, transparent 100%)')}; }
/* panel: a floating panel, aligned left, centre or right */
html[data-icefin-osd="panel"] #videoOsdPage .videoOsdBottom { left: auto !important; right: auto !important; bottom: 4vh !important; width: min(70vw, 70em) !important; box-sizing: border-box;
  padding: 1em 1.6em !important; border-radius: ${V('panelRadius', '1em')}; background: ${V('panelBackground', 'rgb(var(--icefin-color-surface-channel) / 0.86)')};
  backdrop-filter: blur(${V('panelBlur', '0px')}); box-shadow: 0 1em 3em rgb(var(--icefin-color-background-channel) / 0.5); }
html[data-icefin-osd="panel"][data-icefin-osd-align="left"] #videoOsdPage .videoOsdBottom { left: 4vw !important; }
html[data-icefin-osd="panel"][data-icefin-osd-align="right"] #videoOsdPage .videoOsdBottom { right: 4vw !important; }
/* centred with auto margins: transform stays jellyfin-web's, which slides the controls in and out with it */
html[data-icefin-osd="panel"][data-icefin-osd-align="center"] #videoOsdPage .videoOsdBottom { left: 0 !important; right: 0 !important; margin-left: auto !important; margin-right: auto !important; }
/* minimal: the transport centred under a thin seek line; nothing removed, the other buttons smaller at the ends */
html[data-icefin-osd="minimal"] #videoOsdPage .videoOsdBottom::before { content: ''; position: absolute; left: 0; right: 0; bottom: 0; top: -12vh; z-index: -1; pointer-events: none;
  background: ${V('barBackground', 'linear-gradient(0deg, rgb(var(--icefin-color-background-channel) / 0.75) 0%, rgb(var(--icefin-color-background-channel) / 0.7) 18%, rgb(var(--icefin-color-background-channel) / 0.48) 36%, rgb(var(--icefin-color-background-channel) / 0.28) 54%, rgb(var(--icefin-color-background-channel) / 0.12) 72%, rgb(var(--icefin-color-background-channel) / 0.04) 88%, transparent 100%)')}; }
html[data-icefin-osd="minimal"] #videoOsdPage .videoOsdBottom .buttons { position: relative; justify-content: flex-end; min-height: 3em; }
html[data-icefin-osd="minimal"] #videoOsdPage .videoOsdBottom .buttons > div:first-child { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }
html[data-icefin-osd="minimal"] #videoOsdPage .videoOsdBottom .osdTimeText { margin-right: auto; }
html[data-icefin-osd="minimal"] #videoOsdPage .videoOsdBottom .buttons > :not(:first-child) { font-size: 0.8em; opacity: 0.8; }
html[data-icefin-osd="minimal"] #videoOsdPage .sliderContainer .mdl-slider-background-flex { height: ${V('progressHeight', '0.15em')}; }
/* the overlay lane: plugin buttons over the video sit above the controls while those are up */
html[data-icefin-osd-up] .skip-button, html[data-icefin-osd-up] #skipIntro, html[data-icefin-osd-up] .skipIntro,
html[data-icefin-osd-up] [data-icefin-overlay] { bottom: calc(var(--icefin-osd-clear, 0px) + 1.2em) !important; top: auto !important;
  transition: bottom 200ms ease; z-index: 1001 !important; }
html[data-icefin-osd-up] .skip-button:focus, html[data-icefin-osd-up] #skipIntro button:focus, html[data-icefin-osd-up] .skipIntro button:focus,
html[data-icefin-osd-up] [data-icefin-overlay]:focus { outline: 0.18em solid var(--icefin-color-focus); outline-offset: 0.15em; }
/* while video plays, only the player's page shows: a page left open before playback (a standalone one such as Select
   Server stays visible in jellyfin-web) no longer shows through above the video (host walk, 9.43) */
html[data-icefin-osd-playing] .mainAnimatedPage:not(#videoOsdPage), html[data-icefin-osd-playing] .mainAnimatedPage:not(#videoOsdPage) * { visibility: hidden !important; }
/* size: the controls over video, scaled as one (zoom keeps jellyfin-web's px and em parts in proportion) */
html[data-icefin-osd-playing] #videoOsdPage .videoOsdBottom, html[data-icefin-osd-playing] .skinHeader.osdHeader,
html[data-icefin-osd-playing] .upNextContainer { zoom: var(--icefin-osd-scale, 1); }
/* overlays fixed to the window: scaled from their bottom-right corner, so the lane above places them in screen px */
html[data-icefin-osd-playing] .skip-button, html[data-icefin-osd-playing] #skipIntro, html[data-icefin-osd-playing] .skipIntro,
html[data-icefin-osd-playing] [data-icefin-overlay] { transform: scale(var(--icefin-osd-scale, 1)) !important; transform-origin: 100% 100% !important; }
/* menus over video (audio, subtitles, speed): larger text; jellyfin-web places them by their measured size */
html[data-icefin-osd-playing] .actionSheet { font-size: calc(100% * var(--icefin-osd-scale, 1)); }
/* the panel layout keeps its share of the screen when zoomed */
html[data-icefin-osd="panel"][data-icefin-osd-playing] #videoOsdPage .videoOsdBottom { width: min(calc(70vw / var(--icefin-osd-scale, 1)), 70em) !important; }
/* Couch Mode: focus that reads across the room */
html[data-icefin-couch][data-icefin-osd-playing] #videoOsdPage .videoOsdBottom :focus,
html[data-icefin-couch][data-icefin-osd-playing] .skip-button:focus { outline: 0.22em solid var(--icefin-color-focus, currentColor) !important; outline-offset: 0.12em; }
`;
    const COUCH_FACTOR = 1.3;
    const OVERLAYS = '.skip-button, #skipIntro button, .skipIntro button, [data-icefin-overlay]';
    let spec = null;
    const html = () => document.documentElement;
    function ensureStyle() {
        if (document.getElementById('icefin-osd-base')) return;
        const s = document.createElement('style');
        s.id = 'icefin-osd-base';
        s.textContent = STYLE;
        (document.head || html()).prepend(s);
    }
    function apply() {
        const h = html();
        if (!h) return;
        if (spec) {
            h.setAttribute('data-icefin-osd', spec.layout);
            h.setAttribute('data-icefin-osd-align', spec.align);
        } else {
            h.removeAttribute('data-icefin-osd');
            h.removeAttribute('data-icefin-osd-align');
        }
    }
    // While the video page is up: lets menu styles apply only to menus opened over video.
    function watchRoute() {
        const h = html();
        if (h) h.toggleAttribute('data-icefin-osd-playing', /^#\/video\b/.test(location.hash));
    }
    // The controls' top edge, while they are up, for the overlay lane.
    function watchControls() {
        const h = html();
        if (!h) return;
        const bar = /^#\/video\b/.test(location.hash) && document.querySelector('#videoOsdPage .videoOsdBottom');
        let up = false;
        if (bar && !bar.classList.contains('hide') && !bar.classList.contains('videoOsdBottom-hidden')) {
            const r = bar.getBoundingClientRect(), cs = getComputedStyle(bar);
            // A zoomed element's rect comes back divided by its zoom (--icefin-osd-scale): back to viewport px.
            const z = parseFloat(h.style.getPropertyValue('--icefin-osd-scale')) || 1;
            const top = r.top * z;
            up = r.height > 0 && top < innerHeight - 4 && parseFloat(cs.opacity) > 0.1 && cs.visibility !== 'hidden';
            if (up) h.style.setProperty('--icefin-osd-clear', `${Math.max(0, Math.round(innerHeight - top))}px`);
        }
        h.toggleAttribute('data-icefin-osd-up', !!up);
    }
    setInterval(watchControls, 200);
    const visibleOverlay = () => [...document.querySelectorAll(OVERLAYS)].find((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden'; });
    // Up from the controls' top row reaches the overlay; Down from the overlay returns to the controls.
    const laneHook = (a) => {
        if ((a !== 'up' && a !== 'down') || !/^#\/video\b/.test(location.hash)) return false;
        const f = document.activeElement;
        const bar = document.querySelector('#videoOsdPage .videoOsdBottom');
        if (!bar || !html().hasAttribute('data-icefin-osd-up')) return false;
        const ov = visibleOverlay();
        if (!ov) return false;
        if (a === 'up' && f && bar.contains(f)) {
            const fr = f.getBoundingClientRect(), br = bar.getBoundingClientRect();
            const topRow = [...bar.querySelectorAll('button, input, [tabindex]')].filter((x) => x.offsetParent !== null)
                .reduce((m, x) => Math.min(m, x.getBoundingClientRect().top), Infinity);
            if (fr.top <= topRow + 4 || fr.top - br.top < br.height * 0.34) { ov.focus(); E.sound('focus'); return true; }
            return false;
        }
        if (a === 'down' && f && (f === ov || (ov.contains && ov.contains(f)))) {
            const back = bar.querySelector('.btnPause, .btnPlayPause') || bar.querySelector('button');
            if (back) { back.focus(); E.sound('focus'); return true; }
        }
        return false;
    };
    E.addActionHook(laneHook);
    // ---- size ----
    function settingsVideo() { try { return (window.jmpInfo && window.jmpInfo.settings && window.jmpInfo.settings.video) || {}; } catch (e) { return {}; } }
    function couchOn() {
        const v = settingsVideo();
        if (v.icefin_couch_mode === true) return true;
        const sys = T.system;
        return v.icefin_couch_detect !== false && !!(sys && sys.couch && sys.couch.couch);
    }
    function sizeScale() {
        const v = settingsVideo();
        const base = Math.max(1, innerHeight / 1080);
        const couch = couchOn();
        const pct = v.icefin_osd_size && v.icefin_osd_size !== 'auto' ? Number(v.icefin_osd_size) / 100 : 1;
        return { scale: Math.max(0.6, Math.min(4, base * (couch ? COUCH_FACTOR : 1) * (pct || 1))), couch };
    }
    function applySize() {
        const h = html();
        if (!h) return;
        const { scale, couch } = sizeScale();
        h.style.setProperty('--icefin-osd-scale', scale.toFixed(3));
        h.toggleAttribute('data-icefin-couch', couch);
    }
    T.ui.osdSize = () => sizeScale();
    window.addEventListener('resize', applySize);
    window.addEventListener('icefin-system', applySize);
    const hookSettings = () => {
        if (window.jmpInfo && Array.isArray(window.jmpInfo.settingsUpdate)) window.jmpInfo.settingsUpdate.push((section) => { if (section === 'video') applySize(); });
        applySize();
    };
    if (document.documentElement) hookSettings(); else document.addEventListener('DOMContentLoaded', hookSettings);
    window.addEventListener('hashchange', watchRoute);
    window.addEventListener('popstate', watchRoute);
    setInterval(watchRoute, 1000);  // jellyfin-web's own navigation goes through history.pushState as well
    E.onReset(() => { spec = null; apply(); E.addActionHook(laneHook); });  // a theme change clears the action hooks

    T.ui.osd = {
        set(o) {
            const layout = ['bar', 'panel', 'minimal'].includes((o || {}).layout) ? o.layout : 'bar';
            const align = ['left', 'center', 'right'].includes((o || {}).align) ? o.align : 'center';
            spec = { layout, align };
            if (document.head) ensureStyle(); else document.addEventListener('DOMContentLoaded', ensureStyle);
            apply();
        },
        layout: () => (spec ? Object.assign({}, spec) : null)
    };
})();
