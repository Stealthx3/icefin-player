// Icefin: Client Settings -> Audio test (PLAN 3.8). Appended to the injected native shell script.
// One row per format: Play sends a two-second clip through the current audio settings, then shows what was sent
// (bitstream or PCM, channels, output) and what the receiver should display, so the two can be compared.
(function () {
    'use strict';
    if (window.icefinAudioTestPage || !window.apiPromise) return;
    window.icefinAudioTestPage = true;
    const ID = 'icefin-audiotest-section';

    function describe(r) {
        if (!r.ok) return `Didn't play: ${r.error}`;
        const o = r.output || {};
        const f = String(o.format || '');
        const sent = f.startsWith('spdif') ? `bitstream (${f})` : `PCM, ${o.channels} channels`;
        return `Sent ${sent} via ${o.ao || '?'} · ${r.decision.reason}`;
    }

    window.apiPromise.then((api) => {
        if (!api.audiotest) return;
        const results = {};
        const render = (section) => api.audiotest.formats((formats) => {
            section.querySelectorAll('.icefin-at-body').forEach((n) => n.remove());
            const body = document.createElement('div');
            body.className = 'icefin-at-body';
            const intro = document.createElement('p');
            intro.className = 'fieldDescription';
            intro.textContent = 'Play each clip and compare what your receiver shows with the expected format. The clips use your current audio settings above.';
            body.append(intro);
            for (const f of formats) {
                const row = document.createElement('div');
                row.className = 'icefin-at-row';
                row.setAttribute('data-id', f.id);
                row.style.margin = '0.6em 0';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'raised emby-button icefin-at-play';
                btn.textContent = `Play ${f.label}`;
                btn.addEventListener('click', () => { btn.disabled = true; results[f.id] = { pending: true }; render(section); api.audiotest.play(f.id); });
                const exp = document.createElement('div');
                exp.className = 'fieldDescription';
                exp.textContent = `Receiver should show: ${f.receiverShows}`;
                const res = document.createElement('div');
                res.className = 'fieldDescription icefin-at-result';
                const r = results[f.id];
                res.textContent = !r ? '' : r.pending ? 'Playing…' : describe(r);
                if (r && r.pending) btn.disabled = true;
                row.append(btn, exp, res);
                const fm = r && r.formats;
                if (fm && !fm.ok && fm.rule) {
                    // 3.4 fallback: the sound server didn't take the format at runtime; WirePlumber can be told once.
                    const why = document.createElement('div');
                    why.className = 'fieldDescription icefin-at-formats';
                    why.textContent = `This output didn't accept the format (${fm.error}). A WirePlumber rule fixes it for good:`;
                    const pre = document.createElement('pre');
                    pre.className = 'icefin-at-rule';
                    pre.style.cssText = 'white-space:pre-wrap;font-size:0.8em';
                    pre.textContent = fm.rule;
                    const copy = document.createElement('button');
                    copy.type = 'button';
                    copy.className = 'raised emby-button icefin-at-copy';
                    copy.textContent = 'Copy the rule';
                    copy.addEventListener('click', () => navigator.clipboard.writeText(fm.rule).then(() => { copy.textContent = 'Copied'; }, () => { copy.textContent = 'Select and copy it above'; }));
                    row.append(why, pre, copy);
                }
                body.append(row);
            }
            section.append(body);
        });
        api.audiotest.result.connect((r) => {
            results[r.id] = r;
            const s = document.getElementById(ID);
            if (s) render(s);
        });
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
            h.textContent = 'Audio test';
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
    });
})();
