// Orbit: the engine's screens Orbit uses as they are: the settings hub (Client settings, in Orbit's look), the
// web player fallback (osd.* tokens, the bar layout of 9.19), and details only if Orbit's own failed to load.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (!T || !T.ui) return;
    if (T.ui.details && !(window.icefinOrbit && window.icefinOrbit.ownDetails)) T.registerScreen('#/details', T.ui.details.screen({ layout: 'panel' }));
    // jellyfin-web's own controls, when the user picks them or a plugin needs them (the web fallback)
    if (T.ui.osd) T.ui.osd.set({ layout: 'bar' });
    if (T.ui.settings) T.registerScreen('#/mypreferencesmenu', T.ui.settings.screen({ layout: 'list' }));
})();
