// Media Center: program info (PLAN 9.60; the canvas's "a programme" board, 9.46, approved). The details of a Live TV
// programme, or of a channel (what is on it now), which the engine's details screen leaves to jellyfin-web: Watch now
// (a programme on now, or the channel), Record, Record series (Cancel when set), Other showings, Back to guide at the
// left; the picture (LIVE while it is on), the title, the channel and time, its tags, how far through it is, the
// description, and the other showings below. Recording goes through the engine's ui.items (9.60).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    if (!T || !T.ui || !M) return;
    const el = M.el;
    const I = T.ui.items;
    const when = (d) => new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

    // root: the details screen's root; item: a TvChannel or a Program. Returns a stop() for the clock.
    M.programInfo = async (root, item) => {
        const c = M.client(), uid = c.getCurrentUserId(), now = Date.now();
        root.setAttribute('data-mc', 'programme');
        const f = el('div', 'mc-field');
        f.append(el('div', 'mc-ribbon one'), el('div', 'mc-ribbon two'));
        root.append(f);
        const chrome = M.chrome(root, 'program info');
        const channelId = item.Type === 'TvChannel' ? item.Id : item.ChannelId;
        let channel = item.Type === 'TvChannel' ? item : null;
        let prog = item.Type === 'Program' ? item : null;
        let upcoming = [];
        try {
            if (!channel && channelId) channel = await c.getItem(uid, channelId);
            const r = await c.getLiveTvPrograms({ UserId: uid, ChannelIds: channelId, MinEndDate: new Date(now).toISOString(), SortBy: 'StartDate', Limit: 12, Fields: 'Overview' });
            upcoming = r.Items || [];
            if (!prog) prog = upcoming[0] || null;
        } catch (e) { /* what we have */ }
        if (prog && I && I.programme) { try { prog = await I.programme(prog.Id); } catch (e) { /* the list's copy */ } }
        if (!root.isConnected) return chrome.stop;
        const on = !!prog && Date.parse(prog.StartDate) <= now && Date.parse(prog.EndDate) > now;
        const side = el('div', 'mc-you-side mc-pi-side');
        const watch = () => { T.ctx.sound('select'); T.ctx.play({ ids: [channelId], serverId: M.sid() }); };
        const record = async (series) => {
            try { const r = await I.record(prog, series); M.notice(r.message); M.details(prog.Id); } catch (e) { M.notice('That didn’t work', true); }
        };
        const cancel = async () => {
            try { await I.cancelRecording(prog.TimerId); M.notice('Recording cancelled'); M.details(prog.Id); } catch (e) { M.notice('That didn’t work', true); }
        };
        if (channelId && (on || !prog)) side.append(M.button('Watch now', watch, true));
        if (prog && I) {
            if (prog.TimerId) side.append(M.button('Don’t record', cancel));
            else if (Date.parse(prog.EndDate) > now) side.append(M.button('Record', () => record(false)));
            if (prog.IsSeries && !prog.SeriesTimerId && Date.parse(prog.EndDate) > now) side.append(M.button('Record series', () => record(true)));
        }
        const others = el('div', 'mc-pi-others');
        side.append(M.button('Other showings', () => { const r = others.querySelector('[data-icefin-focus]'); if (r) T.ctx.focus(r); else T.ctx.sound('error'); }), M.button('Back to guide', () => T.ctx.navigate('#/livetv')));
        root.append(side);
        const pic = el('div', 'mc-pi-pic');
        const tag = prog && ((prog.ImageTags || {}).Primary || (prog.ImageTags || {}).Thumb);
        const art = tag ? c.getScaledImageUrl(prog.Id, { type: (prog.ImageTags || {}).Thumb ? 'Thumb' : 'Primary', maxWidth: 640, tag })
            : channel && (channel.ImageTags || {}).Primary ? c.getScaledImageUrl(channel.Id, { type: 'Primary', maxWidth: 480, tag: channel.ImageTags.Primary }) : '';
        if (art) pic.style.backgroundImage = `url("${art}")`;
        else pic.append(el('span', 'mc-pi-fallback', [channel && channel.ChannelNumber, channel && channel.Name].filter(Boolean).join('  ')));
        if (on) pic.append(el('span', 'mc-pi-live', 'LIVE'));
        root.append(pic);
        const head = el('div', 'mc-pi-head');
        head.append(el('div', 'mc-pi-title', prog ? prog.Name : (channel ? channel.Name : '')));
        if (prog) {
            const time = `${M.time(new Date(prog.StartDate))} – ${M.time(new Date(prog.EndDate))}`;
            head.append(el('div', 'mc-pi-when', [channel && [channel.ChannelNumber, channel.Name].filter(Boolean).join(' '), time].filter(Boolean).join(' · ')));
            const tags = el('div', 'mc-pi-tags');
            for (const t of [prog.IsPremiere && 'NEW', prog.IsHD && 'HD', prog.IsLive && 'LIVE', prog.IsRepeat && 'REPEAT'].filter(Boolean)) tags.append(el('span', 'mc-pi-tag', t));
            const more = [(prog.Genres || []).slice(0, 2).join(', '), prog.OfficialRating].filter(Boolean).join(' · ');
            if (more) tags.append(el('span', '', more));
            if (prog.TimerId || prog.SeriesTimerId) tags.append(el('span', 'mc-pi-tag mc-pi-rec', prog.SeriesTimerId ? 'SERIES RECORDING' : 'RECORDING'));
            head.append(tags);
            if (on) {
                const s = Date.parse(prog.StartDate), e = Date.parse(prog.EndDate);
                const bar = el('div', 'mc-pi-bar'), fill = el('div');
                fill.style.width = `${Math.round(((now - s) / (e - s)) * 100)}%`;
                bar.append(fill);
                head.append(bar, el('div', 'mc-pi-left', `started ${M.time(new Date(s))} · ${Math.max(1, Math.round((e - now) / 60000))} min left`));
            }
        } else head.append(el('div', 'mc-pi-when', 'Nothing in the guide for this channel right now.'));
        root.append(head);
        const text = el('div', 'mc-pi-text', prog ? [prog.IndexNumber != null && prog.ParentIndexNumber != null ? `S${prog.ParentIndexNumber} E${prog.IndexNumber}` : '', prog.EpisodeTitle, prog.Overview].filter(Boolean).join(' · ') : '');
        root.append(text);
        others.append(M.sec('other showings'));
        const rest = upcoming.filter((p) => !prog || p.Id !== prog.Id).slice(0, 5);
        if (!rest.length) others.append(el('div', 'mc-note', 'No other showings in the guide.'));
        for (const p of rest) others.append(M.row(p.Name, { sub: when(p.StartDate), go: () => M.details(p.Id) }));
        root.append(others);
        T.ctx.focus(side.querySelector('[data-icefin-focus]'));
        root.setAttribute('data-mc-ready', '1');
        return chrome.stop;
    };
})();
