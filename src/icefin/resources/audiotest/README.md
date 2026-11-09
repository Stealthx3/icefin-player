Audio test clips (PLAN 3.8). Two seconds of a 440 Hz tone, made by Icefin with ffmpeg (no third-party content):

| File | Format | The receiver should show |
|---|---|---|
| ac3.mka | AC-3 5.1, 448 kb/s | Dolby Digital |
| eac3.mka | E-AC-3 5.1, 640 kb/s | Dolby Digital Plus |
| dts.mka | DTS core 5.1, 1509 kb/s | DTS |
| truehd.mka | TrueHD 5.1 | Dolby TrueHD |
| lpcm71.mka | 7.1 (FLAC, played as PCM) | Multichannel PCM / 7.1 |

ffmpeg can't encode DTS-HD MA, so that format is tested with the lab's server media on the HTPC.
