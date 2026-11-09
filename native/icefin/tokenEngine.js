// Icefin theme engine: web token engine (PLAN 6.5). Appended to the injected native shell script, after
// nativeshell.js (SystemComponent::getNativeShellScript, ICEFIN-HOOK), so it never needs a network fetch.
// Theme-agnostic: it applies whatever stylesheet ThemeComponent ("theme" on the QWebChannel) hands it, which is the
// active theme's tokens as CSS custom properties plus the engine's jellyfin-web adapter. No theme = stock UI.
// Switching or turning off the theme applies live, with no reload.
(function () {
    'use strict';
    if (window.icefinTokenEngine || !window.apiPromise) return;

    const STYLE_ID = 'icefin-theme-tokens';
    const CLASS = 'icefin-themed';
    let css = '';

    // Stand-down (SPEC): when the server already injects the theme plugin's runtime, it owns the page's look.
    const standDown = () => !!window.icefinPluginRuntime;

    // Keep the style element last in <head>, after jellyfin-web's own theme stylesheet links.
    function attach() {
        const root = document.documentElement;
        if (!root) return;
        let el = document.getElementById(STYLE_ID);
        if (!css || standDown()) {
            if (el) el.remove();
            root.classList.remove(CLASS);
            return;
        }
        if (!el) {
            el = document.createElement('style');
            el.id = STYLE_ID;
        }
        if (el.textContent !== css) el.textContent = css;
        const parent = document.head || root;
        if (parent.lastElementChild !== el) parent.appendChild(el);
        root.classList.add(CLASS);
    }

    let headWatch = null;
    function watch() {
        if (headWatch || !document.head) return;
        headWatch = new MutationObserver(() => { if (css) attach(); });
        headWatch.observe(document.head, { childList: true });
    }
    const rootWatch = new MutationObserver(() => { watch(); if (document.head) { rootWatch.disconnect(); attach(); } });
    if (document.documentElement) rootWatch.observe(document.documentElement, { childList: true });
    document.addEventListener('DOMContentLoaded', () => { watch(); attach(); });
    window.addEventListener('icefin-plugin-runtime', () => attach());

    function load(api) {
        api.theme.stylesheet((s) => {
            css = s || '';
            attach();
            watch();
        });
    }

    window.icefinTokenEngine = {
        // For the settings UI and tests: the stylesheet in effect ('' when the engine is off).
        current: () => css,
        reload: () => window.apiPromise.then(load)
    };

    window.apiPromise.then((api) => {
        if (!api.theme) return;  // older native side: stay stock
        load(api);
        api.theme.changed.connect(() => load(api));
    });
})();
