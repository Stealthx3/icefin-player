// Icefin: the capability prompt (PLAN 6.3, SPEC "Capability prompt"). Appended to the injected native shell script.
// When this system can't show a source correctly, this asks the user how to play it. It uses jellyfin-web's own
// dialog classes, so the theme engine styles it and jellyfin-web's focus handling makes it remote- and
// controller-navigable. Only options this system has are shown; the server-transcode options also need the user's
// transcoding permission.
//
// When it asks: at the start of a play action (jellyfin-web's playbackManager.play), from the feature's own video
// range, before any cinema-mode intro plays. The answer holds for that whole play action, intros and feature,
// and the next play action asks again; "Remember on this device" keeps it for every later play action here.
// A load that arrives without a play action (RouterComponent holds it) is asked about at load time, as before.
(function () {
    'use strict';
    if (window.icefinCapabilityPrompt || !window.apiPromise) return;
    const ID = 'icefin-capability-prompt';
    const PROMPT = 'capability prompt';
    const TRANSCODE = { transcodeHdr10: 'SDR|HDR10|HDR10Plus|HLG', transcodeSdr: 'SDR' };
    let sessionRanges = null;  // this play action's transcode choice: every device profile asks for these ranges

    // Called by deviceProfile.js for every profile: during a play action that chose a transcode, the server converts
    // video outside the allowed ranges.
    window.icefinPromptProfile = (profile) => {
        if (!sessionRanges) return profile;
        profile.CodecProfiles = (profile.CodecProfiles || []).concat([{
            Type: 'Video',
            Conditions: [{ Condition: 'EqualsAny', Property: 'VideoRangeType', Value: sessionRanges }]
        }]);
        console.info('icefinCapabilityPrompt: profile limited to', sessionRanges);
        return profile;
    };

    function canTranscode() {
        const c = window.ApiClient;
        if (!c || !c.getCurrentUser) return Promise.resolve(false);
        return c.getCurrentUser().then((u) => !!(u && u.Policy && u.Policy.EnableVideoPlaybackTranscoding), () => false);
    }

    // The dialog. Resolves with {choice, remember}.
    function ask(info, allowed) {
        return new Promise((resolve) => {
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
            const remember = document.createElement('input');
            const done = (choice, keep) => { container.remove(); resolve({ choice, remember: !!keep }); };
            for (const o of options) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'raised emby-button block icefin-prompt-option' + (o.id === 'cancel' ? '' : ' button-submit');
                b.style.cssText = 'display:block;width:100%;margin:0.5em 0';
                b.dataset.choice = o.id;
                b.textContent = o.label.charAt(0).toUpperCase() + o.label.slice(1);
                b.addEventListener('click', () => done(o.id, remember.checked));
                body.append(b);
            }
            const label = document.createElement('label');
            label.className = 'checkboxContainer';
            label.style.cssText = 'display:block;margin-top:1em';
            remember.type = 'checkbox';
            remember.className = 'icefin-prompt-remember';
            const span = document.createElement('span');
            span.textContent = ' Remember on this device';
            label.append(remember, span);
            body.append(label);
            dlg.append(head, body);
            container.append(dlg);
            container.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); done('cancel', false); }
            });
            document.body.append(container);
            const first = body.querySelector('button');
            if (first) first.focus();
        });
    }

    // ---- at the start of a play action ----
    function rangeOf(item) {
        const streams = item.MediaStreams || ((item.MediaSources || [])[0] || {}).MediaStreams;
        if (!streams) return null;  // not known from this item object
        const v = streams.find((s) => s.Type === 'Video');
        return v ? (v.VideoRangeType || '') : '';
    }

    // The decision for the play action's feature (its first item), or null when it needs no prompt.
    async function featureDecision(api, options) {
        let item = (options && options.items && options.items[0]) || null;
        if (!item && options && options.ids && options.ids.length) item = { Id: options.ids[0] };
        if (!item || !item.Id || (item.MediaType && item.MediaType !== 'Video')) return null;
        let vrt = rangeOf(item);
        if (vrt === null) {
            const c = window.ApiClient;
            item = await c.getItem(c.getCurrentUserId(), item.Id);
            vrt = rangeOf(item);
        }
        if (!vrt) return null;
        const d = await new Promise((r) => api.router.decide(vrt, r));
        if (!d || d.output !== PROMPT) return null;
        return Object.assign({}, d, { itemId: item.Id, serverId: item.ServerId, name: item.Name });
    }

    function hookPlay(api, pm) {
        if (!pm || (pm.play && pm.play.icefinWrapped)) return;
        const wrapped = async function (options) {
            const self = this, args = arguments;
            const go = () => wrapped.icefinOriginal.apply(self, args);
            if (options && options.icefinRestart) return go();  // this play action's own transcode restart
            sessionRanges = null;
            api.router.clearSession();
            let d = null;
            try { d = await featureDecision(api, options); } catch (e) { console.warn('icefinCapabilityPrompt: no decision before play', e); }
            if (!d) return go();
            const allowed = await canTranscode();
            let answer = { choice: d.remembered, remember: false };
            if (!answer.choice || (TRANSCODE[answer.choice] && !allowed)) answer = await ask(d, allowed);
            if (answer.choice === 'cancel') { console.info('icefinCapabilityPrompt: play action cancelled'); return undefined; }
            api.router.setSessionChoice(d.key, answer.choice, answer.remember);
            if (TRANSCODE[answer.choice]) sessionRanges = TRANSCODE[answer.choice];
            return go();
        };
        wrapped.icefinOriginal = pm.play;
        wrapped.icefinWrapped = true;
        pm.play = wrapped;
    }

    // ---- a load the router held (no play action asked first) ----
    function restartWithTranscode(info, choice) {
        sessionRanges = TRANSCODE[choice];
        const pm = window.icefinPlaybackManager;
        if (!pm || !info.itemId) { console.error('icefinCapabilityPrompt: no playback manager to restart with'); return; }
        // At least one tick: jellyfin-web plays cinema-mode intros only when no start position is given, and they
        // already played.
        setTimeout(() => pm.play({ ids: [info.itemId], serverId: info.serverId, icefinRestart: true,
            startPositionTicks: Math.max(1, (info.startMs || 0) * 10000) }), 600);
    }

    async function onHeld(api, info) {
        const allowed = await canTranscode();
        let answer = { choice: info.remembered, remember: false };
        if (!(answer.choice && TRANSCODE[answer.choice] && allowed)) answer = await ask(info, allowed);
        api.router.resolve(answer.choice, answer.remember);
        if (TRANSCODE[answer.choice]) restartWithTranscode(info, answer.choice);
    }

    window.icefinCapabilityPrompt = { open: () => !!document.getElementById(ID) };
    window.apiPromise.then((api) => {
        if (!api.router) return;
        api.router.promptRequested.connect((info) => onHeld(api, info));
        // inputPlugin.js publishes jellyfin-web's playbackManager when its plugin loads.
        const wait = setInterval(() => {
            if (!window.icefinPlaybackManager) return;
            clearInterval(wait);
            hookPlay(api, window.icefinPlaybackManager);
        }, 250);
    });
})();
