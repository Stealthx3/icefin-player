// Icefin: Add to Steam (Steam Shortcut Standard v1, D43, PLAN 11.10). Appended to the injected native shell script.
// The page side of the "steam" component (src/icefin/steam/SteamComponent.h):
//   - Client Settings -> Steam: the state (Add to Steam / Update art / Remove from Steam, or why it can't);
//   - the first-run offer: once, when Steam is here and IceFin Player isn't in it. "Not now" is remembered and the offer
//     never comes back by itself; the setting stays;
//   - Add and Remove ask the user to quit Steam completely first (a running Steam rewrites its shortcuts from memory
//     and drops the change). The sandbox can't see Steam's process, so this confirmation is the check;
//   - Steam installed as a Flatpak needs permission to start other Flatpak apps: shown with the command, never run.
// The user sees plain sentences: no paths, no shortcut IDs. The silent art refresh at start is the native side's.
(function () {
    'use strict';
    if (window.icefinSteam || !window.apiPromise) return;
    window.icefinSteam = true;
    const ID = 'icefin-steam-section';
    const DLG = 'icefin-steam-dialog';
    const APP = 'IceFin Player';

    const el = (tag, props, ...kids) => {
        const e = Object.assign(document.createElement(tag), props || {});
        kids.forEach((k) => k != null && e.append(k));
        return e;
    };
    const p = (text, cls) => el('p', { className: 'fieldDescription' + (cls ? ' ' + cls : ''), textContent: text });
    const button = (text, cls, submit) => el('button', { type: 'button', textContent: text,
        className: 'raised emby-button ' + cls + (submit ? ' button-submit' : '') });

    // A command the user runs themselves, with a copy button (the clipboard is native: Gamescope has no web clipboard).
    function command(api, text) {
        const code = el('code', { className: 'icefin-steam-command', textContent: text });
        code.style.cssText = 'display:block;user-select:all;white-space:pre-wrap;word-break:break-all;font-size:0.85em;padding:0.6em 0.8em;margin:0.4em 0;border-radius:0.3em;background:var(--icefin-color-inputBackground, Field);color:var(--icefin-color-text, FieldText)';
        const copy = button('Copy command', 'icefin-steam-copy');
        copy.addEventListener('click', () => { api.steam.copyText(text); copy.textContent = 'Copied'; });
        return el('div', { className: 'icefin-steam-cmd' }, code, copy);
    }

    // Who was changed: "Steam: Alex, Sam" or "Steam (Flatpak): one account".
    function accountsLine(accounts) {
        const groups = {};
        for (const a of accounts || []) (groups[a.flatpak ? 'Steam (Flatpak)' : 'Steam'] = groups[a.flatpak ? 'Steam (Flatpak)' : 'Steam'] || []).push(a.name);
        return Object.keys(groups).map((k) => {
            const named = groups[k].filter(Boolean), unnamed = groups[k].length - named.length;
            const parts = named.concat(unnamed ? [unnamed === 1 && !named.length ? 'one account' : `${unnamed} more account${unnamed > 1 ? 's' : ''}`] : []);
            return `${k}: ${parts.join(', ')}`;
        }).join('; ');
    }

    // ---- dialogs (jellyfin-web's dialog classes, like the capability prompt, so themes style them) ----
    // Resolves with the chosen button's id, or 'cancel' for Escape, Backspace or a pad's or remote's Back.
    function dialog(title, body, buttons) {
        return new Promise((resolve) => {
            const old = document.getElementById(DLG);
            if (old) old.remove();
            const container = el('div', { id: DLG, className: 'dialogContainer' });
            const dlg = el('div', { className: 'focuscontainer dialog dialog-fixedSize dialog-small formDialog opened' });
            dlg.setAttribute('role', 'alertdialog');
            dlg.setAttribute('aria-labelledby', DLG + '-title');
            const head = el('div', { className: 'formDialogHeader' },
                el('h3', { className: 'formDialogHeaderTitle', id: DLG + '-title', textContent: title }));
            const content = el('div', { className: 'formDialogContent' });
            content.style.padding = '1em 2em 2em';
            body.forEach((b) => content.append(typeof b === 'string' ? el('p', { textContent: b }) : b));
            const E = window.icefinTheme && window.icefinTheme._engine;
            let offBack = null;
            const done = (id) => { if (offBack) offBack(); container.remove(); resolve(id); };
            // A pad's or remote's Back goes through the theme engine's action hook, not a keydown here.
            if (E && E.addActionHook) {
                offBack = E.addActionHook((a) => {
                    if (a !== 'back' || !container.isConnected) return false;
                    if (E.sound) E.sound('back');
                    done('cancel');
                    return true;
                });
            }
            for (const b of buttons) {
                const btn = button(b.label, 'block icefin-steam-choice', b.primary);
                btn.style.cssText = 'display:block;width:100%;margin:0.5em 0';
                btn.dataset.choice = b.id;
                btn.addEventListener('click', () => done(b.id));
                content.append(btn);
            }
            dlg.append(head, content);
            container.append(dlg);
            container.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); done('cancel'); }
            });
            // jellyfin-web's input layer (stock, no theme) sends a cancelable "command" event to the focused element.
            container.addEventListener('command', (e) => {
                if (e.detail && e.detail.command === 'back') { e.preventDefault(); e.stopPropagation(); done('cancel'); }
            });
            document.body.append(container);
            const first = content.querySelector('button');
            if (first) first.focus();
        });
    }

    let lastState = {};
    let API = null;
    let artNote = '';  // the last Update art result, kept across re-renders
    const result = (api) => new Promise((resolve) => {
        const on = (r) => { api.steam.finished.disconnect(on); resolve(r); };
        api.steam.finished.connect(on);
    });

    // Add or Remove: the close-Steam confirmation (and, before adding, the Flatpak Steam notice), then the result.
    async function change(api, op) {
        const st = lastState;
        const body = [
            'Quit Steam completely first: use Steam → Exit, and make sure its icon is gone from the system tray. ' +
            'Steam rewrites its shortcuts when it closes, so a change made while it runs is lost.'
        ];
        if (op === 'add' && st.flatpakSteam) {
            body.push('Steam is installed as a Flatpak here. It needs permission to start other Flatpak apps, or Play in ' +
                `Steam won't open ${APP}. Run this once in a terminal:`);
            body.push(command(api, st.spawnCommand));
        }
        const go = await dialog(op === 'add' ? `Add ${APP} to Steam` : `Remove ${APP} from Steam`, body, [
            { id: 'go', label: op === 'add' ? 'Steam is closed: add it' : 'Steam is closed: remove it', primary: true },
            { id: 'cancel', label: 'Cancel' }
        ]);
        if (go !== 'go') return;
        const wait = result(api);
        if (op === 'add') api.steam.add(); else api.steam.remove();
        artNote = '';
        lastState = Object.assign({}, lastState, { busy: true });
        render();
        const r = await wait;
        const who = accountsLine(r.accounts);
        if (r.ok) {
            await dialog(op === 'add' ? `${APP} is in Steam` : `${APP} was removed from Steam`, [
                op === 'add' ? `Start Steam to see it, with its own artwork, in your library and in the IceSuite collection.`
                    : 'Start Steam to see the change.',
                who ? (op === 'add' ? 'Added for ' : 'Removed for ') + who + '.' : null
            ].filter(Boolean), [{ id: 'ok', label: 'OK', primary: true }]);
        } else {
            await dialog(op === 'add' ? `Couldn't add ${APP} to Steam` : `Couldn't remove ${APP} from Steam`,
                [r.error || 'Something went wrong.'], [{ id: 'ok', label: 'OK', primary: true }]);
        }
        // Back in Client Settings: focus on the section's first button again.
        const back = document.querySelector(`#${ID} button`);
        if (back) back.focus({ preventScroll: true });
    }

    // ---- Client Settings -> Steam ----
    function render() {
        const section = document.getElementById(ID);
        if (!section) return;
        const api = API;
        const st = lastState;
        // A redraw keeps focus on the same button (a remote or pad would otherwise lose its place).
        const had = section.contains(document.activeElement) && [...document.activeElement.classList].find((c) => c.startsWith('icefin-steam-'));
        section.querySelectorAll('.icefin-steam-body').forEach((n) => n.remove());
        const body = el('div', { className: 'icefin-steam-body' });
        section.dataset.state = !st.checked ? 'checking' : st.busy ? 'busy' : !st.steam ? (st.reachable ? 'nosteam' : 'unreachable') : st.present ? 'present' : 'absent';
        if (!st.checked || st.busy) {
            body.append(p(st.checked ? 'Changing Steam…' : 'Looking for Steam…'));
        } else if (!st.steam && !st.reachable) {
            body.append(p(`Steam's folder isn't reachable from ${APP}. To let ${APP} add itself to Steam, run this once in a terminal, then restart ${APP}:`));
            body.append(command(api, st.reachCommand));
        } else if (!st.steam) {
            body.append(p('Steam wasn\'t found on this computer (or it has no signed-in account yet).'));
        } else if (!st.present) {
            body.append(p(`Add ${APP} to your Steam library with its own artwork, to start it from Steam, Big Picture or Game Mode.`));
            const add = button('Add to Steam', 'icefin-steam-add', true);
            add.addEventListener('click', () => change(api, 'add'));
            body.append(add);
        } else {
            const who = accountsLine((st.accounts || []).filter((a) => a.present));
            body.append(p(`${APP} is in your Steam library` + (who ? ` (${who}).` : '.')));
            const note = p(artNote, 'icefin-steam-note');
            const art = button('Update art', 'icefin-steam-art');
            art.addEventListener('click', async () => {
                const wait = result(api);
                api.steam.updateArt();
                const r = await wait;
                artNote = r.ok ? 'The artwork in Steam is up to date. Restart Steam if it still shows the old images.' : (r.error || 'Something went wrong.');
                render();
            });
            const remove = button('Remove from Steam', 'icefin-steam-remove');
            remove.addEventListener('click', () => change(api, 'remove'));
            body.append(el('div', { className: 'icefin-steam-buttons' }, art, ' ', remove), note);
            body.append(p(`Uninstalling ${APP} can't remove it from Steam: use Remove from Steam first, or delete the shortcut in Steam.`));
        }
        section.append(body);
        const again = had && (body.querySelector('.' + had) || body.querySelector('button'));
        if (again && !document.getElementById(DLG)) again.focus({ preventScroll: true });
    }

    function attach(dialogEl) {
        const content = dialogEl && dialogEl.querySelector('.formDialogContent');
        if (!content || content.querySelector('#' + ID)) return;
        const section = el('fieldset', { id: ID, className: 'editItemMetadataForm editMetadataForm dialog-content-centered' });
        section.style.border = 0;
        section.style.outline = 0;
        section.append(el('legend', {}, el('h2', { textContent: 'Steam' })));
        content.append(section);
        render();
    }

    // ---- the first-run offer ----
    let offered = false;
    // Not over a dialog (the capability prompt, Client Settings, a menu) or playback; the offer waits for a quiet moment.
    const quiet = () => !document.querySelector('.dialogContainer') && !/\/video\b/.test(location.hash)
        && document.visibilityState !== 'hidden';
    function maybeOffer(api) {
        if (offered || !lastState.offer) return;
        offered = true;
        const ask = async () => {
            if (!quiet()) { setTimeout(ask, 2000); return; }
            if (!lastState.offer) return;
            const a = await dialog(`Add ${APP} to Steam?`, [
                `Start ${APP} from your Steam library, Big Picture or Game Mode, with its own artwork.`,
                'You can do this later in Client Settings → Steam.'
            ], [{ id: 'add', label: 'Add to Steam', primary: true }, { id: 'later', label: 'Not now' }]);
            api.steam.dismissOffer();  // answered: it never comes back by itself
            if (a === 'add') change(api, 'add');
        };
        setTimeout(ask, 4000);  // after the first screen has drawn
    }

    window.apiPromise.then((api) => {
        if (!api.steam) return;
        API = api;
        const update = (st) => {
            lastState = st || {};
            if (!lastState.available) return;
            render();
            maybeOffer(api);
        };
        api.steam.stateChanged.connect(update);
        api.steam.state(update);
        const scan = () => {
            if (!lastState.available) return;
            document.querySelectorAll('.formDialogHeaderTitle').forEach((t) => {
                if (t.textContent === 'Client Settings') attach(t.closest('.dialog'));
            });
        };
        const start = () => new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
        if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    });
})();
