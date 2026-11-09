// Icefin: the capability prompt (PLAN 6.3, SPEC "Capability prompt"). Appended to the injected native shell script.
// When the router (RouterComponent, "router" on the WebChannel) holds a load because this system can't show the
// source correctly, this asks the user. It uses jellyfin-web's own dialog classes, so the theme engine styles it and
// jellyfin-web's focus handling makes it remote- and controller-navigable. Only options this system has are shown;
// the server-transcode options also need the user's transcoding permission.
(function () {
    'use strict';
    if (window.icefinCapabilityPrompt || !window.apiPromise) return;
    const ID = 'icefin-capability-prompt';
    const TRANSCODE = { transcodeHdr10: 'SDR|HDR10|HDR10Plus|HLG', transcodeSdr: 'SDR' };
    let override = null;  // one-shot device profile change for a transcode restart

    // Called by deviceProfile.js for every profile: the next one asks the server to convert video outside the
    // allowed ranges.
    window.icefinPromptProfile = (profile) => {
        if (!override) return profile;
        const ranges = override;
        override = null;
        profile.CodecProfiles = (profile.CodecProfiles || []).concat([{
            Type: 'Video',
            Conditions: [{ Condition: 'EqualsAny', Property: 'VideoRangeType', Value: ranges }]
        }]);
        console.info('icefinCapabilityPrompt: profile limited to', ranges);
        return profile;
    };

    function canTranscode() {
        const c = window.ApiClient;
        if (!c || !c.getCurrentUser) return Promise.resolve(false);
        return c.getCurrentUser().then((u) => !!(u && u.Policy && u.Policy.EnableVideoPlaybackTranscoding), () => false);
    }

    function restartWithTranscode(info, choice) {
        override = TRANSCODE[choice];
        const pm = window.icefinPlaybackManager;
        if (!pm || !info.itemId) { console.error('icefinCapabilityPrompt: no playback manager to restart with'); return; }
        setTimeout(() => pm.play({ ids: [info.itemId], serverId: info.serverId, startPositionTicks: (info.startMs || 0) * 10000 }), 600);
    }

    function answer(api, info, choice, remember) {
        const d = document.getElementById(ID);
        if (d) d.remove();
        api.router.resolve(choice, !!remember);
        if (TRANSCODE[choice]) restartWithTranscode(info, choice);
    }

    async function show(api, info) {
        const allowed = await canTranscode();
        if (info.remembered && TRANSCODE[info.remembered] && allowed) { answer(api, info, info.remembered, false); return; }
        const options = info.options.filter((o) => allowed || !TRANSCODE[o.id]);
        const old = document.getElementById(ID);
        if (old) old.remove();

        const container = document.createElement('div');
        container.id = ID;
        container.className = 'dialogContainer';
        const dlg = document.createElement('div');
        dlg.className = 'focuscontainer dialog dialog-fixedSize dialog-small formDialog opened';
        dlg.setAttribute('role', 'alertdialog');
        dlg.setAttribute('aria-labelledby', ID + '-title');
        const head = document.createElement('div');
        head.className = 'formDialogHeader';
        const h = document.createElement('h3');
        h.className = 'formDialogHeaderTitle';
        h.id = ID + '-title';
        h.textContent = "This video can't be shown correctly here";
        head.append(h);
        const body = document.createElement('div');
        body.className = 'formDialogContent';
        body.style.padding = '1em 2em 2em';
        const p = document.createElement('p');
        p.textContent = `${info.name ? info.name + ': ' : ''}${info.reason}. Choose how to play it.`;
        body.append(p);
        for (const o of options) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'raised emby-button block icefin-prompt-option' + (o.id === 'cancel' ? '' : ' button-submit');
            b.style.cssText = 'display:block;width:100%;margin:0.5em 0';
            b.dataset.choice = o.id;
            b.textContent = o.label.charAt(0).toUpperCase() + o.label.slice(1);
            b.addEventListener('click', () => answer(api, info, o.id, remember.checked));
            body.append(b);
        }
        const label = document.createElement('label');
        label.className = 'checkboxContainer';
        label.style.cssText = 'display:block;margin-top:1em';
        const remember = document.createElement('input');
        remember.type = 'checkbox';
        remember.className = 'icefin-prompt-remember';
        const span = document.createElement('span');
        span.textContent = ' Remember on this device';
        label.append(remember, span);
        body.append(label);
        dlg.append(head, body);
        container.append(dlg);
        container.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); answer(api, info, 'cancel', false); }
        });
        document.body.append(container);
        const first = body.querySelector('button');
        if (first) first.focus();
    }

    window.icefinCapabilityPrompt = { open: () => !!document.getElementById(ID) };
    window.apiPromise.then((api) => {
        if (!api.router) return;
        api.router.promptRequested.connect((info) => show(api, info));
    });
})();
