// Icefin theme engine: connecting to a Live TV channel (user feedback on the first alpha). Appended after osdLayout.js.
//
// Starting a TV channel can take seconds (the server tunes and opens a live stream), and nothing showed it. While a
// theme is up, every channel start, from a theme's screen or jellyfin-web's own guide, shows a dialog in the theme's
// colours: the channel, a spinner and three steps (tuning in, opening the stream, waiting for the picture), with
// Cancel. It closes when the picture plays. If the start fails (the server refuses or can't open the stream, the player
// reports an error, or nothing plays within TIMEOUT_MS) the dialog turns into an error notice with the reason and Try
// again / Close. A jellyfin-web alert that appears during the attempt is taken over (its text becomes the reason).
// Remote and controller: left/right between the buttons, OK presses, Back cancels or closes. html[data-icefin-live]
// is "connecting" or "failed" while it shows.
(function () {
    'use strict';
    const T = window.icefinTheme;
    if (!T || !T._engine || !T.ui || T.ui.liveConnect) return;
    const E = T._engine;
    const ID = 'icefin-live';
    const TIMEOUT_MS = 40000;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const STYLE = `
#${ID} { position: fixed; inset: 0; z-index: 1003; display: flex; align-items: center; justify-content: center; background: rgb(var(--icefin-color-background-channel, 0 0 0) / 0.55);
  font-family: var(--icefin-font-family, inherit); animation: icefin-live-in 160ms ease; }
@keyframes icefin-live-in { from { opacity: 0; } to { opacity: 1; } }
#${ID} .icefin-live-card { width: min(34em, 86vw); box-sizing: border-box; padding: 1.6em 1.8em; border-radius: var(--icefin-shape-cardRadius, 0.8em);
  background: var(--icefin-color-surfaceRaised, var(--icefin-color-surface)); color: var(--icefin-color-text); box-shadow: 0 1em 3em rgb(var(--icefin-color-background-channel) / 0.6);
  border-top: 0.25em solid var(--icefin-color-accent); font-size: 2.2vh; }
#${ID}[data-state="failed"] .icefin-live-card { border-top-color: var(--icefin-color-error); }
#${ID} .icefin-live-head { display: flex; align-items: center; gap: 1em; }
#${ID} .icefin-live-logo { width: 4.2em; height: 2.8em; flex: none; border-radius: 0.4em; background: var(--icefin-color-surface) center / contain no-repeat; }
#${ID} .icefin-live-title { font-size: 1.35em; font-weight: 700; line-height: 1.2; }
#${ID} .icefin-live-sub { color: var(--icefin-color-textSecondary); margin-top: 0.2em; }
#${ID} .icefin-live-spin { width: 2.2em; height: 2.2em; margin-left: auto; flex: none; border-radius: 50%; border: 0.28em solid rgb(var(--icefin-color-text-channel) / 0.15);
  border-top-color: var(--icefin-color-accent); animation: icefin-live-spin 900ms linear infinite; }
#${ID}[data-state="failed"] .icefin-live-spin { animation: none; border-color: var(--icefin-color-error); display: flex; align-items: center; justify-content: center; }
#${ID}[data-state="failed"] .icefin-live-spin::after { content: "!"; font-weight: 800; color: var(--icefin-color-error); }
@keyframes icefin-live-spin { to { transform: rotate(360deg); } }
#${ID} .icefin-live-steps { list-style: none; margin: 1.2em 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.45em; }
#${ID} .icefin-live-steps li { display: flex; gap: 0.6em; align-items: center; color: var(--icefin-color-textSecondary); }
#${ID} .icefin-live-steps li::before { content: ""; width: 0.7em; height: 0.7em; border-radius: 50%; border: 0.12em solid currentColor; flex: none; }
#${ID} .icefin-live-steps li.now { color: var(--icefin-color-text); font-weight: 600; }
#${ID} .icefin-live-steps li.now::before { background: var(--icefin-color-accent); border-color: var(--icefin-color-accent); animation: icefin-live-pulse 1s ease-in-out infinite; }
#${ID} .icefin-live-steps li.done::before { background: var(--icefin-color-textSecondary); }
#${ID}[data-state="failed"] .icefin-live-steps li.now::before { background: var(--icefin-color-error); border-color: var(--icefin-color-error); animation: none; }
@keyframes icefin-live-pulse { 50% { opacity: 0.35; } }
#${ID} .icefin-live-reason { margin-top: 1em; line-height: 1.45; }
#${ID} .icefin-live-buttons { display: flex; gap: 0.8em; justify-content: flex-end; margin-top: 1.4em; }
#${ID} .icefin-live-btn { padding: 0.6em 1.4em; border-radius: var(--icefin-osd-buttonRadius, 0.5em); background: var(--icefin-color-surface); color: var(--icefin-color-text);
  box-shadow: inset 0 0 0 0.12em var(--icefin-color-divider); cursor: pointer; outline: none; font-weight: 600; }
#${ID} .icefin-live-btn.icefin-focused, #${ID} .icefin-live-btn:hover { background: var(--icefin-color-focus); color: var(--icefin-color-onFocus); box-shadow: none; }
html[data-icefin-motion="low"] #${ID}, html[data-icefin-motion="low"] #${ID} * { animation: none !important; }
`;
    function ensureStyle() {
        if (document.getElementById(ID + '-style') || !document.head) return;
        const s = el('style');
        s.id = ID + '-style';
        s.textContent = STYLE;
        document.head.append(s);
    }

    const STEPS = ['Tuning in', 'Opening the live stream', 'Waiting for the picture'];
    let cur = null;  // {channel, options, root, steps, buttons, focus, timer, poll, alertObs, state}

    function attr(v) { const h = document.documentElement; if (!h) return; if (v) h.setAttribute('data-icefin-live', v); else h.removeAttribute('data-icefin-live'); }
    function close() {
        if (!cur) return;
        clearTimeout(cur.timer);
        clearInterval(cur.poll);
        if (cur.alertObs) cur.alertObs.disconnect();
        cur.root.remove();
        cur = null;
        attr(false);
    }
    function setStep(i) {
        if (!cur) return;
        cur.step = Math.max(cur.step || 0, i);
        [...cur.steps.children].forEach((li, k) => { li.classList.toggle('done', k < cur.step); li.classList.toggle('now', k === cur.step); });
    }
    function buttons(list) {
        cur.buttonBox.textContent = '';
        cur.buttons = list.map(([label, go]) => {
            const b = el('div', 'icefin-live-btn', label);
            b.setAttribute('role', 'button');
            b.tabIndex = -1;
            b.addEventListener('click', go);
            cur.buttonBox.append(b);
            return b;
        });
        focusButton(cur.buttons.length - 1);
    }
    function focusButton(i) {
        if (!cur || !cur.buttons.length) return;
        cur.focus = Math.max(0, Math.min(cur.buttons.length - 1, i));
        cur.buttons.forEach((b, k) => b.classList.toggle('icefin-focused', k === cur.focus));
    }
    const pm = () => window.icefinPlaybackManager;
    function cancel() {
        const p = pm();
        close();
        try { if (p && p.getCurrentPlayer && p.getCurrentPlayer()) p.stop(); } catch (e) { /* nothing playing */ }
    }
    function fail(reason) {
        if (!cur || cur.state === 'failed') return;
        cur.state = 'failed';
        clearTimeout(cur.timer);
        clearInterval(cur.poll);
        cur.root.setAttribute('data-state', 'failed');
        attr('failed');
        cur.title.textContent = `Couldn't start ${cur.channel.Name || 'the channel'}`;
        cur.reason.textContent = reason || 'The server could not open this channel.';
        cur.reason.hidden = false;
        try { const p = pm(); if (p && p.getCurrentPlayer && p.getCurrentPlayer()) p.stop(); } catch (e) { /* nothing playing */ }
        const again = cur.options;
        buttons([['Close', close], ['Try again', () => { close(); const p = pm(); if (p) p.play(again); }]]);
        E.sound('error');
    }
    function succeed() { if (cur && cur.state !== 'failed') close(); }

    function show(channel, options) {
        close();
        ensureStyle();
        const root = el('div');
        root.id = ID;
        root.setAttribute('role', 'alertdialog');
        root.setAttribute('aria-live', 'polite');
        root.setAttribute('data-state', 'connecting');
        const card = el('div', 'icefin-live-card');
        const head = el('div', 'icefin-live-head');
        const logo = el('div', 'icefin-live-logo');
        const c = T.ctx.apiClient();
        const tag = channel.ImageTags && channel.ImageTags.Primary;
        if (c && tag) logo.style.backgroundImage = `url("${c.getScaledImageUrl(channel.Id, { type: 'Primary', maxWidth: 200, tag })}")`;
        const text = el('div');
        const title = el('div', 'icefin-live-title', `Connecting to ${channel.Name || 'the channel'}`);
        const now = channel.CurrentProgram ? channel.CurrentProgram.Name : '';
        text.append(title, el('div', 'icefin-live-sub', [channel.ChannelNumber ? `CH ${channel.ChannelNumber}` : '', now].filter(Boolean).join(' · ')));
        head.append(logo, text, el('div', 'icefin-live-spin'));
        const steps = el('ul', 'icefin-live-steps');
        STEPS.forEach((s) => steps.append(el('li', '', s)));
        const reason = el('div', 'icefin-live-reason');
        reason.hidden = true;
        const buttonBox = el('div', 'icefin-live-buttons');
        card.append(head, steps, reason, buttonBox);
        root.append(card);
        document.body.append(root);
        cur = { channel, options, root, steps, title, reason, buttonBox, buttons: [], focus: 0, state: 'connecting', step: 0 };
        attr('connecting');
        setStep(0);
        buttons([['Cancel', cancel]]);
        const mine = cur;
        cur.timer = setTimeout(() => { if (cur === mine) fail(`Nothing played within ${Math.round(TIMEOUT_MS / 1000)} seconds. The tuner may be busy, or the channel off the air.`); }, TIMEOUT_MS);
        // Progress: the player page opening, then the picture moving.
        cur.poll = setInterval(() => {
            if (cur !== mine) return;
            const p = pm();
            const player = p && p.getCurrentPlayer && p.getCurrentPlayer();
            if (/^#\/video\b/.test(location.hash) || player) setStep(1);
            if (player) setStep(2);
            try { if (player && p.currentTime(player) > 0 && !p.paused(player)) succeed(); } catch (e) { /* not ready */ }
        }, 250);
        // jellyfin-web's own alert for a failed start: its text becomes the reason here.
        cur.alertObs = new MutationObserver(() => {
            if (cur !== mine) return;
            const d = [...document.querySelectorAll('.dialogContainer .dialog')].find((x) => !x.querySelector('.formDialogHeaderTitle') || !/Client Settings/.test(x.textContent));
            if (!d) return;
            const msg = (d.querySelector('.dialogContent, .formDialogContent, .dialogContentInner') || d).textContent.trim().replace(/\s+/g, ' ');
            if (!/error|fail|unable|compatible|tuner|not available|couldn/i.test(msg)) return;
            const btn = d.querySelector('button');
            if (btn) btn.click(); else (d.closest('.dialogContainer') || d).remove();
            fail(msg.slice(0, 280));
        });
        cur.alertObs.observe(document.body, { childList: true, subtree: true });
    }

    // Every channel start goes through the playback manager: wrap its play() once it exists.
    async function channelOf(options) {
        const items = options && options.items;
        if (items && items[0]) return items[0].Type === 'TvChannel' ? items[0] : null;
        const ids = options && options.ids;
        if (!ids || ids.length !== 1) return null;
        const c = T.ctx.apiClient();
        try { const it = await c.getItem(c.getCurrentUserId(), ids[0]); return it && it.Type === 'TvChannel' ? it : null; } catch (e) { return null; }
    }
    // The capability prompt (capabilityPrompt.js) wraps play() too and calls its saved original once answered: hook in
    // under it, around that original, so a channel's dialog comes after any prompt and the prompt's wrapper stays
    // outermost. Without the prompt (after WAIT_PROMPT_MS) play() itself is wrapped.
    const WAIT_PROMPT_MS = 10000;
    const started = Date.now();
    function liveWrap(p, orig) {
        const wrapped = function (options) {
            const result = orig.apply(this, arguments);
            if (T.active()) {
                channelOf(options).then((ch) => {
                    if (!ch) return;
                    // A quick start can be playing before the item lookup returns: then there is nothing to show.
                    try { const pl = p.getCurrentPlayer(); if (pl && p.currentTime(pl) > 0 && !p.paused(pl)) return; } catch (e) { /* not ready */ }
                    show(ch, options);
                    Promise.resolve(result).catch((err) => fail(err && err.message ? err.message : String(err || '')));
                });
            }
            return result;
        };
        wrapped.icefinLive = true;
        return wrapped;
    }
    function wrap() {
        const p = pm();
        if (!p || typeof p.play !== 'function') return false;
        if (p.play.icefinWrapped) {
            if (p.play.icefinOriginal && p.play.icefinOriginal.icefinLive) return true;
            p.play.icefinOriginal = liveWrap(p, p.play.icefinOriginal);
            return true;
        }
        if (p.play.icefinLive) return true;
        if (Date.now() - started < WAIT_PROMPT_MS) return false;
        p.play = liveWrap(p, p.play.bind(p));
        return true;
    }
    const tryWrap = setInterval(() => { if (wrap()) clearInterval(tryWrap); }, 500);
    // The native player's error signal.
    if (window.apiPromise) window.apiPromise.then((api) => { if (api.player && api.player.error) api.player.error.connect((e) => { if (cur) fail(`The player stopped: ${e}`); }); });

    // Modal while it shows: left/right between the buttons, OK presses, Back cancels or closes.
    const hook = (a) => {
        if (!cur) return false;
        if (a === 'left' || a === 'right') { focusButton(cur.focus + (a === 'right' ? 1 : -1)); E.sound('focus'); return true; }
        if (a === 'enter' || a === 'select') { const b = cur.buttons[cur.focus]; if (b) { E.sound('select'); b.click(); } return true; }
        if (a === 'back') { E.sound('back'); if (cur.state === 'failed') close(); else cancel(); return true; }
        return a === 'up' || a === 'down';
    };
    E.addActionHook(hook);
    E.onReset(() => { close(); E.addActionHook(hook); });
    // Keys on the player page (no themed screen there to pass them on).
    const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'enter', Escape: 'back', Backspace: 'back' };
    window.addEventListener('keydown', (e) => {
        if (!cur || !KEYS[e.key] || e.altKey || e.ctrlKey || e.metaKey) return;
        if (hook(KEYS[e.key])) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);

    T.ui.liveConnect = { show: (channel, options) => show(channel, options || {}), fail, close, state: () => (cur ? cur.state : null) };
})();
