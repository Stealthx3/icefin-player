// Icefin: the Client Settings dialog's arrangement and drop-downs (PLAN 9.22). Appended to the injected native shell
// script. nativeshell.js builds the dialog (upstream); this arranges it after the fact, every time it appears or a
// section re-renders, so upstream stays untouched:
//   Main, Theme, Controllers, Subtitles,
//   [Video tests | Video]   (Video tests is Icefin's Hardware section; Web GPU Buffers, Renderer and HDR Output lead Video)
//   [Audio test  | Audio]
//   Other, Saved Server, and the Close button.
// Nintendo Button Layout moves to Controllers. Two columns where the dialog is wide enough, one otherwise.
// Every select gets an in-page drop-down: a box and a chevron, and a list opened by a mouse press, Enter, Space or the
// remote's OK; arrows move, Enter or a click picks, Escape or Back closes it. The list lives inside the dialog, so the
// theme engine's rule that hides stray top-level page UI under a themed screen can't hide it.
(function () {
    'use strict';
    if (window.icefinClientSettings) return;
    window.icefinClientSettings = true;

    const el = (tag, props, ...kids) => {
        const e = Object.assign(document.createElement(tag), props || {});
        kids.forEach((k) => k != null && e.append(k));
        return e;
    };

    // ---- drop-downs ----
    const STYLE = `
.icefin-dd { position: relative; display: block; }
.icefin-dd > select { width: 100%; box-sizing: border-box; padding-right: 2.6em !important; cursor: pointer; appearance: none; -webkit-appearance: none;
  background-color: var(--icefin-color-inputBackground, Field) !important; color: var(--icefin-color-text, FieldText) !important;
  border: 0.1em solid var(--icefin-color-divider, GrayText) !important; border-radius: 0.3em; opacity: 1 !important; }
.icefin-dd > select:disabled { cursor: default; color: var(--icefin-color-textSecondary, GrayText) !important; }
.icefin-dd > select:focus { outline: none; border-color: var(--icefin-color-focus, Highlight) !important; box-shadow: 0 0 0 0.12em var(--icefin-color-focus, Highlight); }
.icefin-dd::after { content: ''; position: absolute; right: 1em; top: 50%; width: 0.55em; height: 0.55em; margin-top: -0.4em; pointer-events: none;
  border-right: 0.15em solid var(--icefin-color-text, FieldText); border-bottom: 0.15em solid var(--icefin-color-text, FieldText); transform: rotate(45deg); }
.icefin-dd.disabled::after { opacity: 0.4; }
.icefin-dd-list { position: fixed; z-index: 2147483647; max-height: 50vh; overflow-y: auto; box-sizing: border-box; padding: 0.3em 0; border-radius: 0.3em;
  background: var(--icefin-color-surfaceRaised, var(--icefin-color-surface, Canvas)); color: var(--icefin-color-text, CanvasText);
  border: 0.1em solid var(--icefin-color-divider, GrayText); box-shadow: 0 0.8em 2em rgb(var(--icefin-color-background-channel, 0 0 0) / 0.5); scrollbar-width: thin;
  visibility: visible !important; }
.icefin-dd-option { padding: 0.6em 1em; cursor: pointer; outline: none; }
.icefin-dd-option[aria-selected="true"] { font-weight: 600; }
.icefin-dd-option[aria-selected="true"]::after { content: " ✓"; }
.icefin-dd-option:focus, .icefin-dd-option:hover { background: var(--icefin-color-focus, Highlight); color: var(--icefin-color-onFocus, HighlightText); }
/* the arrangement */
.formDialog.icefin-cs { width: min(96vw, 112em) !important; max-width: none !important; }
.icefin-cs-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr); gap: 0 3em; align-items: start; padding: 0 2em; }
.icefin-cs-row > fieldset { max-width: none !important; margin: 0 !important; min-width: 0; }
@media (max-width: 900px) { .icefin-cs-row { grid-template-columns: minmax(0, 1fr); padding: 0; } }
`;
    function style() {
        if (document.getElementById('icefin-cs-style')) return;
        document.head.append(el('style', { id: 'icefin-cs-style', textContent: STYLE }));
    }

    let open = null;
    function close(refocus) {
        if (!open) return;
        const { list, select } = open;
        open = null;
        list.remove();
        if (refocus) select.focus({ preventScroll: true });
    }
    function pick(select, value) {
        if (select.value !== value) {
            select.value = value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        close(true);
    }
    function openList(select) {
        if (select.disabled) return;
        close(false);
        const r = select.getBoundingClientRect();
        const list = el('div', { className: 'icefin-dd-list' });
        list.setAttribute('role', 'listbox');
        list.style.left = `${r.left}px`;
        list.style.width = `${r.width}px`;
        const below = window.innerHeight - r.bottom, above = r.top;
        if (below >= 200 || below >= above) list.style.top = `${r.bottom + 2}px`; else list.style.bottom = `${window.innerHeight - r.top + 2}px`;
        let current = null;
        [...select.options].forEach((o) => {
            const it = el('div', { className: 'icefin-dd-option', tabIndex: 0, textContent: o.textContent });
            it.setAttribute('role', 'option');
            it.dataset.value = o.value;
            if (o.value === select.value) { it.setAttribute('aria-selected', 'true'); current = it; }
            it.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); pick(select, o.value); });
            list.append(it);
        });
        list.addEventListener('keydown', (e) => {
            const items = [...list.children], i = items.indexOf(document.activeElement);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const it = items[Math.max(0, Math.min(items.length - 1, (i < 0 ? 0 : i) + (e.key === 'ArrowDown' ? 1 : -1)))];
                it.focus({ preventScroll: true });
                if (it.offsetTop < list.scrollTop) list.scrollTop = it.offsetTop;
                else if (it.offsetTop + it.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = it.offsetTop + it.offsetHeight - list.clientHeight;
            } else if (e.key === 'Enter' || e.key === ' ') {
                if (i >= 0) pick(select, items[i].dataset.value);
            } else if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
                close(true);
            } else if (e.key === 'Tab') {
                close(true);
                return;
            } else {
                return;
            }
            e.preventDefault();
            e.stopImmediatePropagation();
        }, true);
        // jellyfin-web's input layer (remote, gamepad) sends a cancelable "command" event to the focused element.
        list.addEventListener('command', (e) => {
            if (e.detail && e.detail.command === 'back') { e.preventDefault(); e.stopPropagation(); close(true); }
        });
        // Inside the dialog itself: jellyfin-web keeps focus within the open dialog, and the theme engine hides stray
        // top-level page UI under a themed screen. The dialog may be transformed (its opening animation), which makes it
        // the frame for fixed positioning: measure where the list landed and correct by the difference.
        (select.closest('.formDialog, .dialog') || select.closest('.dialogContainer') || document.body).append(list);
        const got = list.getBoundingClientRect();
        const dx = r.left - got.left;
        const dy = list.style.top ? (r.bottom + 2) - got.top : (r.top - 2) - got.bottom;
        if (Math.abs(dx) > 0.5) list.style.left = `${parseFloat(list.style.left) + dx}px`;
        if (Math.abs(dy) > 0.5) {
            if (list.style.top) list.style.top = `${parseFloat(list.style.top) + dy}px`;
            else list.style.bottom = `${parseFloat(list.style.bottom) - dy}px`;
        }
        open = { list, select };
        const first = current || list.firstChild;
        if (first) {
            first.focus({ preventScroll: true });
            list.scrollTop = Math.max(0, first.offsetTop - list.clientHeight / 2);
        }
    }
    function dropdown(select) {
        if (select.multiple || select.closest('.icefin-dd')) return;
        style();
        const wrap = el('div', { className: 'icefin-dd' });
        select.parentNode.insertBefore(wrap, select);
        wrap.append(select);
        const sync = () => wrap.classList.toggle('disabled', select.disabled);
        new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ['disabled'] });
        sync();
        let pressed = false;  // a mouse press handled here; its click that follows is not a second open
        select.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            pressed = true;
            select.focus({ preventScroll: true });
            if (open && open.select === select) close(true); else openList(select);
        });
        select.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ' || (e.key === 'ArrowDown' && e.altKey) || e.key === 'F4') { e.preventDefault(); e.stopPropagation(); openList(select); }
        });
        select.addEventListener('click', (e) => {
            if (pressed) { pressed = false; return; }
            e.preventDefault();
            if (!open) openList(select);
        });
    }
    document.addEventListener('mousedown', (e) => { if (open && !open.list.contains(e.target) && e.target !== open.select) close(false); }, true);
    window.addEventListener('resize', () => close(false));
    document.addEventListener('scroll', (e) => { if (open && !open.list.contains(e.target)) close(false); }, true);
    window.icefinDropdown = dropdown;

    // ---- the arrangement ----
    const legend = (fs) => ((fs.querySelector(':scope > legend h2') || {}).textContent || '').trim().toLowerCase();
    const setting = (fs, prefix) => fs && [...fs.querySelectorAll(':scope > label.inputContainer')].find((l) => {
        const t = l.querySelector('.inputLabel, label') || l;
        return (t.textContent || l.textContent || '').trim().startsWith(prefix);
    });
    // Settings that live in another section: [source, label prefix, target]. They're marked when moved; when the source
    // section re-renders (nativeshell rebuilds it on value updates), the stale moved copy gives way to the fresh one.
    const MOVES = [['main', 'Web GPU Buffers', 'video'], ['main', 'Renderer', 'video'], ['main', 'HDR Output', 'video'],
        ['main', 'Nintendo Button Layout', 'controllers']];

    function arrange(content) {
        const dialog = content.closest('.formDialog');
        if (dialog) dialog.classList.add('icefin-cs');
        const fs = {};
        for (const f of content.querySelectorAll('fieldset')) {
            if (f.id === 'icefin-hardware-section') fs.videotests = f;
            else if (f.id === 'icefin-controllers-section') fs.controllers = f;
            else if (f.id === 'icefin-audiotest-section') fs.audiotest = f;
            else if (f.parentElement === content || f.parentElement.classList.contains('icefin-cs-row')) fs[legend(f)] = fs[legend(f)] || f;
        }
        // Hardware is "Video tests" here.
        const vt = fs.videotests && fs.videotests.querySelector(':scope > legend h2');
        if (vt && vt.textContent !== 'Video tests') vt.textContent = 'Video tests';
        // Moved settings, in order (the Video ones lead it, in the listed order).
        const placed = {};
        for (const [from, prefix, to] of MOVES) {
            const target = fs[to];
            if (!target) continue;
            const fresh = setting(fs[from], prefix);
            const key = prefix.replace(/\W+/g, '-').toLowerCase();
            if (fresh) {
                target.querySelectorAll(`[data-icefin-moved="${key}"]`).forEach((x) => x.remove());
                fresh.dataset.icefinMoved = key;
            }
            const item = fresh || target.querySelector(`[data-icefin-moved="${key}"]`);
            if (!item) continue;
            const after = placed[to] || target.querySelector(':scope > legend');
            if (after && after.nextSibling !== item) after.after(item);
            placed[to] = item;
        }
        // Rows of two.
        const row = (id, left, right) => {
            if (!left || !right) return right || left;
            let r = content.querySelector(`#${id}`);
            if (!r) r = el('div', { id, className: 'icefin-cs-row' });
            if (r.firstChild !== left) r.prepend(left);
            if (left.nextSibling !== right) left.after(right);
            return r;
        };
        const order = [fs.main, fs.theme, fs.controllers, fs.subtitles,
            row('icefin-cs-video', fs.videotests, fs.video), row('icefin-cs-audio', fs.audiotest, fs.audio),
            fs.other, fs['saved server']];
        // Anything else nativeshell or a plugin adds keeps its place after these, before the Close button.
        const close = [...content.children].find((c) => c.tagName === 'DIV' && c.querySelector(':scope > button') && !c.classList.contains('icefin-cs-row'));
        let prev = null;
        for (const node of order) {
            if (!node) continue;
            if (prev ? prev.nextSibling !== node : content.firstChild !== node) {
                if (prev) prev.after(node); else content.prepend(node);
            }
            prev = node;
        }
        if (close && content.lastChild !== close) content.append(close);
        content.querySelectorAll('select').forEach(dropdown);
    }

    let pending = false;
    const scan = () => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
            pending = false;
            document.querySelectorAll('.formDialogHeaderTitle').forEach((t) => {
                if (t.textContent !== 'Client Settings') return;
                const content = t.closest('.dialog') && t.closest('.dialog').querySelector('.formDialogContent');
                if (content) arrange(content);
            });
        });
    };
    const start = () => new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
