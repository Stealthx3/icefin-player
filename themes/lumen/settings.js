// Lumen: settings (PLAN 9.49; the canvas's PrefsFramed and HomeOrder boards).
//   - jellyfin-web's pages Lumen doesn't draw (the preference pages, and any other) sit in Lumen's frame
//     (ui.stockChrome): a header band with the page's name and the clock, the preference pages as tabs (shoulders flip
//     them); fields, switches and lists restyled as Lumen's rows (styles.css).
//     The server dashboard and plugin pages stay jellyfin-web's (the engine never frames them).
//   - Settings › Home (#/mypreferenceshome) is Lumen's own: the home's rows and the tab strip's libraries, each
//     Shown or Hidden, moved with the lift (Move or ≡ lifts, ▲ ▼ carry, OK drops, Back puts it back; a pointer drags
//     a row by its label). Saved per user on this device.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinLumen;
    if (!T || !D) return;
    const ui = T.ui;
    const el = D.el;

    // ---- the frame around jellyfin-web's pages (PrefsFramed) ----
    const PAGES = { mypreferencesdisplay: ['Display', 'display'], mypreferenceshome: ['Home', 'home'], mypreferencesplayback: ['Playback', 'play'],
        mypreferencessubtitles: ['Subtitles', 'subtitles'], mypreferencescontrols: ['Controls', 'controls'] };
    const NAMES = { queue: ['Now playing', 'music'], lyrics: ['Lyrics', 'lyrics'], search: ['Search', 'search'], livetv: ['Live TV', 'livetv'], userprofile: ['Profile', 'person'],
        quickconnect: ['Quick Connect', 'quick'], login: ['Sign in', 'person'], selectserver: ['Choose a server', 'server'], addserver: ['Add a server', 'server'], forgotpassword: ['Forgot password', 'key'] };
    if (ui.stockChrome) ui.stockChrome.set({
        mount(host, info) {
            const f = el('div', 'lm-sc');
            this.icon = el('div', 'lm-sc-icon');
            this.name = el('div', 'lm-sc-name');
            this.tabs = el('div', 'lm-sc-tabs');
            this.clock = el('div', 'lm-sc-clock');
            this.clock.textContent = D.clockText();
            const clockEl = this.clock;
            const timer = setInterval(() => { if (clockEl.isConnected) clockEl.textContent = D.clockText(); else clearInterval(timer); }, 15000);
            const back = el('button', 'lm-sc-back');
            back.type = 'button';
            back.append(D.svg('back'), document.createTextNode(' Back'));
            back.addEventListener('click', () => info.back());
            const home = el('button', 'lm-sc-back');
            home.type = 'button';
            home.append(D.svg('home'), document.createTextNode(' Home'));
            home.addEventListener('click', () => info.home());
            const nav = el('div', 'lm-sc-nav');
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
                    const t = el('button', 'lm-sc-tab' + (r === route ? ' on' : ''), label);
                    t.type = 'button';
                    t.addEventListener('click', () => { T.ctx.sound('navigate'); T.ctx.navigate(`#/${r}`); });
                    this.tabs.append(t);
                }
            }
            D.hints([['OK', 'change'], ['▲ ▼', 'move'], ['Back', '']]);
            // focus on arrival, sooner than the engine's 1.2 s: the first control that isn't a text field
            clearTimeout(this.arrive);
            this.arrive = setTimeout(() => {
                const a = document.activeElement;
                if (a && a !== document.body && a !== document.documentElement) return;
                const page = [...document.querySelectorAll('.mainAnimatedPage:not(.hide), .page:not(.hide)')].find((x) => x.getClientRects().length && x.getBoundingClientRect().height > 100);
                if (!page) return;
                const first = [...page.querySelectorAll('select, input[type=checkbox], button, a[href], input:not([type=hidden]):not([type=file])')]
                    .find((x) => !x.disabled && x.getClientRects().length && !/^(text|search|password|email|url|tel|number)$/i.test(x.type || ''));
                if (first) first.focus({ preventScroll: true });
            }, 450);
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

    // ---- Settings › Home (HomeOrder board): the home's rows, then the tab strip's libraries; Shown or Hidden,
    // and the lift to move one (≡ or OK on Move lifts, ▲ ▼ carry, OK drops, Back puts it back; a pointer drags) ----
    let H = null;
    D.register('#/mypreferenceshome', {
        async mount(root) {
            root.setAttribute('data-lm-screen', 'homeprefs');
            root.classList.add('lm-screen', 'lm-hp-screen');
            const me = H = { root, lift: null };
            me.clock = { stop() {} };
            D.pointerNav(root);
            const pane = el('div', 'lm-pane');
            const crumb = el('div', 'lm-crumb', 'Settings › Preferences › Home');
            const title = el('div', 'lm-title', 'Home rows');
            const when = el('div', 'lm-when');
            const desc = el('div', 'lm-desc', 'Which rows Home shows, in what order, and the libraries in the tab strip. Saved for you on this player; the preview at the right follows every change.');
            pane.append(crumb, title, when, desc);
            const pv = el('div', 'lm-pv lm-hp-pv on');
            const list = el('div', 'lm-hp');
            root.append(pane, pv, list);
            const prefs = D.homePrefs();
            const views0 = await ui.userViews();
            if (H !== me) return;
            const views = D.orderedViews(views0, prefs);
            const rowsAll = D.orderedRows(D.homeRows(views0), prefs);
            const preview = () => {
                pv.textContent = '';
                for (const r of list.querySelectorAll('.lm-hp-row[data-kind="row"]')) { const i = el('i', r.classList.contains('off') ? 'off' : ''); if (r === (me.lift && me.lift.row)) i.className = 'lit'; pv.append(i); }
                const n = list.querySelectorAll('.lm-hp-row[data-kind="row"]:not(.off)').length, h = list.querySelectorAll('.lm-hp-row[data-kind="row"].off').length;
                when.textContent = `${n} rows shown · ${h} hidden`;
            };
            const save = () => {
                prefs.rows = [...list.querySelectorAll('.lm-hp-row[data-kind="row"]')].map((r) => r.dataset.id);
                prefs.rowsHidden = [...list.querySelectorAll('.lm-hp-row[data-kind="row"].off')].map((r) => r.dataset.id);
                prefs.order = [...list.querySelectorAll('.lm-hp-row[data-kind="view"]')].map((r) => r.dataset.id);
                prefs.hidden = [...list.querySelectorAll('.lm-hp-row[data-kind="view"].off')].map((r) => r.dataset.id);
                D.saveHomePrefs(prefs);
                D.memory.delete('#/home');
                preview();
            };
            const head = (text) => list.append(el('div', 'lm-hp-head', text));
            const item = (kind, id, name, off) => {
                const r = el('div', 'lm-hp-row' + (off ? ' off' : ''));
                r.dataset.id = id;
                r.dataset.kind = kind;
                const label = el('div', 'lm-ch');
                label.append(el('span', 'lm-ch-label', name));
                const state = D.focusable(el('button', 'lm-c lm-hp-state', off ? 'Hidden' : 'Shown'));
                state.type = 'button';
                const move = D.focusable(el('button', 'lm-c lm-hp-move', 'Move'));
                move.type = 'button';
                const lane = el('div', 'lm-lane lm-hp-lane');
                lane.append(state, move);
                r.append(label, lane);
                state.setAttribute('aria-label', `${name}: ${off ? 'hidden' : 'shown'}`);
                state.addEventListener('click', () => {
                    if (me.lift) { dropLift(); return; }
                    const now = !r.classList.contains('off');
                    r.classList.toggle('off', now);
                    state.textContent = now ? 'Hidden' : 'Shown';
                    state.setAttribute('aria-label', `${name}: ${now ? 'hidden' : 'shown'}`);
                    T.ctx.sound('select');
                    save();
                });
                move.addEventListener('click', () => { if (me.lift) dropLift(); else startLift(r); });
                // the pointer: drag a row by its label (hold 450 ms or move 12 px)
                label.addEventListener('pointerdown', (e) => {
                    const y0 = e.clientY;
                    let lifted = false;
                    const t = setTimeout(() => { lifted = true; startLift(r); }, 450);
                    const mv = (ev) => {
                        if (!lifted && Math.abs(ev.clientY - y0) > 12) { clearTimeout(t); lifted = true; startLift(r); }
                        if (lifted) { const over = document.elementFromPoint(ev.clientX, ev.clientY); const row = over && over.closest(`.lm-hp-row[data-kind="${kind}"]`); if (row && row !== r) { const after = ev.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2; list.insertBefore(r, after ? row.nextSibling : row); } }
                    };
                    const up = () => { clearTimeout(t); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (lifted) setTimeout(() => dropLift(), 0); };
                    window.addEventListener('pointermove', mv);
                    window.addEventListener('pointerup', up);
                    e.preventDefault();
                });
                list.append(r);
                return r;
            };
            head('Home’s rows, top to bottom');
            for (const r of rowsAll) item('row', r.id, r.name, (prefs.rowsHidden || []).includes(r.id));
            head('The libraries in the guide’s Library blade, top to bottom');
            for (const v of views) item('view', v.Id, v.Name, (prefs.hidden || []).includes(v.Id));
            const reset = D.focusable(el('button', 'lm-c lm-hp-reset', 'Reset to the default order'));
            reset.type = 'button';
            reset.addEventListener('click', () => { prefs.rows = []; prefs.rowsHidden = []; prefs.order = []; prefs.hidden = []; D.saveHomePrefs(prefs); D.memory.delete('#/home'); T.ctx.sound('select'); D.notice('Home is back to the default order'); T.ctx.navigate('#/mypreferenceshome?lm=' + Date.now()); });
            const classic = D.focusable(el('button', 'lm-c lm-hp-reset', 'Classic home sections (jellyfin-web’s) ›'));
            classic.type = 'button';
            classic.addEventListener('click', () => T.ctx.navigate('#/mypreferenceshome?icefin=stock'));
            const foot = el('div', 'lm-hp-row lm-hp-foot');
            const fl = el('div', 'lm-ch');
            fl.append(el('span', 'lm-ch-label', 'Reset'));
            const flane = el('div', 'lm-lane lm-hp-lane');
            flane.append(reset, classic);
            foot.append(fl, flane);
            list.append(foot);
            function startLift(r) {
                me.lift = { row: r, before: r.nextSibling };
                r.classList.add('lm-lifted');
                const m = r.querySelector('.lm-hp-move');
                m.textContent = 'Moving · ▲▼ place, OK drop';
                T.ctx.focus(m);
                T.ctx.sound('select');
                D.hints([['▲ ▼', 'place'], ['OK', 'drop it here'], ['Back', 'put it back']]);
                preview();
            }
            function dropLift() { if (!me.lift) return; const r = me.lift.row; r.classList.remove('lm-lifted'); r.querySelector('.lm-hp-move').textContent = 'Move'; me.lift = null; T.ctx.sound('select'); save(); hints(); T.ctx.focus(r.querySelector('.lm-hp-move')); }
            me.startLift = startLift; me.dropLift = dropLift;
            me.moveLift = (dir) => {
                const r = me.lift.row, sib = dir < 0 ? r.previousElementSibling : r.nextElementSibling;
                if (!sib || !sib.dataset || sib.dataset.kind !== r.dataset.kind) { T.ctx.sound('error'); return; }
                if (dir < 0) list.insertBefore(r, sib); else list.insertBefore(sib, r);
                T.ctx.focus(r.querySelector('.lm-hp-move'));
                T.ctx.sound('focus');
                keepInView(r);
                preview();
            };
            me.cancelLift = () => { const { row, before } = me.lift; list.insertBefore(row, before); row.classList.remove('lm-lifted'); row.querySelector('.lm-hp-move').textContent = 'Move'; me.lift = null; T.ctx.sound('back'); hints(); preview(); T.ctx.focus(row.querySelector('.lm-hp-move')); };
            const keepInView = (r) => { const lr = list.getBoundingClientRect(), rr = r.getBoundingClientRect(); if (rr.bottom > lr.bottom) list.scrollTop += rr.bottom - lr.bottom; if (rr.top < lr.top) list.scrollTop -= lr.top - rr.top; };
            me.keepInView = keepInView;
            const hints = () => D.hints([['OK', 'show or hide · lift'], ['≡', 'lift to move'], ['◀ ▶ ▲ ▼', 'move'], ['Back', 'to Settings']]);
            hints();
            preview();
            const first = list.querySelector('[data-icefin-focus]');
            if (first) T.ctx.focus(first);
            root.setAttribute('data-lm-ready', '1');
        },
        unmount() { H = null; D.hintsOff(); },
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
            const row = f && f.closest && f.closest('.lm-hp-row');
            if (a === 'menu' && row && row.dataset.id) { H.startLift(row); return true; }
            // the grid: ▲ ▼ row to row in the same column, ◀ ▶ between Shown and Move
            if (row && (a === 'up' || a === 'down' || a === 'left' || a === 'right')) {
                const cells = [...row.querySelectorAll('[data-icefin-focus]')];
                const k = cells.indexOf(f);
                if (a === 'left' || a === 'right') { const n = cells[k + (a === 'right' ? 1 : -1)]; if (n) { ctx.focus(n); ctx.sound('focus'); } else ctx.sound('error'); return true; }
                let r = a === 'up' ? row.previousElementSibling : row.nextElementSibling;
                while (r && !r.querySelector('[data-icefin-focus]')) r = a === 'up' ? r.previousElementSibling : r.nextElementSibling;
                if (!r) { ctx.sound('error'); return true; }
                const cs = [...r.querySelectorAll('[data-icefin-focus]')];
                ctx.focus(cs[Math.min(k, cs.length - 1)]);
                H.keepInView(r);
                ctx.sound('focus');
                return true;
            }
            if (a === 'back') { T.ctx.sound('back'); if (history.length > 1) history.back(); else T.ctx.navigate('#/home'); return true; }
            return false;
        }
    });
})();
