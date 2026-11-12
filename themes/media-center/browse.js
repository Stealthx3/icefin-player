// Media Center: search and favourites (PLAN 9.46), from the design canvas's "search" and "favourites" boards.
// Search: a text field with the phone-style keypad beside it (a key pressed again within a second steps through its
// letters), results grouped by kind as they're typed. Favourites: a row per kind of item, the focused row open.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    if (!T || !M) return;
    const { el, focusable } = M;

    // ---- search ----
    const KEYS = [['1', ''], ['2', 'abc'], ['3', 'def'], ['4', 'ghi'], ['5', 'jkl'], ['6', 'mno'], ['7', 'pqrs'], ['8', 'tuv'], ['9', 'wxyz'], ['clear', ''], ['0', ' '], ['delete', '']];
    const GROUPS = [['movies', 'Movie'], ['tv', 'Series'], ['episodes', 'Episode'], ['music', 'MusicAlbum,Audio,MusicArtist'], ['people', 'Person'],
        ['other', 'BoxSet,Playlist,Book,Video,MusicVideo,TvChannel']];
    let Q = null;

    function setText(v) {
        Q.input.value = v;
        Q.input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function keyPress(k, letters) {
        const now = Date.now();
        let v = Q.input.value;
        if (k === 'clear') { setText(''); return; }
        if (k === 'delete') { setText(v.slice(0, -1)); return; }
        if (!letters) { setText(v + k); return; }
        if (Q.last && Q.last.k === k && now - Q.last.at < 1000) {
            const i = (letters.indexOf(v.slice(-1)) + 1) % letters.length;
            setText(v.slice(0, -1) + letters[i]);
        } else setText(v + letters[0]);
        Q.last = { k, at: now };
    }

    async function run(term, gen) {
        const c = M.client(), uid = c.getCurrentUserId();
        Q.results.textContent = '';
        if (term.trim().length < 2) { Q.results.append(el('div', 'mc-note', 'Two letters or more.')); return; }
        Q.results.append(el('div', 'mc-note', 'Searching…'));
        const found = await Promise.all(GROUPS.map(async ([label, types]) => {
            try {
                if (types === 'Person') { const r = await c.getPeople(uid, { searchTerm: term, Limit: 6 }); return [label, r.Items || []]; }
                const r = await c.getItems(uid, { searchTerm: term, IncludeItemTypes: types, Recursive: true, Limit: 8, Fields: 'ProductionYear,ChildCount' });
                return [label, r.Items || []];
            } catch (e) { return [label, []]; }
        }));
        if (!Q || gen !== Q.gen) return;
        Q.results.textContent = '';
        let any = false;
        for (const [label, items] of found) {
            if (!items.length) continue;
            any = true;
            Q.results.append(el('div', 'mc-sec', `${label} · ${items.length}`));
            for (const it of items) {
                const r = focusable(el('div', 'mc-li'));
                r.append(el('span', 'mc-li-label', it.Name), el('span', 'mc-li-value',
                    [it.Type === 'Episode' ? it.SeriesName : '', it.AlbumArtist || '', it.ProductionYear || '', it.Type === 'Series' && it.ChildCount ? `${it.ChildCount} seasons` : '',
                        it.Type === 'Person' ? 'person' : ''].filter(Boolean).join(' · ')));
                r.addEventListener('click', () => {
                    T.ctx.sound('select');
                    if (it.Type === 'TvChannel' && T.ctx.canPlay()) T.ctx.play({ ids: [it.Id], serverId: c.serverId() });
                    else M.details(it.Id);
                });
                Q.results.append(r);
            }
        }
        if (!any) Q.results.append(el('div', 'mc-note', `Nothing matches “${term}”.`));
    }

    T.registerScreen('#/search', {
        onAction(action, ctx) {
            // Typing keys stay with the field; arrows leave it.
            if (!Q) return false;
            if (action === 'enter' && ctx.focused() === Q.input) { Q.input.focus(); return true; }
            return false;
        },
        mount(root) {
            root.setAttribute('data-mc', 'search');
            const field = el('div', 'mc-field');
            field.append(el('div', 'mc-ribbon one'), el('div', 'mc-ribbon two'));
            root.append(field);
            const chrome = M.chrome(root, 'search');
            const left = el('div', 'mc-search-left');
            const label = el('label', 'mc-search-label', 'Title, person, song or genre');
            const input = focusable(el('input', 'mc-search-input'));
            input.type = 'search';
            input.id = 'mc-search-q';
            label.htmlFor = input.id;
            input.setAttribute('autocomplete', 'off');
            const pad = el('div', 'mc-keypad');
            for (const [k, letters] of KEYS) {
                const b = focusable(el('button', 'mc-key'));
                b.type = 'button';
                b.append(el('span', 'mc-key-main', k), el('small', '', letters === ' ' ? 'space' : letters));
                b.addEventListener('click', () => { T.ctx.sound('focus'); keyPress(k, letters); });
                pad.append(b);
            }
            left.append(label, input, pad, el('div', 'mc-note', 'Press a key again within a second for its next letter. Results update as you type.'));
            const results = el('div', 'mc-search-results');
            root.append(left, results);
            Q = { root, input, results, chrome, gen: 0, last: null, t: null };
            input.addEventListener('input', () => {
                clearTimeout(Q.t);
                const gen = ++Q.gen;
                Q.t = setTimeout(() => run(input.value, gen), 350);
            });
            const q = new URLSearchParams(location.hash.split('?')[1] || '').get('query');
            if (q) setText(q); else results.append(el('div', 'mc-note', 'Type to search everything on the server.'));
            T.ctx.focus(input);
            root.setAttribute('data-mc-ready', '1');
        },
        unmount() { if (Q) { clearTimeout(Q.t); Q.chrome.stop(); } Q = null; }
    });

    // ---- favourites ----
    const FAV = [['Movies', 'Movie', 'poster'], ['Shows', 'Series', 'poster'], ['Episodes', 'Episode', 'wide'], ['Albums', 'MusicAlbum', 'square'],
        ['Songs', 'Audio', 'square'], ['Artists', 'MusicArtist', 'square'], ['Collections', 'BoxSet', 'poster'], ['People', 'Person', 'poster']];
    let F = null;
    T.registerScreen('#/favorites', {
        onAction(action, ctx) {
            if (!F || !F.rows.length) return false;
            const f = ctx.focused();
            const r = F.rows.findIndex((x) => x.tiles.includes(f));
            if (r < 0) return false;
            const c = F.rows[r].tiles.indexOf(f);
            if (action === 'left' || action === 'right') {
                const n = F.rows[r].tiles[c + (action === 'right' ? 1 : -1)];
                if (n) { ctx.focus(n); ctx.sound('focus'); }
                return true;
            }
            if (action === 'up' || action === 'down') {
                const nr = F.rows[r + (action === 'down' ? 1 : -1)];
                if (nr) { ctx.focus(nr.tiles[Math.min(c, nr.tiles.length - 1)]); ctx.sound('focus'); return true; }
                return action === 'down';
            }
            return false;
        },
        async mount(root) {
            root.setAttribute('data-mc', 'favorites');
            const field = el('div', 'mc-field');
            field.append(el('div', 'mc-ribbon one'), el('div', 'mc-ribbon two'));
            root.append(field);
            const chrome = M.chrome(root, 'favourites');
            const box = el('div', 'mc-fav');
            root.append(box);
            F = { root, chrome, rows: [] };
            const c = M.client(), uid = c.getCurrentUserId();
            const found = await Promise.all(FAV.map(async ([label, type, shape]) => {
                try {
                    const r = type === 'Person' ? await c.getPeople(uid, { Filters: 'IsFavorite', Limit: 30 }) :
                        type === 'MusicArtist' ? await c.getArtists(uid, { Filters: 'IsFavorite', Limit: 30 }) :
                            await c.getItems(uid, { Filters: 'IsFavorite', IncludeItemTypes: type, Recursive: true, Limit: 30, SortBy: 'SortName', Fields: 'PrimaryImageAspectRatio' });
                    return [label, shape, r.Items || []];
                } catch (e) { return [label, shape, []]; }
            }));
            if (!F || F.root !== root) return;
            for (const [label, shape, items] of found) {
                if (!items.length) continue;
                const row = el('section', 'mc-fav-row');
                const strip = el('div', `mc-fav-strip mc-lib-${shape}`);
                const tiles = items.map((it) => {
                    const t = focusable(el('div', 'mc-lib-tile'));
                    const art = el('div', 'mc-lib-art');
                    const tag = (it.ImageTags || {}).Primary;
                    if (tag) art.style.backgroundImage = `url("${c.getScaledImageUrl(it.Id, { type: 'Primary', maxHeight: 320, tag })}")`;
                    else art.append(el('span', 'mc-lib-fallback', it.Name));
                    t.append(art, el('div', 'mc-lib-name', it.Name));
                    t.addEventListener('click', () => { T.ctx.sound('select'); M.details(it.Id); });
                    t.addEventListener('icefin-focus', () => {
                        F.rows.forEach((x) => x.el.classList.toggle('current', x.el === row));
                        const off = Math.max(0, t.offsetLeft - strip.parentNode.offsetWidth * 0.4);
                        strip.style.transform = `translateX(${-off}px)`;
                        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    });
                    strip.append(t);
                    return t;
                });
                row.append(el('div', 'mc-fav-title', label), el('div', 'mc-fav-clip'));
                row.lastChild.append(strip);
                box.append(row);
                F.rows.push({ el: row, tiles });
            }
            if (!F.rows.length) box.append(el('div', 'mc-lib-empty', 'Nothing is a favourite yet. Choose Favourite on anything you like, and it shows here.'));
            else T.ctx.focus(F.rows[0].tiles[0]);
            root.setAttribute('data-mc-ready', String(F.rows.length));
        },
        unmount() { if (F) F.chrome.stop(); F = null; }
    });
})();
