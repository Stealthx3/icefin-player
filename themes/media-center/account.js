// Media Center: connecting and signing in (PLAN 9.46), from the design canvas's "connect to a server", "choose a
// server", "who's watching, and the password" and "Quick Connect" boards, on the theme API's account calls (9.44:
// ctx.servers, connect, forgetServer, publicUsers, signIn, quickConnect). The screens mount before anyone is signed in
// (beforeSignIn). Forgotten passwords stay jellyfin-web's page, framed and restyled.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    if (!T || !M || typeof T.ctx.servers !== 'function') return;
    const { el, focusable } = M;
    const ago = (t) => {
        if (!t) return '';
        const d = Math.round((Date.now() - t) / 86400000);
        return d <= 0 ? 'last used today' : d === 1 ? 'last used yesterday' : `last used ${d} days ago`;
    };

    function page(root, title, kind) {
        root.setAttribute('data-mc', kind);
        const field = el('div', 'mc-field');
        field.append(el('div', 'mc-ribbon one'), el('div', 'mc-ribbon two'));
        root.append(field);
        // Before sign-in there is no Home: Back only. Signed in (choose a server from settings), Home stays.
        const chrome = M.chrome(root, title);
        const c = T.ctx.apiClient();
        let signedIn = false;
        try { signedIn = !!(c && c.getCurrentUserId()); } catch (e) { /* not signed in */ }
        if (!signedIn) chrome.home.remove();
        return chrome;
    }
    function button(label, fn, cls) {
        const b = focusable(el('button', 'mc-btn' + (cls ? ' ' + cls : ''), label));
        b.type = 'button';
        b.addEventListener('click', () => { T.ctx.sound('select'); fn(b); });
        return b;
    }
    function field(label, type, id) {
        const wrap = el('div', 'mc-acc-field');
        const l = el('label', 'mc-search-label', label);
        const i = focusable(el('input', 'mc-search-input'));
        i.type = type;
        i.id = id;
        i.setAttribute('autocomplete', 'off');
        l.htmlFor = id;
        wrap.append(l, i);
        return { wrap, input: i };
    }
    const status = (box, text, bad) => { box.textContent = text || ''; box.classList.toggle('bad', !!bad); };

    // ---- choose a server ----
    let A = null;
    T.registerScreen('#/selectserver', {
        beforeSignIn: true,
        async mount(root) {
            const chrome = page(root, 'choose a server', 'servers');
            const col = el('div', 'mc-acc-col');
            const list = el('div', 'mc-acc-list');
            const note = el('div', 'mc-note');
            root.append(col, list);
            A = { root, chrome };
            let current = null;
            col.append(button('Add a server', () => T.ctx.navigate('#/addserver')),
                button('Forget this server', async () => {
                    if (!current) return;
                    const host = document.getElementById('icefin-theme-root');
                    await M.band(host, { title: `Forget ${current.name}?`, text: 'Its saved sign-in on this device goes too. The server itself is not changed.',
                        choices: [{ label: 'Forget it', run: async () => { await T.ctx.forgetServer(current.id); draw(); } }, { label: 'Keep it', safe: true }] });
                }), note);
            async function draw() {
                list.textContent = '';
                const servers = (await T.ctx.servers()) || [];
                if (!A || A.root !== root) return;
                if (!servers.length) { list.append(el('div', 'mc-lib-empty', 'No servers yet. Add one with its address.')); T.ctx.focus(col.firstChild); return; }
                for (const s of servers) {
                    const r = focusable(el('div', 'mc-acc-server'));
                    r.append(el('b', '', s.name || s.address), el('span', '', [s.signedIn ? 'signed in' : 'not signed in', ago(s.lastUsed)].filter(Boolean).join(' · ')));
                    r.addEventListener('icefin-focus', () => { current = s; });
                    r.addEventListener('click', async () => {
                        T.ctx.sound('select');
                        status(note, `Connecting to ${s.name || s.address}…`);
                        const res = await T.ctx.connect(s.id);
                        if (res && res.state === 'Unavailable') status(note, `${s.name || s.address} isn't reachable right now.`, true);
                        else if (res && res.state === 'ServerUpdateNeeded') status(note, 'That server needs an update before Icefin can use it.', true);
                    });
                    list.append(r);
                }
                T.ctx.focus(list.firstChild);
            }
            await draw();
            root.setAttribute('data-mc-ready', '1');
        },
        unmount() { if (A) A.chrome.stop(); A = null; }
    });

    // ---- add (connect to) a server ----
    T.registerScreen('#/addserver', {
        beforeSignIn: true,
        mount(root) {
            const chrome = page(root, 'connect to a server', 'addserver');
            const col = el('div', 'mc-acc-col');
            const right = el('div', 'mc-acc-right');
            const f = field('Server address', 'url', 'mc-acc-address');
            f.input.placeholder = 'https://media.example:8920';
            const note = el('div', 'mc-note', 'A name or address; the port can be left off.');
            right.append(f.wrap, note);
            const go = async () => {
                const a = f.input.value.trim();
                if (!a) { status(note, 'Type the server\'s address first.', true); return; }
                status(note, 'Connecting…');
                const res = await T.ctx.connect(a);
                if (!res || res.state === 'Unavailable') status(note, 'Nothing answered at that address. Check it, and that the server is running.', true);
                else if (res.state === 'ServerUpdateNeeded') status(note, 'That server needs an update before Icefin can use it.', true);
            };
            f.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
            col.append(button('Connect', go), button('Choose a known server', () => T.ctx.navigate('#/selectserver')));
            root.append(col, right);
            A = { root, chrome };
            T.ctx.focus(f.input);
            root.setAttribute('data-mc-ready', '1');
        },
        unmount() { if (A) A.chrome.stop(); A = null; }
    });

    // ---- who's watching, and the password; Quick Connect ----
    let L = null;
    T.registerScreen('#/login', {
        beforeSignIn: true,
        onBack() {
            if (M.band.open) { M.band.open.close(); return true; }
            return false;
        },
        onAction(action, ctx) {
            if (M.band.open && ['up', 'down', 'left', 'right'].includes(action)) { ctx.move(action, M.band.open.el); return true; }
            return false;
        },
        async mount(root) {
            const chrome = page(root, "who's watching?", 'login');
            const users = el('div', 'mc-acc-users');
            const col = el('div', 'mc-acc-col mc-acc-low');
            const right = el('div', 'mc-acc-right mc-acc-low');
            const name = field('Name', 'text', 'mc-acc-name');
            const pw = field('Password', 'password', 'mc-acc-pw');
            const note = el('div', 'mc-note');
            right.append(name.wrap, pw.wrap, note);
            root.append(users, col, right);
            L = { root, chrome, qc: null };
            const signIn = async () => {
                status(note, 'Signing in…');
                const r = await T.ctx.signIn(name.input.value.trim(), pw.input.value);
                if (!r || !r.ok) status(note, (r && r.error) || 'That name and password didn\'t work.', true);
            };
            for (const i of [name.input, pw.input]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); signIn(); } });
            col.append(button('Sign in', signIn), button('Use Quick Connect', async () => {
                const qc = await T.ctx.quickConnect();
                if (!qc) { status(note, 'Quick Connect is off on this server.', true); return; }
                L.qc = qc;
                const host = document.getElementById('icefin-theme-root');
                const shown = M.band(host, { title: 'Sign in with Quick Connect',
                    text: `On a phone or computer already signed in, open Settings, then Quick Connect, and enter ${String(qc.code).replace(/(\d{3})(\d{3})/, '$1 $2')}.`,
                    note: 'Waiting for approval…', choices: [{ label: 'Use a password', safe: true }] });
                shown.then(() => { if (L && L.qc) { L.qc.cancel(); L.qc = null; } });
                const done = await qc.done;
                if (done && !done.ok && L) status(note, 'Quick Connect stopped. Try again, or use a password.', true);
            }), button('Forgot password', () => T.ctx.navigate('#/forgotpassword')), button('Another server', () => T.ctx.navigate('#/selectserver')));
            const list = (await T.ctx.publicUsers()) || [];
            if (!L || L.root !== root) return;
            const pick = (u, tile) => {
                users.querySelectorAll('.mc-acc-user').forEach((x) => x.classList.toggle('on', x === tile));
                name.input.value = u ? u.name : '';
                name.wrap.hidden = !!u;
                pw.wrap.hidden = !!(u && !u.hasPassword);
                pw.input.value = '';
                if (u && !u.hasPassword) signIn(); else T.ctx.focus(u ? pw.input : name.input);
            };
            for (const u of list) {
                const t = focusable(el('div', 'mc-acc-user'));
                const face = el('div', 'mc-acc-face');
                if (u.image) face.style.backgroundImage = `url("${u.image}")`; else face.textContent = (u.name || '?').charAt(0).toUpperCase();
                t.append(face, el('div', 'mc-acc-uname', u.name));
                t.addEventListener('click', () => { T.ctx.sound('select'); pick(u, t); });
                users.append(t);
            }
            const other = focusable(el('div', 'mc-acc-user'));
            const face = el('div', 'mc-acc-face mc-acc-plus', '+');
            other.append(face, el('div', 'mc-acc-uname', 'someone else'));
            other.addEventListener('click', () => { T.ctx.sound('select'); pick(null, other); });
            users.append(other);
            if (list.length) { name.wrap.hidden = true; T.ctx.focus(users.firstChild); } else pick(null, other);
            root.setAttribute('data-mc-ready', String(list.length));
        },
        unmount() { if (L) { if (L.qc) L.qc.cancel(); L.chrome.stop(); } L = null; }
    });
})();
