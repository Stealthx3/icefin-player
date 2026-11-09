// Fixture: a themed home screen with three tiles. Clicks and back presses are recorded for the test.
window.labScreens = { clicks: [], backs: 0 };
window.icefinTheme.registerScreen('#/home', {
    mount(root) {
        for (const name of ['one', 'two', 'three']) {
            const t = document.createElement('div');
            t.className = 'lab-tile';
            t.textContent = name;
            t.dataset.icefinFocus = '';
            t.tabIndex = -1;
            t.addEventListener('click', () => window.labScreens.clicks.push(name));
            root.appendChild(t);
        }
    },
    onBack() { window.labScreens.backs++; return window.labScreens.backs === 1; }
});
