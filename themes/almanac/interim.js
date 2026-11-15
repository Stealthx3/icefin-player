// Almanac: the engine's screens Almanac uses as they are: the settings hub (Client settings, in Almanac's look), the
// web player fallback (osd.* tokens, the bar layout of 9.19), and details only if Almanac's own failed to load.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (!T || !T.ui) return;
    if (T.ui.details && !(window.icefinAlmanac && window.icefinAlmanac.ownDetails)) T.registerScreen('#/details', T.ui.details.screen({ layout: 'panel' }));
    // jellyfin-web's own controls, when the user picks them or a plugin needs them (the web fallback)
    if (T.ui.osd) T.ui.osd.set({ layout: 'bar' });
    if (T.ui.settings) T.registerScreen('#/mypreferencesmenu', T.ui.settings.screen({ layout: 'list' }));
})();
