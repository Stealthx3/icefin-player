// Media Center: profile, Quick Connect approve and forgotten passwords (PLAN 9.60; the canvas's Profile,
// QuickConnectApprove and QuickConnect boards, 9.46, approved). The page chrome is kit.js's; the left column holds the
// page's buttons, like the settings pages. Server calls go through the theme script API's client.
//   #/userprofile     the picture (change, remove; the initial when there is none) and the password
//   #/quickconnect    six code boxes: number keys fill them, ▲▼ step the focused digit (a pad has no number keys),
//                     ◀▶ move between them, Backspace or ◀ on an empty box goes back a digit; Approve
//   #/forgotpassword  the name, then what the server says to do (its PIN file, or ask an administrator)
(function () {
    'use strict';
    const T = window.icefinTheme;
    const M = window.icefinMediaCenter;
    if (!T || !M || !M.register) return;
    const el = M.el;
    const field = (label, type) => {
        const l = el('label', 'mc-sp-field mc-you-field');
        const i = M.focusable(el('input', 'mc-sp-input'));
        i.type = type || 'password';
        i.autocomplete = 'off';
        l.append(el('span', 'mc-sp-flabel', label), i);
        l.input = i;
        return l;
    };
    const page = (root, title, crumb) => {
        root.setAttribute('data-mc', 'you');
        const f = el('div', 'mc-field');
        f.append(el('div', 'mc-ribbon one'), el('div', 'mc-ribbon two'));
        root.append(f);
        const chrome = M.chrome(root, title);
        if (crumb) root.append(el('div', 'mc-you-crumb', crumb));
        const side = el('div', 'mc-you-side');
        const main = el('div', 'mc-you-main');
        root.append(side, main);
        return { chrome, side, main };
    };
    let P = null;

    // ---- profile ----
    M.register('#/userprofile', {
        async mount(root) {
            const c = M.client();
            const p = P = page(root, 'profile', 'settings › profile and password');
            let user = null;
            try { user = await c.getCurrentUser(); } catch (e) { user = null; }
            if (P !== p) return;
            if (!user) { p.main.append(el('div', 'mc-lib-empty', 'Your profile can’t be read right now.')); return; }
            const who = el('div', 'mc-you-who');
            const pic = el('div', 'mc-you-pic');
            const draw = () => {
                pic.textContent = '';
                pic.style.backgroundImage = user.PrimaryImageTag ? `url("${c.getUserImageUrl(user.Id, { type: 'Primary', tag: user.PrimaryImageTag, maxWidth: 400 })}")` : '';
                if (!user.PrimaryImageTag) pic.append(el('span', '', (user.Name || '?').trim().charAt(0).toUpperCase()));
            };
            draw();
            let server = '';
            try { const list = await T.ctx.servers(); const s = list.find((x) => x.current); server = s ? s.name : ''; } catch (e) { server = ''; }
            who.append(pic, el('div', 'mc-you-name', user.Name || ''), el('div', 'mc-you-sub', [server, user.LastLoginDate ? `last signed in ${new Date(user.LastLoginDate).toLocaleDateString()}` : ''].filter(Boolean).join(' · ')));
            const form = el('div', 'mc-you-form');
            const cur = field('Current password'), nw = field('New password'), again = field('New password again');
            if (!user.HasConfiguredPassword) cur.hidden = true;
            const msg = el('div', 'mc-note mc-you-msg', 'Leave the new password empty to sign in without one on this server. An administrator can also reset it from the server dashboard.');
            form.append(cur, nw, again, msg);
            p.main.append(who, form);
            const reload = async () => { try { user = await c.getCurrentUser(); draw(); } catch (e) { /* keep what shows */ } };
            const file = el('input');
            file.type = 'file';
            file.accept = 'image/*';
            file.hidden = true;
            file.addEventListener('change', async () => {
                const f = file.files && file.files[0];
                if (!f) return;
                try { await c.uploadUserImage(user.Id, 'Primary', f); await reload(); M.notice('Picture changed'); } catch (e) { M.notice('That didn’t work', true); }
                file.value = '';
            });
            root.append(file);
            const remove = M.button('Remove picture', () => {
                if (!user.PrimaryImageTag) { T.ctx.sound('error'); return; }
                M.band(root, { title: 'Remove your picture?', text: 'Your initial shows in its place.', choices: [{ label: 'Keep it', safe: true }, { label: 'Remove', run: async () => {
                    try { await c.deleteUserImage(user.Id, 'Primary'); await reload(); M.notice('Picture removed'); } catch (e) { M.notice('That didn’t work', true); }
                } }] });
            });
            const save = async () => {
                if (nw.input.value !== again.input.value) { msg.textContent = 'The new passwords don’t match.'; T.ctx.sound('error'); T.ctx.focus(again.input); return; }
                try {
                    await c.updateUserPassword(user.Id, cur.hidden ? '' : cur.input.value, nw.input.value);
                    for (const x of [cur, nw, again]) x.input.value = '';
                    msg.textContent = 'Password saved.';
                    M.notice('Password saved');
                } catch (e) {
                    msg.textContent = 'That password wasn’t accepted: check the current one.';
                    T.ctx.sound('error');
                    T.ctx.focus(cur.hidden ? nw.input : cur.input);
                }
            };
            p.side.append(M.button('Change picture', () => file.click()), remove, M.button('Save password', save), M.button('Quick Connect', () => T.ctx.navigate('#/quickconnect')),
                M.button('Cancel', () => history.back()));
            T.ctx.focus(p.side.querySelector('[data-icefin-focus]'));
            root.setAttribute('data-mc-ready', '1');
        },
        unmount() { if (P) P.chrome.stop(); P = null; }
    });

    // ---- Quick Connect approve ----
    const LEN = 6;
    M.register('#/quickconnect', {
        onAction(a, ctx) {
            const f = ctx.focused();
            if (!f || !f.classList.contains('mc-qc-box')) return false;
            const boxes = [...document.querySelectorAll('.mc-qc-box')];
            const k = boxes.indexOf(f);
            if (a === 'up' || a === 'down') {
                const v = f.textContent === '' ? (a === 'up' ? 0 : 9) : (Number(f.textContent) + (a === 'up' ? 1 : 9)) % 10;
                f.textContent = String(v);
                ctx.sound('navigate');
                return true;
            }
            if (a === 'left' && f.textContent === '' && k > 0) { boxes[k - 1].textContent = ''; ctx.focus(boxes[k - 1]); ctx.sound('back'); return true; }
            return false;
        },
        async mount(root) {
            const c = M.client();
            const p = P = page(root, 'quick connect', 'settings › quick connect');
            let user = null;
            try { user = await c.getCurrentUser(); } catch (e) { user = null; }
            let on = true;
            try { on = await c.ajax({ type: 'GET', url: c.getUrl('QuickConnect/Enabled'), dataType: 'json' }); } catch (e) { on = true; }
            if (P !== p) return;
            p.main.append(el('div', 'mc-you-head', `Sign in another device as ${(user && user.Name) || 'you'}`),
                el('div', 'mc-you-text', 'Enter the six-digit code shown on the other device. It signs in with your account; you can sign it out later from the server dashboard.'));
            if (on === false) { p.main.append(el('div', 'mc-lib-empty', 'Quick Connect is turned off on this server. An administrator can turn it on in the dashboard.')); p.side.append(M.button('Back', () => history.back())); T.ctx.focus(p.side.firstChild); return; }
            const row = el('div', 'mc-qc-row');
            const boxes = [];
            for (let k = 0; k < LEN; k++) {
                const b = M.focusable(el('div', 'mc-qc-box'));
                b.setAttribute('role', 'textbox');
                b.setAttribute('aria-label', `Digit ${k + 1}`);
                boxes.push(b);
                row.append(b);
                if (k === 2) row.append(el('span', 'mc-qc-gap'));
            }
            const msg = el('div', 'mc-note mc-you-msg', 'Number keys fill the boxes; ▲▼ change a digit; ◀ on an empty box goes back a digit.');
            p.main.append(row, msg);
            const code = () => boxes.map((b) => b.textContent).join('');
            const approve = async () => {
                if (code().length < LEN) { msg.textContent = `The code has ${LEN} digits.`; T.ctx.sound('error'); return; }
                try {
                    await c.ajax({ type: 'POST', url: c.getUrl('QuickConnect/Authorize', { Code: code(), UserId: c.getCurrentUserId() }) });
                    M.notice('Approved: the other device is signing in');
                    boxes.forEach((b) => { b.textContent = ''; });
                } catch (e) { msg.textContent = 'That code wasn’t accepted. Check it on the other device, or get a new one there.'; T.ctx.sound('error'); }
            };
            const go = M.button('Approve', approve);
            p.side.append(go, M.button('Cancel', () => history.back()));
            // number keys from a keyboard or a remote's number pad fill the focused box and move on
            const keys = (e) => {
                if (!root.isConnected) { window.removeEventListener('keydown', keys, true); return; }
                const f = T.ctx.focused();
                const k = boxes.indexOf(f);
                if (k < 0) return;
                if (/^[0-9]$/.test(e.key)) {
                    e.preventDefault();
                    f.textContent = e.key;
                    T.ctx.sound('select');
                    T.ctx.focus(k < LEN - 1 ? boxes[k + 1] : go);
                } else if (e.key === 'Backspace') {
                    e.preventDefault();
                    if (f.textContent) f.textContent = ''; else if (k > 0) { boxes[k - 1].textContent = ''; T.ctx.focus(boxes[k - 1]); }
                    T.ctx.sound('back');
                }
            };
            window.addEventListener('keydown', keys, true);
            T.ctx.focus(boxes[0]);
            root.setAttribute('data-mc-ready', '1');
        },
        unmount() { if (P) P.chrome.stop(); P = null; }
    });

    // ---- forgot password (signed out) ----
    M.register('#/forgotpassword', {
        beforeSignIn: true,
        mount(root) {
            const c = M.client();
            const p = P = page(root, 'forgot password');
            const name = field('Your name on this server', 'text');
            const msg = el('div', 'mc-note mc-you-msg', 'The server says what to do next: usually a PIN in a file on the server, or asking an administrator.');
            p.main.append(el('div', 'mc-you-head', 'Forgotten your password?'), name, msg);
            const send = async () => {
                const n = name.input.value.trim();
                if (!n) { T.ctx.sound('error'); T.ctx.focus(name.input); return; }
                try {
                    const r = await c.ajax({ type: 'POST', url: c.getUrl('Users/ForgotPassword'), data: JSON.stringify({ EnteredUsername: n }), contentType: 'application/json', dataType: 'json' });
                    msg.textContent = r && r.Action === 'PinCode' ? `A PIN was written on the server to ${r.PinFile || 'a file'}. Ask whoever runs the server for it, then sign in with it.`
                        : r && r.Action === 'InNetworkRequired' ? 'Try again from a device on the server’s own network.'
                            : 'Ask an administrator of this server to reset it.';
                    T.ctx.sound('select');
                } catch (e) { msg.textContent = 'That didn’t work. Check the name and try again.'; T.ctx.sound('error'); }
            };
            p.side.append(M.button('Send', send), M.button('Back to sign in', () => history.back()));
            T.ctx.focus(name.input);
            root.setAttribute('data-mc-ready', '1');
        },
        unmount() { if (P) P.chrome.stop(); P = null; }
    });
})();
