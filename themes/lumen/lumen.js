// Lumen's home (PLAN 9.12, the 9.53 pass; the "Lumen Screens" canvas: Main, Home, HomeMore). Its target is named in
// docs/PLAN.md. The target's current version: a hero of a featured item filling the screen (Continue Watching first,
// then what's up next and new), its title, facts, two lines of overview and Resume / Play, favourite and details as
// round glass buttons, paging every 8 s (Gate 1, decision 2a); under it the rows in the user's order (Settings › Home):
// Continue Watching and Next Up as 16:9 cards with a progress line, each library's newest as posters on the published
// six-column grid. In the rows the hero gives way to the focused item's backdrop with its title top left, and the
// focused row slides to the top. The sidebar (menus.js) opens with ◀ from the first column. The home's own lists
// (?lm=resume|nextup|favourites|<row id>) and Settings (?lm=settings) are the shared screens.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinLumen;
    if (!T || !D || !D.columns) return;
    const ui = T.ui;
    const E = T.ctx;
    const el = D.el;
    const WIDE = new Set(['resume', 'nextup', 'onnow', 'system']);
    const HERO_MS = 8000;

    let S = null, H = null;

    // ---- pictures ----
    const tags = (it) => it.ImageTags || {};
    function backdrop(it, w) {
        if (!it) return '';
        if ((it.BackdropImageTags || []).length) return D.image(it.Id, 'Backdrop', it.BackdropImageTags[0], w);
        if ((it.ParentBackdropImageTags || []).length) return D.image(it.ParentBackdropItemId, 'Backdrop', it.ParentBackdropImageTags[0], w);
        if (tags(it).Thumb) return D.image(it.Id, 'Thumb', tags(it).Thumb, w);
        return '';
    }
    function wideArt(it, w) {
        if (!it) return '';
        if (tags(it).Thumb) return D.image(it.Id, 'Thumb', tags(it).Thumb, w);
        if (it.ParentThumbImageTag) return D.image(it.ParentThumbItemId, 'Thumb', it.ParentThumbImageTag, w);
        if (it.Type === 'Episode' && tags(it).Primary) return D.image(it.Id, 'Primary', tags(it).Primary, w);
        return backdrop(it, w) || (tags(it).Primary ? D.image(it.Id, 'Primary', tags(it).Primary, w) : '');
    }
    const facts = (it) => {
        if (!it) return [];
        const out = [];
        if (it.Type === 'Episode') out.push(`S${it.ParentIndexNumber} · E${it.IndexNumber} · ${it.Name}`);
        if (it.ProductionYear && it.Type !== 'Episode') out.push(String(it.ProductionYear));
        if ((it.Genres || []).length) out.push(it.Genres.slice(0, 2).join(', '));
        const pos = it.UserData && it.UserData.PlaybackPositionTicks;
        if (pos && it.RunTimeTicks) out.push(`${Math.max(1, Math.round((it.RunTimeTicks - pos) / 6e8))} min left`);
        else if (it.RunTimeTicks && D.ticks) out.push(D.ticks(it.RunTimeTicks));
        return out;
    };
    const titleOf = (it) => (it && it.Type === 'Episode' && it.SeriesName ? it.SeriesName : (it && it.Name) || '');

    // ---- the backdrop: two layers cross-fading (400 ms), the focused item's after focus settles 140 ms ----
    let bgTimer = null;
    function showBackdrop(it, now) {
        clearTimeout(bgTimer);
        const put = () => {
            if (!S || !it || S.root.getAttribute('data-lm-shelf') === it.Id) return;
            const url = backdrop(it, 1920) || wideArt(it, 1280);
            const next = S.bg[S.bgAt ^ 1];
            next.style.backgroundImage = url ? `url("${url}")` : 'none';
            next.classList.add('on');
            S.bg[S.bgAt].classList.remove('on');
            S.bgAt ^= 1;
            S.root.setAttribute('data-lm-shelf', it.Id);
        };
        if (now) put(); else bgTimer = setTimeout(put, 140);
    }

    // ---- the hero ----
    function heroButton(cls, label, icon, run) {
        const b = D.focusable(el('button', 'lm-hb ' + cls));
        b.type = 'button';
        if (icon) b.append(D.svg(icon));
        if (label) b.append(el('span', '', label));
        b.addEventListener('click', () => { E.sound('select'); run(); });
        return b;
    }
    function drawHero(i, dir) {
        if (!S || !S.heroItems.length) return;
        S.heroAt = (i + S.heroItems.length) % S.heroItems.length;
        const it = S.heroItems[S.heroAt];
        const h = S.hero;
        h.box.classList.remove('lm-hero-in', 'from-left', 'from-right');
        void h.box.offsetWidth;
        h.box.classList.add('lm-hero-in', dir < 0 ? 'from-left' : 'from-right');
        h.title.textContent = titleOf(it);
        h.meta.textContent = '';
        if (it.OfficialRating) h.meta.append(el('span', 'lm-badge', it.OfficialRating));
        h.meta.append(document.createTextNode(facts(it).join(' · ')));
        h.over.textContent = it.Overview || '';
        const pos = it.UserData && it.UserData.PlaybackPositionTicks;
        h.play.querySelector('span').textContent = pos ? 'Resume' : 'Play';
        h.play.setAttribute('aria-label', `${pos ? 'Resume' : 'Play'} ${titleOf(it)}`);
        h.fav.classList.toggle('on', !!(it.UserData && it.UserData.IsFavorite));
        h.dots.forEach((d, k) => d.classList.toggle('on', k === S.heroAt));
        if (S.zone === 'hero') showBackdrop(it, true);
        S.root.setAttribute('data-lm-hero', it.Id);
    }
    function heroTick() {
        clearInterval(S.heroTimer);
        if (S.heroItems.length < 2 || D.reduced()) return;
        S.heroTimer = setInterval(() => { if (S && S.zone === 'hero' && !ui.overlay.isOpen() && !(D.panel && D.panel.isOpen())) drawHero(S.heroAt + 1, 1); }, HERO_MS);
    }

    // ---- a row ----
    function cardFor(entry, wide, row) {
        const it = entry.item;
        const c = D.focusable(el('button', 'lm-hcard' + (wide ? ' wide' : '') + (entry.shape === 'square' ? ' square' : '')));
        c.type = 'button';
        const art = it ? (wide ? wideArt(it, 640) : (entry.art || D.artOf(it, 400))) : entry.art;
        if (art) c.style.backgroundImage = `url("${art}")`;
        else { c.classList.add('lm-noart'); const g = el('span', 'lm-hcard-glyph'); g.append(D.svg(entry.icon || (it ? D.kindIcon(it.Type) : 'item'))); c.append(g, el('span', 'lm-hcard-name', entry.name || '')); }
        c.setAttribute('aria-label', [entry.name, entry.sub].filter(Boolean).join(', '));
        if (entry.progress > 0 && entry.progress < 1) { const p = el('span', 'lm-progress'); const b = el('i'); b.style.width = `${(entry.progress * 100).toFixed(1)}%`; p.append(b); c.append(p); }
        const cap = el('span', 'lm-under');
        cap.append(el('b', '', entry.name || ''), el('small', '', entry.cellSub || entry.sub || ''));
        c.append(cap);
        c.lumenItem = it || null;
        c.lumenEntry = entry;
        c.addEventListener('click', () => {
            E.sound('select');
            if (entry.go) entry.go(null, c);
            else if (it) D.openItem(it, c);
            else E.navigate(`#/home?lm=${encodeURIComponent(row.id)}`);
        });
        c.addEventListener('icefin-focus', () => {
            if (!S) return;
            if (it) showBackdrop(it);
            S.top.title.textContent = it ? titleOf(it) : (entry.name || '');
            S.top.meta.textContent = it ? facts(it).join(' · ') : (entry.sub || '');
        });
        return c;
    }
    function drawRow(r, entries) {
        const wide = WIDE.has(r.id);
        const sec = el('section', 'lm-hrow' + (wide ? ' wide' : ''));
        sec.setAttribute('data-row', r.id);
        const track = el('div', 'lm-htrack');
        sec.append(el('div', 'lm-hrow-title', r.name), track);
        const row = { id: r.id, sec, track, cards: [], index: 0, wide };
        row.cards = entries.slice(0, 24).map((e) => cardFor(e, wide, row));
        if (entries.length > 6) {  // See all: the row's own list (the shared screens)
            const all = D.focusable(el('button', 'lm-hcard lm-seeall' + (wide ? ' wide' : '')));
            all.type = 'button';
            all.append(el('span', 'lm-seeall-tx', 'See all'));
            all.addEventListener('click', () => { E.sound('select'); E.navigate(`#/home?lm=${encodeURIComponent(r.id)}`); });
            row.cards.push(all);
        }
        track.append(...row.cards);
        return row;
    }
    function scrollRow(row) {
        const c = row.cards[row.index];
        if (!c) return;
        const pitch = row.cards.length > 1 ? row.cards[1].offsetLeft - row.cards[0].offsetLeft : c.offsetWidth;
        const room = S.root.clientWidth - 2 * row.cards[0].offsetLeft;
        const max = Math.max(0, row.track.scrollWidth - room);
        const x = Math.max(0, Math.min(max, (row.index - 1) * pitch));
        row.track.style.transform = `translateX(${-x}px)`;
        row.sec.setAttribute('data-lm-index', String(row.index));
    }

    // ---- focus zones: the hero's buttons, the rows ----
    function zone(z) { S.zone = z; S.root.setAttribute('data-lm-zone', z); }
    function focusHero(i) {
        zone('hero');
        S.rows.forEach((x) => x.sec.classList.remove('current', 'above'));
        S.rowsBox.style.transform = '';
        S.heroIndex = Math.max(0, Math.min(S.heroButtons.length - 1, i));
        if (S.heroButtons[S.heroIndex]) E.focus(S.heroButtons[S.heroIndex]);
        if (S.heroItems.length) showBackdrop(S.heroItems[S.heroAt], true);
        D.hints([['OK', S.heroIndex === 0 ? 'play' : 'select'], ['▼', 'rows'], ['◀', 'sidebar']]);
    }
    function focusRow(r, i) {
        const row = S.rows[r];
        if (!row || !row.cards.length) return;
        zone('rows');
        row.index = Math.max(0, Math.min(row.cards.length - 1, i));
        S.rowAt = r;
        S.rows.forEach((x, k) => { x.sec.classList.toggle('current', k === r); x.sec.classList.toggle('above', k < r); });
        scrollRow(row);
        // the focused row slides up under the focused item's title (350 ms, ease-out)
        const top = Math.round(S.root.clientHeight * 0.205);
        S.rowsBox.style.transform = `translateY(${top - S.rowsBox.offsetTop - row.sec.offsetTop}px)`;
        E.focus(row.cards[row.index]);
        const it = row.cards[row.index].lumenItem;
        D.hints(it ? [['OK', 'open'], ['▶', 'play'], ['≡', 'options'], ['◀', 'sidebar']] : [['OK', 'open'], ['◀', 'sidebar']]);
    }
    D.homeHints = () => { if (S && S.ready) { if (S.zone === 'hero') focusHero(S.heroIndex); else focusRow(S.rowAt, S.rows[S.rowAt].index); } };

    D.register('#/home', {
        onAction(action, ctx) {
            if (H && H.C) return H.C.onAction(action);
            if (!S || !S.ready) return action === 'back' ? (D.exitAsk(), true) : false;
            const f = ctx.focused();
            const it = f && f.lumenItem;
            if (action === 'menu' && it && D.itemMenu) { D.itemMenu(it, {}); return true; }
            if ((action === 'play_pause' || action === 'playpause') && it && D.playable(it)) { ctx.sound('select'); D.playItem(it, true); return true; }
            const hi = S.heroButtons.indexOf(f);
            if (hi >= 0) {
                if (action === 'left') { if (hi > 0) { focusHero(hi - 1); ctx.sound('focus'); } else { ctx.sound('navigate'); D.sidebar(); } return true; }
                if (action === 'right') { if (hi < S.heroButtons.length - 1) { focusHero(hi + 1); ctx.sound('focus'); } return true; }
                if (action === 'step_forward' || action === 'step_backward') { const d = action === 'step_forward' ? 1 : -1; drawHero(S.heroAt + d, d); heroTick(); ctx.sound('navigate'); return true; }
                if (action === 'down') { const r = S.rows.findIndex((x) => x.cards.length); if (r >= 0) { focusRow(r, S.rows[r].index); ctx.sound('focus'); } return true; }
                if (action === 'up') return true;
                if (action === 'back') { D.exitAsk(); return true; }
                return false;
            }
            const r = S.rows.findIndex((row) => row.track.contains(f));
            if (r >= 0) {
                const row = S.rows[r];
                if (action === 'left' || action === 'right') {
                    const n = row.index + (action === 'right' ? 1 : -1);
                    if (n >= 0 && n < row.cards.length) { focusRow(r, n); ctx.sound('focus'); }
                    else if (n < 0) { ctx.sound('navigate'); D.sidebar(); }
                    return true;  // at a row's far end the card only tilts (ui.parallax saw the press)
                }
                if (action === 'down') { for (let k = r + 1; k < S.rows.length; k++) if (S.rows[k].cards.length) { focusRow(k, S.rows[k].index); ctx.sound('focus'); break; } return true; }
                if (action === 'up') {
                    for (let k = r - 1; k >= 0; k--) if (S.rows[k].cards.length) { focusRow(k, S.rows[k].index); ctx.sound('focus'); return true; }
                    if (S.heroButtons.length) { focusHero(0); ctx.sound('focus'); }
                    return true;
                }
                if (action === 'back') { if (S.heroButtons.length) { focusHero(0); ctx.sound('back'); } else D.exitAsk(); return true; }
                return false;
            }
            if (action === 'back') { D.exitAsk(); return true; }
            return false;
        },
        onBack() { if (H && H.C) return H.C.onAction('back'); return this.onAction('back', T.ctx); },
        async mount(root) {
            const sub = D.params().get('lm');
            if (sub) {  // the home's own lists and Settings: the shared screens
                H = { root, extra: [] };
                const lvl = sub === 'settings' ? { title: 'Settings', count: false, load: D.settingsEntries, mode: 'list' }
                    : { title: ({ resume: 'Continue Watching', nextup: 'Next Up', favourites: 'Favourites', onnow: 'Live TV', playlists: 'Playlists', system: 'System' })[sub] || 'Home', count: false,
                        load: async () => { const rows = D.homeRows(await D.loadViews()); const rr = rows.find((x) => x.id === sub); const lv = rr ? await rr.level() : null; return lv ? lv.load() : []; } };
                H.C = D.columns(root, { root: lvl, name: sub === 'settings' ? 'settings' : 'homelist', key: `#/home?lm=${sub}` });
                H.extra.push(D.capsule(root));
                return;
            }
            H = null;
            root.setAttribute('data-lm', 'home');
            root.setAttribute('data-lm-screen', 'home');
            S = { root, rows: [], heroItems: [], heroButtons: [], heroAt: 0, heroIndex: 0, rowAt: 0, zone: 'hero', ready: false, bg: [], bgAt: 0, extra: [] };
            const me = S;
            // layers, back to front: the backdrop (two, cross-fading), the shades, the hero, the rows, the chrome
            S.bg = [el('div', 'lm-bg on'), el('div', 'lm-bg')];
            const shade = el('div', 'lm-shade');
            const hero = el('div', 'lm-hero');
            const box = el('div', 'lm-hero-box');
            S.hero = { box, title: el('h1', 'lm-hero-title'), meta: el('div', 'lm-hero-meta'), over: el('p', 'lm-hero-over'), dots: [] };
            const btns = el('div', 'lm-hero-btns');
            S.hero.play = heroButton('lm-hb-play', 'Play', 'play', () => { const it = S.heroItems[S.heroAt]; if (it) D.playItem(it, true); });
            S.hero.fav = heroButton('lm-hb-round lm-hb-fav', '', 'heart', async () => {
                const it = S.heroItems[S.heroAt];
                if (!it) return;
                const on = !(it.UserData && it.UserData.IsFavorite);
                try { await D.client().updateFavoriteStatus(D.uid(), it.Id, on); it.UserData = Object.assign({}, it.UserData, { IsFavorite: on }); S.hero.fav.classList.toggle('on', on); D.notice(on ? 'Added to favourites' : 'Removed from favourites'); } catch (e) { E.sound('error'); }
            });
            S.hero.fav.setAttribute('aria-label', 'Favourite');
            const info = heroButton('lm-hb-round', '', 'info', () => { const it = S.heroItems[S.heroAt]; if (it) D.openItem(it, null); });
            info.setAttribute('aria-label', 'Details');
            const next = heroButton('lm-hb-round lm-hb-next', '', 'next', () => { drawHero(S.heroAt + 1, 1); heroTick(); });
            next.setAttribute('aria-label', 'Next');
            S.heroButtons = [S.hero.play, S.hero.fav, info, next];
            btns.append(...S.heroButtons);
            box.append(S.hero.title, S.hero.meta, S.hero.over, btns);
            const dots = el('div', 'lm-dots');
            hero.append(box, dots);
            S.top = { box: el('div', 'lm-ftop'), title: el('div', 'lm-ftop-title'), meta: el('div', 'lm-ftop-meta') };
            S.top.box.append(S.top.title, S.top.meta);
            S.rowsBox = el('div', 'lm-hrows');
            const clock = el('div', 'lm-hclock', D.time());
            S.clockTimer = setInterval(() => { clock.textContent = D.time(); }, 15000);
            root.append(S.bg[0], S.bg[1], shade, hero, S.top.box, S.rowsBox, clock);
            D.mini(root, 'Home');
            S.extra.push(D.capsule(root));
            D.pointerNav(root, () => D.exitAsk());
            zone('hero');
            if (D.ping) D.ping();
            S.ping = setInterval(() => D.ping && D.ping(), 60000);
            if (D.loadMe) D.loadMe();

            const entries = await D.homeEntries();
            if (S !== me) return;
            const loaded = await Promise.all(entries.map(async (e) => {
                try { const lv = await e.open(); return { id: e.homeRow, name: e.name, title: lv && lv.title, list: lv ? await lv.load() : [] }; } catch (err) { return { id: e.homeRow, name: e.name, list: [] }; }
            }));
            if (S !== me) return;
            // the hero: what's in progress, then up next, then new (with a backdrop), five at most
            const seen = new Set();
            for (const x of loaded) {
                if (x.id === 'system' || x.id === 'onnow' || S.heroItems.length >= 5) continue;
                for (const e of x.list) {
                    const it = e.item;
                    if (!it || seen.has(it.Id) || !(backdrop(it, 1280) || wideArt(it, 1280))) continue;  // a backdrop first; else its other art
                    if (!['Movie', 'Episode', 'Series', 'Video', 'MusicVideo'].includes(it.Type)) continue;
                    seen.add(it.Id); S.heroItems.push(it);
                    if (S.heroItems.length >= 5) break;
                }
            }
            for (let k = 0; k < S.heroItems.length; k++) { const d = el('i'); dots.append(d); S.hero.dots.push(d); }
            if (!S.heroItems.length) { hero.classList.add('empty'); S.hero.title.textContent = 'Icefin'; S.hero.over.textContent = '◀ opens the sidebar: Search, your libraries and Settings.'; S.heroButtons = []; btns.textContent = ''; }
            S.rows = loaded.filter((x) => x.list.length).map((x) => drawRow({ id: x.id, name: x.title || x.name }, x.list));
            S.rowsBox.append(...S.rows.map((r) => r.sec));
            S.parallax = ui.parallax(S.rowsBox);  // the engine's lift (tokens parallax.lift) and tilt
            S.ready = true;
            root.setAttribute('data-lm-ready', String(S.rows.length || 1));
            if (S.heroItems.length) { drawHero(0, 1); heroTick(); focusHero(0); }
            else if (S.rows.length) focusRow(0, 0);
        },
        unmount() {
            clearTimeout(bgTimer);
            if (H) { if (H.C) H.C.stop(); for (const x of H.extra) if (x && x.stop) x.stop(); }
            if (S) { clearInterval(S.heroTimer); clearInterval(S.clockTimer); clearInterval(S.ping); for (const x of S.extra) if (x && x.stop) x.stop(); if (S.parallax) S.parallax.stop(); }
            S = null; H = null;
            D.hintsOff();
        }
    });
})();
