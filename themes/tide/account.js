// Tide: the account and sign-in (PLAN 9.48; the canvas's Profile, QuickConnect, SignIn and Servers boards).
//   #/userprofile     you in the trail (picture or initials), your account's entries at the fixed point; fields in the panel
//   #/quickconnect    six character slots a pad fills without the keyboard (▲ ▼ through 0–9 and A–Z, ◀ ▶ move), or typed
//   #/forgotpassword  the name, then what the server says to do
//   #/login, #/selectserver, #/addserver   only when Tide is the signed-out theme: a cross bar of Users and Servers
//     (the engine's publicUsers, signIn, quickConnect, servers, connect and forgetServer)
(function () {
    'use strict';
    const T = window.icefinTheme;
    const D = window.icefinTide;
    if (!T || !D || !D.columns) return;
    const ui = T.ui;
    const el = D.el;
    const ctx = T.ctx;
    const fail = (e) => { console.error('tide: account', e); D.notice('That didn’t work', true); };
    const leave = () => { ctx.sound('back'); if (history.length > 1) history.back(); else ctx.navigate('#/home'); };

    // ---- profile ----
    async function profileEntries(C) {
        const c = D.client();
        const user = await c.getCurrentUser();
        const has = !!user.PrimaryImageTag;
        const reload = () => { C.S.stack[0] = profileRoot(); D.memory.delete(C.S.key); C.redraw(); };
        const pickFile = () => {
            const f = el('input');
            f.type = 'file';
            f.accept = 'image/*';
            f.addEventListener('change', async () => { const file = f.files && f.files[0]; if (!file) return; try { await c.uploadUserImage(user.Id, 'Primary', file); D.notice('Picture changed'); reload(); } catch (e) { fail(e); } });
            f.click();
        };
        const out = [
            { name: has ? 'Change the picture' : 'Add a picture', sub: 'from a file on this computer', icon: 'photos', shape: 'icon', go: pickFile },
            { name: 'Password', sub: user.HasConfiguredPassword ? 'change it' : 'none yet: set one', icon: 'key', shape: 'icon', focusFirst: true, go: () => D.panel.show({
                title: 'Change password', path: user.Name,
                render(body) {
                    const cur = D.field('Current password', '', { type: 'password', autocomplete: 'current-password' });
                    const nw = D.field('New password', '', { type: 'password', autocomplete: 'new-password' });
                    const again = D.field('Again', '', { type: 'password', autocomplete: 'new-password' });
                    if (!user.HasConfiguredPassword) cur.hidden = true;
                    body.append(cur, nw, again, D.foot(D.button('Save', async () => {
                        if (nw.input.value !== again.input.value) { D.notice('The new passwords don’t match', true); ctx.focus(again.input); return; }
                        try { await c.updateUserPassword(user.Id, cur.hidden ? '' : cur.input.value, nw.input.value); D.panel.close(); D.notice('Password changed'); } catch (e) { D.notice('That didn’t work: check the current password', true); }
                    }, true), D.button('Cancel', () => D.panel.close())));
                }
            }) },
            { name: 'Quick Connect', sub: 'sign in another device', icon: 'quick', shape: 'icon', go: () => ctx.navigate('#/quickconnect') },
            { name: 'Sign out', icon: 'signout', shape: 'icon', go: () => D.panel.ask({ title: 'Sign out?', path: user.Name, choices: [{ label: 'Stay signed in', safe: true }, { label: 'Sign out', run: () => ctx.signOut() }] }) }
        ];
        if (has) out.splice(1, 0, { name: 'Remove the picture', icon: 'photos', shape: 'icon', go: () => D.panel.ask({ title: 'Remove your picture?', path: user.Name, choices: [{ label: 'Keep it', safe: true }, { label: 'Remove', danger: true, run: async () => { try { await c.deleteUserImage(user.Id, 'Primary'); D.notice('Picture removed'); reload(); } catch (e) { fail(e); } } }] }) });
        return out;
    }
    const profileRoot = () => {
        const lv = { title: 'Profile', icon: 'person', count: false, round: true };
        lv.load = async () => {
            const c = D.client();
            const user = await c.getCurrentUser();
            lv.title = user.Name;
            lv.art = user.PrimaryImageTag ? c.getUserImageUrl(user.Id, { tag: user.PrimaryImageTag, type: 'Primary', maxWidth: 240 }) : '';
            lv.initials = user.PrimaryImageTag ? null : user.Name;
            return profileEntries(D.currentColumn);
        };
        return lv;
    };
    D.columnScreen('#/userprofile', { name: 'profile', key: () => '#/userprofile', fresh: true, selfInTrail: true, root: profileRoot });

    // ---- Quick Connect (QuickConnect board) ----
    const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let Q = null;
    D.register('#/quickconnect', {
        async mount(root) {
            root.setAttribute('data-td-screen', 'quickconnect');
            const me = Q = { root, at: 0, code: ['', '', '', '', '', ''] };
            me.wave = D.ground(root);
            me.clock = D.clock(root);
            D.pointerNav(root);
            const box = el('div', 'td-qc');
            box.append(el('div', 'td-qc-path', 'Profile › Quick Connect'), el('div', 'td-qc-title', 'Sign in another device'),
                el('div', 'td-qc-text', 'Choose Quick Connect on the other device, then enter the six characters it shows.'));
            const slots = D.focusable(el('div', 'td-qc-slots'));
            slots.setAttribute('role', 'group');
            slots.setAttribute('aria-label', 'The code: ▲ ▼ change a character, ◀ ▶ move, or type');
            me.slotEls = [];
            for (let i = 0; i < 6; i++) { const s = el('span', 'td-qc-slot'); me.slotEls.push(s); slots.append(s); }
            const typed = el('input', 'td-qc-typed');
            typed.setAttribute('aria-hidden', 'true');
            typed.maxLength = 6;
            const row = el('div', 'td-qc-buttons');
            me.approve = D.button('Approve', () => approve(), true);
            row.append(me.approve, D.button('Cancel', leave));
            const note = el('div', 'td-qc-note');
            me.note = note;
            box.append(slots, typed, row, el('div', 'td-qc-hint', '▲ ▼ change a character · ◀ ▶ move · or type'), note);
            root.append(box);
            me.slots = slots;
            const draw = () => { me.slotEls.forEach((s, i) => { s.textContent = me.code[i]; s.classList.toggle('at', i === me.at); }); me.approve.disabled = me.code.join('').length !== 6; me.approve.classList.toggle('td-btn-off', me.approve.disabled); };
            me.draw = draw;
            // a keyboard types the code (digits and letters), Backspace deletes
            root.addEventListener('keydown', (e) => {
                if (e.key.length === 1 && /[0-9a-z]/i.test(e.key)) { me.code[me.at] = e.key.toUpperCase(); me.at = Math.min(5, me.at + 1); draw(); ctx.sound('focus'); e.preventDefault(); }
                else if (e.key === 'Backspace' && document.activeElement === slots) { me.at = Math.max(0, me.code[me.at] ? me.at : me.at - 1); me.code[me.at] = ''; draw(); ctx.sound('back'); e.preventDefault(); e.stopPropagation(); }
            });
            draw();
            ctx.focus(slots);
            D.hints([['▲ ▼', 'character'], ['◀ ▶', 'move'], ['OK', 'approve'], ['Back', '']]);
            const c = D.client();
            let on = true;
            try { on = await c.ajax({ type: 'GET', url: c.getUrl('QuickConnect/Enabled'), dataType: 'json' }); } catch (e) { on = true; }
            if (Q === me && on === false) { note.textContent = 'Quick Connect is off on this server. An administrator can turn it on in the dashboard.'; me.approve.disabled = true; }
            async function approve() {
                const code = me.code.join('');
                if (code.length !== 6) { ctx.sound('error'); return; }
                try {
                    await c.ajax({ type: 'POST', url: c.getUrl('QuickConnect/Authorize', { Code: code, UserId: c.getCurrentUserId() }) });
                    note.textContent = 'Signed in on the other device.';
                    D.notice('Approved: the other device is signed in');
                } catch (e) { note.textContent = 'That code didn’t work: check it on the other device.'; ctx.sound('error'); }
            }
            me.approveNow = approve;
        },
        unmount() { if (Q) { Q.wave.stop(); Q.clock.stop(); } Q = null; D.hintsOff(); },
        onAction(a, c2) {
            if (!Q) return false;
            D.sawAction(a);
            const onSlots = c2.focused() === Q.slots;
            if (onSlots && (a === 'up' || a === 'down')) {
                const cur = Q.code[Q.at] || (a === 'up' ? CHARS[CHARS.length - 1] : CHARS[0]);
                const i = CHARS.indexOf(cur);
                Q.code[Q.at] = Q.code[Q.at] ? CHARS[(i + (a === 'up' ? 1 : -1) + CHARS.length) % CHARS.length] : CHARS[0];
                Q.draw(); ctx.sound('focus'); return true;
            }
            if (onSlots && (a === 'left' || a === 'right')) {
                const n = Q.at + (a === 'right' ? 1 : -1);
                if (n < 0 || n > 5) { if (a === 'right') { ctx.focus(Q.approve); return true; } ctx.sound('error'); return true; }
                Q.at = n; Q.draw(); ctx.sound('navigate'); return true;
            }
            if (onSlots && (a === 'enter' || a === 'select')) { if (Q.code.join('').length === 6) Q.approveNow(); else { Q.at = Math.min(5, Q.at + 1); Q.draw(); } return true; }
            if (onSlots && (a === 'down')) { ctx.focus(Q.approve); return true; }
            if (a === 'back') { leave(); return true; }
            return false;
        }
    });

    // ---- forgot password ----
    let F = null;
    D.register('#/forgotpassword', {
        beforeSignIn: true,
        mount(root) {
            root.setAttribute('data-td-screen', 'forgot');
            const me = F = { root };
            me.wave = D.ground(root);
            me.clock = D.clock(root);
            const box = el('div', 'td-qc');
            box.append(el('div', 'td-qc-path', 'Sign in › Forgot password'), el('div', 'td-qc-title', 'Forgot your password?'),
                el('div', 'td-qc-text', 'Enter your name. The server says what to do next.'));
            const name = D.field('Your name', D.params().get('name') || '');
            const note = el('div', 'td-qc-note');
            box.append(name, D.foot(D.button('Continue', async () => {
                const n = name.input.value.trim();
                if (!n) { ctx.sound('error'); ctx.focus(name.input); return; }
                const c = D.client();
                try {
                    const r = await c.ajax({ type: 'POST', url: c.getUrl('Users/ForgotPassword'), data: JSON.stringify({ EnteredUsername: n }), contentType: 'application/json', dataType: 'json' });
                    note.textContent = r && r.Action === 'PinCode' ? `The server wrote a PIN to a file it keeps${r.PinFile ? ` (${r.PinFile})` : ''}. Ask whoever runs it for the PIN.` : 'Ask the server’s administrator to reset it.';
                } catch (e) { note.textContent = 'Ask the server’s administrator to reset it.'; }
            }, true), D.button('Back', leave)), note);
            root.append(box);
            ctx.focus(name.input);
        },
        unmount() { if (F) { F.wave.stop(); F.clock.stop(); } F = null; },
        onAction(a) { if (a === 'back') { leave(); return true; } return false; }
    });

    // ---- sign-in: Users and Servers (SignIn, Servers boards) ----
    function signInWith(name, hasPassword) {
        if (!hasPassword && name) { doSignIn(name, ''); return; }
        D.panel.show({
            title: name ? `Sign in as ${name}` : 'Another user', path: D.serverName || '',
            render(body) {
                const n = D.field('Name', name || '', { autocomplete: 'username' });
                const p = D.field('Password', '', { type: 'password', autocomplete: 'current-password' });
                if (name) n.hidden = true;
                body.append(n, p, D.foot(D.button('Sign in', () => doSignIn(n.input.value.trim(), p.input.value), true), D.button('Forgot password', () => { D.panel.close(); ctx.navigate(`#/forgotpassword?name=${encodeURIComponent(n.input.value.trim())}`); })));
                setTimeout(() => { const f = name ? p.input : n.input; ctx.focus(f); if (ui.keyboard) ui.keyboard.open(f); }, 280);
                p.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSignIn(n.input.value.trim(), p.input.value); } });
            }
        });
    }
    async function doSignIn(name, pass) {
        if (!name) { ctx.sound('error'); return; }
        const r = await ctx.signIn(name, pass);
        if (r && r.ok) { D.panel.close(); return; }
        D.notice(r && r.error ? r.error : 'That name and password didn’t work', true);
    }
    async function quickConnectIn() {
        let q = null;
        try { q = await ctx.quickConnect(); } catch (e) { q = null; }
        if (!q) { D.notice('Quick Connect is off on this server', true); return; }
        D.panel.show({
            title: 'Quick Connect', path: 'Sign in',
            render(body) {
                body.append(D.note('On a device where you’re signed in, open Quick Connect and enter:'), el('div', 'td-qc-show', q.code), D.note('This screen signs in by itself once it’s approved.'),
                    D.foot(D.button('Cancel', () => { q.cancel(); D.panel.close(); }, true)));
            }
        });
        q.done.then((r) => { if (!(r && r.ok)) D.notice('Quick Connect didn’t finish', true); });
    }
    const usersCat = () => ({
        label: 'Users', icon: 'people', count: false,
        async load() {
            let users = [];
            try { users = await ctx.publicUsers(); } catch (e) { users = []; }
            const out = users.map((u) => ({ name: u.name, sub: u.hasPassword ? 'OK, then the password' : 'OK to sign in', shape: 'round', art: u.image || '', initials: u.image ? null : u.name, icon: 'person', go: () => signInWith(u.name, u.hasPassword) }));
            out.push({ name: 'Another user', sub: 'type a name', icon: 'add', shape: 'icon', go: () => signInWith('', true) });
            out.push({ name: 'Quick Connect', sub: 'sign in from another device', icon: 'quick', shape: 'icon', go: quickConnectIn });
            return out;
        }
    });
    const addServer = (C) => D.panel.show({
        title: 'Add a server', path: 'Servers',
        render(body) {
            const a = D.field('Address', '', { placeholder: 'https://[address]:8096', type: 'url' });
            body.append(a, D.foot(D.button('Connect', () => connect(a.input.value.trim(), C), true), D.button('Cancel', () => D.panel.close())));
            setTimeout(() => { ctx.focus(a.input); if (ui.keyboard) ui.keyboard.open(a.input); }, 280);
        }
    });
    async function connect(idOrAddress, C) {
        if (!idOrAddress) { ctx.sound('error'); return; }
        let r = null;
        try { r = await ctx.connect(idOrAddress); } catch (e) { r = null; }
        D.panel.close();
        if (!r) { D.notice('That server didn’t answer', true); return; }
        if (r.state === 'Unavailable') D.notice('That server didn’t answer', true);
        else if (r.state === 'ServerUpdateNeeded') D.notice('That server needs updating first', true);
    }
    const serversCat = () => ({
        label: 'Servers', icon: 'server', count: false,
        async load(C) {
            let list = [];
            try { list = await ctx.servers(); } catch (e) { list = []; }
            const out = list.map((s) => ({
                name: s.name, sub: [s.current ? '● this one' : '', s.address, s.lastUsed ? `last used ${new Date(s.lastUsed).toLocaleDateString()}` : ''].filter(Boolean).join(' · '),
                icon: 'server', shape: 'icon', okLabel: 'connect', go: () => connect(s.id, C),
                menu: () => D.panel.ask({ title: `Forget ${s.name}?`, path: 'Servers', text: 'Icefin forgets its address and your sign-in there.', choices: [{ label: 'Keep it', safe: true }, { label: 'Forget it', danger: true, run: async () => { await ctx.forgetServer(s.id); if (D.currentColumn) D.currentColumn.reload(); } }] })
            }));
            out.push({ name: 'Add a server', sub: 'type its address', icon: 'add', shape: 'icon', go: () => addServer(C) });
            return out;
        }
    });
    function signInScreen(at) {
        let C = null;
        return {
            beforeSignIn: true,
            mount(root) {
                C = D.columns(root, { name: 'signin', key: '#/signin', fresh: true, leave: false, root: { bar: [usersCat(), serversCat()], at } });
                if (location.hash.startsWith('#/addserver')) setTimeout(() => addServer(C), 400);
            },
            unmount() { if (C) C.stop(); C = null; },
            onAction(a) { D.sawAction(a); return C ? C.onAction(a) : false; },
            onBack() { return C ? C.onAction('back') : false; }
        };
    }
    T.registerScreen('#/login', signInScreen(0));
    T.registerScreen('#/selectserver', signInScreen(1));
    T.registerScreen('#/addserver', signInScreen(1));
})();
