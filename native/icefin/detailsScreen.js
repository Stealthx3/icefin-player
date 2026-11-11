// Icefin theme engine: the details screen capability (PLAN 9.18). Appended after capabilities.js.
//
//   T.registerScreen('#/details', T.ui.details.screen({ layout: 'hero' | 'poster' | 'banner' | 'panel' }))
//
// One details screen for every theme, with the features of jellyfin-web's own page, so no theme can drop one:
//   - Back and Home at the top (for a pointer or touch as well as the remote's Back key);
//   - Play, Resume, Play from the start, Trailer, Shuffle, Instant mix, Favourite, Played, and More options (jellyfin-web's
//     page, for editing, deleting, playlists and the like);
//   - Version, Audio and Subtitles pickers for what plays (the choice goes to play());
//   - the media in brief (resolution, HDR, audio format), chapters (play from one), cast and crew, More like this;
//   - series: Next up, Seasons and the Episodes of the focused season; a season: its Episodes; an album: its Tracks; an
//     artist: Albums; a collection, playlist or folder: its Items; a person: Filmography.
// Themes choose a layout and style the markup with their own CSS (class names below, all icefin-d-*); the layouts
// here are structural only and take every colour from tokens. Types it doesn't cover (Live TV programs, books,
// photos) keep jellyfin-web's page.
//
// Markup: .icefin-details[data-layout][data-type] > .icefin-d-art, .icefin-d-shade,
//   .icefin-d-nav > .icefin-d-btn.icefin-d-navbtn[data-action=back|home], .icefin-d-scroll >
//   .icefin-d-main > (.icefin-d-poster, .icefin-d-info > .icefin-d-logo, .icefin-d-kicker, .icefin-d-title,
//   .icefin-d-facts, .icefin-d-genres, .icefin-d-tagline, .icefin-d-overview, .icefin-d-media, .icefin-d-actions >
//   .icefin-d-btn[data-action], .icefin-d-options > .icefin-d-select[data-option]), .icefin-d-sections >
//   .icefin-d-section[data-section] > h2, .icefin-d-row > .icefin-d-card | .icefin-d-track. Picker: .icefin-d-picker.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (!T || !T._engine || !T.ui || T.ui.details) return;
    const FOCUS = '[data-icefin-focus]';
    const TICKS_PER_MIN = 600000000;
    const PLAYABLE = new Set(['Movie', 'Episode', 'Video', 'MusicVideo', 'Trailer', 'Audio']);
    const CONTAINER = new Set(['Series', 'Season', 'MusicAlbum', 'MusicArtist', 'BoxSet', 'Playlist', 'Folder', 'CollectionFolder', 'Person']);
    const pm = () => window.icefinPlaybackManager;

    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const focusable = (e) => { e.setAttribute('data-icefin-focus', ''); e.tabIndex = -1; return e; };
    const minutes = (ticks) => {
        const m = Math.round(ticks / TICKS_PER_MIN);
        if (m < 1) return 'under 1 min';
        return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
    };
    const clock = (ticks) => {
        const s = Math.floor(ticks / 10000000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(sec).padStart(2, '0');
    };

    // Structural layouts, colours from tokens only (theme-lint). Themes restyle anything with their own CSS.
    const BASE = `
.icefin-details { position: absolute; inset: 0; color: var(--icefin-color-text); overflow: hidden; font-size: 2.4vh; }
.icefin-d-art { position: absolute; inset: 0; background: center / cover no-repeat; }
.icefin-d-shade { position: absolute; inset: 0; background: linear-gradient(90deg, var(--icefin-color-background) 0%, rgb(var(--icefin-color-background-channel) / 0.85) 40%, rgb(var(--icefin-color-background-channel) / 0.25) 100%),
  linear-gradient(0deg, var(--icefin-color-background) 0%, transparent 45%); }
.icefin-d-nav { position: absolute; z-index: 3; left: 3vw; top: 3vh; display: flex; gap: 0.6em; }
.icefin-d-navbtn { font-size: 0.9em; padding: 0.45em 1.1em; }
.icefin-d-scroll { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; scroll-behavior: smooth; }
.icefin-d-scroll::-webkit-scrollbar { display: none; }
.icefin-d-main { display: grid; grid-template-columns: auto 1fr; gap: 3vw; padding: 14vh 6vw 4vh; align-items: start; }
.icefin-d-poster { width: 17vw; aspect-ratio: 2 / 3; border-radius: var(--icefin-shape-cardRadius, 0.3em); background: var(--icefin-color-surface) center / cover no-repeat; }
.icefin-details[data-shape="square"] .icefin-d-poster { aspect-ratio: 1; }
.icefin-details[data-shape="wide"] .icefin-d-poster { aspect-ratio: 16 / 9; width: 28vw; }
.icefin-d-info { max-width: 60vw; }
.icefin-d-logo { max-width: 28vw; max-height: 14vh; display: none; }
.icefin-d-logo[src] { display: block; margin-bottom: 1.5vh; }
.icefin-d-kicker { opacity: 0.8; font-size: 1.2em; }
.icefin-d-title { font-size: 2.8em; font-weight: 400; margin: 0.15em 0 0.3em; line-height: 1.1; }
.icefin-d-facts, .icefin-d-genres, .icefin-d-media { color: var(--icefin-color-textSecondary); margin-bottom: 0.45em; }
.icefin-d-facts span + span::before, .icefin-d-media span + span::before { content: "  ·  "; white-space: pre; }
.icefin-d-tagline { font-style: italic; margin: 0.6em 0 0.3em; }
.icefin-d-overview { line-height: 1.5; max-width: 46em; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
.icefin-d-actions, .icefin-d-options { display: flex; flex-wrap: wrap; gap: 0.9em; margin-top: 1.4em; }
.icefin-d-btn, .icefin-d-select { padding: 0.6em 1.4em; border-radius: 2em; background: var(--icefin-color-surfaceRaised, var(--icefin-color-surface)); outline: none; cursor: pointer;
  transition: transform 150ms, background 150ms, color 150ms; white-space: nowrap; }
.icefin-d-select { border-radius: 0.4em; font-size: 0.9em; }
.icefin-d-select b { font-weight: 600; margin-left: 0.4em; }
.icefin-d-btn.icefin-focused, .icefin-d-select.icefin-focused, .icefin-d-track.icefin-focused { background: var(--icefin-color-focus); color: var(--icefin-color-onFocus); }
.icefin-d-btn[aria-pressed="true"]::after { content: " ✓"; }
.icefin-d-sections { padding: 0 6vw 10vh; }
.icefin-d-section { margin-top: 4vh; }
.icefin-d-section h2 { font-size: 1.4em; font-weight: 500; margin: 0 0 1.2vh; }
.icefin-d-row { display: flex; gap: 1.2vw; overflow-x: auto; overflow-y: visible; padding: 1vh 0.6vw; scrollbar-width: none; scroll-behavior: smooth; }
.icefin-d-row::-webkit-scrollbar { display: none; }
.icefin-d-card { flex: 0 0 auto; width: 11vw; outline: none; cursor: pointer; transition: transform 150ms; }
.icefin-d-card .icefin-d-img { aspect-ratio: 2 / 3; border-radius: var(--icefin-shape-cardRadius, 0.3em); background: var(--icefin-color-surface) center / cover no-repeat; }
.icefin-d-card.wide { width: 19vw; }
.icefin-d-card.wide .icefin-d-img { aspect-ratio: 16 / 9; }
.icefin-d-card.square .icefin-d-img { aspect-ratio: 1; }
.icefin-d-card.person { width: 9vw; }
.icefin-d-card.person .icefin-d-img { aspect-ratio: 1; border-radius: 50%; }
.icefin-d-card.icefin-focused { transform: scale(1.06); }
.icefin-d-card.icefin-focused .icefin-d-img { box-shadow: 0 0 0 0.2em var(--icefin-color-focus); }
.icefin-d-card.current .icefin-d-img { box-shadow: 0 0 0 0.12em var(--icefin-color-accent); }
.icefin-d-name { margin-top: 0.6em; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icefin-d-sub { font-size: 0.8em; color: var(--icefin-color-textSecondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icefin-d-progress { height: 0.25em; background: var(--icefin-color-divider); margin-top: 0.3em; }
.icefin-d-progress > i { display: block; height: 100%; background: var(--icefin-color-accent); }
.icefin-d-row.list { flex-direction: column; overflow: visible; gap: 0.2em; }
.icefin-d-track { display: grid; grid-template-columns: 3em 1fr auto; gap: 1em; padding: 0.55em 1em; border-radius: 0.3em; outline: none; cursor: pointer; }
.icefin-d-track .n, .icefin-d-track .t { color: inherit; opacity: 0.75; }
.icefin-d-picker { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; background: rgb(var(--icefin-color-background-channel) / 0.7); }
.icefin-d-picker-box { min-width: 30vw; max-width: 60vw; max-height: 70vh; overflow-y: auto; padding: 1.4em; border-radius: 0.6em; background: var(--icefin-color-surfaceRaised, var(--icefin-color-surface)); scrollbar-width: none; }
.icefin-d-picker h2 { margin: 0 0 0.8em; font-size: 1.3em; font-weight: 500; }
.icefin-d-option { padding: 0.6em 1em; border-radius: 0.3em; outline: none; cursor: pointer; }
.icefin-d-option[aria-selected="true"]::after { content: " ✓"; }
.icefin-d-option.icefin-focused { background: var(--icefin-color-focus); color: var(--icefin-color-onFocus); }
/* hero: art full-bleed, the text low on the left, no poster */
.icefin-details[data-layout="hero"] .icefin-d-main { grid-template-columns: 1fr; min-height: 78vh; align-content: end; padding-top: 0; }
.icefin-details[data-layout="hero"] .icefin-d-poster { display: none; }
/* banner: the art as a band across the top, poster and text under it */
.icefin-details[data-layout="banner"] .icefin-d-art { bottom: auto; height: 46vh; }
.icefin-details[data-layout="banner"] .icefin-d-shade { background: linear-gradient(0deg, var(--icefin-color-background) 54%, transparent 100%); }
.icefin-details[data-layout="banner"] .icefin-d-main { padding-top: 34vh; }
.icefin-details[data-layout="banner"] .icefin-d-poster { width: 13vw; }
/* panel: a fixed information panel on the left, the lists to its right */
.icefin-details[data-layout="panel"] .icefin-d-art { left: 34vw; }
.icefin-details[data-layout="panel"] .icefin-d-shade { background: linear-gradient(90deg, var(--icefin-color-background) 34%, rgb(var(--icefin-color-background-channel) / 0.6) 60%, rgb(var(--icefin-color-background-channel) / 0.3) 100%); }
.icefin-details[data-layout="panel"] .icefin-d-scroll { display: grid; grid-template-columns: 34vw 1fr; }
.icefin-details[data-layout="panel"] .icefin-d-main { grid-template-columns: 1fr; padding: 1vh 2.5vw 4vh 4vw; position: sticky; top: 10vh; align-self: start;
  margin-top: 10vh; max-height: 90vh; box-sizing: border-box; overflow-y: auto; scrollbar-width: none; }  /* below Back and Home */
.icefin-details[data-layout="panel"] .icefin-d-title { font-size: 2.2em; }
.icefin-details[data-layout="panel"] .icefin-d-main::-webkit-scrollbar { display: none; }
.icefin-details[data-layout="panel"] .icefin-d-poster { width: 11vw; }
.icefin-details[data-layout="panel"] .icefin-d-info { max-width: none; }
.icefin-details[data-layout="panel"] .icefin-d-overview { -webkit-line-clamp: 8; }
.icefin-details[data-layout="panel"] .icefin-d-sections { padding: 8vh 4vw 10vh 1vw; }
html[data-icefin-motion="low"] .icefin-d-scroll, html[data-icefin-motion="low"] .icefin-d-row { scroll-behavior: auto; }
`;
    function ensureStyle() {
        if (document.getElementById('icefin-details-base')) return;
        const s = el('style');
        s.id = 'icefin-details-base';
        s.textContent = BASE;
        // First in <head>, so a theme's stylesheet (loaded later) wins at the same weight.
        document.head.prepend(s);
    }

    function image(client, item, kind, max) {
        const tags = item.ImageTags || {};
        if (kind === 'Backdrop') {
            const b = item.BackdropImageTags || [];
            if (b.length) return client.getScaledImageUrl(item.Id, { type: 'Backdrop', maxWidth: max || 1920, tag: b[0] });
            const pb = item.ParentBackdropImageTags || [];
            if (pb.length && item.ParentBackdropItemId) return client.getScaledImageUrl(item.ParentBackdropItemId, { type: 'Backdrop', maxWidth: max || 1920, tag: pb[0] });
            return '';
        }
        if (kind === 'Thumb') {
            if (tags.Thumb) return client.getScaledImageUrl(item.Id, { type: 'Thumb', maxWidth: max || 640, tag: tags.Thumb });
            if (tags.Primary && (item.PrimaryImageAspectRatio || 0) > 1.2) return client.getScaledImageUrl(item.Id, { type: 'Primary', maxWidth: max || 640, tag: tags.Primary });
            const b = item.BackdropImageTags || [];
            if (b.length) return client.getScaledImageUrl(item.Id, { type: 'Backdrop', maxWidth: max || 640, tag: b[0] });
            if (item.ParentThumbItemId && item.ParentThumbImageTag) return client.getScaledImageUrl(item.ParentThumbItemId, { type: 'Thumb', maxWidth: max || 640, tag: item.ParentThumbImageTag });
        }
        if (kind === 'Logo') {
            if (tags.Logo) return client.getScaledImageUrl(item.Id, { type: 'Logo', maxWidth: max || 800, tag: tags.Logo });
            if (item.ParentLogoItemId && item.ParentLogoImageTag) return client.getScaledImageUrl(item.ParentLogoItemId, { type: 'Logo', maxWidth: max || 800, tag: item.ParentLogoImageTag });
            return '';
        }
        if (tags.Primary) return client.getScaledImageUrl(item.Id, { type: 'Primary', maxHeight: max || 600, tag: tags.Primary });
        if (item.SeriesPrimaryImageTag && item.SeriesId) return client.getScaledImageUrl(item.SeriesId, { type: 'Primary', maxHeight: max || 600, tag: item.SeriesPrimaryImageTag });
        if (item.AlbumPrimaryImageTag && item.AlbumId) return client.getScaledImageUrl(item.AlbumId, { type: 'Primary', maxHeight: max || 600, tag: item.AlbumPrimaryImageTag });
        return '';
    }

    function facts(item) {
        const out = [];
        if (item.Type === 'Episode' && item.ParentIndexNumber != null && item.IndexNumber != null) out.push(`S${item.ParentIndexNumber} E${item.IndexNumber}`);
        if (item.Type === 'Series' && item.ProductionYear) out.push(item.EndDate ? `${item.ProductionYear}–${new Date(item.EndDate).getFullYear()}` : `${item.ProductionYear}–`);
        else if (item.ProductionYear) out.push(String(item.ProductionYear));
        if (item.RunTimeTicks && item.Type !== 'Series') out.push(minutes(item.RunTimeTicks));
        if (item.ChildCount && item.Type === 'Series') out.push(`${item.ChildCount} season${item.ChildCount === 1 ? '' : 's'}`);
        if (item.OfficialRating) out.push(item.OfficialRating);
        if (item.CommunityRating) out.push(`★ ${item.CommunityRating.toFixed(1)}`);
        if (item.CriticRating) out.push(`${item.CriticRating}%`);
        if (item.RunTimeTicks >= TICKS_PER_MIN && item.Type !== 'Series' && PLAYABLE.has(item.Type)) {
            const left = item.RunTimeTicks - ((item.UserData || {}).PlaybackPositionTicks || 0);
            const end = new Date(Date.now() + left / 10000);
            out.push(`Ends at ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
        }
        return out;
    }

    // The media in brief, from the chosen version: 4K · HDR10 · HEVC · Dolby Atmos 7.1 · Subtitles
    function mediaFacts(source) {
        if (!source) return [];
        const streams = source.MediaStreams || [];
        const v = streams.find((s) => s.Type === 'Video');
        const a = streams.find((s) => s.Type === 'Audio' && s.IsDefault) || streams.find((s) => s.Type === 'Audio');
        const out = [];
        if (v) {
            const h = v.Height || 0, w = v.Width || 0;
            out.push(w >= 3800 || h >= 2100 ? '4K' : h >= 1400 ? '1440p' : h >= 1000 || w >= 1900 ? '1080p' : h >= 700 ? '720p' : h ? 'SD' : '');
            const range = v.VideoRangeType || v.VideoRange;
            if (range && range !== 'SDR' && range !== 'Unknown') out.push(range.replace('DOVI', 'Dolby Vision').replace('WithHDR10Plus', ' + HDR10+').replace('WithHDR10', ' + HDR10').replace('WithHLG', ' + HLG').replace('WithSDR', ''));
            if (v.Codec) out.push(v.Codec.toUpperCase());
        }
        if (a) {
            const atmos = /atmos/i.test(`${a.Profile || ''} ${a.Title || ''} ${a.DisplayTitle || ''}`);
            const ch = a.Channels ? (a.Channels > 2 ? `${a.Channels - 1}.1` : a.Channels === 2 ? 'Stereo' : 'Mono') : '';
            out.push([(a.Codec || '').toUpperCase().replace('EAC3', 'E-AC-3').replace('AC3', 'AC-3').replace('TRUEHD', 'TrueHD'), atmos ? 'Atmos' : '', ch].filter(Boolean).join(' '));
        }
        if (streams.some((s) => s.Type === 'Subtitle')) out.push('Subtitles');
        return out.filter(Boolean);
    }

    function screen(opts) {
        const o = Object.assign({ layout: 'hero' }, opts || {});
        let S = null;  // per-mount state

        function card(client, item, shape, go, sub) {
            const c = focusable(el('div', `icefin-d-card ${shape || ''}`.trim()));
            c.dataset.id = item.Id;
            const img = el('div', 'icefin-d-img');
            const url = image(client, item, shape === 'wide' ? 'Thumb' : 'Primary', shape === 'wide' ? 480 : 420);
            if (url) img.style.backgroundImage = `url("${url}")`;
            c.append(img);
            const ud = item.UserData || {};
            if (ud.PlayedPercentage > 0 && ud.PlayedPercentage < 100) {
                const p = el('div', 'icefin-d-progress'), i = el('i');
                i.style.width = `${ud.PlayedPercentage}%`;
                p.append(i);
                c.append(p);
            }
            c.append(el('div', 'icefin-d-name', item.Name));
            if (sub) c.append(el('div', 'icefin-d-sub', sub));
            c.addEventListener('click', go || (() => T.ctx.navigate(`#/details?id=${item.Id}&serverId=${client.serverId()}`)));
            return c;
        }

        function section(id, title, cls) {
            const s = el('section', 'icefin-d-section');
            s.dataset.section = id;
            s.append(el('h2', '', title));
            const row = el('div', 'icefin-d-row' + (cls ? ' ' + cls : ''));
            s.append(row);
            S.sections.append(s);
            return row;
        }

        function button(action, label, go, pressed) {
            const b = focusable(el('div', 'icefin-d-btn', label));
            b.dataset.action = action;
            if (pressed != null) b.setAttribute('aria-pressed', String(!!pressed));
            b.addEventListener('click', go);
            S.actions.append(b);
            return b;
        }

        // Version, Audio, Subtitles: a focusable chip that opens a picker; the choice goes to play().
        function option(name, label, choices, get, set) {
            if (choices.length < 2) return;  // one version, one audio track, or subtitles with only "Off"
            const c = focusable(el('div', 'icefin-d-select'));
            c.dataset.option = name;
            const draw = () => { c.textContent = label; c.append(el('b', '', (choices.find((x) => x.value === get()) || choices[0]).label)); };
            draw();
            c.addEventListener('click', () => openPicker(label, choices, get(), (v) => { set(v); draw(); }));
            S.options.append(c);
        }

        function openPicker(title, choices, current, pick) {
            closePicker();
            const p = el('div', 'icefin-d-picker');
            const box = el('div', 'icefin-d-picker-box');
            box.append(el('h2', '', title));
            let first = null;
            for (const ch of choices) {
                const e = focusable(el('div', 'icefin-d-option', ch.label));
                e.dataset.value = String(ch.value);
                if (ch.value === current) { e.setAttribute('aria-selected', 'true'); first = e; }
                e.addEventListener('click', () => { pick(ch.value); closePicker(); });
                box.append(e);
            }
            p.append(box);
            S.root.querySelector('.icefin-details').append(p);
            S.picker = { el: p, back: T.ctx.focused() };
            T.ctx.focus(first || box.querySelector('.icefin-d-option'));
        }
        function closePicker() {
            if (!S || !S.picker) return false;
            const back = S.picker.back;
            S.picker.el.remove();
            S.picker = null;
            if (back && back.isConnected) T.ctx.focus(back);
            return true;
        }

        async function playOpts(extra) {
            const it = S.item;
            const o2 = { ids: [it.Id], serverId: S.client.serverId() };
            if (S.source) o2.mediaSourceId = S.source.Id;
            if (S.audio != null) o2.audioStreamIndex = S.audio;
            if (S.subtitle != null) o2.subtitleStreamIndex = S.subtitle;
            return Object.assign(o2, extra || {});
        }
        const playItem = async (ticks) => { const m = pm(); if (m) m.play(await playOpts({ startPositionTicks: ticks || 0 })); };
        const playContainer = (shuffle) => {
            const m = pm();
            if (!m) return;
            if (shuffle && m.shuffle) m.shuffle(S.item);
            else m.play({ items: [S.item], serverId: S.client.serverId() });
        };

        async function fill(root, item) {
            const client = S.client, uid = client.getCurrentUserId();
            const wrap = el('div', 'icefin-details');
            wrap.dataset.layout = o.layout;
            wrap.dataset.type = item.Type;
            wrap.dataset.shape = item.Type === 'Episode' || item.Type === 'Video' ? 'wide' : (item.Type === 'MusicAlbum' || item.Type === 'MusicArtist' || item.Type === 'Audio' || item.Type === 'Playlist') ? 'square' : 'poster';
            const art = el('div', 'icefin-d-art');
            const bg = image(client, item, 'Backdrop');
            if (bg) art.style.backgroundImage = `url("${bg}")`;
            const scroll = el('div', 'icefin-d-scroll');
            const main = el('div', 'icefin-d-main');
            const poster = el('div', 'icefin-d-poster');
            const purl = image(client, item, wrap.dataset.shape === 'wide' ? 'Thumb' : 'Primary', 720);
            if (purl) poster.style.backgroundImage = `url("${purl}")`;
            const info = el('div', 'icefin-d-info');
            const logo = el('img', 'icefin-d-logo');
            const lurl = image(client, item, 'Logo');
            if (lurl) { logo.src = lurl; wrap.dataset.hasLogo = ''; }
            logo.alt = '';
            info.append(logo);
            const kicker = item.Type === 'Episode' ? item.SeriesName : item.Type === 'Season' ? item.SeriesName
                : item.Type === 'MusicAlbum' || item.Type === 'Audio' ? (item.AlbumArtist || (item.Artists || [])[0]) : '';
            if (kicker) info.append(el('div', 'icefin-d-kicker', kicker));
            info.append(el('h1', 'icefin-d-title', item.Name));
            const f = el('div', 'icefin-d-facts');
            facts(item).forEach((x) => f.append(el('span', '', x)));
            info.append(f);
            if (item.Genres && item.Genres.length) info.append(el('div', 'icefin-d-genres', item.Genres.slice(0, 4).join(', ')));
            if ((item.Taglines || [])[0]) info.append(el('div', 'icefin-d-tagline', item.Taglines[0]));
            if (item.Overview) info.append(el('p', 'icefin-d-overview', item.Overview));
            const media = el('div', 'icefin-d-media');
            info.append(media);
            S.actions = el('div', 'icefin-d-actions');
            S.options = el('div', 'icefin-d-options');
            info.append(S.actions, S.options);
            main.append(poster, info);
            S.sections = el('div', 'icefin-d-sections');
            scroll.append(main, S.sections);
            // Back and Home: the way out without the remote's Back key.
            const nav = el('div', 'icefin-d-nav');
            const navBtn = (action, label, go) => {
                const b = focusable(el('div', 'icefin-d-btn icefin-d-navbtn', label));
                b.dataset.action = action;
                b.addEventListener('click', go);
                nav.append(b);
            };
            navBtn('back', '‹ Back', () => { if (history.length > 1) history.back(); else T.ctx.navigate('#/home'); });
            navBtn('home', 'Home', () => T.ctx.navigate('#/home'));
            wrap.append(art, el('div', 'icefin-d-shade'), scroll, nav);
            root.append(wrap);

            const ud = item.UserData || {};
            const pos = ud.PlaybackPositionTicks || 0;
            // ---- actions ----
            if (PLAYABLE.has(item.Type)) {
                if (pos > 0) button('resume', `Resume from ${clock(pos)}`, () => playItem(pos));
                button(pos > 0 ? 'restart' : 'play', pos > 0 ? 'Play from the start' : 'Play', () => playItem(0));
            } else if (item.Type === 'Series') {
                let next = null;
                try { next = ((await client.getNextUpEpisodes({ SeriesId: item.Id, UserId: uid, Limit: 1, Fields: 'PrimaryImageAspectRatio' })).Items || [])[0] || null; } catch (e) { /* none */ }
                S.next = next;
                const np = next && (next.UserData || {}).PlaybackPositionTicks;
                if (next) button(np ? 'resume' : 'play', `${np ? 'Resume' : 'Play'} S${next.ParentIndexNumber} E${next.IndexNumber}`,
                    () => { const m = pm(); if (m) m.play({ ids: [next.Id], serverId: client.serverId(), startPositionTicks: np || 0 }); });
                else button('play', 'Play', () => playContainer(false));
                button('shuffle', 'Shuffle', () => playContainer(true));
            } else if (item.Type === 'MusicArtist') {
                button('shuffle', 'Shuffle', () => playContainer(true));
                if (pm() && pm().instantMix) button('mix', 'Instant mix', () => pm().instantMix(item));
            } else if (item.Type !== 'Person') {
                button('play', 'Play', () => playContainer(false));
                button('shuffle', 'Shuffle', () => playContainer(true));
                if ((item.Type === 'MusicAlbum' || item.Type === 'Playlist') && pm() && pm().instantMix) button('mix', 'Instant mix', () => pm().instantMix(item));
            }
            if ((item.LocalTrailerCount || 0) > 0 || (item.RemoteTrailers || []).length) {
                button('trailer', 'Trailer', () => { const m = pm(); if (m && m.playTrailers) m.playTrailers(item); });
            }
            {
                const fav = button('favourite', 'Favourite', async () => {
                    const now = !((S.item.UserData || {}).IsFavorite);
                    try {
                        await client.updateFavoriteStatus(uid, item.Id, now);
                        S.item.UserData = Object.assign({}, S.item.UserData, { IsFavorite: now });
                        fav.setAttribute('aria-pressed', String(now));
                    } catch (e) { T.ctx.sound('error'); }
                }, !!ud.IsFavorite);
            }
            if (item.Type !== 'Person' && item.Type !== 'MusicArtist') {
                const played = button('played', 'Played', async () => {
                    const now = !((S.item.UserData || {}).Played);
                    try {
                        if (now) await client.markPlayed(uid, item.Id, new Date());
                        else await client.markUnplayed(uid, item.Id);
                        S.item.UserData = Object.assign({}, S.item.UserData, { Played: now });
                        played.setAttribute('aria-pressed', String(now));
                    } catch (e) { T.ctx.sound('error'); }
                }, !!ud.Played);
            }
            if (item.Type === 'Episode' && item.SeriesId) button('series', 'Series', () => T.ctx.navigate(`#/details?id=${item.SeriesId}&serverId=${client.serverId()}`));
            if (item.Type === 'Season' && item.SeriesId) button('series', 'Series', () => T.ctx.navigate(`#/details?id=${item.SeriesId}&serverId=${client.serverId()}`));
            if (item.Type === 'MusicAlbum' && (item.AlbumArtists || [])[0]) button('artist', 'Artist', () => T.ctx.navigate(`#/details?id=${item.AlbumArtists[0].Id}&serverId=${client.serverId()}`));
            // jellyfin-web's own page keeps the rest (edit, delete, add to playlist or collection, download, identify).
            button('more', 'More options', () => location.assign(`#/details?id=${item.Id}&serverId=${client.serverId()}&icefin=stock`));

            // ---- versions and tracks ----
            const sources = (item.MediaSources || []).filter((s) => s.Type !== 'Placeholder');
            if (PLAYABLE.has(item.Type) && sources.length) {
                S.source = sources[0];
                const tracks = () => {
                    const st = S.source.MediaStreams || [];
                    S.audio = S.source.DefaultAudioStreamIndex != null ? S.source.DefaultAudioStreamIndex : null;
                    S.subtitle = S.source.DefaultSubtitleStreamIndex != null ? S.source.DefaultSubtitleStreamIndex : -1;
                    S.options.querySelectorAll('[data-option="audio"], [data-option="subtitles"]').forEach((x) => x.remove());
                    option('audio', 'Audio', st.filter((s) => s.Type === 'Audio').map((s) => ({ value: s.Index, label: s.DisplayTitle || s.Language || `Track ${s.Index}` })),
                        () => S.audio, (v) => { S.audio = v; });
                    option('subtitles', 'Subtitles', [{ value: -1, label: 'Off' }].concat(st.filter((s) => s.Type === 'Subtitle').map((s) => ({ value: s.Index, label: s.DisplayTitle || s.Language || `Track ${s.Index}` }))),
                        () => S.subtitle, (v) => { S.subtitle = v; });
                    media.textContent = '';
                    mediaFacts(S.source).forEach((x) => media.append(el('span', '', x)));
                };
                option('version', 'Version', sources.map((s) => ({ value: s.Id, label: s.Name || s.Container || s.Id })),
                    () => S.source.Id, (v) => { S.source = sources.find((s) => s.Id === v) || sources[0]; tracks(); });
                tracks();
            }

            // ---- sections ----
            const sid = client.serverId();
            const opts = { userId: uid, Fields: 'PrimaryImageAspectRatio,UserData' };
            if (item.Type === 'Series') {
                if (S.next) section('nextup', 'Next up').append(card(client, S.next, 'wide', null, `S${S.next.ParentIndexNumber} E${S.next.IndexNumber}`));
                let seasons = [];
                try { seasons = (await client.getSeasons(item.Id, opts)).Items || []; } catch (e) { /* none */ }
                if (seasons.length) {
                    const srow = section('seasons', 'Seasons');
                    const erow = section('episodes', 'Episodes');
                    let shown = null, timer = null;
                    const showSeason = async (season) => {
                        if (!season || shown === season.Id) return;
                        shown = season.Id;
                        srow.querySelectorAll('.icefin-d-card').forEach((c) => c.classList.toggle('current', c.dataset.id === season.Id));
                        erow.parentElement.querySelector('h2').textContent = season.Name;
                        let eps = [];
                        try { eps = (await client.getEpisodes(item.Id, Object.assign({ seasonId: season.Id }, opts))).Items || []; } catch (e) { /* none */ }
                        if (shown !== season.Id || !S) return;
                        erow.textContent = '';
                        eps.forEach((ep) => erow.append(card(client, ep, 'wide', null, `E${ep.IndexNumber != null ? ep.IndexNumber : '?'}${ep.RunTimeTicks ? ' · ' + minutes(ep.RunTimeTicks) : ''}`)));
                    };
                    seasons.forEach((s) => {
                        const c = card(client, s, '', null, s.ChildCount ? `${s.ChildCount} episodes` : '');
                        // Focusing a season shows its episodes below; Enter opens the season.
                        c.addEventListener('icefin-focus', () => { clearTimeout(timer); timer = setTimeout(() => showSeason(s), 250); });
                        srow.append(c);
                    });
                    await showSeason(seasons.find((s) => S.next && s.Id === S.next.SeasonId) || seasons.find((s) => !((s.UserData || {}).Played)) || seasons[0]);
                }
            } else if (item.Type === 'Season') {
                let eps = [];
                try { eps = (await client.getEpisodes(item.SeriesId, Object.assign({ seasonId: item.Id }, opts))).Items || []; } catch (e) { /* none */ }
                if (eps.length) {
                    const row = section('episodes', 'Episodes');
                    eps.forEach((ep) => row.append(card(client, ep, 'wide', null, `E${ep.IndexNumber != null ? ep.IndexNumber : '?'}${ep.RunTimeTicks ? ' · ' + minutes(ep.RunTimeTicks) : ''}`)));
                }
            } else if (item.Type === 'Episode' && item.SeasonId) {
                let eps = [];
                try { eps = (await client.getEpisodes(item.SeriesId, Object.assign({ seasonId: item.SeasonId }, opts))).Items || []; } catch (e) { /* none */ }
                const others = eps.filter((e) => e.Id !== item.Id);
                if (others.length) {
                    const row = section('episodes', item.SeasonName || 'More from this season');
                    eps.forEach((ep) => { const c = card(client, ep, 'wide', null, `E${ep.IndexNumber != null ? ep.IndexNumber : '?'}`); if (ep.Id === item.Id) c.classList.add('current'); row.append(c); });
                }
            } else if (item.Type === 'MusicAlbum' || item.Type === 'Playlist') {
                let tracks = [];
                try { tracks = (await client.getItems(uid, { ParentId: item.Id, SortBy: item.Type === 'Playlist' ? '' : 'ParentIndexNumber,IndexNumber,SortName', Fields: 'UserData', Limit: 500 })).Items || []; } catch (e) { /* none */ }
                if (tracks.length) {
                    const row = section('tracks', item.Type === 'Playlist' ? 'Items' : 'Tracks', 'list');
                    tracks.forEach((t, i) => {
                        const r = focusable(el('div', 'icefin-d-track'));
                        r.dataset.id = t.Id;
                        r.append(el('span', 'n', t.IndexNumber != null ? String(t.IndexNumber) : String(i + 1)), el('span', '', t.Name), el('span', 't', t.RunTimeTicks ? clock(t.RunTimeTicks) : ''));
                        r.addEventListener('click', () => { const m = pm(); if (m) m.play({ ids: tracks.map((x) => x.Id), startIndex: i, serverId: sid }); });
                        row.append(r);
                    });
                }
            } else if (item.Type === 'MusicArtist') {
                let albums = [];
                try { albums = (await client.getItems(uid, { ArtistIds: item.Id, IncludeItemTypes: 'MusicAlbum', Recursive: true, SortBy: 'ProductionYear,SortName', SortOrder: 'Descending', Fields: 'PrimaryImageAspectRatio', Limit: 100 })).Items || []; } catch (e) { /* none */ }
                if (albums.length) { const row = section('albums', 'Albums'); albums.forEach((a) => row.append(card(client, a, 'square', null, a.ProductionYear ? String(a.ProductionYear) : ''))); }
            } else if (item.Type === 'Person') {
                let films = [];
                try { films = (await client.getItems(uid, { PersonIds: item.Id, Recursive: true, IncludeItemTypes: 'Movie,Series,Episode', SortBy: 'PremiereDate,ProductionYear,SortName', SortOrder: 'Descending', Fields: 'PrimaryImageAspectRatio', Limit: 100 })).Items || []; } catch (e) { /* none */ }
                if (films.length) { const row = section('filmography', 'Filmography'); films.forEach((x) => row.append(card(client, x, x.Type === 'Episode' ? 'wide' : '', null, x.ProductionYear ? String(x.ProductionYear) : ''))); }
            } else if (CONTAINER.has(item.Type)) {
                let kids = [];
                try { kids = (await client.getItems(uid, { ParentId: item.Id, SortBy: item.Type === 'BoxSet' ? 'PremiereDate,ProductionYear,SortName' : 'SortName', Fields: 'PrimaryImageAspectRatio,UserData', Limit: 200 })).Items || []; } catch (e) { /* none */ }
                if (kids.length) {
                    const row = section('items', 'Items');
                    kids.forEach((k) => row.append(card(client, k, k.Type === 'Episode' || k.Type === 'Video' ? 'wide' : k.Type === 'MusicAlbum' || k.Type === 'Audio' ? 'square' : '', null, k.ProductionYear ? String(k.ProductionYear) : '')));
                }
            }
            // Chapters: play from one.
            const chapters = (item.Chapters || []).filter((c) => c.StartPositionTicks != null);
            if (PLAYABLE.has(item.Type) && chapters.length > 1) {
                const row = section('chapters', 'Chapters');
                chapters.forEach((c, i) => {
                    const fake = { Id: `${item.Id}-ch${i}`, Name: c.Name || `Chapter ${i + 1}`, ImageTags: {} };
                    const k = card(client, fake, 'wide', () => playItem(c.StartPositionTicks), clock(c.StartPositionTicks));
                    if (c.ImageTag) k.querySelector('.icefin-d-img').style.backgroundImage = `url("${client.getScaledImageUrl(item.Id, { type: 'Chapter', index: i, maxWidth: 480, tag: c.ImageTag })}")`;
                    row.append(k);
                });
            }
            // Cast and crew.
            const people = (item.People || []).filter((p) => p.Id);
            if (people.length) {
                const row = section('cast', 'Cast and crew');
                people.slice(0, 40).forEach((p) => {
                    const fake = { Id: p.Id, Name: p.Name, ImageTags: p.PrimaryImageTag ? { Primary: p.PrimaryImageTag } : {} };
                    row.append(card(client, fake, 'person', null, p.Role || p.Type || ''));
                });
            }
            // More like this.
            if (item.Type !== 'Person' && item.Type !== 'Season' && item.Type !== 'Folder' && item.Type !== 'CollectionFolder') {
                let sim = [];
                try { sim = (await client.getSimilarItems(item.Id, { userId: uid, limit: 12, fields: 'PrimaryImageAspectRatio,UserData' })).Items || []; } catch (e) { /* none */ }
                if (sim.length) {
                    const row = section('similar', 'More like this');
                    sim.forEach((x) => row.append(card(client, x, x.Type === 'Episode' || x.Type === 'Video' ? 'wide' : x.Type === 'MusicAlbum' || x.Type === 'MusicArtist' ? 'square' : '', null, x.ProductionYear ? String(x.ProductionYear) : '')));
                }
            }
        }

        return {
            onAction(action, ctx) {
                if (!S || !S.picker) return false;
                if (action === 'up' || action === 'down') { ctx.move(action, S.picker.el); return true; }
                if (action === 'left' || action === 'right') return true;  // a list: nothing beside it
                return false;  // enter clicks the option; back closes the picker (onBack)
            },
            onBack() { return closePicker(); },
            async mount(root) {
                ensureStyle();
                const params = new URLSearchParams(location.hash.split('?')[1] || '');
                const id = params.get('id');
                const client = T.ctx.apiClient();
                const toStock = () => location.replace(location.hash + (location.hash.includes('?') ? '&' : '?') + 'icefin=stock');
                if (!id || !client) { toStock(); return; }
                let item;
                try { item = await client.getItem(client.getCurrentUserId(), id); } catch (e) { toStock(); return; }
                if (!PLAYABLE.has(item.Type) && !CONTAINER.has(item.Type)) { toStock(); return; }
                S = { root, client, item, picker: null };
                root.setAttribute('data-icefin-details', item.Type);
                await fill(root, item);
                if (!S || !root.isConnected) return;
                const first = root.querySelector('.icefin-d-actions ' + FOCUS);
                if (first) T.ctx.focus(first);
                root.setAttribute('data-icefin-details-ready', item.Id);
                if (o.onReady) { try { o.onReady(root, item); } catch (e) { console.error('icefinTheme: details onReady', e); } }
            },
            unmount() { S = null; }
        };
    }

    T.ui.details = { screen, PLAYABLE: [...PLAYABLE], TYPES: [...PLAYABLE, ...CONTAINER] };
})();
