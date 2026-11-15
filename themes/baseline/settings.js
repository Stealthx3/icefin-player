// Baseline: settings, the profile, Quick Connect and signing in, as stock's TV layout draws them.
//   #/mypreferencesmenu: stock's list under the user's name (Profile, Quick Connect, Display, Home, Playback,
//     Subtitles, Client Settings, Controls), Administration for administrators, then User (Select Server, Sign Out,
//     Exit Application). Client Settings (?pane=client) is the engine's: Icefin's own sections, in stock's look.
//   #/userprofile: the picture with Add Image, the password fields and Save. #/quickconnect: the user, the code, Authorize.
//   Signed out (when Baseline is the signed-out theme): #/selectserver (server cards, Add Server), #/addserver,
//   #/login (the users' cards, then the manual form, Quick Connect, Forgot Password), #/forgotpassword.
//   The preference pages themselves stay jellyfin-web's own pages: they are stock already (D31's control).
(function () {
    'use strict';
    const T = window.icefinTheme;
    const B = window.icefinBaseline;
    if (!T || !B || !B.panel) return;
    const ui = T.ui;
    const ctx = T.ctx;
    const el = B.el;
    const c = () => B.client();

    const link = (icon, label, go) => { const a = B.btn('bl-hub-item', null); a.append(B.icon(icon, 'bl-hub-ic'), el('span', 'bl-hub-text', label)); a.addEventListener('click', () => { ctx.sound('select'); go(); }); return a; };
    const field = (label, type, value) => { const f = B.field(label, value || '', { type: type || 'text' }); return f; };
    const raisedBlock = (label, go, cls) => { const b = B.btn('bl-raised block' + (cls ? ` ${cls}` : ''), label); b.addEventListener('click', () => { ctx.sound('select'); go(); }); return b; };

    // ---- the settings hub ----
    let H = null;
    const engineSettings = ui.settings ? ui.settings.screen({ layout: 'list' }) : null;
    B.register('#/mypreferencesmenu', {
        async mount(root, cx) {
            // Client Settings: jellyfin-web's own dialog (stock's), which the engine hosts in a page with Icefin's sections;
            // Baseline gives that page its header and drops the engine's own Back, Home, title and section rail.
            if (B.params().get('pane') && engineSettings) {
                const me = H = { engine: true };
                root.classList.add('bl-screen', 'bl-client-settings');
                const p = engineSettings.mount(root, cx);
                B.header(root, { title: 'Client Settings' });
                await p;
                if (H === me) { B.arrive(root, root.querySelector('.icefin-cs-host [data-icefin-focus], .icefin-cs-host input, .icefin-cs-host select')); root.setAttribute('data-bl-ready', '1'); }
                return;
            }
            const me = H = { root };
            const page = B.page(root, 'bl-hub');
            B.header(root, { title: 'Settings' });
            root.setAttribute('data-bl-screen', 'settings');
            let user = null;
            try { user = await c().getCurrentUser(); } catch (e) { user = null; }
            if (H !== me) return;
            const q = `?userId=${B.uid()}`;
            const box = el('div', 'bl-hub-box');
            box.append(el('h2', 'bl-hub-title', user ? user.Name : ''));
            box.append(link('person', 'Profile', () => B.go(`#/userprofile${q}`)), link('devices', 'Quick Connect', () => B.go(`#/quickconnect${q}`)),
                link('tv', 'Display', () => B.go(`#/mypreferencesdisplay${q}`)), link('home', 'Home', () => B.go(`#/mypreferenceshome${q}`)),
                link('play_circle_filled', 'Playback', () => B.go(`#/mypreferencesplayback${q}`)), link('closed_caption', 'Subtitles', () => B.go(`#/mypreferencessubtitles${q}`)),
                link('devices_other', 'Client Settings', () => B.go('#/mypreferencesmenu?pane=client')), link('keyboard', 'Controls', () => B.go(`#/mypreferencescontrols${q}`)));
            if (user && user.Policy && user.Policy.IsAdministrator) {
                box.append(el('h2', 'bl-hub-title', 'Administration'), link('dashboard', 'Dashboard', () => B.go('#/dashboard')), link('mode_edit', 'Metadata Manager', () => B.go('#/metadata')));
            }
            box.append(el('h2', 'bl-hub-title', 'User'), link('storage', 'Select Server', () => ctx.selectServer()),
                link('exit_to_app', 'Sign Out', () => B.panel.ask({ title: 'Sign Out', text: 'Are you sure you want to sign out?', choices: [{ label: 'Cancel', safe: true }, { label: 'Sign Out', run: () => B.farewell(() => ctx.signOut()) }] })),
                link('close', 'Exit Application', () => B.exitAsk && B.exitAsk()));
            page.append(box);
            B.arrive(root, box.querySelector('.bl-hub-item'));
            root.setAttribute('data-bl-ready', '1');
        },
        first: true,
        unmount() { if (H && H.engine && engineSettings) engineSettings.unmount(); H = null; B.hintsOff(); },
        onAction(a, cx) { if (H && H.engine && engineSettings && engineSettings.onAction) return engineSettings.onAction(a, cx); return false; },
        onBack(cx) { if (H && H.engine && engineSettings && engineSettings.onBack) return engineSettings.onBack(cx); return false; }
    });

    // ---- the profile ----
    let P = null;
    B.register('#/userprofile', {
        async mount(root) {
            const me = P = { root };
            const page = B.page(root, 'bl-form-page');
            let user = null;
            try { user = await c().getCurrentUser(); } catch (e) { user = null; }
            if (P !== me || !user) return;
            B.header(root, { title: user.Name });
            root.setAttribute('data-bl-screen', 'profile');
            const head = el('div', 'bl-profile-head');
            const pic = el('div', 'bl-profile-pic');
            if (user.PrimaryImageTag) pic.style.backgroundImage = `url("${c().getUserImageUrl(user.Id, { tag: user.PrimaryImageTag, type: 'Primary', maxWidth: 240 })}")`; else pic.append(B.icon('person'));
            const right = el('div', 'bl-profile-right');
            right.append(el('h2', 'bl-profile-name', user.Name), raisedBlock('Add Image', () => B.notice('Choose the picture on another device: Profile › Add Image'), 'inline'));
            head.append(pic, right);
            const cur = field('Current password', 'password'), nw = field('New password', 'password'), conf = field('New password confirm', 'password');
            const form = el('div', 'bl-form');
            form.append(cur, nw, conf, raisedBlock('Save', async () => {
                if (nw.input.value !== conf.input.value) { B.notice('Passwords do not match.', true); return; }
                try { await c().updateUserPassword(user.Id, cur.input.value, nw.input.value); B.notice('Password saved.'); cur.input.value = nw.input.value = conf.input.value = ''; } catch (e) { B.notice('That didn’t work', true); }
            }, 'submit'));
            page.append(head, form);
            B.arrive(root, cur.input);
            root.setAttribute('data-bl-ready', '1');
        },
        unmount() { P = null; B.hintsOff(); }
    });

    // ---- Quick Connect ----
    let Q = null;
    B.register('#/quickconnect', {
        async mount(root) {
            const me = Q = { root };
            const page = B.page(root, 'bl-form-page');
            B.header(root, { title: 'Quick Connect' });
            root.setAttribute('data-bl-screen', 'quickconnect');
            let user = null;
            try { user = await c().getCurrentUser(); } catch (e) { user = null; }
            if (Q !== me) return;
            const form = el('div', 'bl-form');
            form.append(el('h2', 'bl-form-title', 'Quick Connect'), el('p', 'bl-form-text', 'To sign in with Quick Connect, select the ‘Quick Connect’ button on the device you are logging in from and enter the displayed code below.'));
            const u = B.btn('bl-selectbox', user ? user.Name : '');
            u.append(B.icon('keyboard_arrow_down', 'bl-select-arrow'));
            const ul = el('label', 'bl-field'); ul.append(el('span', 'bl-field-label', 'User'), u);
            const code = field('Quick Connect code', 'text');
            form.append(ul, code, raisedBlock('Authorize', async () => {
                const v = code.input.value.trim();
                if (!v) { ctx.sound('error'); return; }
                try { await c().ajax({ type: 'POST', url: c().getUrl('QuickConnect/Authorize', { Code: v, UserId: B.uid() }) }); B.notice('Successfully authenticated!'); code.input.value = ''; } catch (e) { B.notice('Unknown or expired Quick Connect code.', true); }
            }));
            page.append(form);
            B.arrive(root, u);
            root.setAttribute('data-bl-ready', '1');
        },
        unmount() { Q = null; B.hintsOff(); }
    });

    // ---- signing in (when Baseline is the signed-out theme) ----
    const signedOut = (path, build) => {
        let S = null;
        B.register(path, {
            beforeSignIn: true,
            async mount(root) {
                const me = S = { root };
                const page = B.page(root, 'bl-form-page bl-signin');
                const h = B.header(root, { home: false });
                h.querySelector('.bl-header-right').hidden = true;
                const hb = h.querySelectorAll('.bl-header-left .bl-hbtn'); if (hb[1]) hb[1].hidden = true;  // no Home before signing in
                const logo = el('div', 'bl-logo small'); logo.style.backgroundImage = `url("${B.mark()}")`;
                h.querySelector('.bl-header-left').append(logo);
                root.setAttribute('data-bl-screen', path.slice(2));
                await build(page, () => S === me);
                if (S === me) { B.arrive(root, page.querySelector('[data-icefin-focus]')); root.setAttribute('data-bl-ready', '1'); }
            },
            unmount() { S = null; B.hintsOff(); }
        });
    };
    signedOut('#/selectserver', async (page, alive) => {
        let list = [];
        try { list = await ctx.servers(); } catch (e) { list = []; }
        if (!alive()) return;
        const box = el('div', 'bl-centered');
        box.append(el('h1', 'bl-centered-title', 'Select Server'));
        const g = el('div', 'bl-inner-row centered');
        for (const s of list) { const card = B.card({ Id: s.id, Name: s.name, Type: 'Server', ImageTags: {} }, { row: false, shape: 'square', lines: [s.name], go: async () => { let r = null; try { r = await ctx.connect(s.id); } catch (e) { r = null; } if (!r || r.ok === false) B.notice('We’re unable to connect to the selected server right now.', true); } }); card.classList.add('bl-server-card'); card.querySelector('.bl-card-img').textContent = ''; card.querySelector('.bl-card-img').append(B.icon('dns', 'bl-card-icon')); g.append(card); }
        box.append(g, raisedBlock('Add Server', () => B.go('#/addserver'), 'inline'));
        page.append(box);
    });
    signedOut('#/addserver', async (page) => {
        const form = el('div', 'bl-form');
        const host = field('Host');
        form.append(el('h1', 'bl-form-title big', 'Connect to Server'), host, el('p', 'bl-field-desc', 'Example: http://192.168.1.100:8096 or https://myserver.com'),
            raisedBlock('Connect', async () => { let r = null; try { r = await ctx.connect(host.input.value.trim()); } catch (e) { r = null; } if (!r || r.ok === false) B.notice('We’re unable to connect to the selected server right now.', true); }, 'submit'),
            raisedBlock('Cancel', () => history.back()));
        page.append(form);
    });
    signedOut('#/login', async (page, alive) => {
        let users = [];
        try { users = await ctx.publicUsers(); } catch (e) { users = []; }
        B.branding = null;  // this server's own splash screen and disclaimer (the user's branding call)
        const brand = B.client() ? await B.loadBranding().catch(() => null) : null;
        if (!alive()) return;
        if (brand && brand.splash) { const root = page.closest('.bl-screen') || page; root.style.backgroundImage = `linear-gradient(rgba(0,0,0,.6), rgba(0,0,0,.6)), url("${brand.splash}")`; root.classList.add('bl-splash'); }
        const form = el('div', 'bl-form');
        const user = field('User'), pass = field('Password', 'password');
        const doSignIn = async (n, p) => { let r = null; try { r = await ctx.signIn(n, p); } catch (e) { r = null; } if (!r || !r.ok) B.notice('Invalid username or password.', true); };
        if (users.length) {
            const g = el('div', 'bl-inner-row centered');
            for (const u of users) g.append(B.card({ Id: u.Id, Name: u.Name, Type: 'Person', ImageTags: u.PrimaryImageTag ? { Primary: u.PrimaryImageTag } : {} }, { row: false, shape: 'square', lines: [u.Name],
                art: u.PrimaryImageTag ? c().getUserImageUrl(u.Id, { tag: u.PrimaryImageTag, type: 'Primary', maxWidth: 240 }) : null,
                go: () => { if (!u.HasPassword) doSignIn(u.Name, ''); else { user.input.value = u.Name; ctx.focus(pass.input); } } }));
            form.append(el('h1', 'bl-centered-title', 'Please sign in'), g);
        } else form.append(el('h1', 'bl-centered-title', 'Please sign in'));
        const remember = B.toggle('Remember Me', true, () => {});
        form.append(user, pass, remember, raisedBlock('Sign In', () => doSignIn(user.input.value.trim(), pass.input.value), 'submit'),
            raisedBlock('Use Quick Connect', async () => { let q = null; try { q = await ctx.quickConnect(); } catch (e) { q = null; } if (!q) { B.notice('Quick Connect is not available on this server.', true); return; }
                B.panel.show({ title: 'Quick Connect', path: 'Sign in', render(b) { b.append(B.note('On a device where you are signed in, open Quick Connect and enter:'), el('div', 'bl-qc-code', q.code || ''), B.foot(B.button('Cancel', () => { if (q.cancel) q.cancel(); B.panel.close(); }))); } }); }),
            raisedBlock('Forgot Password', () => B.go('#/forgotpassword')), raisedBlock('Change Server', () => B.go('#/selectserver')));
        if (brand && brand.disclaimer) form.append(el('p', 'bl-disclaimer', brand.disclaimer));
        page.append(form);
    });
    signedOut('#/forgotpassword', async (page) => {
        const form = el('div', 'bl-form');
        const user = field('User');
        form.append(el('h1', 'bl-form-title big', 'Forgot Password'), user, el('p', 'bl-field-desc', 'Enter your username, if you remember it.'),
            raisedBlock('Submit', async () => { try { const r = await c().ajax({ type: 'POST', url: c().getUrl('Users/ForgotPassword'), data: JSON.stringify({ EnteredUsername: user.input.value }), contentType: 'application/json', dataType: 'json' }); B.notice(r && r.Action === 'ContactAdmin' ? 'Please contact your server administrator to reset your password.' : 'Follow the instructions on the server.'); } catch (e) { B.notice('That didn’t work', true); } }, 'submit'),
            raisedBlock('Cancel', () => history.back()));
        page.append(form);
    });
})();
