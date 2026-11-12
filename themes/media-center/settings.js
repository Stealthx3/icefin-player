// Media Center: settings (PLAN 9.46), from the design canvas's "settings", "playback settings", "Client Settings",
// "theme settings", "subtitle settings", "profile" and "approve Quick Connect" boards.
//
//   - the hub (#/mypreferencesmenu): one list of everything, the focused entry described at the right. It keeps every
//     entry the engine's own hub has (Client settings, Classic View, Server Settings for administrators, the user's
//     preferences), as docs/themes/PACKAGE.md asks of a theme's own hub;
//   - This device (?pane=client): the engine's themed Client Settings page (ui.settings.screen), in Media Center's
//     chrome: its sections as a list at the left, the rows at the right with ‹ value › spinners (left and right step a
//     value), ticks, and a row's help under it while it has focus;
//   - the account pages (playback, subtitles, display, start screen, controls, profile, Quick Connect) stay
//     jellyfin-web's own pages, which keep saving where jellyfin-web keeps them, laid out as the boards: the page's
//     buttons in a column at the left with Cancel, the rows at the right with the same spinners.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    if (!T || !M || !T.ui || !T.ui.settings) return;
    const { el, focusable } = M;
    const uid = () => { const c = M.client(); return c ? c.getCurrentUserId() : ''; };
    const params = () => new URLSearchParams(location.hash.split('?')[1] || '');
    const go = (hash) => T.ctx.navigate(hash);
    const pref = (route) => () => go(`#/${route}?userId=${uid()}`);

    // ---- spinners: ‹ value › around a drop-down; a step picks the next enabled option and tells the page ----
    function step(select, dir) {
        const opts = [...select.options];
        let i = select.selectedIndex;
        for (let n = 0; n < opts.length; n++) {
            i += dir;
            if (i < 0 || i >= opts.length) return false;
            if (!opts[i].disabled && !opts[i].hidden) break;
        }
        if (i < 0 || i >= opts.length || i === select.selectedIndex) return false;
        select.selectedIndex = i;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        T.ctx.sound('focus');
        return true;
    }
    // asButtons: real buttons (jellyfin-web's pages, where its own focus navigation reaches them); otherwise marks the
    // pointer can press, while the remote's left and right step the focused drop-down itself.
    function spinner(select, asButtons) {
        if (select.hasAttribute('data-mc-spin') || select.multiple) return;
        select.setAttribute('data-mc-spin', '');
        const anchor = select.closest('.icefin-dd') || select;
        const mark = (dir, text) => {
            const b = el(asButtons ? 'button' : 'span', 'mc-spin mc-spin-' + (dir < 0 ? 'prev' : 'next'), text);
            if (asButtons) { b.type = 'button'; b.setAttribute('aria-label', dir < 0 ? 'Previous value' : 'Next value'); } else b.setAttribute('aria-hidden', 'true');
            b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); step(select, dir); });
            return b;
        };
        anchor.before(mark(-1, '‹'));
        anchor.after(mark(1, '›'));
        (anchor.parentElement || anchor).classList.add('mc-spin-row');
    }

    // ---- the hub ----
    const ENTRIES = [
        { id: 'client', name: 'This device (Client Settings)', device: true, go: () => go('#/mypreferencesmenu?pane=client'),
            text: "This player's own settings: the renderer and HDR, audio output and its test, the player's subtitles, controllers, the window." },
        { id: 'theme', name: 'Theme', device: true, go: () => go('#/mypreferencesmenu?pane=client&section=theme'),
            text: 'The look of the whole interface: the theme, its colours, its sounds, and whether it follows your account to other devices.' },
        { id: 'playback', name: 'Playback', go: pref('mypreferencesplayback'),
            text: 'Audio language and channels, quality on your home network and away from it, the next episode, cinema mode.' },
        { id: 'subtitles', name: 'Subtitles', go: pref('mypreferencessubtitles'),
            text: 'The subtitle language and when subtitles show. How they look on this player is under This device.' },
        { id: 'display', name: 'Display', go: pref('mypreferencesdisplay'),
            text: 'Language, dates and times, library pages, backdrops, theme songs and videos, episode pictures.' },
        { id: 'home', name: 'Start screen', go: pref('mypreferenceshome'),
            text: 'Which rows the classic home shows, in which order, and what each library shows on it.' },
        { id: 'controls', name: 'Controls', go: pref('mypreferencescontrols'),
            text: 'Gamepad input in the web client. Controllers on this player are under This device.' },
        { sep: true },
        { id: 'profile', name: 'Profile and password', go: pref('userprofile'),
            text: 'Your picture and your password on this server.' },
        { id: 'quickconnect', name: 'Quick Connect', go: () => go('#/quickconnect'),
            text: 'Sign in another device with the six-digit code it shows, without typing a password there.' },
        { sep: true },
        { id: 'classic', name: 'Classic view', device: true, go: () => T.ui.settings.classic(),
            text: 'The plain web client, now, for this session. Media Center comes back at the next start, or from This device, Theme.' },
        { id: 'server', name: 'Server dashboard', admin: true, go: () => go('#/dashboard'),
            text: "The server's own administration pages, unchanged: libraries, users, playback, plugins and the rest." },
        { id: 'signout', name: 'Sign out or switch server', go: () => signOut(),
            text: 'Sign out of this server, or choose another one. Your settings stay where they are.' }
    ];
    function signOut() {
        const host = document.getElementById('icefin-theme-root');
        M.band(host, { title: 'Sign out?', text: 'You can sign out of this server, or keep this sign-in and choose another server.',
            choices: [{ label: 'Sign out', run: () => T.ctx.signOut() }, { label: 'Switch server', run: () => T.ctx.selectServer() }, { label: 'Cancel', safe: true }] });
    }

    let H = null;
    async function hub(root) {
        root.setAttribute('data-mc', 'settings');
        const chrome = M.chrome(root, 'settings');
        const list = el('div', 'mc-set-list');
        const about = el('div', 'mc-set-about');
        const aName = el('div', 'mc-set-about-name');
        const aText = el('div', 'mc-set-about-text');
        const aNote = el('div', 'mc-set-about-note');
        about.append(aName, aText, aNote);
        const foot = el('div', 'mc-set-foot', 'Server dashboard opens the server\'s own administration pages, unchanged, for administrators. Classic view shows the plain web client until you come back.');
        root.append(list, about, foot);
        H = { root, chrome };
        const brand = await M.brand();
        let admin = false;
        try { const u = await M.client().getCurrentUser(); admin = !!(u && u.Policy && u.Policy.IsAdministrator); } catch (e) { /* not signed in */ }
        if (!H || H.root !== root) return;
        const server = brand.name || 'this server';
        for (const e of ENTRIES) {
            if (e.sep) { list.append(el('div', 'mc-set-sep')); continue; }
            if (e.admin && !admin) continue;
            if (e.id === 'classic' && !T.ui.settings.classic) continue;
            const r = focusable(el('div', 'mc-li mc-set-entry', e.name));
            r.dataset.entry = e.id;
            r.addEventListener('icefin-focus', () => {
                aName.textContent = e.name.replace(/ \(.*\)$/, '');
                aText.textContent = e.text;
                aNote.textContent = e.device ? 'Saved on this device only.' : e.admin || e.id === 'signout' ? '' : `Saved with your account on ${server}, so they follow you to other devices.`;
            });
            r.addEventListener('click', () => { T.ctx.sound('select'); e.go(); });
            list.append(r);
        }
        const back = params().get('from');
        T.ctx.focus(list.querySelector(`[data-entry="${back}"]`) || list.querySelector('.mc-set-entry'));
        root.setAttribute('data-icefin-settings-ready', String(list.querySelectorAll('.mc-set-entry').length));
    }

    // ---- This device: the engine's Client Settings page in Media Center's chrome ----
    const engine = T.ui.settings.screen({ layout: 'list' });
    let C = null;
    async function client(root, ctx) {
        root.setAttribute('data-mc', 'client');
        const section = (params().get('section') || '').toLowerCase();
        const chrome = M.chrome(root, section === 'theme' ? 'theme' : 'this device', { back: () => go('#/mypreferencesmenu?from=' + (section === 'theme' ? 'theme' : 'client')) });
        root.append(el('div', 'mc-crumb', section === 'theme' ? 'settings › this device › theme' : 'settings › this device · changes apply at once'));
        C = { root, chrome, obs: null };
        await engine.mount(root, ctx);
        if (!C || C.root !== root) return;
        const host = root.querySelector('.icefin-cs-host');
        const rail = root.querySelector('.icefin-cs-rail');
        const decorate = () => { if (host) host.querySelectorAll('select').forEach((s) => spinner(s, false)); };
        decorate();
        if (host) { C.obs = new MutationObserver(decorate); C.obs.observe(host, { childList: true, subtree: true }); }
        if (section && rail) {
            const b = [...rail.children].find((x) => (x.dataset.section || '').toLowerCase() === section);
            if (b) b.click();
        }
    }

    T.registerScreen('#/mypreferencesmenu', {
        onAction(action, ctx) {
            if (M.band.open && ['up', 'down', 'left', 'right'].includes(action)) { ctx.move(action, M.band.open.el); return true; }
            if (C && (action === 'left' || action === 'right')) {
                const f = ctx.focused();
                if (f && f.tagName === 'SELECT' && f.hasAttribute('data-mc-spin')) { step(f, action === 'left' ? -1 : 1); return true; }
            }
            return C ? engine.onAction(action, ctx) : false;
        },
        onBack() {
            if (M.band.open) { M.band.open.close(); return true; }
            if (C) return engine.onBack();
            return false;
        },
        mount(root, ctx) { return params().get('pane') === 'client' ? client(root, ctx) : hub(root); },
        unmount() {
            if (H) H.chrome.stop();
            if (C) { C.chrome.stop(); if (C.obs) C.obs.disconnect(); engine.unmount(); }
            H = C = null;
        }
    });

    // ---- jellyfin-web's account pages, laid out as the boards ----
    const PAGES = { mypreferencesplayback: 'playback', mypreferencessubtitles: 'subtitles', mypreferencesdisplay: 'display', mypreferenceshome: 'start screen',
        mypreferencescontrols: 'controls', userprofile: 'profile and password', quickconnect: 'quick connect' };
    const ENTRY_OF = { mypreferencesplayback: 'playback', mypreferencessubtitles: 'subtitles', mypreferencesdisplay: 'display', mypreferenceshome: 'home',
        mypreferencescontrols: 'controls', userprofile: 'profile', quickconnect: 'quickconnect' };
    let seq = 0;
    function adapt(info) {
        const route = (info.route || '').replace(/^#\//, '').replace(/\.html$/, '');
        if (!PAGES[route]) return;
        const page = [...document.querySelectorAll('.page.userPreferencesPage')].find((p) => !p.classList.contains('hide') && p.getClientRects().length);
        if (!page) return;
        if (!page.hasAttribute('data-mc-form')) {
            page.setAttribute('data-mc-form', route);
            page.prepend(el('div', 'mc-crumb', 'settings › ' + PAGES[route]));
            const col = el('div', 'mc-form-col');
            // The page's own buttons (Save, Save Password, Add Image, Authorize) move to the column and keep their
            // handlers; a submit button names its form, so it still submits it from outside.
            for (const b of page.querySelectorAll('.button-submit, .btnSave')) {
                if (col.contains(b) || !b.getClientRects().length) continue;
                const form = b.closest('form');
                if (form) { if (!form.id) form.id = `mc-form-${++seq}`; b.setAttribute('form', form.id); }
                b.classList.remove('block');
                col.append(b);
            }
            const cancel = el('button', 'raised mc-form-cancel', 'Cancel');
            cancel.type = 'button';
            cancel.addEventListener('click', () => go('#/mypreferencesmenu?from=' + ENTRY_OF[route]));
            col.append(cancel);
            page.prepend(col);
        }
        page.querySelectorAll('.selectContainer select').forEach((s) => spinner(s, true));
    }
    M.stockHooks.push(adapt);
})();
