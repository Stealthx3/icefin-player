// Tide: settings (PLAN 9.48; the canvas's PrefsFramed, HomeOrder and HomeSettings boards).
//   - jellyfin-web's pages Tide doesn't draw (the preference pages, and any other) sit in Tide's frame
//     (ui.stockChrome): the page's icon and name where the column would be, its sibling pages as a line, the clock, a
//     band so text never runs under the top; fields, switches and lists restyled as Tide's lines (styles.css).
//     The server dashboard and plugin pages stay jellyfin-web's (the engine never frames them).
//   - Settings › Home (#/mypreferenceshome) is Tide's own: switches for what the cross bar and each library's column
//     show, and moving categories with the reorder model (≡ lifts, ▲ ▼ carry, OK places, Back puts it back; a pointer
//     drags by the grip). Saved per user on this device.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinTide;
    if (!T || !D) return;
    const ui = T.ui;
    const el = D.el;

    // ---- the frame around jellyfin-web's pages (PrefsFramed) ----
    const PAGES = { mypreferencesdisplay: ['Display', 'display'], mypreferenceshome: ['Home screen', 'home'], mypreferencesplayback: ['Playback', 'play'],
        mypreferencessubtitles: ['Subtitles', 'subtitles'], mypreferencescontrols: ['Controls', 'controls'] };
    const NAMES = { queue: ['Now playing', 'music'], lyrics: ['Lyrics', 'lyrics'], search: ['Search', 'search'], livetv: ['Live TV', 'livetv'], userprofile: ['Profile', 'person'],
        quickconnect: ['Quick Connect', 'quick'], login: ['Sign in', 'person'], selectserver: ['Choose a server', 'server'], addserver: ['Add a server', 'server'], forgotpassword: ['Forgot password', 'key'] };
    if (ui.stockChrome) ui.stockChrome.set({
        mount(host, info) {
            const f = el('div', 'td-sc');
            this.icon = el('div', 'td-sc-icon');
            this.name = el('div', 'td-sc-name');
            this.tabs = el('div', 'td-sc-tabs');
            this.clock = el('div', 'td-sc-clock');
            this.clock.textContent = D.clockText();
            const clockEl = this.clock;
            const timer = setInterval(() => { if (clockEl.isConnected) clockEl.textContent = D.clockText(); else clearInterval(timer); }, 15000);
            const back = el('button', 'td-sc-back');
            back.type = 'button';
            back.append(D.svg('back'), document.createTextNode(' Back'));
            back.addEventListener('click', () => info.back());
            const home = el('button', 'td-sc-back');
            home.type = 'button';
            home.append(D.svg('home'), document.createTextNode(' Home'));
            home.addEventListener('click', () => info.home());
            const nav = el('div', 'td-sc-nav');
            nav.append(back, home);
            f.append(nav, this.icon, this.name, this.tabs, this.clock);
            host.append(f);
            this.update(info);
        },
        update(info) {
            if (!this.name) return;
            const route = (info.route || '').replace(/^#\//, '');
            const [name, icon] = PAGES[route] || NAMES[route] || [(info.title || '').trim(), 'settings'];
            this.name.textContent = name;
            this.icon.textContent = '';
            this.icon.append(D.svg(PAGES[route] ? 'settings' : icon));
            this.tabs.textContent = '';
            if (PAGES[route]) {
                for (const [r, [label]] of Object.entries(PAGES)) {
                    const t = el('button', 'td-sc-tab' + (r === route ? ' on' : ''), label);
                    t.type = 'button';
                    t.addEventListener('click', () => { T.ctx.sound('navigate'); T.ctx.navigate(`#/${r}`); });
                    this.tabs.append(t);
                }
            }
            D.hints([['OK', 'change'], ['▲ ▼', 'move'], ['Back', '']]);
        }
    });

    // ---- the keyboard on a framed page (desktop mode, as Media Center): the arrows move between its controls ----
    const isText = (e) => !!e && ((e.tagName === 'INPUT' && /^(text|search|password|email|url|tel|number|)$/i.test(e.type || '')) || e.tagName === 'TEXTAREA' || e.isContentEditable);
    const shown = (e) => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; for (let p = e; p && p !== document.documentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
    const framed = () => { const h = document.documentElement; return h.hasAttribute('data-icefin-stock') && !h.hasAttribute('data-icefin-dashboard'); };
    const overlayUp = () => [...document.querySelectorAll('.dialogContainer .dialog, .slideshowDialog, #bookPlayer, #pdfPlayer, #comicsPlayer')].some((d) => d.getClientRects().length);
    const rectOf = (e) => (e.type === 'checkbox' ? (e.closest('label') || e) : e).getBoundingClientRect();
    function moveIn(dir) {
        const page = [...document.querySelectorAll('.mainAnimatedPage:not(.hide), .page:not(.hide)')].find((p) => p.getClientRects().length && p.getBoundingClientRect().height > 100);
        const list = [...document.querySelectorAll('#icefin-stock-chrome button')];
        if (page) list.push(...page.querySelectorAll('button, select, input:not([type=hidden]):not([type=file]), textarea, a[href]'));
        const ok = list.filter((e) => !e.disabled && shown(e.type === 'checkbox' ? (e.closest('label') || e) : e));
        if (!ok.length) return;
        const cur = ok.includes(document.activeElement) ? document.activeElement : null;
        if (!cur) { const first = ok.find((e) => !e.closest('#icefin-stock-chrome')) || ok[0]; first.focus(); first.scrollIntoView({ block: 'nearest' }); return; }
        const a = rectOf(cur), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
        let best = null, score = Infinity;
        for (const e of ok) {
            if (e === cur) continue;
            const b = rectOf(e), bx = b.left + b.width / 2, by = b.top + b.height / 2;
            const along = { up: ay - by, down: by - ay, left: ax - bx, right: bx - ax }[dir];
            const across = dir === 'up' || dir === 'down' ? Math.abs(bx - ax) : Math.abs(by - ay);
            if (along <= 4) continue;
            const s = along + across * 2;
            if (s < score) { score = s; best = e; }
        }
        if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); T.ctx.sound('focus'); }
    }
    const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    D.framedKeys = (e) => {
        if (!framed() || overlayUp()) return false;
        const dir = ARROWS[e.key];
        if (dir) {
            if (isText(e.target) && (dir === 'left' || dir === 'right')) return false;
            e.preventDefault();
            moveIn(dir);
            return true;
        }
        if (e.key === 'Enter' && e.target && e.target.type === 'checkbox') { e.preventDefault(); e.target.click(); return true; }
        return false;
    };

    // ---- Settings › Home (HomeOrder board) ----
    let H = null;
    D.register('#/mypreferenceshome', {
        async mount(root) {
            root.setAttribute('data-td-screen', 'homeprefs');
            const me = H = { root, lift: null };
            me.wave = D.ground(root);
            me.clock = D.clock(root);
            D.pointerNav(root);
            const trail = el('div', 'td-trail');
            for (const [icon, name, near] of [['settings', '', false], ['home', 'Home screen', true]]) {
                const t = el('div', 'td-trail-step' + (near ? ' near' : ''));
                t.append(D.svg(icon));
                if (name) t.append(el('div', 'td-trail-name', name));
                trail.append(t);
            }
            const list = el('div', 'td-hp');
            root.append(trail, list);
            const prefs = D.homePrefs();
            const views = D.orderedViews(await ui.userViews(), prefs);
            if (H !== me) return;
            const save = () => { prefs.order = [...list.querySelectorAll('.td-hp-row[data-id]')].map((r) => r.dataset.id); D.saveHomePrefs(prefs); D.memory.delete('#/home'); };
            const head = (text) => list.append(el('div', 'td-hp-head', text));
            head('The cross bar, left to right');
            const fixed = (name, note) => { const r = el('div', 'td-hp-row fixed'); r.append(el('i', 'td-hp-grip'), el('span', 'td-hp-name', name), el('span', 'td-hp-note', note)); list.append(r); };
            fixed('Settings', 'always first');
            for (const v of views) {
                const r = D.focusable(el('div', 'td-hp-row'));
                r.dataset.id = v.Id;
                const grip = el('i', 'td-hp-grip');
                grip.append(D.svg('reorder'));
                const sw = el('span', 'td-switch' + ((prefs.hidden || []).includes(v.Id) ? '' : ' on'));
                sw.append(el('i'));
                r.append(grip, D.svg(D.kindIcon(v.CollectionType), 'td-hp-icon'), el('span', 'td-hp-name', v.Name), sw);
                r.setAttribute('role', 'switch');
                r.setAttribute('aria-label', `${v.Name}: ${sw.classList.contains('on') ? 'shown' : 'hidden'}; ≡ to move`);
                r.addEventListener('click', () => {
                    if (me.lift) return;
                    const on = !sw.classList.contains('on');
                    sw.classList.toggle('on', on);
                    prefs.hidden = (prefs.hidden || []).filter((x) => x !== v.Id).concat(on ? [] : [v.Id]);
                    r.setAttribute('aria-label', `${v.Name}: ${on ? 'shown' : 'hidden'}; ≡ to move`);
                    T.ctx.sound('select');
                    save();
                });
                // the pointer: drag by the grip (hold 450 ms or move 12 px)
                grip.addEventListener('pointerdown', (e) => {
                    const y0 = e.clientY;
                    let lifted = false;
                    const t = setTimeout(() => { lifted = true; startLift(r); }, 450);
                    const mv = (ev) => {
                        if (!lifted && Math.abs(ev.clientY - y0) > 12) { clearTimeout(t); lifted = true; startLift(r); }
                        if (lifted) { const over = document.elementFromPoint(ev.clientX, ev.clientY); const row = over && over.closest('.td-hp-row[data-id]'); if (row && row !== r) { const after = ev.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2; list.insertBefore(r, after ? row.nextSibling : row); } }
                    };
                    const up = () => { clearTimeout(t); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (lifted) { setTimeout(() => dropLift(), 0); } };
                    window.addEventListener('pointermove', mv);
                    window.addEventListener('pointerup', up);
                    e.preventDefault();
                });
                list.append(r);
            }
            fixed('Search', 'always last');
            head('In each library’s column');
            const peek = D.toggle('What to watch first (Continue, Next up)', prefs.peek !== false, (on) => { prefs.peek = on; save(); });
            peek.classList.add('td-hp-toggle');
            list.append(peek);
            const classic = D.row('Classic home sections (jellyfin-web’s) ›', { go: () => T.ctx.navigate('#/mypreferenceshome?icefin=stock') });
            list.append(classic);
            function startLift(r) {
                me.lift = { row: r, before: r.nextSibling };
                r.classList.add('td-lifted');
                T.ctx.focus(r);
                T.ctx.sound('select');
                D.hints([['▲ ▼', 'carry'], ['OK', 'place'], ['Back', 'put it back']]);
            }
            function dropLift() { if (!me.lift) return; me.lift.row.classList.remove('td-lifted'); me.lift = null; T.ctx.sound('select'); save(); hints(); }
            me.startLift = startLift; me.dropLift = dropLift;
            me.moveLift = (dir) => {
                const r = me.lift.row, sib = dir < 0 ? r.previousElementSibling : r.nextElementSibling;
                if (!sib || !sib.dataset || !sib.dataset.id) { T.ctx.sound('error'); return; }
                if (dir < 0) list.insertBefore(r, sib); else list.insertBefore(sib, r);
                T.ctx.sound('focus');
            };
            me.cancelLift = () => { const { row, before } = me.lift; list.insertBefore(row, before); row.classList.remove('td-lifted'); me.lift = null; T.ctx.sound('back'); hints(); };
            const hints = () => D.hints([['OK', 'switch'], ['≡', 'lift to move'], ['Back', '']]);
            hints();
            const first = list.querySelector('[data-icefin-focus]');
            if (first) T.ctx.focus(first);
            root.setAttribute('data-td-ready', '1');
        },
        unmount() { if (H) { H.wave.stop(); H.clock.stop(); } H = null; D.hintsOff(); },
        onAction(a, ctx) {
            if (!H) return false;
            D.sawAction(a);
            if (H.lift) {
                if (a === 'up' || a === 'down') { H.moveLift(a === 'up' ? -1 : 1); return true; }
                if (a === 'enter' || a === 'select' || a === 'menu') { H.dropLift(); return true; }
                if (a === 'back') { H.cancelLift(); return true; }
                return true;
            }
            const f = ctx.focused();
            if (a === 'menu' && f && f.dataset && f.dataset.id) { H.startLift(f); return true; }
            if (a === 'back') { T.ctx.sound('back'); if (history.length > 1) history.back(); else T.ctx.navigate('#/home'); return true; }
            return false;
        }
    });
})();
