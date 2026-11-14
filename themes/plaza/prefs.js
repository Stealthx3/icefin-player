// Settings › Home in Plaza (PLAN 9.44; the design canvas's PrefsHome) on #/mypreferenceshome: what Plaza's home shows.
// Every channel in the home's order with a switch (a hidden channel leaves its slot empty) and ≡ to move it (▲▼ carry
// it, Ⓐ places it, Ⓑ puts it back); a note on how the home works; and jellyfin-web's own home sections, which
// Classic home shows, one row down (that page as it is). The other preference pages stay jellyfin-web's own, in
// Plaza's frame (stock.js), so every setting keeps saving where jellyfin-web keeps it.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const P = window.icefinPlaza;
    if (!T || !P || !P.frame || !P.homeChannels) return;
    const el = P.el;
    const ui = T.ui;
    const PAGES = [['mypreferencesdisplay', 'Display'], ['mypreferenceshome', 'Home'], ['mypreferencesplayback', 'Playback'], ['mypreferencessubtitles', 'Subtitles'], ['mypreferencescontrols', 'Controls']];

    function home() {
        let F = null, list = null, lift = null;
        const S = {
            async mount(root) {
                ui.pointerFirst(true);
                F = P.frame(root, { view: 'prefs-home', kind: 'folder', name: 'Settings', hints: 'Ⓐ On/off · ≡ Move · Ⓑ Back' });
                const uid = P.uid();
                F.setTabs(PAGES.map(([id, label]) => ({ id, label })), 'mypreferenceshome', (id) => { if (id !== 'mypreferenceshome') T.ctx.navigate(`#/${id}?userId=${uid}`); });
                const box = el('div', 'pz-ph');
                list = el('div', 'pz-ph-list');
                const note = el('div', 'pz-ph-note');
                note.append(el('b', '', 'What Plaza shows'),
                    el('div', '', 'Channels come first on the home, in this order; a channel you switch off leaves its place empty. Move them here with ≡, or on the home itself: ≡ on a channel, then the arrows.'));
                box.append(list, note);
                F.body.append(box);
                const chans = await P.homeChannels();
                if (!F) return;
                for (const c of chans) {
                    const r = P.focusable(el('div', 'pz-setrow pz-ph-row pz-k-' + c.kind + (c.hidden ? '' : ' pz-on')));
                    r.pzChannel = c;
                    const sw = el('span', 'pz-switch' + (c.hidden ? '' : ' pz-on'));
                    r.append(el('span', 'pz-ph-handle', '≡'), el('span', 'pz-ph-dot'), el('span', 'pz-setrow-label', c.label), sw);
                    r.addEventListener('click', () => {
                        if (lift) { drop(); return; }
                        const on = !r.classList.contains('pz-on');
                        r.classList.toggle('pz-on', on);
                        sw.classList.toggle('pz-on', on);
                        P.setChannelHidden(c.id, !on);
                        T.ctx.sound('select');
                        F.focusText(`${c.label}: ${on ? 'shown on the home' : 'hidden'}`);
                    });
                    r.addEventListener('icefin-focus', () => F.focusText(`${c.label}${r.classList.contains('pz-on') ? '' : ' (hidden)'}`));
                    list.append(r);
                }
                const classic = P.focusable(el('div', 'pz-setrow pz-ph-row pz-ph-classic'));
                classic.append(el('span', 'pz-setrow-label', 'Classic home sections'), el('span', 'pz-sheet-row-sub', 'What Jellyfin’s own home shows ›'));
                classic.addEventListener('click', () => T.ctx.navigate(`#/mypreferenceshome?userId=${uid}&icefin=stock`));
                list.append(classic);
                const first = list.querySelector('[data-icefin-focus]');
                if (first) T.ctx.focus(first);
            },
            onAction(a, ctx) {
                P.sawAction();
                if (lift) {
                    if (a === 'up' || a === 'down') { carry(a === 'up' ? -1 : 1); return true; }
                    if (a === 'enter' || a === 'select' || a === 'menu') { drop(); return true; }
                    return true;
                }
                const f = ctx.focused();
                if (a === 'menu' && f && f.pzChannel) { start(f); return true; }
                return P.common ? P.common(a, ctx) : false;
            },
            onBack() { if (lift) { putBack(); return true; } P.goBack(); return true; },
            unmount() { if (F) F.stop(); ui.pointerFirst(false); F = null; lift = null; }
        };
        const rows = () => [...list.querySelectorAll('.pz-ph-row:not(.pz-ph-classic)')];
        function start(r) { lift = { r, from: rows().indexOf(r) }; r.classList.add('pz-ph-lifted'); F.hints('▲▼ Move · Ⓐ Place · Ⓑ Put back'); T.ctx.sound('select'); }
        function carry(d) {
            const all = rows(), i = all.indexOf(lift.r), j = i + d;
            if (j < 0 || j >= all.length) { T.ctx.sound('error'); return; }
            list.insertBefore(lift.r, d < 0 ? all[j] : all[j].nextSibling);
            lift.r.scrollIntoView({ block: 'nearest' });
            T.ctx.sound('focus');
        }
        function drop() {
            lift.r.classList.remove('pz-ph-lifted');
            lift = null;
            P.setChannelOrder(rows().map((r) => r.pzChannel.id));
            F.hints('Ⓐ On/off · ≡ Move · Ⓑ Back');
            T.ctx.sound('select');
        }
        function putBack() {
            const all = rows();
            all.splice(all.indexOf(lift.r), 1);
            list.insertBefore(lift.r, all[lift.from] || list.querySelector('.pz-ph-classic'));
            lift.r.classList.remove('pz-ph-lifted');
            lift = null;
            F.hints('Ⓐ On/off · ≡ Move · Ⓑ Back');
            T.ctx.sound('back');
        }
        return S;
    }

    T.registerScreen('#/mypreferenceshome', { mount(r, c) { return (this.s = home()).mount(r, c); }, onAction(a, c) { return this.s.onAction(a, c); },
        onBack() { return this.s.onBack(); }, unmount() { if (this.s) this.s.unmount(); this.s = null; } });
})();
