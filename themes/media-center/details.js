// Media Center: the details screen (Icefin reference theme, PLAN 8.6) for things that play on their own: movies,
// episodes, videos and music videos. A full-bleed backdrop under the poster, title, facts and overview, with Resume,
// Play from the start and Favourite. Series, seasons, collections, people and anything else go to jellyfin-web's own
// page (?icefin=stock, replacing this history entry so Back doesn't loop), where their lists live.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const ui = T.ui;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    const PLAYABLE = new Set(['Movie', 'Episode', 'Video', 'MusicVideo']);
    let D = null;

    function facts(item) {
        const out = [];
        if (item.Type === 'Episode' && item.ParentIndexNumber != null && item.IndexNumber != null) out.push(`Season ${item.ParentIndexNumber}, episode ${item.IndexNumber}`);
        if (item.ProductionYear) out.push(String(item.ProductionYear));
        if (item.RunTimeTicks) {
            const min = Math.round(item.RunTimeTicks / 600000000);
            out.push(min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);
        }
        if (item.OfficialRating) out.push(item.OfficialRating);
        if (item.CommunityRating) out.push(`★ ${item.CommunityRating.toFixed(1)}`);
        return out.join('  ·  ');
    }

    function button(label, go) {
        const b = el('div', 'mc-btn', label);
        b.setAttribute('data-icefin-focus', '');
        b.tabIndex = -1;
        b.addEventListener('click', go);
        return b;
    }

    T.registerScreen('#/details', {
        onAction(action, ctx) {
            if (!D || !D.buttons.length) return false;
            const i = D.buttons.indexOf(ctx.focused());
            if (i < 0) return false;
            if (action === 'left' || action === 'right') {
                const n = i + (action === 'right' ? 1 : -1);
                if (n >= 0 && n < D.buttons.length) { ctx.focus(D.buttons[n]); ctx.sound('focus'); }
                return true;
            }
            return action === 'up' || action === 'down';  // one row of buttons: nothing above or below
        },
        async mount(root) {
            const params = new URLSearchParams(location.hash.split('?')[1] || '');
            const id = params.get('id');
            const client = T.ctx.apiClient();
            const toStock = () => location.replace(location.hash + (location.hash.includes('?') ? '&' : '?') + 'icefin=stock');
            if (!id || !client) { toStock(); return; }
            let item;
            try { item = await client.getItem(client.getCurrentUserId(), id); } catch (e) { toStock(); return; }
            if (!PLAYABLE.has(item.Type)) { toStock(); return; }
            D = { root, item, buttons: [] };
            root.setAttribute('data-mc', 'details');
            root.setAttribute('data-mc-item', item.Id);
            const art = el('div', 'mc-details-art');
            const tags = item.BackdropImageTags || [];
            const parentArt = item.ParentBackdropImageTags || [];
            if (tags.length) art.style.backgroundImage = `url("${client.getScaledImageUrl(item.Id, { type: 'Backdrop', maxWidth: 1920, tag: tags[0] })}")`;
            else if (parentArt.length && item.ParentBackdropItemId) art.style.backgroundImage = `url("${client.getScaledImageUrl(item.ParentBackdropItemId, { type: 'Backdrop', maxWidth: 1920, tag: parentArt[0] })}")`;
            const shade = el('div', 'mc-details-shade');
            const panel = el('div', 'mc-details');
            const poster = el('div', 'mc-details-poster');
            const ptag = (item.ImageTags || {}).Primary;
            if (ptag) poster.style.backgroundImage = `url("${client.getScaledImageUrl(item.Id, { type: 'Primary', maxHeight: 640, tag: ptag })}")`;
            const text = el('div', 'mc-details-text');
            if (item.Type === 'Episode' && item.SeriesName) text.append(el('div', 'mc-details-series', item.SeriesName));
            text.append(el('h1', 'mc-details-title', item.Name), el('div', 'mc-details-facts', facts(item)));
            if (item.Genres && item.Genres.length) text.append(el('div', 'mc-details-genres', item.Genres.slice(0, 4).join(', ')));
            text.append(el('p', 'mc-details-overview', item.Overview || ''));
            const row = el('div', 'mc-details-buttons');
            const pos = (item.UserData || {}).PlaybackPositionTicks || 0;
            const play = (ticks) => T.ctx.play({ ids: [item.Id], serverId: client.serverId(), startPositionTicks: ticks });
            if (pos > 0) {
                const min = Math.round(pos / 600000000);
                D.buttons.push(button(`Resume from ${Math.floor(min / 60) ? Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0') : min + ' min'}`, () => play(pos)));
            }
            D.buttons.push(button(pos > 0 ? 'Play from the start' : 'Play', () => play(0)));
            const fav = button((item.UserData || {}).IsFavorite ? 'Favourite ✓' : 'Favourite', async () => {
                const now = !((item.UserData || {}).IsFavorite);
                try {
                    await client.updateFavoriteStatus(client.getCurrentUserId(), item.Id, now);
                    item.UserData = Object.assign({}, item.UserData, { IsFavorite: now });
                    fav.textContent = now ? 'Favourite ✓' : 'Favourite';
                    T.ctx.sound('select');
                } catch (e) { T.ctx.sound('error'); }
            });
            D.buttons.push(fav);
            row.append(...D.buttons);
            text.append(row);
            panel.append(poster, text);
            root.append(art, shade, panel);
            panel.style.setProperty('--mc-ms', `${ui.motion.duration(360)}ms`);
            requestAnimationFrame(() => panel.classList.add('in'));
            T.ctx.focus(D.buttons[0]);
            root.setAttribute('data-mc-ready', '1');
        },
        unmount() { D = null; }
    });
})();
