// Icefin: Client Settings -> Hardware (PLAN 4.1). Appended to the injected native shell script.
// Adds a Hardware section to nativeshell.js's Client Settings dialog when it opens: the decoder self-test result
// (which decoder each sample used and how fast it decoded), whether the web layer is GPU-accelerated (4.3), and a
// button to run the test again.
(function () {
    'use strict';
    if (window.icefinHardwarePage || !window.apiPromise) return;
    const ID = 'icefin-hardware-section';

    const el = (tag, props, ...kids) => {
        const e = Object.assign(document.createElement(tag), props || {});
        kids.forEach((k) => e.append(k));
        return e;
    };

    function render(section, r) {
        section.querySelectorAll('.icefin-hw-body').forEach((n) => n.remove());
        const body = el('div', { className: 'icefin-hw-body' });
        if (r.running) {
            body.append(el('p', { className: 'fieldDescription', textContent: 'Testing the decoders…' }));
        } else if (!r.samples || !r.samples.length) {
            body.append(el('p', { className: 'fieldDescription', textContent: 'Not tested yet on this machine.' }));
        } else {
            const table = el('table', { className: 'icefin-hw-table' });
            table.style.cssText = 'width:100%;border-collapse:collapse;margin:0.5em 0;text-align:left';
            table.append(el('tr', {}, ...['Codec', 'Decoder', 'Speed'].map((h) => el('th', { textContent: h }))));
            for (const s of r.samples) {
                const dec = !s.ok ? `failed: ${s.error}` : s.hardware ? `hardware (${s.hwdec})` : 'software';
                const speed = s.ok ? `${s.speed.toFixed(1)}× real time` : '';
                const tr = el('tr', { className: 'icefin-hw-row' },
                    ...[s.codec.toUpperCase(), dec, speed].map((t) => el('td', { textContent: t })));
                tr.setAttribute('data-codec', s.codec);
                table.append(tr);
            }
            body.append(table);
            const tc = (r.transcode || []).map((c) => c.toUpperCase());
            body.append(el('p', { className: 'fieldDescription icefin-hw-transcode',
                textContent: tc.length ? `The server will convert ${tc.join(', ')} for this machine.` : 'Every tested format plays directly on this machine.' }));
            body.append(el('p', { className: 'fieldDescription', textContent: `Tested ${new Date(r.time).toLocaleString()} · ${r.fingerprint}` }));
        }
        const web = r.web || {};
        const f = web.features || {};
        body.append(el('p', { className: 'fieldDescription icefin-hw-web', textContent: !web.features ? 'Web layer: checking…'
            : `Web layer: ${web.accelerated ? 'GPU-accelerated' : 'not GPU-accelerated'} (rasterization: ${f.Rasterization || '?'}; compositing: ${f.Compositing || '?'})`
              + (web.gbm === false ? ' · GBM off' : '') }));
        const btn = el('button', { className: 'raised emby-button icefin-hw-run', type: 'button', textContent: 'Test again', disabled: !!r.running });
        // Display (6.1): what the router knows about the screen the window is on.
        window.apiPromise.then((api) => api.router && api.router.display((d) => {
            const lum = d.maxLuminance >= 0 ? `, peak ${d.maxLuminance} nits, reference white ${d.referenceLuminance}` : '';
            const text = d.hdr === 'yes' ? `HDR (${d.transfer}, ${d.primaries}${lum})` : d.hdr === 'no' ? `SDR (${d.transfer || '?'}${lum})` : `unknown: ${d.error}`;
            body.insertBefore(el('p', { className: 'fieldDescription icefin-hw-display', textContent: `Display: ${text}` }), btn);
        }));
        // The capability model (6.7): renderer, how each kind of video plays here, the receiver, versions.
        window.apiPromise.then((api) => api.router && api.router.capabilities && api.router.capabilities((c) => {
            if (!c || !c.renderer) return;
            const v = c.video || {};
            const plays = Object.keys(v).map((k) => `${k}: ${v[k].output}`).join(' · ');
            const a = c.audio || {};
            const recv = a.valid ? `Receiver: ${a.name || 'unnamed'} (${(a.codecs || []).join(', ') || 'PCM'}, ${a.lpcmChannels || 2} ch)`
                : a.hdmi ? 'Receiver: no valid ELD' : 'Receiver: not read yet (read when a video plays over HDMI)';
            const ver = c.versions || {};
            const lines = [
                `Playback here: ${plays}`,
                (c.renderer.vulkanAvailable ? 'A Vulkan GPU is available: the capability prompt can switch to it.' : ''),
                recv,
                `Versions: mpv ${ver.mpv || '?'}, FFmpeg ${ver.ffmpeg || '?'}, libplacebo ${ver.libplacebo || '?'}, Qt ${ver.qt || '?'}`
            ].filter(Boolean);
            for (const t of lines) body.insertBefore(el('p', { className: 'fieldDescription icefin-hw-capability', textContent: t }), btn);
        }));
        // Playback choices remembered from the capability prompt (6.3), with a reset.
        window.apiPromise.then((api) => api.router && api.router.rememberedChoices((m) => {
            const n = Object.keys(m || {}).length;
            const row = el('p', { className: 'fieldDescription icefin-hw-choices', textContent: n ? `Remembered playback choices: ${n}. ` : 'No remembered playback choices.' });
            if (n) {
                const forget = el('button', { className: 'raised emby-button icefin-hw-forget', type: 'button', textContent: 'Forget them' });
                forget.addEventListener('click', () => { api.router.forgetChoices(); row.textContent = 'No remembered playback choices.'; });
                row.append(forget);
            }
            body.insertBefore(row, btn);
        }));
        btn.addEventListener('click', () => window.apiPromise.then((api) => { api.hardware.run(); render(section, Object.assign({}, r, { running: true })); }));
        body.append(btn);
        section.append(body);
    }

    function attach(api, dialog) {
        const content = dialog.querySelector('.formDialogContent');
        if (!content || content.querySelector('#' + ID)) return;
        const section = el('fieldset', { id: ID, className: 'editItemMetadataForm editMetadataForm dialog-content-centered' });
        section.style.border = 0;
        section.style.outline = 0;
        section.append(el('legend', {}, el('h2', { textContent: 'Hardware' })));
        content.append(section);
        api.hardware.results((r) => render(section, r));
        api.hardware.checkWeb();
    }

    window.icefinHardwarePage = true;
    window.apiPromise.then((api) => {
        if (!api.hardware) return;
        const scan = () => document.querySelectorAll('.formDialogHeaderTitle').forEach((t) => {
            if (t.textContent === 'Client Settings') attach(api, t.closest('.dialog'));
        });
        const start = () => new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
        if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
        const redraw = () => api.hardware.results((r) => { const s = document.getElementById(ID); if (s) render(s, r); });
        api.hardware.finished.connect(redraw);
        api.hardware.webStatusReady.connect(redraw);
    });
})();
