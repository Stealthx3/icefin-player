// Icefin: the Auto device profile (PLAN 6.4, SPEC "Device profile"). Appended to the injected native shell script.
// nativeshell.js's getDeviceProfile (upstream, with its force-transcode switches) is wrapped (ICEFIN-HOOK there):
//  1. Auto (video.icefin_auto_profile, default on): codecs the decoder self-test (4.1) found neither hardware- nor
//     real-time-software-decodable on this machine are sent for server conversion; everything else direct-plays.
//  2. The capability prompt's one-shot choice (6.3), if any.
//  3. Upstream's force-transcode switches stay as overrides: they are already in the profile this wraps.
(function () {
    'use strict';
    if (window.icefinAdjustProfile) return;
    let transcode = [];  // from api.hardware.results(); refreshed when the self-test finishes

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
    window.icefinDeviceProfile = { transcodeCodecs: () => transcode.slice(), auto: autoOn };

    if (!window.apiPromise) return;
    window.apiPromise.then((api) => {
        if (!api.hardware) return;
        const load = () => api.hardware.results((r) => {
            transcode = (r && r.transcode) || [];
            if (transcode.length) console.info('icefinDeviceProfile: the server will convert', transcode.join(', '));
        });
        load();
        api.hardware.finished.connect(load);
    });
})();
