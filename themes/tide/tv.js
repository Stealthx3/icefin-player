// Tide: Live TV (PLAN 9.48; the canvas's Guide, Notices and PlayerExtras boards). Live TV's column: Channels, Guide,
// Recordings, Schedule and Series timers. The guide keeps the channels at the fixed point's column and runs the
// programmes right along time with a glowing now line (the engine's ui.guideGrid in Tide's look). ≡ (or OK) on a
// programme opens its options in the panel: Watch, Record, Record the series, and the steppers for starting early,
// stopping late and keeping. A channel with no logo shows its number and name.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinTide;
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
    const fail = (e) => { console.error('tide: live tv', e); D.notice('That didn’t work', true); };

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
        empty: { icon: 'record', title: 'No recordings yet', text: 'Record a programme from the guide; it shows here.', way: { label: 'Open the guide', go: () => T.ctx.navigate('#/livetv?td=guide') } }
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
        empty: { icon: 'schedule', title: 'Nothing scheduled', text: 'Programmes and series you choose to record are listed here.', way: { label: 'Open the guide', go: () => T.ctx.navigate('#/livetv?td=guide') } }
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
        { name: 'Guide', sub: 'what’s on, along time', icon: 'guide', shape: 'icon', go: () => T.ctx.navigate('#/livetv?td=guide') },
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
        root.tdStop = () => C.stop();
        D.detailsColumn = C;
    };

    // ---- #/livetv: Live TV's column, or the guide (?tab=guide) ----
    let G = null;
    D.register('#/livetv', {
        async mount(root) {
            const tab = D.params().get('td');
            if (tab !== 'guide') {
                const C = D.columns(root, { name: 'livetv', key: '#/livetv', selfInTrail: true, root: { title: 'Live TV', icon: 'livetv', count: false, load: async () => D.liveEntries() } });
                G = { C };
                return;
            }
            root.setAttribute('data-td-screen', 'guide');
            const me = G = { root };
            const wave = D.ground(root);
            const clock = D.clock(root);
            D.pointerNav(root);
            const tabs = el('div', 'td-guide-tabs');
            for (const [label, go] of [['Channels', '#/livetv'], ['Guide', null], ['Recordings', '#/livetv'], ['Schedule', '#/livetv']]) {
                const b = el('span', 'td-guide-tab' + (go ? '' : ' on'), label);
                tabs.append(b);
            }
            const box = el('div', 'td-guide');
            root.append(tabs, box);
            me.stop = () => { wave.stop(); clock.stop(); if (me.guide) me.guide.stop(); };
            let chans = [];
            try { chans = items(await Promise.resolve(c().getLiveTvChannels({ UserId: uid(), EnableImages: true, ImageTypeLimit: 1, Limit: 1000, EnableUserData: false }))); } catch (e) { chans = []; }
            if (G !== me) return;
            chans.sort((a, b) => (parseFloat(a.ChannelNumber) || 1e9) - (parseFloat(b.ChannelNumber) || 1e9) || String(a.Name).localeCompare(b.Name));
            root.setAttribute('data-td-guide', String(chans.length));
            if (!chans.length) { box.append(el('div', 'td-empty-title', 'This server has no Live TV channels')); return; }
            me.guide = ui.guideGrid(box, {
                channels: chans.map((ch) => ({ id: ch.Id, name: ch.Name, ch })),
                rows: 7, span: 120, focus: true,
                async fetch(ids, a, b) {
                    const res = await Promise.resolve(c().getLiveTvPrograms({ UserId: uid(), ChannelIds: ids.join(','), MinEndDate: iso(a), MaxStartDate: iso(b), EnableImages: false, EnableUserData: false, SortBy: 'StartDate', EnableTotalRecordCount: false, Limit: 2000 }));
                    return items(res).map((p) => ({ id: p.Id, channelId: p.ChannelId, start: Date.parse(p.StartDate), end: Date.parse(p.EndDate), title: p.Name, item: p }));
                },
                renderChannel(ch, cell) {
                    const tag = ch.ch.ImageTags && ch.ch.ImageTags.Primary;
                    cell.append(el('span', 'td-gch-no', ch.ch.ChannelNumber || ''));
                    if (tag) { const logo = el('span', 'td-gch-logo'); logo.style.backgroundImage = `url("${D.image(ch.id, 'Primary', tag, 120)}")`; cell.append(logo); }
                    else cell.append(el('span', 'td-gch-logo td-gch-text', (ch.ch.ChannelNumber || ch.name || '').slice(0, 5)));
                    cell.append(el('span', 'td-gch-name', ch.name));
                },
                renderProgram(p, cell) {
                    cell.append(el('div', 'td-gp-title', p.title || ''));
                    if (!p.gap) cell.append(el('div', 'td-gp-time', `${hm(p.start)}–${hm(p.end)}${p.item && p.item.TimerId ? ' · ● recording' : ''}`));
                },
                emptyLabel: 'No information',
                onFocus() { D.hints([['OK', 'watch or record'], ['≡', 'options'], ['▲ ▼', 'channels'], ['◀ ▶', 'time'], ['Back', '']]); },
                onSelect(p, ch) { if (p.gap || !p.id || p.start > Date.now()) { if (p.id && !p.gap) programmeOptions(p.id, ch.ch); else watch(ch.ch); return; } programmeOptions(p.id, ch.ch); }
            });
            D.hints([['OK', 'watch or record'], ['≡', 'options'], ['▲ ▼', 'channels'], ['◀ ▶', 'time'], ['Back', '']]);
        },
        unmount() { if (G) { if (G.C) G.C.stop(); if (G.stop) G.stop(); } G = null; D.hintsOff(); },
        onAction(a) {
            if (G && G.C) return G.C.onAction(a);
            if (a === 'menu' && G && G.guide) {
                const f = G.guide.focused && G.guide.focused();
                if (f && f.p && f.p.id && !f.p.gap) { programmeOptions(f.p.id, f.ch && f.ch.ch); return true; }
            }
            if (a === 'back') { T.ctx.sound('back'); T.ctx.navigate('#/livetv'); return true; }
            return false;
        },
        onBack() { return G && G.C ? G.C.onAction('back') : false; }
    });
})();
