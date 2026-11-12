// Play on and Watch together as one Plaza card (PLAN 9.44; the design canvas's PlayOn), on the engine's playTargets
// and syncPlay (9.44): the devices what plays can go to, this one marked "Playing here", and the server's Watch
// together groups, with a new one and leaving the one this device is in. The header's Play on and Watch together on
// jellyfin-web's pages (stock.js) and the player's two pills (player.js) open it; without the engine's calls they keep
// jellyfin-web's own menus.
(function () {
    'use strict';
    const T = window.icefinTheme;
    const P = window.icefinPlaza;
    if (!T || !P) return;
    const el = P.el;
    const able = () => !!(P.sheet && T.ctx.playTargets && T.ctx.syncPlay);
    const BADGE = { this: 'TV', tv: 'TV', phone: 'PH', computer: 'PC', other: '··' };

    P.playOn = (focusOn) => {
        if (!able()) return false;
        P.sheet.show({
            title: 'Play on', kind: 'livetv', wide: false,
            async render(body) {
                const devices = el('div', 'pz-sheet-rows pz-po-rows');
                const groups = el('div', 'pz-sheet-rows pz-po-rows');
                body.append(el('div', 'pz-panel-label', 'Devices'), devices, el('div', 'pz-panel-label pz-po-gap', 'Watch together'), groups);
                devices.append(el('div', 'pz-sheet-note', 'Looking for devices…'));
                const [targets, list] = await Promise.all([T.ctx.playTargets(), T.ctx.syncPlay.groups()]);
                const row = (badge, label, sub, note, go) => {
                    const r = P.focusable(el('div', 'pz-sheet-row pz-po-row'));
                    r.append(el('span', 'pz-po-badge', badge), el('span', 'pz-sheet-row-label', label));
                    if (sub) r.append(el('span', 'pz-po-sub', sub));
                    if (note) r.append(el('span', 'pz-po-note', note));
                    r.addEventListener('click', go);
                    return r;
                };
                devices.textContent = '';
                for (const t of targets) {
                    devices.append(row(BADGE[t.kind] || '··', t.kind === 'this' ? `${t.name || 'This Icefin'}` : t.name, t.kind === 'this' ? 'This device' : t.app, t.current ? 'Playing here' : '', async () => {
                        if (t.current) { P.sheet.close(); return; }
                        const ok = await T.ctx.setPlayTarget(t.id);
                        P.sheet.close();
                        if (P.toast) P.toast(ok ? (t.kind === 'this' ? 'Playing here' : `Playing on ${t.name}`) : 'That didn’t work', !ok);
                    }));
                }
                if (!targets.length) devices.append(el('div', 'pz-sheet-note', 'No other devices are signed in right now.'));
                const cur = T.ctx.syncPlay.current();
                if (cur) groups.append(row('GR', `Leave ${cur.name}`, '', 'You’re in it', async () => { await T.ctx.syncPlay.leave(); P.sheet.close(); if (P.toast) P.toast(`Left ${cur.name}`); }));
                for (const g of list) {
                    if (cur && cur.id === g.id) continue;
                    groups.append(row('GR', g.name, `${g.people} ${g.people === 1 ? 'person' : 'people'}`, '', async () => {
                        const ok = await T.ctx.syncPlay.join(g.id);
                        P.sheet.close();
                        if (P.toast) P.toast(ok ? `Watching together with ${g.name}` : 'That didn’t work', !ok);
                    }));
                }
                const plus = row('+', 'New group', 'Others join it from their own Play on', '', async () => {
                    let me = '';
                    try { me = (await P.client().getCurrentUser()).Name || ''; } catch (e) { me = ''; }
                    const ok = await T.ctx.syncPlay.create(me ? `${me}’s group` : 'Watch together');
                    P.sheet.close();
                    if (P.toast) P.toast(ok ? 'Group started: others can join it' : 'That didn’t work', !ok);
                });
                plus.classList.add('pz-po-new');
                groups.append(plus);
                const first = (focusOn === 'together' ? groups : devices).querySelector('[data-icefin-focus]') || body.querySelector('[data-icefin-focus]');
                if (first) T.ctx.focus(first);
            }
        });
        return true;
    };
})();
