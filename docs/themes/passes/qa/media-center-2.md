# media-center: QA pass 2 (D40, D41)

Phase A, pass 2 of 3, in the VM lab (D42) as a parallel walk (D44): the seven runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad) at once, each walker user a copy of the lab's admin, against stock
Jellyfin-Web walked on the same build. Walked together with Plaza's pass-3 re-walk 2. Build: main with #218,
theme/media-center f219a74d. Report: lab `~/walks/qa-plaza3v2-mc2` (Media Center 93 + 18 findings, none in the control;
pass 1 had 174 + 26). Pass 1's fixes are checked in `media-center-1.md`, Verified.

## Findings fixed

Theme (theme/media-center):
- [x] The mouse run never left Live TV (required-missing: every library, details page and preference, mouse): the start
      strip's closed rows open with a click on their title, and the titles were plain text to anything but the eye.
      A closed row's title is a button ("Open Movies"), marked as the pointer's own way in (`data-icefin-pointer-only`:
      the remote changes rows by up and down). Checked: a click on Movies opens the row on All Movies.
- [x] Back from a movie to the Movies wall came back on the first pivot, so the tile focused was another film
      (back-focus, every keys and pad run, after the walk chose "year"): the wall keeps, per history entry, its pivot,
      a genre or studio opened, the sort and filter and a folder. The wall's posters also carry their names (the
      walker read them as nothing). Checked: Back from the third film under "year" lands on it, under "year".
- [x] Playback preferences: down from a drop-down stopped on the next row's ‹ and skipped that row's drop-down, so the
      keys and pad runs missed the segment and quality drop-downs (unreachable-by-input, 36), and ‹ on a first value
      and › on a last did nothing (dead-control, 12): ‹ and › are marks for the pointer, as on the client pane (the
      remote's left and right step the focused drop-down), and one with nothing further that way is shown off.
      Checked: down walks all 18 drop-downs in order to the last checkbox.

Engine (#220):
- [x] The Audio test's Play buttons left the remote on nothing (focus-lost, keys, 3): the section redraws on each play
      and result; the button pressed comes back with it, busy while its clip plays. Checked.

## Judged not Media Center's, or the walker's

- Choose… (wallpaper) and "play on" in the Watch together panel (dead-control): as in pass 1 (the system's file chooser;
  the panel's redraw).
- Hover not focusing Play on and Watch together on the start strip (hover-no-focus, mouse): there they are the
  pointer's own buttons, not focus stops (the pad has them on the Tasks row).
- Hover not focusing Live TV's tabs, Play on and Watch together (mouse): hovered, each takes the focus (checked:
  channels, recorded tv, guide, Play on, Watch together). The run's last minutes had a channel tuning late under the
  pointer (the walk's own trace: a late change to the player), and the tab row slides as the tab changes.
- "No information" in the guide clicked (dead-control, mouse): an empty slot, nothing to open.
- Shift+Tab (low): Media Center is a TV theme; Tab isn't one of its inputs.
- Required screens not reached by the keys and pad runs (budget, 6): Live TV, a season, an episode, a song, an artist,
  Display preferences and Now playing, after 25 minutes on the libraries and settings that pass 1 never reached. Pass 3
  runs with a longer budget.

## Verified

Pass 3 (with every fix above, Media Center alone and a longer budget): to follow.
