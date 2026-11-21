# media-center: QA pass 1 (D40, D41)

Phase A, pass 1 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each walker user a copy of the lab's admin, against stock
Jellyfin-Web walked on the same build. Walked together with Plaza's pass-3 re-walk. Build: main with #215,
theme/media-center 15ff06ba. Report: lab `~/walks/qa-plaza3v-mc1` (Media Center 174 + 26 findings, none in the control;
121 + 20 of them screens not reached).

Screenshots from the walker (DevTools captures) show the page white where Media Center's native backdrop draws: the
page is transparent over it, and a DevTools capture has only the page. Captured from the display itself, the field is
the deep blue with its ribbons (checked). The corner name is the server's own (the lab server's container name).

## Findings fixed

Theme (theme/media-center):
- [x] The start strip had no Movies, Shows, Home videos, Collections or Playlists row, so no run reached a library, a
      details page or Now playing (required-missing, every run): a row showed only when the server's Latest had
      something, and Latest leaves watched items out (every walker user is a copy of an admin who has watched them).
      A library keeps its row with its "All …" tile. Checked: Live TV, Movies, Music, Shows, Books, Collections,
      Photos, Playlists, Tasks.
- [x] Settings: left from an entry jumped to the header's Home button, so the remote left the list part-way down and no
      run got past Theme (Playback, Subtitles, Display, Start screen not reached): the list moves as a list (up and
      down through the entries, left and right stay, up from the first to the header). Checked.
- [x] Watch together threw `(g.people || []).join is not a function` (script error, every run): the group's member
      names (engine #217); the row shows them, or how many are in it.
- [x] Back from the player to Live TV came back to the guide on a gap ("No information"), not to the channel played
      from Channels (back-focus and broken-back, mouse and 8BitDo): Back focus also hears the Navigation API (jellyfin-web
      opens the player with pushState, which fires no event the theme heard), and Live TV keeps the tab shown on each
      history entry. Checked: Back from a channel played from Channels returns to Channels on that channel.
- [x] Channels: the list ran 2vh past the body that clips it, so its last row sat under the edge (obscured, mouse): it
      fits (border-box). Checked: 547 px in a 547 px body.
- [x] Play on, Look again pressed twice within a minute showed the same line (dead-control, 3): the time to the second.

Engine (#218):
- [x] The theme switched to Mosaic with no Apply, part-way through the walk (every run's later findings on the client
      pane were Mosaic's): jellyfin's plain Theme drop-down, which the theme manager hides, came back under Media
      Center's row layout (`display: flex !important`), and it saves at once. Hidden with an inline `!important`.
      Checked: one theme picker shown.
- [x] Video tests left the remote on nothing (focus-lost, every run): the section redraws on each status and dropped
      the focused button; the focus comes back, and Test again is busy, not disabled, while a test runs. Checked.
- [x] Apply with no focus look (no-focus-indicator, every run): seen on the stock-look page after the theme switch
      above; on Media Center's own pane the focused Apply has the lens (checked).

## Judged not Media Center's, or the walker's

- Choose… (wallpaper) does nothing on the page (dead-control): it opens the system's file chooser, outside the page.
- "play on" in the Watch together panel (dead-control, every run): the panel turns to Play on (the finding's own
  screenshot); the walker missed the redraw.
- Mouse dead-controls on channels and "Back from /video" landing elsewhere (mouse, 8BitDo): Live TV takes about 5 s to
  tune; a click started the channel after the walker had moved on and credited the next click.
- Shift+Tab (low): Media Center is a TV theme; Tab isn't one of its inputs.

## Verified

Pass 2 (lab `~/walks/qa-plaza3v2-mc2`, walked together with Plaza's re-walk 2; build main with #218, theme/media-center
f219a74d): Media Center 93 + 18 findings (from 174 + 26), none in the control. Every keys and pad run reached the
libraries, a movie's and a series' details and the settings list past Theme (Playback, Subtitles, Start screen); the
theme stayed Media Center to the end of every run. Gone: the Watch together script error, Video tests' lost focus, Back
from the player to Live TV, the channel grid's overflow (no broken-back, obscured or script-error finding). The rest of
pass 2 is in `media-center-2.md`.
