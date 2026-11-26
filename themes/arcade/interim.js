// Arcade: the engine's screens Arcade uses as they are, and the settings hub (Settings board). #/mypreferencesmenu is
// Arcade's hub: the target's settings list, what the focused entry does in the side panel (D.settingsEntries, home.js).
// Client Settings (?pane=client) is the engine's page in Arcade's colours. The web player fallback keeps the osd.*
// tokens (the bar layout of 9.19), and details fall back to the engine's only if Arcade's own failed to load.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (!T || !T.ui) return;
    // the preference pages, drawn as Client Settings is (PLAN 9.62, D39)
    if (T.ui.settings && T.ui.settings.prefs) for (const r of T.ui.settings.prefsRoutes) T.registerScreen(r, T.ui.settings.prefs());
    const D = window.icefinArcade;
    if (T.ui.details && !(D && D.ownDetails)) T.registerScreen('#/details', T.ui.details.screen({ layout: 'panel' }));
    // jellyfin-web's own controls, when the user picks them or a plugin needs them (the web fallback)
    if (T.ui.osd) T.ui.osd.set({ layout: 'bar' });
    const engine = T.ui.settings ? T.ui.settings.screen({ layout: 'list' }) : null;
    if (!D || !D.columns || !D.settingsEntries) { if (engine) T.registerScreen('#/mypreferencesmenu', engine); return; }
    let H = null;
    D.register('#/mypreferencesmenu', {
        mount(root, cx) {
            if (D.params().get('pane') && engine) { H = { engine: true }; root.classList.add('ac-client-settings'); return engine.mount(root, cx); }
            H = { C: D.columns(root, { root: { title: 'Settings', count: false, load: D.settingsEntries, mode: 'list' }, name: 'settings', key: '#/mypreferencesmenu' }) };
            H.cap = D.capsule ? D.capsule(root) : null;
        },
        unmount() { if (H) { if (H.engine && engine) engine.unmount(); if (H.C) H.C.stop(); if (H.cap) H.cap.stop(); } H = null; D.hintsOff(); },
        onAction(a, cx) { if (H && H.engine) return engine.onAction ? engine.onAction(a, cx) : false; return H && H.C ? H.C.onAction(a) : false; },
        onBack(cx) { if (H && H.engine) return engine.onBack ? engine.onBack(cx) : false; return H && H.C ? H.C.onAction('back') : false; }
    });
})();
