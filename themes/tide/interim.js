// Tide: the engine's screens Tide still uses while its own are built in this pass (details, the player's controls,
// the settings hub). Each goes as Tide's own screen replaces it.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (!T || !T.ui) return;
    if (T.ui.details && !(window.icefinTide && window.icefinTide.ownDetails)) T.registerScreen('#/details', T.ui.details.screen({ layout: 'panel' }));
    if (T.ui.osd && !(window.icefinTide && window.icefinTide.ownPlayer)) T.ui.osd.set({ layout: 'minimal' });
    if (T.ui.settings) T.registerScreen('#/mypreferencesmenu', T.ui.settings.screen({ layout: 'list' }));
})();
