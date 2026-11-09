// Icefin controller layer, page side (PLAN 7.3, 7.5). Appended to the injected native shell script.
// - Hides the browser's Gamepad API: only the native SDL path drives input, so no press acts twice (spike 2.7: the
//   getter shim alone isn't enough, connect/disconnect events reach the page too, so those stop at capture).
// - Button prompts (7.3): <html data-icefin-glyphs="xbox|playstation|nintendo|steamdeck|generic"> follows the pad used
//   last, and icefinTheme.glyph(button) returns an original SVG drawing for that family (no vendor logos).
// - Client Settings -> Controllers (7.5): detected pads with family, mapping source and battery, and what to check
//   when none is found.
(function () {
    'use strict';
    if (window.icefinGamepads) return;

    // ---- 7.5: one input path ----
    try {
        Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: function () { return []; } });
    } catch (e) { console.error('icefinGamepads: getGamepads shim failed', e); }
    for (const t of ['gamepadconnected', 'gamepaddisconnected']) window.addEventListener(t, (e) => e.stopImmediatePropagation(), true);

    // ---- 7.3: glyphs. Original geometric drawings; colour comes from the theme (currentColor). ----
    const circle = (label) => `<svg viewBox="0 0 24 24" aria-label="${label}" role="img"><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1.6"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-family="sans-serif" font-weight="700" fill="currentColor">${label}</text></svg>`;
    const shape = (inner, label) => `<svg viewBox="0 0 24 24" aria-label="${label}" role="img"><circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1.6"/>${inner}</svg>`;
    const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    const FACE = {
        xbox: { south: circle('A'), east: circle('B'), west: circle('X'), north: circle('Y') },
        steamdeck: { south: circle('A'), east: circle('B'), west: circle('X'), north: circle('Y') },
        nintendo: { south: circle('B'), east: circle('A'), west: circle('Y'), north: circle('X') },
        playstation: {
            south: shape(`<path d="M8 8l8 8M16 8l-8 8" ${S}/>`, 'cross'),
            east: shape(`<circle cx="12" cy="12" r="4.5" ${S}/>`, 'circle'),
            west: shape(`<rect x="7.8" y="7.8" width="8.4" height="8.4" ${S}/>`, 'square'),
            north: shape(`<path d="M12 7l5 8.5H7z" ${S}/>`, 'triangle')
        },
        generic: { south: circle('1'), east: circle('2'), west: circle('3'), north: circle('4') }
    };
    let family = 'generic';
    const setFamily = (f) => {
        family = FACE[f] ? f : 'generic';
        document.documentElement.setAttribute('data-icefin-glyphs', family);
    };

    function glyph(button) {
        const b = String(button || '').toLowerCase();
        // With the Nintendo layout option the confirm button is the east one on Nintendo pads; prompts follow the action.
        return (FACE[family] || FACE.generic)[b] || circle(b.slice(0, 2).toUpperCase());
    }

    window.icefinGamepads = { glyph, family: () => family };
    const attachGlyph = () => { if (window.icefinTheme && !window.icefinTheme.glyph) window.icefinTheme.glyph = glyph; };

    if (!window.apiPromise) return;
    window.apiPromise.then((api) => {
        attachGlyph();
        if (!api.gamepads) return;
        api.gamepads.family((f) => { if (f) setFamily(f); });
        api.gamepads.familyChanged.connect(setFamily);

        // ---- 7.5: Client Settings -> Controllers ----
        const ID = 'icefin-controllers-section';
        const render = (section) => api.gamepads.available((ok) => api.gamepads.list((pads) => {
            section.querySelectorAll('.icefin-pad-body').forEach((n) => n.remove());
            const body = document.createElement('div');
            body.className = 'icefin-pad-body';
            const note = (t) => { const p = document.createElement('p'); p.className = 'fieldDescription'; p.textContent = t; body.append(p); };
            if (!ok) note('This build uses the older joystick layer; controllers work through per-model maps.');
            else if (!pads.length) {
                note('No controller found. Check that it is connected or paired, that the host has the steam-devices udev rules '
                    + '(needed for PlayStation, Nintendo and Steam controllers), and, for the Xbox wireless USB adapter, the xone driver.');
            } else {
                for (const p of pads) {
                    const row = document.createElement('p');
                    row.className = 'icefin-pad-row';
                    row.setAttribute('data-family', p.family);
                    const battery = p.battery === 'wired' ? 'wired' : p.percent >= 0 ? `${p.battery}, ${p.percent}%` : p.battery;
                    row.textContent = `${p.name} · ${p.family} · ${p.mapping} · ${battery}`;
                    body.append(row);
                }
                note('Remap a controller by adding a file to the inputmaps folder in Icefin\'s data directory (it overrides the built-in map).');
            }
            section.append(body);
        }));
        const attach = (dialog) => {
            const content = dialog && dialog.querySelector('.formDialogContent');
            if (!content || content.querySelector('#' + ID)) return;
            const section = document.createElement('fieldset');
            section.id = ID;
            section.className = 'editItemMetadataForm editMetadataForm dialog-content-centered';
            section.style.border = 0;
            section.style.outline = 0;
            const legend = document.createElement('legend');
            const h = document.createElement('h2');
            h.textContent = 'Controllers';
            legend.append(h);
            section.append(legend);
            content.append(section);
            render(section);
        };
        const scan = () => document.querySelectorAll('.formDialogHeaderTitle').forEach((t) => {
            if (t.textContent === 'Client Settings') attach(t.closest('.dialog'));
        });
        const start = () => new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
        if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
        api.gamepads.changed.connect(() => { const s = document.getElementById(ID); if (s) render(s); });
    });
})();
