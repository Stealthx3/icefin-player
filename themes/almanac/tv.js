// Almanac: Live TV (PLAN 9.49; the canvas's Guide, Programme and Notices boards). Live TV's rows: Channels, Guide,
// Recordings, Schedule and Series timers. The guide keeps the channels at the fixed point's column and runs the
// programmes right along time with a glowing now line (the engine's ui.guideGrid in Tide's look). ≡ (or OK) on a
// programme opens its options in the panel: Watch, Record, Record the series, and the steppers for starting early,
// stopping late and keeping. A channel with no logo shows its number and name.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinAlmanac;
    if (!T || !D || !D.columns) return;
    const ui = T.ui;
    const I = ui.items;
    const el = D.el;
    const c = () => D.client();
    const uid = () => D.uid();
    D.liveScreen = true;
    const iso = (t) => new Date(t).toISOString();
    const hm = (t) => D.time(new Date(t));
    const items = (r) => (r && r.Items) || [];
    const fail = (e) => { console.error('almanac: live tv', e); D.notice('That didn’t work', true); };

    const watch = (ch) => T.ctx.play({ ids: [ch.Id || ch.ChannelId], serverId: D.sid() });
    const chanEntry = (ch) => {
        const p = ch.CurrentProgram;
        const s = p ? Date.parse(p.StartDate) : 0, e = p ? Date.parse(p.EndDate) : 0;
        const tag = ch.ImageTags && ch.ImageTags.Primary;
        return {
            name: `${ch.ChannelNumber ? `${ch.ChannelNumber} · ` : ''}${ch.Name}`, sub: p ? `${p.Name} · ${hm(s)}–${hm(e)}` : 'no information',
            shape: 'wide', art: tag ? D.image(ch.Id, 'Primary', tag, 300) : '', initials: tag ? null : null, icon: 'channel',
            chanLabel: tag ? null : (ch.ChannelNumber || ch.Name), progress: p ? Math.max(0, Math.min(1, (Date.now() - s) / ((e - s) || 1))) : 0,
            item: ch, okLabel: 'watch', go: () => watch(ch), menu: () => (p ? programmeOptions(p.Id, ch) : watch(ch))
        };
    };
    const channelsLevel = () => ({
        title: 'Channels', icon: 'channel',
        async load() {
            const r = await Promise.resolve(c().getLiveTvChannels({ UserId: uid(), AddCurrentProgram: true, EnableImages: true, ImageTypeLimit: 1, EnableUserData: false, Limit: 1000 }));
            return items(r).sort((a, b) => (parseFloat(a.ChannelNumber) || 1e9) - (parseFloat(b.ChannelNumber) || 1e9)).map(chanEntry);
        },
        empty: { icon: 'livetv', title: 'No channels', text: 'This server has no Live TV channels.' }
    });
    const recordingsLevel = () => ({
        title: 'Recordings', icon: 'record',
        async load() { const r = await Promise.resolve(c().getLiveTvRecordings({ UserId: uid(), Fields: D.FIELDS, EnableImages: true })); return items(r).map((it) => D.entry(it)); },
        empty: { icon: 'record', title: 'No recordings yet', text: 'Record a programme from the guide; it shows here.', way: { label: 'Open the guide', go: () => T.ctx.navigate('#/livetv') } }
    });
    const scheduleLevel = () => ({
        title: 'Schedule', icon: 'schedule',
        async load() {
            const r = await Promise.resolve(c().getLiveTvTimers({}));
            return items(r).map((t) => ({
                name: t.Name, sub: [t.ChannelName, t.StartDate ? `${new Date(t.StartDate).toLocaleDateString([], { weekday: 'short' })} ${hm(t.StartDate)}` : ''].filter(Boolean).join(' · '),
                icon: 'record', shape: 'icon', go: () => t.ProgramId && programmeOptions(t.ProgramId),
                menu: () => D.panel.ask({ title: `Cancel ${t.Name}?`, path: 'Schedule', choices: [{ label: 'Keep it', safe: true }, { label: 'Cancel the recording', danger: true, run: async () => { try { await I.cancelRecording(t.Id); D.notice('Recording cancelled'); if (D.currentColumn) D.currentColumn.reload(); } catch (e) { fail(e); } } }] })
            }));
        },
        empty: { icon: 'schedule', title: 'Nothing scheduled', text: 'Programmes and series you choose to record are listed here.', way: { label: 'Open the guide', go: () => T.ctx.navigate('#/livetv') } }
    });
    const seriesLevel = () => ({
        title: 'Series timers', icon: 'timer',
        async load() {
            const r = await Promise.resolve(c().getLiveTvSeriesTimers({ SortBy: 'SortName' }));
            return items(r).map((t) => ({
                name: t.Name, sub: [t.ChannelName, t.RecordAnyChannel ? 'any channel' : '', t.RecordNewOnly ? 'new only' : ''].filter(Boolean).join(' · '), icon: 'timer', shape: 'icon',
                menu: () => D.panel.ask({ title: `Stop recording ${t.Name}?`, path: 'Series timers', choices: [{ label: 'Keep it', safe: true }, { label: 'Stop the series', danger: true, run: async () => {
                    try { await c().cancelLiveTvSeriesTimer(t.Id); D.notice('Series timer removed'); if (D.currentColumn) D.currentColumn.reload(); } catch (e) { fail(e); }
                } }] }),
                go: () => {}
            }));
        },
        empty: { icon: 'timer', title: 'No series timers' }
    });
    D.liveEntries = () => [
        { name: 'Channels', icon: 'channel', shape: 'icon', open: channelsLevel },
        { name: 'Guide', sub: 'what’s on, along time', icon: 'guide', shape: 'icon', row: 'Live TV', okLabel: 'open', go: () => T.ctx.navigate('#/livetv') },
        { name: 'Recordings', icon: 'record', shape: 'icon', open: recordingsLevel },
        { name: 'Schedule', icon: 'schedule', shape: 'icon', open: scheduleLevel },
        { name: 'Series timers', icon: 'timer', shape: 'icon', open: seriesLevel }
    ];

    // ---- a programme's options (Notices board) ----
    async function programmeOptions(id, ch) {
        let p;
        try { p = await I.programme(id); } catch (e) { fail(e); return; }
        const pre = [[0, 'on time'], [60, '1 min'], [120, '2 min'], [300, '5 min'], [600, '10 min'], [900, '15 min']];
        const keep = [[0, 'all'], [1, 'the newest'], [3, '3'], [5, '5'], [10, '10']];
        const o = { pre: 0, post: 0, keep: 0 };
        try { const d = await I.recordDefaults(id); o.pre = d.PrePaddingSeconds || 0; o.post = d.PostPaddingSeconds || 0; } catch (e) { /* the server's defaults */ }
        const s = Date.parse(p.StartDate), e = Date.parse(p.EndDate), now = Date.now();
        D.panel.show({
            title: p.Name, path: `${hm(s)}–${hm(e)} · ${p.ChannelName || (ch && ch.Name) || ''}`,
            render(body) {
                if (p.EpisodeTitle || p.Overview) body.append(D.note([p.EpisodeTitle, p.Overview].filter(Boolean).join(' — ')));
                if (s <= now && now < e) body.append(D.row('Watch', { icon: 'play', go: () => { D.panel.close(); watch({ Id: p.ChannelId }); } }));
                if (p.TimerId) body.append(D.row('Cancel the recording', { icon: 'record', danger: true, go: async () => { try { await I.cancelRecording(p.TimerId); D.panel.close(); D.notice('Recording cancelled'); } catch (er) { fail(er); } } }));
                else body.append(D.row('Record', { icon: 'record', go: async () => { try { await I.record(p, false, o); D.panel.close(); D.notice(`Recording ${p.Name}`); } catch (er) { fail(er); } } }));
                if (p.IsSeries && !p.SeriesTimerId) body.append(D.row('Record the series', { icon: 'timer', go: async () => { try { await I.record(p, true, o); D.panel.close(); D.notice(`Recording every ${p.Name}`); } catch (er) { fail(er); } } }));
                body.append(D.sec('Recording'),
                    D.stepper('Start early', pre, o.pre, (v) => { o.pre = v; }),
                    D.stepper('Stop late', pre, o.post, (v) => { o.post = v; }),
                    D.stepper('Keep', keep, o.keep, (v) => { o.keep = v; }));
            }
        });
    }
    D.liveOptions = (it) => (it.Type === 'Program' ? programmeOptions(it.Id) : (it.CurrentProgram ? programmeOptions(it.CurrentProgram.Id, it) : watch(it)));

    // a channel's own details (the walk's details-channel): its programmes as a column, Watch first
    D.programmeScreen = (root, it) => {
        const chId = it.Type === 'TvChannel' ? it.Id : it.ChannelId;
        const C = D.columns(root, { name: 'channel', key: `#/details?id=${it.Id}`, selfInTrail: true, root: {
            title: it.Type === 'TvChannel' ? it.Name : (it.ChannelName || 'Channel'), icon: 'channel',
            async load() {
                const r = await Promise.resolve(c().getLiveTvPrograms({ UserId: uid(), ChannelIds: chId, MinEndDate: iso(Date.now()), MaxStartDate: iso(Date.now() + 864e5), SortBy: 'StartDate', Limit: 60, EnableImages: true }));
                const out = [{ name: 'Watch now', icon: 'play', shape: 'icon', okLabel: 'watch', focusFirst: true, go: () => watch({ Id: chId }) }];
                for (const p of items(r)) out.push({ name: p.Name, sub: `${hm(p.StartDate)}–${hm(p.EndDate)}${p.TimerId ? ' · ● recording' : ''}`, icon: 'livetv', shape: 'icon', okLabel: 'options', go: () => programmeOptions(p.Id), item: p, menu: () => programmeOptions(p.Id) });
                return out;
            }
        } });
        root.setAttribute('data-icefin-details-ready', '1');
        root.alStop = () => C.stop();
        D.detailsColumn = C;
    };

    // ---- #/livetv: the guide (guide.js), or Live TV's rows (?al=rows): Channels, Recordings, Schedule, Series ----
    let G = null;
    D.register('#/livetv', {
        async mount(root, ctx) {
            if (D.params().get('al') === 'rows') {
                const C = D.columns(root, { name: 'livetv', key: '#/livetv?al=rows', root: { title: 'Live TV', headTitle: 'Live TV', count: false, load: async () => D.liveEntries() } });
                G = { C };
                return;
            }
            const g = D.guideScreen();
            G = { g };
            return g.mount(root, ctx);
        },
        unmount() { if (G) { if (G.C) G.C.stop(); if (G.g) G.g.unmount(); } G = null; D.hintsOff(); },
        onAction(a, ctx) {
            if (G && G.C) return G.C.onAction(a);
            if (G && G.g) return G.g.onAction(a, ctx);
            return false;
        },
        onBack() { return G && G.C ? G.C.onAction('back') : false; }
    });
})();
