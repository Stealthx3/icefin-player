// Fixture: every generic capability on a screen (tests/icefin/web/theme_capabilities.py drives them).
(function () {
    const ui = window.icefinTheme.ui;
    const cell = (t) => { const d = document.createElement('div'); d.className = 'lab-cell'; d.textContent = t; d.tabIndex = -1; return d; };
    const range = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
    ui.chrome.set('topBar', { height: '3em', mount(el) { el.append(Object.assign(cell('top-home'), { id: 'lab-top' })); el.firstChild.dataset.icefinFocus = ''; } });
    ui.chrome.set('sideRail', { width: '10em', collapsedWidth: '4em', mount(el) {
        const c = cell('rail-movies'); c.dataset.icefinFocus = '';
        const l = document.createElement('span'); l.className = 'icefin-rail-label'; c.append(l); el.append(c);
    } });
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
    window.icefinTheme.registerScreen('#/search', { mount(root) {
        const panel = document.createElement('div'); panel.className = 'lab-material'; panel.textContent = 'material';
        window.labMaterial = ui.material(panel, 'panel');
        const row = document.createElement('div'); row.className = 'lab-row';
        for (const t of range(6, 'r')) { const c = cell(t); c.dataset.icefinFocus = ''; row.append(c); }
        root.append(panel, row);
        window.labParallax = ui.parallax(row);
        window.labExpand = ui.cardExpand(row, { dwell: 300, item: (c) => c.textContent, preview: () => window.labPreviewItem,
            render(item, p) { p.textContent = `expanded-${item}`; const v = document.createElement('div'); v.className = 'icefin-expand-video'; v.style.cssText = 'width:100%;height:60%'; p.append(v); } });
        ui.material.force(window.labMaterialForce || 'auto');
    } });
    // 9.14: 40 channels, programmes of 30, 60 or 90 minutes from 12 hours ago (deterministic per channel)
    window.icefinTheme.registerScreen('#/livetv', { mount(root) {
        const chans = Array.from({ length: 40 }, (_, i) => ({ id: `ch${i + 1}`, name: `Channel ${i + 1}` }));
        window.labGuideFetches = [];
        const base = Math.floor((Date.now() - 12 * 3600e3) / 1800e3) * 1800e3;
        const progs = (id) => { const n = +id.slice(2), out = []; let t = base; for (let k = 0; t < base + 48 * 3600e3; k++) { const len = [30, 60, 90][(n + k) % 3] * 60e3; out.push({ id: `${id}-p${k}`, channelId: id, start: t, end: t + len, title: `${id} show ${k}` }); t += len; } return out; };
        const guide = document.createElement('div'); root.append(guide);
        window.labGuide = ui.guideGrid(guide, { channels: chans, rows: 6, span: 120,
            fetch: (ids, a, b) => { window.labGuideFetches.push([ids.length, a, b]); return ids.flatMap((id) => progs(id).filter((p) => p.end > a && p.start < b)); },
            onSelect: (p) => { window.labGuideSelected = p.id; } });
    } });
    window.icefinTheme.registerScreen('#/favorites', { mount(root) {
        ui.keyboard.enable();
        const input = document.createElement('input'); input.className = 'lab-input'; input.type = 'text'; input.dataset.icefinFocus = '';
        input.addEventListener('input', () => { window.labInputEvents = (window.labInputEvents || 0) + 1; });
        const after = cell('after-input'); after.dataset.icefinFocus = '';
        root.append(input, after);
    } });
})();
