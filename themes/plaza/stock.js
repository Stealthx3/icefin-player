// Plaza around jellyfin-web's own pages (PLAN 9.42): sign-in and servers, user preferences, profile, Quick Connect, now
// playing and lyrics, and any other page Plaza doesn't draw itself keep jellyfin-web's page and every function on it,
// framed like Plaza's menus: the name pill with the clock on top (tabs beside it where a page has siblings), the curved
// bar with round Back and Home at the bottom, the page between them restyled in styles.css ("jellyfin-web's own
// pages"). The server dashboard stays stock (the engine never frames it). Text fields get the on-screen keyboard.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const P = window.icefinPlaza;
    const ui = T.ui;
    const el = P.el;
    if (!ui.stockChrome) return;

    const SIGN_IN = new Set(['login', 'selectserver', 'addserver', 'forgotpassword', 'forgotpasswordpin', 'startup', 'connectlogin']);
    const PREFS = [['mypreferencesdisplay', 'Display'], ['mypreferenceshome', 'Home'], ['mypreferencesplayback', 'Playback'],
        ['mypreferencessubtitles', 'Subtitles'], ['mypreferencescontrols', 'Controls']];
    const PREF_ROUTES = new Set(PREFS.map((x) => x[0]));
    const MUSIC = [['queue', 'Now playing'], ['lyrics', 'Lyrics']];
    const NAMES = {
        login: 'Sign in', selectserver: 'Choose a server', addserver: 'Add a server', forgotpassword: 'Forgot password', forgotpasswordpin: 'Forgot password',
        userprofile: 'Profile', quickconnect: 'Quick Connect', queue: 'Music', lyrics: 'Music', mypreferencesmenu: 'Settings', details: 'Details',
        mypreferencesdisplay: 'Settings', mypreferenceshome: 'Settings', mypreferencesplayback: 'Settings', mypreferencessubtitles: 'Settings', mypreferencescontrols: 'Settings'
    };
    const KIND = (r) => (SIGN_IN.has(r) ? 'livetv' : r === 'queue' || r === 'lyrics' ? 'music' : PREF_ROUTES.has(r) || r === 'userprofile' || r === 'quickconnect' ? 'folder' : 'search');
    const HINTS = (r) => (SIGN_IN.has(r) ? 'Ⓐ Select · Ⓑ Back' : r === 'queue' || r === 'lyrics' ? 'Ⓐ Select · ▶ Play/Pause · Ⓑ Back' : PREF_ROUTES.has(r) ? 'Ⓐ Change · ◀▶ Choose · Ⓑ Back' : 'Ⓐ Select · Ⓑ Back');
    const routeName = (hash) => ((hash || '').split('?')[0].replace(/^#\//, '').replace(/\.html$/, '') || 'home');
    const query = (hash) => new URLSearchParams((hash || '').split('?')[1] || '');

    let C = null;  // the frame's parts while it is up
    ui.stockChrome.set({
        mount(host) {
            const frame = el('div', 'pz-sc');
            const name = el('div', 'pz-mname pz-sc-name');
            const nameText = el('span', 'pz-mname-text');
            const clock = el('span', 'pz-mclock');
            name.append(nameText, clock);
            const tabs = el('div', 'pz-tabs pz-sc-tabs');
            const head = el('div', 'pz-mhead pz-sc-head');
            // Play on and Watch together live in jellyfin-web's header, which Plaza replaces: they open from here.
            const extra = el('div', 'pz-sc-extra');
            const headerBtn = (label, re) => {
                const b = el('button', 'pz-tab pz-sc-extra-btn', label);
                b.type = 'button';
                b.tabIndex = -1;
                b.addEventListener('click', () => {
                    const t = [...document.querySelectorAll('.skinHeader button, header button')].find((x) => re.test(`${x.className} ${x.getAttribute('aria-label') || ''} ${x.getAttribute('title') || ''}`));
                    if (t) { T.ctx.sound('select'); t.click(); } else T.ctx.sound('error');
                });
                return b;
            };
            extra.append(headerBtn('Play on', /cast|play ?on/i), headerBtn('Watch together', /sync ?play/i));
            head.append(name);
            if (P.nowPill) P.nowPill(head);
            head.append(tabs, extra);
            const bar = el('div', 'pz-mbar pz-sc-bar');
            bar.innerHTML = '<svg class="pz-mbar-svg" viewBox="0 0 1920 210" preserveAspectRatio="none" aria-hidden="true"><path class="pz-bar-fill" d="M0 24 C480 6 1440 6 1920 24 V210 H0 Z"/><path class="pz-bar-shine" d="M0 32 C480 14 1440 14 1920 32"/><path class="pz-bar-line" d="M0 24 C480 6 1440 6 1920 24"/></svg>';
            const round = (cls, label) => { const b = el('button', 'pz-mround ' + cls, label); b.type = 'button'; b.setAttribute('aria-label', label); b.tabIndex = -1; return b; };
            const back = round('pz-mround-back', 'Back');
            const home = round('pz-mround-home', 'Home');
            const mid = el('div', 'pz-mmid');
            const focusLine = el('div', 'pz-mfocus');
            const hint = el('div', 'pz-mhints');
            const hintText = el('span', 'pz-mhint-keys');
            hint.append(hintText);
            mid.append(focusLine, hint);
            bar.append(back, mid, home);
            frame.append(head, bar);
            host.append(frame);
            let timer = 0;
            const tick = () => { if (!frame.isConnected) { clearInterval(timer); return; } clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
            C = { frame, nameText, tabs, back, home, extra, focusLine, hintText, info: null, tabsKey: '' };
            tick();
            timer = setInterval(tick, 15000);
            back.addEventListener('click', () => { T.ctx.sound('back'); if (C.info) C.info.back(); });
            home.addEventListener('click', () => { T.ctx.sound('navigate'); if (C.info) C.info.home(); });
            // The bar's centre line follows what has focus on the page.
            document.addEventListener('focusin', (e) => {
                if (!C || !C.info || !document.documentElement.hasAttribute('data-icefin-stock')) return;
                const t = e.target;
                if (!t || !t.closest || t.closest('#icefin-stock-chrome, #icefin-osk')) return;
                const lab = t.id && document.querySelector(`label[for="${t.id}"]`);
                const text = (lab && lab.textContent) || t.getAttribute('aria-label') || t.getAttribute('title') || (t.textContent || '').trim();
                C.focusLine.textContent = (text || '').replace(/\s+/g, ' ').slice(0, 80);
            });
        },
        update(info) {
            if (!C) return;
            if (!C.info || C.info.hash !== info.hash) C.focusLine.textContent = '';
            C.info = info;
            const r = routeName(info.hash);
            const signIn = SIGN_IN.has(r);
            C.frame.className = 'pz-sc pz-k-' + KIND(r);
            C.frame.setAttribute('data-pz-route', r);
            C.nameText.textContent = NAMES[r] || info.title || r.charAt(0).toUpperCase() + r.slice(1);
            C.home.hidden = signIn;  // no home before signing in
            C.extra.hidden = signIn;
            C.hintText.textContent = '';
            C.hintText.append(...P.hintNodes(HINTS(r)));
            // Sibling pages as tabs: the five preference pages, or now playing and lyrics.
            const set = PREF_ROUTES.has(r) ? PREFS : (r === 'queue' || r === 'lyrics') ? MUSIC : null;
            const key = set ? set.map((x) => x[0]).join() + ':' + r : '';
            if (key !== C.tabsKey) {
                C.tabsKey = key;
                C.tabs.textContent = '';
                if (set) {
                    const uid = query(info.hash).get('userId') || P.uid();
                    for (const [route, label] of set) {
                        const b = el('button', 'pz-tab' + (route === r ? ' pz-tab-on' : ''), label);
                        b.type = 'button';
                        b.tabIndex = -1;
                        b.setAttribute('data-pz-tab', route);
                        b.addEventListener('click', () => { T.ctx.sound('navigate'); location.hash = `#/${route}` + (PREF_ROUTES.has(route) ? `?userId=${uid}` : ''); });
                        C.tabs.append(b);
                    }
                }
            }
        }
    });

    // Text fields on jellyfin-web's pages (sign-in, profile, Quick Connect, dialogs) get the on-screen keyboard.
    ui.keyboard.enable();
})();
