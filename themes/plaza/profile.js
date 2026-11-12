// Plaza's own profile and Quick Connect approve (PLAN 9.44; the design canvas's Profile and QuickConnectApprove) on
// #/userprofile and #/quickconnect, through the signed-in server's own API (picture, password, Quick Connect).
//   Profile: the picture (or the name's initial) with Change picture and Remove picture; the name, the server and when
//     it was last used; the password (current, new, new again) with Save password; Quick Connect.
//   Quick Connect: the code from the other device in six boxes, typed on a number pad (or the keyboard's digits),
//     Ⓧ deletes the last digit, Approve signs that device in as this person.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const P = window.icefinPlaza;
    if (!T || !P || !P.frame) return;
    const el = P.el;
    const ui = T.ui;
    const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();
    const DAY = 86400000;
    const lastSeen = (iso) => {
        const t = Date.parse(iso || '');
        if (!t) return '';
        const d = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / DAY);
        return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? `${d} days ago` : new Date(t).toLocaleDateString();
    };

    function field(form, label, type) {
        const l = el('label', 'pz-field');
        const i = P.focusable(el('input', 'pz-input'));
        i.type = type;
        l.append(el('span', 'pz-field-label', label), i);
        form.append(l);
        return i;
    }
    const pill = (cls, label, go) => { const b = P.focusable(el('div', 'pz-tab ' + cls, label)); b.setAttribute('aria-label', label); b.addEventListener('click', go); return b; };

    // ---- profile ----
    function profile() {
        let F = null, user = null, pic = null;
        const S = {
            async mount(root) {
                ui.pointerFirst(true);
                F = P.frame(root, { view: 'profile', kind: 'folder', name: 'Profile', hints: 'Ⓐ Choose · Ⓑ Back' });
                const c = P.client();
                const box = el('div', 'pz-pf');
                const side = el('div', 'pz-pf-side');
                pic = el('div', 'pz-pf-pic');
                const file = el('input');
                file.type = 'file';
                file.accept = 'image/*';
                file.hidden = true;
                const change = pill('pz-pf-btn', 'Change picture', () => file.click());
                const remove = pill('pz-pf-btn', 'Remove picture', () => removePicture());
                file.addEventListener('change', async () => {
                    const f = file.files && file.files[0];
                    file.value = '';
                    if (!f) return;
                    try { await c.uploadUserImage(user.Id, 'Primary', f); await reload(); if (P.toast) P.toast('Picture changed'); }
                    catch (e) { if (P.toast) P.toast('That picture didn’t upload', true); }
                });
                side.append(pic, change, remove, file);
                const main = el('div', 'pz-pf-main');
                const name = el('div', 'pz-pf-name');
                const where = el('div', 'pz-pf-where');
                const form = el('div', 'pz-pf-form');
                const cur = field(form, 'Current password', 'password');
                const nw = field(form, 'New password', 'password');
                const again = field(form, 'New password again', 'password');
                const row = el('div', 'pz-si-row');
                const err = el('div', 'pz-si-error');
                row.append(pill('pz-pf-save', 'Save password', () => save(cur, nw, again, err)), pill('pz-pf-qc', 'Quick Connect', () => T.ctx.navigate('#/quickconnect')));
                form.append(row, err);
                main.append(name, where, form);
                box.append(side, main);
                F.body.append(box);
                for (const b of box.querySelectorAll('[data-icefin-focus]')) b.addEventListener('icefin-focus', () => F.focusText(b.getAttribute('aria-label') || b.closest('.pz-field')?.querySelector('.pz-field-label')?.textContent || ''));
                T.ctx.focus(change);
                F.focusText('Change picture');
                await reload();
                if (!F) return;
                name.textContent = user ? user.Name : '';
                let server = '';
                try { const list = await T.ctx.servers(); const s = list.find((x) => x.current); server = s ? s.name : ''; } catch (e) { server = ''; }
                const seen = user ? lastSeen(user.LastActivityDate) : '';
                where.textContent = [server && `Signed in to ${server}`, seen && `last seen ${seen}`].filter(Boolean).join(' · ');
                // someone without a password can't be asked for the current one
                if (user && !user.HasConfiguredPassword) cur.closest('.pz-field').hidden = true;
            },
            onAction(a, ctx) { P.sawAction(); return P.common ? P.common(a, ctx) : false; },
            onBack() { P.goBack(); return true; },
            unmount() { if (F) F.stop(); ui.pointerFirst(false); F = null; }
        };
        async function reload() {
            const c = P.client();
            try { user = await c.getCurrentUser(false); } catch (e) { try { user = await c.getUser(c.getCurrentUserId()); } catch (e2) { user = null; } }
            if (!F || !pic) return;
            pic.textContent = '';
            pic.style.backgroundImage = '';
            const has = user && user.PrimaryImageTag;
            if (has) P.bg(pic, c.getUserImageUrl(user.Id, { type: 'Primary', tag: user.PrimaryImageTag, height: 440 }));
            else pic.textContent = initial(user && user.Name);
            const remove = F.body.querySelectorAll('.pz-pf-btn')[1];
            if (remove) remove.classList.toggle('pz-off', !has);
        }
        function removePicture() {
            if (!user || !user.PrimaryImageTag) { T.ctx.sound('error'); return; }
            P.sheet.show({
                title: 'Remove picture', kind: 'folder', danger: true,
                render(body) {
                    const f = el('div', 'pz-panel-foot');
                    const keep = P.focusable(el('div', 'pz-tab pz-tab-on', 'Keep it'));
                    keep.addEventListener('click', () => P.sheet.close());
                    const go = P.focusable(el('div', 'pz-tab', 'Remove'));
                    go.addEventListener('click', async () => {
                        P.sheet.close();
                        try { await P.client().deleteUserImage(user.Id, 'Primary'); await reload(); if (P.toast) P.toast('Picture removed'); }
                        catch (e) { if (P.toast) P.toast('That didn’t work', true); }
                    });
                    f.append(keep, go);
                    body.append(el('div', 'pz-sheet-question', 'Remove your picture?'), el('div', 'pz-sheet-note', 'Your initial shows in its place.'), f);
                }
            });
        }
        async function save(cur, nw, again, err) {
            if (nw.value !== again.value) { err.textContent = 'The new passwords don’t match'; T.ctx.sound('error'); T.ctx.focus(again); return; }
            err.textContent = 'Saving…';
            try {
                await P.client().updateUserPassword(user.Id, cur.closest('.pz-field').hidden ? '' : cur.value, nw.value);
                err.textContent = '';
                cur.value = nw.value = again.value = '';
                if (P.toast) P.toast('Password saved');
                await reload();
            } catch (e) {
                err.textContent = 'That didn’t work: check the current password';
                T.ctx.sound('error');
                T.ctx.focus(cur.closest('.pz-field').hidden ? nw : cur);
            }
        }
        return S;
    }

    // ---- Quick Connect: approve another device ----
    function approve() {
        let F = null, code = '', boxes = [], go = null, onKey = null;
        const LEN = 6;
        const S = {
            async mount(root) {
                ui.pointerFirst(true);
                F = P.frame(root, { view: 'quickconnect', kind: 'folder', name: 'Quick Connect', hints: 'Ⓐ Enter · Ⓧ Delete · Ⓑ Back' });
                const c = P.client();
                const box = el('div', 'pz-qa');
                const left = el('div', 'pz-qa-left');
                const note = el('div', 'pz-qa-note', 'Enter the code shown on the other device to sign it in.');
                const digits = el('div', 'pz-qa-digits');
                boxes = Array.from({ length: LEN }, () => digits.appendChild(el('span', 'pz-qa-digit')));
                go = pill('pz-qa-go', 'Approve', () => submit());
                const msg = el('div', 'pz-si-error pz-qa-msg');
                left.append(el('div', 'pz-qa-title', 'Approve a sign-in'), note, digits, go, msg);
                const pad = el('div', 'pz-qa-pad');
                for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']) {
                    if (!k) { pad.append(el('span', 'pz-qa-gap')); continue; }
                    const b = P.focusable(el('div', 'pz-qa-key' + (k === 'del' ? ' pz-qa-del' : ''), k === 'del' ? 'Delete' : k));
                    b.setAttribute('aria-label', k === 'del' ? 'Delete' : k);
                    b.addEventListener('click', () => (k === 'del' ? del() : type(k)));
                    pad.append(b);
                }
                box.append(left, pad);
                F.body.append(box);
                draw();
                T.ctx.focus(pad.querySelector('.pz-qa-key'));
                onKey = (e) => {
                    if (!F || e.altKey || e.ctrlKey || e.metaKey) return;
                    const t = e.target;
                    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
                    if (/^[0-9]$/.test(e.key)) { type(e.key); e.preventDefault(); e.stopImmediatePropagation(); }
                    else if (e.key === 'Backspace' && code) { del(); e.preventDefault(); e.stopImmediatePropagation(); }
                };
                window.addEventListener('keydown', onKey, true);
                try {
                    const u = await c.getCurrentUser();
                    if (F && u) note.textContent = `Enter the code shown on the other device to sign it in as ${u.Name}.`;
                    const on = await c.ajax({ type: 'GET', url: c.getUrl('QuickConnect/Enabled'), dataType: 'json' });
                    if (F && on === false) { msg.textContent = 'This server has Quick Connect turned off'; go.classList.add('pz-off'); }
                } catch (e) { /* the code still goes through Approve */ }
            },
            onAction(a, ctx) {
                P.sawAction();
                if (a === 'menu') { del(); return true; }
                return P.common ? P.common(a, ctx) : false;
            },
            onBack() { P.goBack(); return true; },
            unmount() { if (onKey) window.removeEventListener('keydown', onKey, true); onKey = null; if (F) F.stop(); ui.pointerFirst(false); F = null; }
        };
        function draw() {
            boxes.forEach((b, i) => { b.textContent = code[i] || ''; b.classList.toggle('pz-qa-at', i === code.length); });
            const msg = F.body.querySelector('.pz-qa-msg');
            if (msg && msg.textContent && !go.classList.contains('pz-off')) msg.textContent = '';
        }
        function type(d) {
            if (code.length >= LEN) { T.ctx.sound('error'); return; }
            code += d;
            T.ctx.sound('select');
            draw();
            if (code.length === LEN) T.ctx.focus(go);
        }
        function del() {
            if (!code) { T.ctx.sound('error'); return; }
            code = code.slice(0, -1);
            T.ctx.sound('back');
            draw();
        }
        async function submit() {
            const msg = F.body.querySelector('.pz-qa-msg');
            if (code.length < LEN) { msg.textContent = `The code has ${LEN} digits`; T.ctx.sound('error'); return; }
            const c = P.client();
            msg.textContent = 'Approving…';
            try {
                await c.ajax({ type: 'POST', url: c.getUrl('QuickConnect/Authorize', { Code: code, UserId: c.getCurrentUserId() }) });
                if (!F) return;
                msg.textContent = '';
                code = '';
                draw();
                if (P.toast) P.toast('Approved: the other device is signing in');
            } catch (e) {
                if (!F) return;
                msg.textContent = 'That code didn’t work: check it, or start again on the other device';
                T.ctx.sound('error');
            }
        }
        return S;
    }

    const wrap = (make) => ({ mount(r, c) { return (this.s = make()).mount(r, c); }, onAction(a, c) { return this.s.onAction(a, c); },
        onBack() { return this.s.onBack(); }, unmount() { if (this.s) this.s.unmount(); this.s = null; } });
    T.registerScreen('#/userprofile', wrap(profile));
    T.registerScreen('#/quickconnect', wrap(approve));
})();
