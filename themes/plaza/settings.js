// Plaza's settings (PLAN 9.44, the walk's mock-ups): the engine's settings area keeps every entry and function (Client
// settings, Classic View, Server Settings for administrators, the user's own profile and preferences; Client Settings'
// own page with every section); Plaza frames it like its menus, the name pill with the clock on top and the bar with
// round Back and Home at the bottom, shows the hub's entries as channels, and Client Settings' rows as Plaza rows with
// switches and pill drop-downs (styles.css, "Settings (9.44)").
(function () {
    'use strict';
    const T = window.icefinTheme;
    const P = window.icefinPlaza;
    if (!T || !T.ui || !T.ui.settings || !P) return;
    const el = P.el;
    const ICON = {
        gear: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" stroke-width="5"/><path d="M24 5v8M24 35v8M5 24h8M35 24h8M11 11l6 6M31 31l6 6M37 11l-6 6M17 31l-6 6" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>',
        classic: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="10" width="36" height="26" rx="5" fill="none" stroke="currentColor" stroke-width="4"/><path d="M14 19h20M14 27h12" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
        server: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="8" width="32" height="13" rx="4" fill="currentColor"/><rect x="8" y="27" width="32" height="13" rx="4" fill="currentColor" opacity=".75"/></svg>',
        you: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="16" r="9" fill="currentColor"/><path d="M7 42c2-10 9-15 17-15s15 5 17 15z" fill="currentColor"/></svg>'
    };
    const BAR = '<svg class="pz-mbar-svg" viewBox="0 0 1920 210" preserveAspectRatio="none" aria-hidden="true"><path class="pz-bar-fill" d="M0 24 C480 6 1440 6 1920 24 V210 H0 Z"/><path class="pz-bar-shine" d="M0 32 C480 14 1440 14 1920 32"/><path class="pz-bar-line" d="M0 24 C480 6 1440 6 1920 24"/></svg>';

    function decorate(root) {
        const s = root.querySelector('.icefin-settings');
        if (!s || s.hasAttribute('data-pz-framed')) return;
        s.setAttribute('data-pz-framed', '');
        const client = /[?&]pane=client\b/.test(location.hash);
        root.setAttribute('data-pz', 'settings');
        root.setAttribute('data-pz-pane', client ? 'client' : 'hub');
        s.classList.add(client ? 'pz-k-livetv' : 'pz-k-folder');
        // the head: the name pill with the clock
        const head = el('div', 'pz-mhead pz-s-head');
        const name = el('div', 'pz-mname');
        const clock = el('span', 'pz-mclock');
        name.append(el('span', 'pz-mname-text', client ? 'Client settings' : 'Settings'), clock);
        head.append(name);
        const now = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        clock.textContent = now();
        const timer = setInterval(() => { if (!clock.isConnected) { clearInterval(timer); return; } clock.textContent = now(); }, 15000);
        // the bar: Back and Home become the round buttons; the focused thing's name between them
        const bar = el('div', 'pz-mbar pz-s-bar');
        bar.innerHTML = BAR;
        const mid = el('div', 'pz-mmid');
        const focusLine = el('div', 'pz-mfocus');
        const hints = el('div', 'pz-mhints');
        const keys = el('span', 'pz-mhint-keys');
        keys.append(...P.hintNodes(client ? 'Ⓐ Change · ↑↓ Move · Ⓑ Back' : 'Ⓐ Open · Ⓑ Back'));
        hints.append(keys);
        mid.append(focusLine, hints);
        bar.append(mid);
        for (const b of s.querySelectorAll('.icefin-d-navbtn')) {
            const home = b.getAttribute('data-action') === 'home';
            b.classList.add('pz-mround', home ? 'pz-mround-home' : 'pz-mround-back');
            b.textContent = home ? 'Home' : 'Back';
            bar.append(b);
        }
        s.append(head, bar);
        root.addEventListener('icefin-focus', (e) => {
            const t = e.target;
            const label = (t.querySelector && (t.querySelector('.icefin-s-name') || null)) || t;
            const text = ((t.getAttribute && t.getAttribute('aria-label')) || label.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
            focusLine.textContent = text.charAt(0).toUpperCase() + text.slice(1);
        }, true);
        if (client) return;
        // the hub: its entries, and the user's own pages, as channels
        const entries = s.querySelector('.icefin-s-entries');
        if (!entries) return;
        const tiles = [...entries.querySelectorAll('.icefin-s-entry')];
        const look = (t) => {
            const n = (t.querySelector('.icefin-s-name') || t).textContent.toLowerCase();
            return n.includes('client') ? ['livetv', 'gear'] : n.includes('classic') ? ['photos', 'classic'] : n.includes('server') ? ['folder', 'server'] : ['tvshows', 'you'];
        };
        const profile = s.querySelector('[data-action="profile"]');
        if (profile) {
            profile.classList.add('icefin-s-entry');
            profile.textContent = '';
            profile.append(el('span', 'icefin-s-name', 'You'), el('span', 'icefin-s-desc', 'Profile, display, home, playback, subtitles, controls, Quick Connect'));
            entries.insertBefore(profile, tiles[1] || null);
            tiles.splice(1, 0, profile);
        }
        for (const t of tiles) {
            const [kind, icon] = look(t);
            t.classList.add('pz-s-tile', 'pz-k-' + kind);
            const i = el('span', 'pz-s-icon');
            i.innerHTML = ICON[icon];
            t.insertBefore(i, t.querySelector('.icefin-s-desc'));
        }
    }

    const base = T.ui.settings.screen({ layout: 'tiles' });
    T.registerScreen('#/mypreferencesmenu', {
        mount(root, ctx) {
            const r = base.mount.call(base, root, ctx);
            decorate(root);
            // the Client Settings page fills in a moment later
            Promise.resolve(r).then(() => decorate(root));
            return r;
        },
        onAction: (a, ctx) => (base.onAction ? base.onAction.call(base, a, ctx) : false),
        onBack: () => (base.onBack ? base.onBack.call(base) : false),
        unmount: () => (base.unmount ? base.unmount.call(base) : undefined)
    });
})();
