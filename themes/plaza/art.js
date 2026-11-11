// Plaza channel illustrations (PLAN 9.32): small animated drawings that say what a channel is, under its name, like a
// channel banner. Original drawings in white on the channel's colour; nothing taken from the target. CSS animates them
// (styles.css, "Illustrations"); low motion stops them.
(function () {
    'use strict';
    const P = window.icefinPlaza;
    const W = 'var(--pz-ink-on)';
    const SVG = {
        livetv: `<svg viewBox="0 0 120 70" aria-hidden="true"><g class="pz-a-bob"><rect x="22" y="18" width="76" height="46" rx="8" fill="${W}"/><rect x="28" y="24" width="64" height="34" rx="4" class="pz-a-screen"/><path d="M48 18 L38 4 M72 18 L82 4" stroke="${W}" stroke-width="4" stroke-linecap="round"/><path class="pz-a-wave" d="M36 41 q12 -10 24 0 t24 0" stroke="var(--pz-ch-a)" stroke-width="3" fill="none"/></g></svg>`,
        movies: `<svg viewBox="0 0 120 70" aria-hidden="true"><g class="pz-a-spin" style="transform-origin:40px 40px"><circle cx="40" cy="40" r="22" fill="${W}"/><circle cx="40" cy="40" r="5" class="pz-a-hole"/><circle cx="40" cy="27" r="5" class="pz-a-hole"/><circle cx="40" cy="53" r="5" class="pz-a-hole"/><circle cx="27" cy="40" r="5" class="pz-a-hole"/><circle cx="53" cy="40" r="5" class="pz-a-hole"/></g><rect x="64" y="22" width="40" height="34" rx="5" fill="${W}"/><path d="M64 30 h40" stroke="var(--pz-ch-b)" stroke-width="3"/></svg>`,
        music: `<svg viewBox="0 0 120 70" aria-hidden="true"><g class="pz-a-spin-fast" style="transform-origin:46px 40px"><circle cx="46" cy="40" r="26" fill="var(--pz-record)"/><circle cx="46" cy="40" r="18" fill="none" stroke="var(--pz-record-groove)" stroke-width="2"/><circle cx="46" cy="40" r="8" fill="var(--pz-record-label)"/></g><path class="pz-a-bob" d="M86 22 v26 a6 6 0 1 1 -4 -5.6 V26 l14 -4 v20 a6 6 0 1 1 -4 -5.6 V18 z" fill="${W}"/></svg>`,
        tvshows: `<svg viewBox="0 0 120 70" aria-hidden="true"><rect x="30" y="14" width="56" height="38" rx="5" fill="${W}" opacity=".55"/><rect class="pz-a-shuffle" x="24" y="20" width="56" height="38" rx="5" fill="${W}" opacity=".8"/><rect x="18" y="26" width="56" height="38" rx="5" fill="${W}"/><path d="M40 38 l14 7 -14 7 z" class="pz-a-hole"/></svg>`,
        nextup: `<svg viewBox="0 0 120 70" aria-hidden="true"><path d="M30 18 l26 17 -26 17 z" fill="${W}"/><path class="pz-a-bob" d="M60 18 l26 17 -26 17 z" fill="${W}" opacity=".7"/></svg>`,
        homevideos: `<svg viewBox="0 0 120 70" aria-hidden="true"><rect x="24" y="22" width="52" height="34" rx="6" fill="${W}"/><path d="M76 32 l18 -10 v34 l-18 -10 z" fill="${W}"/><circle class="pz-a-blink" cx="34" cy="31" r="4" fill="var(--pz-rec)"/></svg>`,
        photos: `<svg viewBox="0 0 120 70" aria-hidden="true"><rect class="pz-a-shuffle" x="30" y="12" width="54" height="42" rx="4" fill="${W}" opacity=".7"/><rect x="22" y="20" width="54" height="42" rx="4" fill="${W}"/><path d="M28 56 l14 -16 10 10 8 -6 12 12 z" class="pz-a-hole"/><circle cx="62" cy="32" r="4" class="pz-a-hole"/></svg>`,
        books: `<svg viewBox="0 0 120 70" aria-hidden="true"><path d="M60 20 C48 12 32 12 22 16 V60 C32 56 48 56 60 64 Z" fill="${W}"/><path d="M60 20 C72 12 88 12 98 16 V60 C88 56 72 56 60 64 Z" fill="${W}" opacity=".85"/><path class="pz-a-flip" d="M60 20 C70 14 82 14 90 16 V58 C82 56 70 56 60 64 Z" fill="${W}"/></svg>`,
        boxsets: `<svg viewBox="0 0 120 70" aria-hidden="true"><rect x="22" y="16" width="20" height="44" rx="3" fill="${W}"/><rect x="46" y="16" width="20" height="44" rx="3" fill="${W}" opacity=".85"/><rect class="pz-a-lean" x="70" y="16" width="20" height="44" rx="3" fill="${W}" opacity=".7"/></svg>`,
        playlists: `<svg viewBox="0 0 120 70" aria-hidden="true"><path d="M26 22 h44 M26 34 h44 M26 46 h30" stroke="${W}" stroke-width="6" stroke-linecap="round"/><path class="pz-a-bob" d="M80 30 v20 a6 6 0 1 1 -4 -5.6 V26 l14 -4 v6 z" fill="${W}"/></svg>`,
        folder: `<svg viewBox="0 0 120 70" aria-hidden="true"><path d="M24 20 h22 l6 6 h42 v34 h-70 z" fill="${W}"/><rect class="pz-a-peek" x="34" y="14" width="44" height="20" rx="3" fill="${W}" opacity=".7"/></svg>`,
        favourite: `<svg viewBox="0 0 120 70" aria-hidden="true"><path class="pz-a-pulse" style="transform-origin:60px 36px" d="M60 10 l7 15 16 2 -12 11 3 16 -14 -8 -14 8 3 -16 -12 -11 16 -2 z" fill="${W}"/></svg>`
    };
    const KIND = { movies: 'movies', tvshows: 'tvshows', music: 'music', livetv: 'livetv', homevideos: 'homevideos', photos: 'photos',
        books: 'books', boxsets: 'boxsets', playlists: 'playlists', musicvideos: 'music', nextup: 'nextup', favourite: 'favourite' };
    // The illustration for a library's collection type (or a channel kind); folders and mixed libraries get the folder.
    P.kindOf = (collectionType) => KIND[collectionType] || 'folder';
    P.illustration = (kind) => {
        const d = P.el('div', 'pz-ill pz-ill-' + kind);
        d.innerHTML = SVG[kind] || SVG.folder;
        return d;
    };

    // The Continue Watching disc: a silver disc whose printed label is the item's art, turning slowly.
    P.disc = (item, size) => {
        const d = P.el('div', 'pz-disc' + (size ? ' pz-disc-' + size : ''));
        const label = P.el('div', 'pz-disc-label');
        P.bg(label, item ? (P.posterArt(item, 400) || P.wideArt(item, 400)) : '');
        d.append(label, P.el('div', 'pz-disc-hub'), P.el('div', 'pz-disc-glint'));
        return d;
    };
})();
