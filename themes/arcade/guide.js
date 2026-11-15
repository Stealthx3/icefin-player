// Arcade: the guide (PLAN 9.15, kept in the 9.49 pass; the canvas's Guide and Programme boards). The engine's
// ui.guideGrid (channels down the side, a time axis, cells sized by duration, a now line, paging by time and channel)
// under the info pane, the focused channel live and muted in the corner through ui.mutedPreview (the page's own
// <video>, never mpv). The tab strip above it is the app's places (grid.js); ≡ on a programme opens its card (tv.js);
// a recording carries a red dot. D.guideScreen() is #/livetv's screen (tv.js).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const E = T.ctx;  // focus, focused, sound: the theme script API (8.7)
    const D = window.icefinArcade;
    if (!D) return;
    const el = D.el;
    const HINTS = [['OK', 'watch'], ['≡', 'programme'], ['◀ ▶', 'time'], ['▲ ▼', 'channels'], ['Back', 'tabs']];
    const ROWS = 8, SPAN = 120, PREVIEW_DWELL = 900;  // eight channel rows over two hours, as on the target (almanac.json)
    const iso = (ms) => new Date(ms).toISOString();
    const hm = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    let S = null;

    function info(p, ch) {
        if (!S) return;
        S.title.textContent = p.gap ? (ch.Name || '') : p.title;
        S.when.textContent = p.gap ? '' : `${ch.ChannelNumber ? ch.ChannelNumber + '  ' : ''}${ch.Name}  ·  ${hm(p.start)} – ${hm(p.end)}${p.start <= Date.now() && p.end > Date.now() ? '  ·  On now' : ''}`;
        S.desc.textContent = p.overview || '';
        S.root.setAttribute('data-ac-programme', p.id);
        preview(ch);
    }

    // ---- live preview of the focused channel ----
    let previewTimer = null;
    function preview(ch) {
        if (S.previewChannel === ch.Id) return;
        clearTimeout(previewTimer);
        stopPreview();
        S.previewChannel = ch.Id;
        S.previewLabel.textContent = ch.Name;
        const tag = ch.ImageTags && ch.ImageTags.Primary;
        S.preview.style.backgroundImage = tag ? `url("${S.client.getScaledImageUrl(ch.Id, { type: 'Primary', maxWidth: 480, tag })}")` : 'none';
        return;  // Arcade shows the channel's picture only: no muted previews (Gate 1, decision 6)
        // eslint-disable-next-line no-unreachable
        previewTimer = setTimeout(() => {
            if (!S || S.previewChannel !== ch.Id) return;
            const pv = ui.mutedPreview(S.previewVideo, { itemId: ch.Id, live: true });
            S.pv = pv;
            S.root.setAttribute('data-ac-preview', ch.Id);
            pv.video.addEventListener('error', () => { if (S && S.pv === pv) stopPreview(); });  // keep the channel image
        }, PREVIEW_DWELL);
    }
    function stopPreview() {
        if (S && S.pv) { S.pv.stop(); S.pv = null; S.root.removeAttribute('data-ac-preview'); }
    }

    function focusMenu() {
        S.zone = 'menu';
        D.hints([['OK', 'open'], ['◀ ▶', 'tab'], ['▼', 'the guide'], ['Back', '']]);
        S.menu.forEach((m) => m.classList.remove('icefin-was'));
        E.focus(S.menu[S.menuIndex || 0]);
    }

    function screen() {
        return {
            onAction(action, ctx) {
                if (!S || !S.ready) return false;
                D.sawAction && D.sawAction(action);
                const f = ctx.focused();
                if (action === 'menu') { if (S.at && S.at.p && S.at.p.item && !S.at.p.gap && D.liveOptions) { D.liveOptions(S.at.p.item); return true; } return false; }
                const mi = S.menu.indexOf(f);
                if (mi >= 0) {
                    if (action === 'left' || action === 'right') { const n = mi + (action === 'right' ? 1 : -1); if (n >= 0 && n < S.menu.length) { S.menuIndex = n; E.focus(S.menu[n]); ctx.sound('focus'); } return true; }
                    if (action === 'down') { if (S.guide) { S.zone = 'guide'; S.guide.refocus(); ctx.sound('focus'); } return true; }
                    if (action === 'back') { ctx.sound('back'); if (history.length > 1) history.back(); else T.ctx.navigate('#/home'); return true; }
                    return action === 'up';
                }
                // In the guide: ui.guideGrid has already used the moves it can make; what reaches here leaves the grid.
                if (S.guide && S.guideEl.contains(f)) {
                    if (action === 'up' || action === 'back') { focusMenu(); ctx.sound(action === 'back' ? 'back' : 'focus'); return true; }
                    return action === 'left' || action === 'right' || action === 'down';
                }
                return false;
            },
            async mount(root) {
                root.setAttribute('data-al', 'guide');
                root.setAttribute('data-ac-screen', 'guide');
                D.pointerNav(root);
                S = { client: T.ctx.apiClient(), root, menu: [], ready: false, zone: 'guide', menuIndex: 0 };
                const top = el('div', 'ac-top');
                const inf = el('div', 'ac-info');
                S.clock = el('div', 'ac-clock');
                S.title = el('div', 'ac-title');
                S.when = el('div', 'ac-when');
                S.desc = el('div', 'ac-desc');
                inf.append(S.clock, S.title, S.when, S.desc);
                S.preview = el('div', 'ac-preview');
                S.previewVideo = el('div', 'ac-preview-video');
                S.previewVideo.style.cssText = 'position:absolute;inset:0';
                S.previewLabel = el('div', 'ac-preview-label');
                S.preview.append(S.previewVideo, S.previewLabel);
                top.append(inf, S.preview);
                const menu = el('nav', 'ac-menu');
                S.guideEl = el('div', 'ac-guide');
                root.append(top, menu, S.guideEl);
                const tick = () => { if (S && S.root === root) S.clock.textContent = new Date().toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' }); };
                tick();
                S.clockTimer = setInterval(tick, 15000);

                S.client = T.ctx.apiClient();  // a cold start creates the client late: read it after userViews
                const c = S.client, uid = c.getCurrentUserId();
                await D.loadViews();
                if (!S || S.root !== root) return;
                const entries = D.liveTabs ? D.liveTabs('guide') : D.navTabs();
                S.menu = entries.map((x, i) => {
                    const b = el('div', 'ac-menu-item ac-tab' + (x.current ? ' current' : ''), x.label);
                    b.setAttribute('data-icefin-focus', '');
                    b.tabIndex = -1;
                    b.addEventListener('click', () => { if (!x.current) x.go(); else if (S.guide) { S.zone = 'guide'; S.guide.refocus(); } });
                    if (x.current) S.menuIndex = i;
                    menu.append(b);
                    return b;
                });

                const res = await Promise.resolve(c.getLiveTvChannels({ UserId: uid, EnableImages: true, ImageTypeLimit: 1, Limit: 1000, EnableUserData: false })).catch(() => null);
                if (!S || S.root !== root) return;
                const chans = ((res && res.Items) || []).sort((a, b) => (parseFloat(a.ChannelNumber) || 1e9) - (parseFloat(b.ChannelNumber) || 1e9) || String(a.Name).localeCompare(b.Name));
                S.ready = true;
                root.setAttribute('data-ac-ready', String(chans.length));
                if (!chans.length) {
                    S.guideEl.append(el('div', 'ac-empty', 'This server has no Live TV channels.'));
                    focusMenu();
                    return;
                }
                S.channels = chans.map((ch) => ({ id: ch.Id, name: ch.Name, ch }));
                S.guide = ui.guideGrid(S.guideEl, {
                    channels: S.channels,
                    rows: ROWS,
                    span: SPAN,
                    async fetch(ids, a, b) {
                        const r = await c.getLiveTvPrograms({ UserId: uid, ChannelIds: ids.join(','), MinEndDate: iso(a), MaxStartDate: iso(b), Fields: 'Overview',
                            EnableImages: false, EnableUserData: false, SortBy: 'StartDate', EnableTotalRecordCount: false, Limit: 2000 });
                        return ((r && r.Items) || []).map((p) => ({ id: p.Id, channelId: p.ChannelId, start: Date.parse(p.StartDate), end: Date.parse(p.EndDate), title: p.Name, overview: p.Overview || '', item: p }));
                    },
                    renderChannel(ch, cell) { cell.append(el('span', 'ac-chno', ch.ch.ChannelNumber || ''), el('span', 'ac-chname', ch.name)); },
                    renderProgram(p, cell) { cell.textContent = p.title; if (p.item && p.item.TimerId) cell.append(el('span', 'ac-rec', ' ●')); },
                    emptyLabel: 'No information',
                    onFocus(p, ch) { info(p, ch.ch); S.at = { p, ch }; if (!(D.panel && D.panel.isOpen())) D.hints(HINTS); D.screenHints = () => D.hints(HINTS); },
                    onSelect(p, ch) {
                        if (p.start <= Date.now() && p.end > Date.now() && T.ctx.canPlay()) { stopPreview(); T.ctx.play({ ids: [ch.id], serverId: c.serverId() }); }
                        else if (D.liveOptions && p.item) D.liveOptions(p.item);
                        else location.hash = `#/details?id=${p.id}&serverId=${c.serverId()}`;
                    }
                });
            },
            unmount() {
                D.screenHints = null;
                D.hintsOff();
                clearTimeout(previewTimer);
                stopPreview();
                if (S) { clearInterval(S.clockTimer); if (S.guide) S.guide.stop(); }
                S = null;
            }
        };
    }
    D.guideScreen = screen;
})();

