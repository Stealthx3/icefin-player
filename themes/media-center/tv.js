// Media Center: Live TV (PLAN 9.46), from the design canvas's "the guide", "recorded TV", "scheduled and series
// recordings" and "a programme" boards: the page chrome, a pivot (guide, channels, recorded tv, scheduled, series),
// the guide on the engine's ui.guideGrid with the focused programme's details and the channel's picture under it.
// Tuning a channel goes through the engine's connecting dialog (liveConnect.js); a programme opens its details.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    if (!T || !M || !T.ui.guideGrid) return;
    const { el, focusable } = M;
    const iso = (ms) => new Date(ms).toISOString();
    const hm = (ms) => M.time(new Date(ms));
    const day = (ms) => new Date(ms).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }).toLowerCase();

    let S = null;

    function programmeInfo(p, ch) {
        S.infoTitle.textContent = p.gap ? ch.Name : p.title;
        const now = p.start <= Date.now() && p.end > Date.now();
        S.infoWhen.textContent = p.gap ? '' : [ch.ChannelNumber ? `${ch.ChannelNumber} ${ch.Name}` : ch.Name, `${hm(p.start)} – ${hm(p.end)}`, now ? 'on now' : day(p.start)].join(' · ');
        S.infoText.textContent = p.overview || '';
        const tag = ch.ImageTags && ch.ImageTags.Primary;
        S.inset.style.backgroundImage = tag ? `url("${M.client().getScaledImageUrl(ch.Id, { type: 'Primary', maxWidth: 480, tag })}")` : 'none';
    }

    async function guide(box) {
        const c = M.client(), uid = c.getCurrentUserId();
        const res = await Promise.resolve(c.getLiveTvChannels({ UserId: uid, EnableImages: true, ImageTypeLimit: 1, Limit: 1000, EnableUserData: false })).catch(() => null);
        if (!S) return;
        const chans = ((res && res.Items) || []).sort((a, b) => (parseFloat(a.ChannelNumber) || 1e9) - (parseFloat(b.ChannelNumber) || 1e9) || String(a.Name).localeCompare(b.Name));
        S.channels = chans;
        if (!chans.length) { box.append(el('div', 'mc-lib-empty', 'This server has no Live TV channels.')); return; }
        const g = el('div', 'mc-tv-guide');
        const under = el('div', 'mc-tv-under');
        S.inset = el('div', 'mc-tv-inset');
        const inf = el('div', 'mc-tv-info');
        S.infoTitle = el('div', 'mc-tv-info-title');
        S.infoWhen = el('div', 'mc-tv-info-when');
        S.infoText = el('div', 'mc-tv-info-text');
        inf.append(S.infoTitle, S.infoWhen, S.infoText, el('div', 'mc-note', 'OK tunes a programme on now, or opens one later; the record buttons are on its details.'));
        under.append(S.inset, inf);
        box.append(g, under);
        S.guide = T.ui.guideGrid(g, {
            channels: chans.map((ch) => ({ id: ch.Id, name: ch.Name, ch })),
            rows: 7, span: 120,
            async fetch(ids, a, b) {
                const r = await c.getLiveTvPrograms({ UserId: uid, ChannelIds: ids.join(','), MinEndDate: iso(a), MaxStartDate: iso(b), Fields: 'Overview',
                    EnableImages: false, EnableUserData: false, SortBy: 'StartDate', EnableTotalRecordCount: false, Limit: 2000 });
                return ((r && r.Items) || []).map((p) => ({ id: p.Id, channelId: p.ChannelId, start: Date.parse(p.StartDate), end: Date.parse(p.EndDate), title: p.Name,
                    overview: p.Overview || '', recording: !!p.TimerId, series: !!p.SeriesTimerId, item: p }));
            },
            renderChannel(ch, cell) { cell.append(el('b', 'mc-tv-chno', ch.ch.ChannelNumber || ''), el('span', 'mc-tv-chname', ch.name)); },
            renderProgram(p, cell) {
                if (p.recording || p.series) cell.append(el('i', 'mc-tv-rec' + (p.series ? ' series' : '')));
                cell.append(document.createTextNode(p.title));
            },
            emptyLabel: 'No information',
            onFocus(p, ch) { programmeInfo(p, ch.ch); },
            onSelect(p, ch) {
                if (p.start <= Date.now() && p.end > Date.now() && T.ctx.canPlay()) T.ctx.play({ ids: [ch.id], serverId: c.serverId() });
                else if (!p.gap) M.details(p.id);
            }
        });
    }

    async function channels(box) {
        const c = M.client(), uid = c.getCurrentUserId();
        const res = await Promise.resolve(c.getLiveTvChannels({ UserId: uid, EnableImages: true, ImageTypeLimit: 1, Limit: 1000, AddCurrentProgram: true })).catch(() => null);
        if (!S) return;
        const grid = el('div', 'mc-tv-channels');
        for (const ch of (res && res.Items) || []) {
            const t = focusable(el('div', 'mc-tv-channel'));
            const logo = el('div', 'mc-tv-logo');
            const tag = ch.ImageTags && ch.ImageTags.Primary;
            if (tag) logo.style.backgroundImage = `url("${c.getScaledImageUrl(ch.Id, { type: 'Primary', maxWidth: 360, tag })}")`;
            else logo.textContent = ch.Name;
            t.append(logo, el('div', 'mc-tv-channel-name', `${ch.ChannelNumber || ''} ${ch.Name}`.trim()),
                el('div', 'mc-tv-channel-now', ch.CurrentProgram ? ch.CurrentProgram.Name : ''));
            t.addEventListener('click', () => { T.ctx.sound('select'); T.ctx.play({ ids: [ch.Id], serverId: c.serverId() }); });
            grid.append(t);
        }
        if (!grid.childElementCount) grid.append(el('div', 'mc-lib-empty', 'This server has no Live TV channels.'));
        box.append(grid);
    }

    async function recordings(box) {
        const c = M.client(), uid = c.getCurrentUserId();
        const res = await Promise.resolve(c.getLiveTvRecordings({ UserId: uid, Fields: 'PrimaryImageAspectRatio', EnableImages: true, ImageTypeLimit: 1, Limit: 300 })).catch(() => null);
        if (!S) return;
        const grid = el('div', 'mc-tv-recs');
        for (const r of (res && res.Items) || []) {
            const t = focusable(el('div', 'mc-tv-rec-tile'));
            const art = el('div', 'mc-tv-rec-art');
            const tag = r.ImageTags && (r.ImageTags.Thumb || r.ImageTags.Primary);
            if (tag) art.style.backgroundImage = `url("${c.getScaledImageUrl(r.Id, { type: r.ImageTags.Thumb ? 'Thumb' : 'Primary', maxHeight: 300, tag })}")`;
            if (r.UserData && !r.UserData.Played) art.append(el('i', 'mc-tv-new', 'NEW'));
            t.append(art, el('div', 'mc-tv-rec-name', r.Name), el('div', 'mc-tv-rec-when', [r.EpisodeTitle, r.StartDate ? day(Date.parse(r.StartDate)) : '', r.ChannelName].filter(Boolean).join(' · ')));
            t.addEventListener('click', () => { T.ctx.sound('select'); M.details(r.Id); });
            grid.append(t);
        }
        if (!grid.childElementCount) grid.append(el('div', 'mc-lib-empty', 'Nothing recorded yet. Record from the guide: open a programme, then Record.'));
        box.append(grid);
    }

    async function scheduled(box, series) {
        const c = M.client();
        const res = await Promise.resolve(series ? c.getLiveTvSeriesTimers({ SortBy: 'SortName' }) : c.getLiveTvTimers({ IsActive: false, IsScheduled: true })).catch(() => null);
        if (!S) return;
        const list = el('div', 'mc-tv-list');
        let last = '';
        for (const t of (res && res.Items) || []) {
            const start = Date.parse(t.StartDate || '') || 0;
            if (!series && start && day(start) !== last) { last = day(start); list.append(el('div', 'mc-sec', last)); }
            const r = focusable(el('div', 'mc-li'));
            r.append(el('span', 'mc-tv-time', series ? (t.RecordAnyChannel ? 'any channel' : (t.ChannelName || '')) : hm(start)),
                el('i', 'mc-tv-rec' + (series ? ' series' : '')), el('span', 'mc-li-label', t.Name || t.ProgramInfo && t.ProgramInfo.Name || ''),
                el('span', 'mc-li-value', series ? (t.RecordNewOnly ? 'new episodes' : 'all episodes') : [t.ChannelName, t.EndDate && start ? `${Math.round((Date.parse(t.EndDate) - start) / 60000)} min` : ''].filter(Boolean).join(' · ')));
            r.addEventListener('click', () => {
                T.ctx.sound('select');
                const host = document.getElementById('icefin-theme-root');
                M.band(host, {
                    title: series ? `Stop recording ${t.Name}?` : `Don't record ${t.Name}?`,
                    text: series ? 'Recordings already made are kept.' : `${hm(start)} on ${t.ChannelName || 'its channel'}.`,
                    choices: [{ label: series ? 'Stop the series' : "Don't record", run: async () => {
                        try { await (series ? c.cancelLiveTvSeriesTimer(t.Id) : c.cancelLiveTvTimer(t.Id)); } catch (e) { T.ctx.sound('error'); }
                        show(S.tab);
                    } }, { label: 'Keep it', safe: true }]
                });
            });
            list.append(r);
        }
        if (!list.childElementCount) list.append(el('div', 'mc-lib-empty', series ? 'No series are set to record.' : 'Nothing is scheduled to record.'));
        box.append(list);
    }

    const TABS = [['guide', guide], ['channels', channels], ['recorded tv', recordings], ['scheduled', (b) => scheduled(b, false)], ['series', (b) => scheduled(b, true)]];
    async function show(k) {
        if (!S) return;
        if (S.guide) { S.guide.stop(); S.guide = null; }
        S.tab = k;
        S.pivot.querySelectorAll('.mc-pivot-item').forEach((x, i) => x.classList.toggle('on', i === k));
        S.body.textContent = '';
        S.body.dataset.tab = TABS[k][0];
        await TABS[k][1](S.body);
        if (!S) return;
        if (S.guide) S.guide.refocus();
        else { const f = S.body.querySelector('[data-icefin-focus]'); if (f) T.ctx.focus(f); }
        S.root.setAttribute('data-mc-ready', TABS[k][0]);
    }

    window.icefinMediaCenter.register('#/livetv', {
        onAction(action, ctx) {
            if (!S) return false;
            if (M.band.open) {
                if (['up', 'down', 'left', 'right'].includes(action)) { ctx.move(action, M.band.open.el); return true; }
                return false;
            }
            const f = ctx.focused();
            // Out of the top of the guide (ui.guideGrid hands over the moves it can't make): to the pivot.
            if (S.guide && f && S.body.contains(f)) {
                if (action === 'up') { ctx.focus(S.pivot.querySelectorAll('.mc-pivot-item')[S.tab]); ctx.sound('focus'); return true; }
                return action === 'left' || action === 'right' || action === 'down';
            }
            if (action === 'down' && f && S.pivot.contains(f) && S.guide) { S.guide.refocus(); return true; }
            return false;
        },
        onBack() { if (M.band.open) { M.band.open.close(); return true; } return false; },
        async mount(root) {
            root.setAttribute('data-mc', 'livetv');
            const field = el('div', 'mc-field');
            field.append(el('div', 'mc-ribbon one'), el('div', 'mc-ribbon two'));
            root.append(field);
            const chrome = M.chrome(root, 'live tv');
            const pivot = el('div', 'mc-pivot mc-lib-pivot');
            const body = el('div', 'mc-tv-body');
            root.append(pivot, body);
            S = { root, pivot, body, chrome, tab: 0, guide: null };
            TABS.forEach(([label], k) => {
                const p = focusable(el('button', 'mc-pivot-item', label));
                p.type = 'button';
                p.addEventListener('click', () => { T.ctx.sound('select'); show(k); });
                pivot.append(p);
            });
            const tab = +(new URLSearchParams(location.hash.split('?')[1] || '').get('tab') || 0);
            const map = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };  // jellyfin-web's tabs: programmes, guide, channels, recordings, schedule, series
            await show(map[tab] != null ? map[tab] : 0);
        },
        unmount() {
            if (S) { if (S.guide) S.guide.stop(); S.chrome.stop(); }
            S = null;
        }
    });
})();
