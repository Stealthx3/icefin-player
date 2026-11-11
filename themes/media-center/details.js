// Media Center: the details screen (Icefin reference theme, PLAN 8.6, 9.18). The engine's details screen (every
// feature of the stock page: play, resume, versions, tracks, trailer, seasons and episodes, chapters, cast, more like
// this) with the poster beside the text over a full backdrop; the look is in styles.css, "Details".
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (T && T.ui && T.ui.details) T.registerScreen('#/details', T.ui.details.screen({ layout: 'poster' }));
})();
