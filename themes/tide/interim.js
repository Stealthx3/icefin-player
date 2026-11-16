// Tide: the engine's screens Tide uses as they are: the settings hub (Client settings, in Tide's look below), the web
// player fallback (osd.* tokens), and details only if Tide's own failed to load.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (!T || !T.ui) return;
    // the preference pages, drawn as Client Settings is (PLAN 9.62, D39)
    if (T.ui.settings && T.ui.settings.prefs) for (const r of T.ui.settings.prefsRoutes) T.registerScreen(r, T.ui.settings.prefs());
    if (T.ui.details && !(window.icefinTide && window.icefinTide.ownDetails)) T.registerScreen('#/details', T.ui.details.screen({ layout: 'panel' }));
    // jellyfin-web's own controls, when the user picks them or a plugin needs them (the web fallback): Tide's look
    if (T.ui.osd) T.ui.osd.set({ layout: 'minimal' });
    if (T.ui.settings) T.registerScreen('#/mypreferencesmenu', T.ui.settings.screen({ layout: 'list' }));
})();
