// Plaza's own sign-in and server choice (PLAN 9.44; the design canvas's SignIn, SelectServer and QuickConnectCode) on
// #/login, #/selectserver and #/addserver, on the engine's servers, connect, publicUsers, signIn and quickConnect
// (9.44). Without those calls (an older build) jellyfin-web's own pages stay, in Plaza's frame (stock.js).
//   Sign in: the server's listed people as round faces and "Someone else"; the chosen one's password (the on-screen
//     keyboard comes up in the field) and Sign in; Quick Connect when the server has it.
//   Choose a server: the servers this device knows as channels, "Add a server", empty slots; ≡ on one forgets it.
//   Quick Connect: the code to enter on a device already signed in, waiting for it; Cancel or Use a password.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const P = window.icefinPlaza;
    if (!T || !P || !P.frame || !T.ctx.signIn || !T.ctx.servers) return;
    const el = P.el;
    const ui = T.ui;
    const SERVER = '<svg viewBox="0 0 40 30" aria-hidden="true"><rect x="2" y="2" width="36" height="10" rx="3" fill="currentColor" opacity=".95"/><rect x="2" y="16" width="36" height="10" rx="3" fill="currentColor" opacity=".7"/></svg>';
    const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();

    function frameFor(root, name, hints) {
        const F = P.frame(root, { view: 'signin', kind: 'livetv', name, hints });
        F.home.hidden = true;   // nowhere to go home to before signing in
        return F;
    }

    // ---- sign in ----
    function login() {
        let F = null, qc = null;
        const S = {
            async mount(root) {
                ui.pointerFirst(true);
                F = frameFor(root, 'Sign in', 'Ⓐ Select · Ⓑ Back');
                const box = el('div', 'pz-si');
                const faces = el('div', 'pz-si-faces');
                const form = el('div', 'pz-si-form');
                box.append(faces, form);
                F.body.append(box);
                const users = await T.ctx.publicUsers();
                if (!F) return;
                const face = (u) => {
                    const f = P.focusable(el('div', 'pz-si-face'));
                    const pic = el('div', 'pz-si-pic');
                    if (u && u.image) P.bg(pic, u.image); else pic.textContent = u ? initial(u.name) : '+';
                    f.append(pic, el('div', 'pz-si-name', u ? u.name : 'Someone else'));
                    f.setAttribute('aria-label', u ? u.name : 'Someone else');
                    f.addEventListener('click', () => choose(u, f));
                    faces.append(f);
                    return f;
                };
                const first = users.map(face)[0];
                face(null);
                choose(users[0] || null, first || faces.lastChild, true);
            },
            onAction(a, ctx) { P.sawAction(); return false; },
            onBack() { if (qc) { qc.cancel(); qc = null; } T.ctx.navigate('#/selectserver'); return true; },
            unmount() { if (qc) qc.cancel(); qc = null; if (F) F.stop(); ui.pointerFirst(false); F = null; }
        };
        function choose(u, f, quiet) {
            const box = F.body.querySelector('.pz-si');
            const faces = box.querySelector('.pz-si-faces');
            const form = box.querySelector('.pz-si-form');
            for (const x of faces.children) x.classList.toggle('pz-si-on', x === f);
            form.textContent = '';
            const field = (label, type) => {
                const l = el('label', 'pz-field');
                const i = el('input', 'pz-input');
                i.type = type;
                P.focusable(i);
                l.append(el('span', 'pz-field-label', label), i);
                form.append(l);
                return i;
            };
            const name = u ? null : field('Name', 'text');
            const pass = field(u ? `Password for ${u.name}` : 'Password', 'password');
            const row = el('div', 'pz-si-row');
            const go = P.focusable(el('div', 'pz-tab pz-tab-on pz-si-go', 'Sign in'));
            const err = el('div', 'pz-si-error');
            row.append(go);
            form.append(row, err);
            const submit = async () => {
                const n = u ? u.name : name.value.trim();
                if (!n) { T.ctx.focus(name); T.ctx.sound('error'); return; }
                err.textContent = 'Signing in…';
                const r = await T.ctx.signIn(n, pass.value);
                if (!r.ok) { err.textContent = r.error || 'That didn’t work'; T.ctx.sound('error'); T.ctx.focus(pass); }
            };
            go.addEventListener('click', submit);
            for (const i of [name, pass].filter(Boolean)) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
            if (T.ctx.quickConnect) {
                const q = P.focusable(el('div', 'pz-tab pz-si-qc', 'Sign in with Quick Connect'));
                q.addEventListener('click', () => quickConnect());
                row.append(q);
            }
            F.focusText(u ? u.name : 'Someone else');
            if (!quiet || !u || u.hasPassword) T.ctx.focus(u && !u.hasPassword ? go : (name || pass));
            else T.ctx.focus(go);
        }
        async function quickConnect() {
            const start = await T.ctx.quickConnect();
            if (!F) return;
            if (!start) { if (P.toast) P.toast('This server has Quick Connect turned off', true); return; }
            qc = start;
            P.sheet.show({
                title: 'Quick Connect', kind: 'livetv',
                render(body) {
                    const code = el('div', 'pz-qc-code');
                    for (const ch of String(start.code)) code.append(el('span', 'pz-qc-digit', ch));
                    const wait = el('div', 'pz-qc-wait');
                    const tick = () => { const s = Math.max(0, Math.round((start.expires - Date.now()) / 1000)); wait.textContent = `Waiting for approval… ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} left`; };
                    tick();
                    const t = setInterval(() => { if (!wait.isConnected) { clearInterval(t); return; } tick(); }, 1000);
                    const f = el('div', 'pz-panel-foot');
                    const cancel = P.focusable(el('div', 'pz-tab pz-tab-on', 'Cancel'));
                    cancel.addEventListener('click', () => { start.cancel(); qc = null; P.sheet.close(); });
                    const pw = P.focusable(el('div', 'pz-tab', 'Use a password'));
                    pw.addEventListener('click', () => { start.cancel(); qc = null; P.sheet.close(); });
                    f.append(cancel, pw);
                    body.append(el('div', 'pz-sheet-question', 'Sign in from another device'),
                        el('div', 'pz-sheet-note', 'On a phone or computer already signed in, open your profile, choose Quick Connect and enter this code.'), code, wait, f);
                }
            });
            const r = await start.done;
            if (r.ok) { P.sheet.close(); return; }
            if (qc === start) { qc = null; P.sheet.close(); if (P.toast) P.toast('The code expired: try again', true); }
        }
        return S;
    }

    // ---- choose a server ----
    function servers(adding) {
        let F = null;
        const S = {
            async mount(root) {
                ui.pointerFirst(true);
                F = frameFor(root, 'Choose a server', 'Ⓐ Connect · ≡ Forget · Ⓑ Back');
                const grid = el('div', 'pz-sv-grid');
                F.body.append(grid);
                await draw(grid);
                if (adding) addServer();
            },
            onAction(a, ctx) {
                P.sawAction();
                const f = ctx.focused();
                if (a === 'menu' && f && f.pzServer) { forget(f.pzServer); return true; }
                return false;
            },
            onBack() { return false; },
            unmount() { if (F) F.stop(); ui.pointerFirst(false); F = null; }
        };
        async function draw(grid) {
            const list = await T.ctx.servers();
            if (!F) return;
            grid.textContent = '';
            for (const s of list) {
                const t = P.focusable(el('div', 'pz-sv-tile pz-sv-server' + (s.current ? ' pz-sv-current' : '')));
                t.pzServer = s;
                const icon = el('span', 'pz-sv-icon');
                icon.innerHTML = SERVER;
                t.append(icon, el('span', 'pz-sv-name', s.name || 'Server'), el('span', 'pz-sv-address', s.address.replace(/^https?:\/\//, '')));
                t.addEventListener('click', () => connect(s.id, s.name));
                t.addEventListener('icefin-focus', () => F.focusText(s.name));
                grid.append(t);
            }
            const add = P.focusable(el('div', 'pz-sv-tile pz-sv-add'));
            add.append(el('span', 'pz-sv-plus', '+'), el('span', 'pz-sv-address', 'Add a server'));
            add.addEventListener('click', () => addServer());
            add.addEventListener('icefin-focus', () => F.focusText('Add a server'));
            grid.append(add);
            for (let i = list.length + 1; i < 8; i++) grid.append(el('div', 'pz-sv-tile pz-sv-empty', 'icefin'));
            const first = grid.querySelector('.pz-sv-current') || grid.querySelector('[data-icefin-focus]');
            if (first) T.ctx.focus(first);
        }
        async function connect(id, name) {
            F.focusText(`Connecting to ${name || id}…`);
            const r = await T.ctx.connect(id);
            if (!F) return;
            if (r.state === 'Unavailable') { F.focusText(''); if (P.toast) P.toast(`${name || 'That server'} isn’t answering`, true); }
            else if (r.state === 'ServerUpdateNeeded') { F.focusText(''); if (P.toast) P.toast('That server needs an update first', true); }
        }
        function forget(s) {
            P.sheet.show({
                title: 'Forget a server', kind: 'livetv', danger: true,
                render(body) {
                    const f = el('div', 'pz-panel-foot');
                    const keep = P.focusable(el('div', 'pz-tab pz-tab-on', 'Keep it'));
                    keep.addEventListener('click', () => P.sheet.close());
                    const go = P.focusable(el('div', 'pz-tab', 'Forget'));
                    go.addEventListener('click', async () => { await T.ctx.forgetServer(s.id); P.sheet.close(); draw(F.body.querySelector('.pz-sv-grid')); });
                    f.append(keep, go);
                    body.append(el('div', 'pz-sheet-question', `Forget ${s.name}?`), el('div', 'pz-sheet-note', 'This device stops listing it and forgets its sign-in. The server itself is not touched.'), f);
                }
            });
        }
        function addServer() {
            P.sheet.show({
                title: 'Add a server', kind: 'livetv',
                render(body) {
                    const l = el('label', 'pz-field');
                    const i = el('input', 'pz-input');
                    i.type = 'url';
                    i.placeholder = 'https://jellyfin.example.com or 192.168.1.20:8096';
                    P.focusable(i);
                    l.append(el('span', 'pz-field-label', 'The server’s address'), i);
                    const f = el('div', 'pz-panel-foot');
                    const go = P.focusable(el('div', 'pz-tab pz-tab-on', 'Connect'));
                    go.addEventListener('click', async () => {
                        const a = i.value.trim();
                        if (!a) { T.ctx.focus(i); T.ctx.sound('error'); return; }
                        P.sheet.close();
                        connect(a, a);
                    });
                    const no = P.focusable(el('div', 'pz-tab', 'Cancel'));
                    no.addEventListener('click', () => P.sheet.close());
                    f.append(go, no);
                    body.append(l, f);
                }
            });
        }
        return S;
    }

    const wrap = (make) => ({ mount(r, c) { return (this.s = make()).mount(r, c); }, onAction(a, c) { return this.s.onAction(a, c); },
        onBack() { return this.s.onBack(); }, unmount() { if (this.s) this.s.unmount(); this.s = null; } });
    T.registerScreen('#/login', wrap(login));
    T.registerScreen('#/selectserver', wrap(() => servers(false)));
    T.registerScreen('#/addserver', wrap(() => servers(true)));
})();
