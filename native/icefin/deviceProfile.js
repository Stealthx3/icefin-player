// Icefin: the Auto device profile (PLAN 6.4, SPEC "Device profile"). Appended to the injected native shell script.
// nativeshell.js's getDeviceProfile (upstream, with its force-transcode switches) is wrapped (ICEFIN-HOOK there):
//  1. Auto (video.icefin_auto_profile, default on): codecs the decoder self-test (4.1) found neither hardware- nor
//     real-time-software-decodable on this machine are sent for server conversion; everything else direct-plays.
//     They come from the capability model (6.7, router.capabilities()), which also says how each kind of video plays
//     here; HDR and Dolby Vision are never removed from the profile, because the capability prompt (6.3) asks at play
//     time where this renderer can't show them.
//  2. The capability prompt's one-shot choice (6.3), if any.
//  3. Upstream's force-transcode switches stay as overrides: they are already in the profile this wraps. Force
//     Transcode Dolby Vision defaults to off in Icefin (settings_description.json, 6.6): upstream's on would have the
//     server convert every profile 5 film, past the Vulkan renderer and the prompt.
(function () {
    'use strict';
    if (window.icefinAdjustProfile) return;
    let transcode = [];  // from the capability model (6.7); refreshed when it changes
    let video = {};      // how each kind of video plays here (diagnostics)

    function autoOn() {
        const v = (window.jmpInfo && jmpInfo.settings && jmpInfo.settings.video) || {};
        return v.icefin_auto_profile !== false;
    }

    window.icefinAdjustProfile = (profile) => {
        if (autoOn()) {
            for (const codec of transcode) {
                profile.CodecProfiles = (profile.CodecProfiles || []).concat([{
                    Type: 'Video',
                    Codec: codec,
                    Conditions: [{ Condition: 'Equals', Property: 'Width', Value: '0' }]  // never true: convert this codec
                }]);
            }
        }
        return window.icefinPromptProfile ? window.icefinPromptProfile(profile) : profile;
    };
    window.icefinDeviceProfile = { transcodeCodecs: () => transcode.slice(), auto: autoOn, video: () => Object.assign({}, video) };

    if (!window.apiPromise) return;
    window.apiPromise.then((api) => {
        if (!api.router || !api.router.capabilities) return;
        const take = (c) => {
            const before = transcode.join(',');
            transcode = ((c && c.decoders && c.decoders.transcode) || []).slice();
            video = (c && c.video) || {};
            if (transcode.length && transcode.join(',') !== before) console.info('icefinDeviceProfile: the server will convert', transcode.join(', '));
        };
        api.router.capabilities(take);
        api.router.capabilitiesChanged.connect(take);
    });
})();
