// Fixture: every generic capability on a screen (tests/icefin/web/theme_capabilities.py drives them).
(function () {
    const ui = window.icefinTheme.ui;
    const cell = (t) => { const d = document.createElement('div'); d.className = 'lab-cell'; d.textContent = t; d.tabIndex = -1; return d; };
    const range = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
    ui.chrome.set('topBar', { height: '3em', mount(el) { el.append(Object.assign(cell('top-home'), { id: 'lab-top' })); el.firstChild.dataset.icefinFocus = ''; } });
    ui.chrome.set('sideRail', { width: '10em', mount(el) { const c = cell('rail-movies'); c.dataset.icefinFocus = ''; el.append(c); } });
    ui.overlay.set({ mount(el, ctx) {
        el.className = 'lab-overlay';
        for (const t of ['guide-a', 'guide-b']) { const c = cell(t); c.dataset.icefinFocus = ''; c.addEventListener('click', () => { window.labOverlayClicks = (window.labOverlayClicks || []).concat(t); }); el.append(c); }
    } });
    window.icefinTheme.registerScreen('#/home', { mount(root, ctx) {
        const content = ui.chrome.frame(root, ctx);
        window.labGrid = ui.pagedGrid(content, range(30, 'g'), { cols: 4, rows: 3, render: cell });
    } });
    window.icefinTheme.registerScreen('#/movies', { mount(root) {
        window.labCarousel = ui.carousel3d(root, range(8, 'c'), { render: cell });
    } });
    window.icefinTheme.registerScreen('#/tv', { mount(root) {
        window.labPivot = ui.pivot(root, ['one', 'two', 'three'].map((n) => ({ title: `pivot-${n}`, mount(el) {
            el.style.display = 'flex'; el.style.gap = '1em';
            for (const t of range(2, `${n}-`)) { const c = cell(t); c.dataset.icefinFocus = ''; el.append(c); }
        } })));
    } });
    window.icefinTheme.registerScreen('#/music', { mount(root) {
        const tile = document.createElement('div'); tile.className = 'lab-live'; root.append(tile);
        window.labLive = ui.liveTile(tile, { interval: 400, fetch: () => range(3, 'live'), render: (t) => { const c = cell(t); c.dataset.icefinFocus = ''; return c; } });
        const pv = document.createElement('div'); pv.style.cssText = 'width:20em;height:12em'; root.append(pv);
        if (window.labPreviewItem) window.labPreview = ui.mutedPreview(pv, { itemId: window.labPreviewItem });
    } });
})();
