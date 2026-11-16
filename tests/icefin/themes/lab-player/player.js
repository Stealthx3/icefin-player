// Lab fixture (PLAN 9.45): minimal theme-native player controls through ui.player. The test reads window.labPlayer.
(function () {
    'use strict';
    const T = window.icefinTheme;
    window.labPlayer = { mounts: 0, states: 0, last: null };
    T.ui.player.set({
        mount(el, player) {
            window.labPlayer.mounts++;
            window.labPlayer.api = player;
            el.innerHTML = '<div id="lab-osd" style="position:absolute;left:5vw;right:5vw;bottom:5vh;padding:1em;background:rgba(0,0,0,.6);color:#fff;font:20px sans-serif">'
                + '<button id="lab-pp" data-icefin-focus>play/pause</button> <span id="lab-pos"></span> <span id="lab-skip"></span></div>';
            el.querySelector('#lab-pp').addEventListener('click', () => player.playPause());
            this.off = player.on((s) => {
                window.labPlayer.states++;
                window.labPlayer.last = { paused: s.paused, position: s.position, duration: s.duration, title: s.title, chapters: s.chapters.length,
                    audio: s.audio.length, subtitles: s.subtitles.length, archive: s.archive.map((a) => a.id), speeds: s.speeds.length };
                el.querySelector('#lab-pos').textContent = `${Math.round(s.position / 1000)} / ${Math.round(s.duration / 1000)}`;
                el.querySelector('#lab-skip').textContent = s.archive.map((a) => a.label || a.id).join(', ');
            });
        },
        unmount() { if (this.off) this.off(); }
    });
})();
