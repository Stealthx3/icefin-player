# tide: QA pass 3 (D40, D41)

Phase A, pass 3 of 3, in the VM lab (D42) as a parallel walk (D44). Walked 2026-11-27 on the lab's first guest: build
5b32846881478656 (main with the engine fixes of #236, not #240), 60 minutes a run, 7 runs (keys, mouse, Xbox, DualSense,
Switch Pro, 8BitDo, Steam Virtual Gamepad), Tide against stock Jellyfin-Web, whose control was reused from Tide's pass 2
on the same build (D47). The walker is #241. The theme was pass 2's (theme/tide 2da145ee). Tide 79 findings (61 plain +
18 Steam environment; pass 2: 83), all triaged. Continues `tide-2.md`.

New in the lab since pass 2: the Live TV guide has programmes. In pass 2 every cell read "no information"; now the
cells carry titles and times about 24 hours ahead. That changed the walk (coverage below) and gave the first guide data
for the open guide rechecks. The reused stock control is stale for anything in the guide.

## Coverage

Tide reached 35 screens on every pad and keys run (pass 2: 37 to 44), 56 on the mouse (pass 2: 55), 67 in the union
(pass 2: 73). All six pad and keys runs reached the same screens and produced the same findings. Progress from #241:
pads and keys now reach a series, an episode, an artist, a person, a book and All shows; the mouse reaches a series, a
season, a song, an artist and every preference page. Still missing on pads and keys: a season, a song, the Display,
Home screen, Playback and Subtitles preferences and now playing. The mouse misses an episode only.

Pads and keys dropped to 35 screens for three causes, none of them Tide's:
- The guide's 180 cells. The snake walked the whole guide: 194 cell elements, 122 distinct labels, re-keyed by DOM
  index as the 7-row window pages. It collected them in about 11 minutes and spent 3 more on "no way to ..." detours to
  keys that had paged out, 14 minutes of the 60 (pass 2: 4 on the empty guide). Walker PR #242 keys a guide cell by
  channel and programme, which removes the duplicates and the detours, but nothing bounds the walk itself.
- #241's deck test refuses Tide's levels. `sub_level()` takes a level for the screen's own when half its controls are
  already among the screen's elements. A one-entry level plus the server line (an element of `/home`, shown in every
  level) is half the set, so Albums and All shows were refused on the home; the entries Albums, Artists and Songs
  credited to `/music` by the snake, and Collections on `/movies`, were refused the same way. On pads a refused level
  stays open, and Tide's column memory (by design) reopens it. The mouse's "Season 1" press was refused too.
- The per-kind limit: all of Tide's column entries are one kind, so round one tried two (Albums, All shows) and left
  the preferences and the songs for a round two that never started. Every pad and keys run ended with 7 screens queued;
  a series was reached one minute before the end, so its season was never opened.

Walker fixes follow in #242's follow-up. Tide's behaviour was right throughout.

## Verdicts

79 findings: 6 real (theme), 13 judged, 11 unsure, 49 walker. The six real are one cause (T1) on six runs.

## Findings fixed

Theme (theme/tide, commit 7af887c6):
- [x] T1, Back from the player landed on the wrong programme of the guide (back-focus, 6: keys and the five pads). Pass
      2's fix kept the row only, and restored it at the time now. The walker's opener was a gap about a day ahead on the
      window's 7th row; after Back, focus was on the programme airing now on channel 6. The guide's cell is filed per
      history entry with the channel id and the programme's start, and Back restores both. A programme that ended while
      the user watched lands on now.

## Judged not Tide's, or the walker's

Walker (to fix in #242's follow-up, none in #241):
- W1, required screens missed (budget, 7): the three causes above. Seeds for the missing preferences are planned for
  the settings column on `/home` (W-T), a guide is one kind, bounded at 24 cells (W-R), and the deck test counts only
  the controls a level brought (W-Q).
- W2, the Live TV column's entries "Guide, Recordings, Schedule, Series timers" on `/home` (unreachable-by-input, 12):
  recorded at the start, when focus began on Channels. By the direct try the entries were not on the page, and the
  walker failed them in 2 s with no press. A pad reaches them with ▲, ◀ to Live TV, then ▼. W-P: an element that is not
  on the page gets no verdict.
- W3, channels 10 to 16 (unreachable-by-input, 21): a level's own keys are DOM-index keys, and Tide's column re-keys its
  entries as it scrolls, so ▼ from channel 9 read as a change of screen. W-S: compare a level's controls by label.
- W4, "Now playing: A440; open the queue" (6): the song line was there at enumeration and gone by the direct try (15-s
  clips). The `*` rule below covers it until W-P.
- W5, "More options…" on an album (2): pass 2's W3, one entry at two DOM indexes. Fixed by #242 (a label this input
  reached is not missed).
- W6, a Dolby Vision play (broken-back, 1, Switch Pro): the capability prompt's first row (play anyway) was pressed and
  the player opened only after the walker's Back. The dialog pass should wait up to 3 s for /video as the activation
  does. Not fixed.
- Read-only risk before the next run: #242 presses rows a click reveals, and the mouse opened Tide's edit form through
  Media info › Details. `edit … details` covers only the Options entry, not the wide panel's tabs, and `save` is not a
  danger word. Add `^\s*save\s*$` to the denylist, or skip the wide panel's tabs other than Media info.

Judged (rules in `qa-judged.json`):
- J1 (8): the wide item panel's shown tab "Details" clicked on the mouse. Options › Edit details… opens the panel on its
  Details section, and a click on the shown tab does nothing by design. The tab carries class `on` only, no
  `aria-selected`. Optional polish: `role=tab` and `aria-selected` in the panel's tab row. Rule for Tide until that and
  the walker's dialog-pass check both land.
- J2 (4): the Media info rows ("720p H264 SDR · …, Video", "Lyric") are information: focusable so a pad can scroll a
  long list, with nothing to do on OK. Optional polish: a Lyric row shows its type alone.
- J3 (1): pass 2's Audio test "Play PCM 7.1" pressed while a clip plays. Already in the `*` rule from #243.
- J4, the server line (pass 2's J3, which this doc's predecessor announced but which never reached `qa-judged.json`): the
  line under the clock ("<server>: online; choose a server") on a level, where ▲ ▼ step the column and only the pointer
  reaches it. A pad chooses a server from Settings › "Server: … choose another", the same action. Rule for Tide:
  unreachable-by-input, pad and keys.
- J5, the `*` rule for "Now playing: …; open the queue" on pad and keys (W4 above): the 15-s clips end before the direct
  try.

## Unsure

- U1 (5, five pads): the first three plays after about 04:12 never start: a collection's Play all, its Shuffle and Live
  TV channel 1 (dead-control; keys' Play all read in place but did not play either). Each log shows the item list, the
  intros request, the still-watching plugin's session start and the endpoint check, then nothing: no "playing url" and no
  router line. The fourth play (channel 2) works, and a late "playbackstop, no active player; resetting media session"
  line at 04:17 frees it. The mouse never stalls, and its own Play all played. Before the stalls, every pad and keys run
  (not the mouse) had played a home video from the photo folder (whose end logs "playing next track"), opened a photo's
  slideshow and re-chosen the current server. One of those leaves the playback manager waiting. Symptom confirmed in the
  logs, cause not. Leads, to replay on keys: Photos › the video (let it end) › the photo › Back › a movie's Play; then
  the same with only the server re-chosen. Then fix where it hangs (the playback manager's stop of the previous player,
  or the engine's play). It affects users, not only the walker.
- U2 (3, with the five pads folded): pass 2's U1, third pass running. The settings hub's "Your profile and preferences"
  is not reached from Server Settings by ▼ (25 presses). The engine's `pick()` should land on the link, and #240 changed
  no hub code. Replay: keys, #/mypreferencesmenu, ▼ after Server Settings, reading the focus after each press. The #244
  beam fix (Mosaic's pass 2) may be the same cause; check Tide's hub geometry against it.
- U3 (2, mouse): the preferences' section rail, "Localization" and "Item Details". Localization is the first section: the
  page opens there with its first control focused, so a click changes nothing (by design). Item Details is pass 2's U2,
  unchanged. No rail entry is marked current. Engine polish: set `aria-current` on the section in view. Replay for Item
  Details: which controls it has for this user.
- U4 (1, mouse): `Cannot set properties of null (setting 'innerHTML')` on Subtitles → Playback, pass 1's and pass 2's
  error. The suspected cause is unchanged (the hub moves the form while jellyfin-web's controller writes into its
  view); the stock control never shows it. Replay with the rejection's `reason.stack` recorded (asked twice already).

## Pass 2 rechecks, as closed by this walk

See `tide-2.md`: T2, T3, the pointer marks and F3 closed; T1 fixed again above and open; coverage partly; the guide
items now testable by hand.

## For your review

Last automated pass for Tide. What a person should look at on screen and listen to:
1. The Live TV guide with programmes (first time in the lab): OK on a programme now, on a later one and on a future gap,
   then Back. Focus should land on the same programme (T1). ◀ from a long programme at the window's start. ▲ ▼ paging
   past row 7. The now line.
2. A collection's Play all and Shuffle after playing a home video from Photos and opening a photo (U1): does anything
   happen, and does the next Play work?
3. Settings, list layout: ▼ past Server Settings to "Your profile and preferences" (U2).
4. Display preferences: click the rail's Localization and Item Details (U3). Open Subtitles, then the Playback tab: does
   the Playback page draw completely (U4)?
5. Listen: the idle transport on the queue ("Nothing is playing" and the error sound), music presses ("Playing …"
   notices), a guide gap's OK (the channel plays), Options on an empty level.
6. Look: the wide item panel's shown tab (J1) and the Media info rows, Lyric's bare row included (J2); the Dolby Vision
   capability prompt and its Back; the Watch together row; the Play on overlay's focus look; Favourite and Mark as
   watched keeping focus.

## To recheck after the walker fixes

Each is replayed in the lab on the build with theme commit 7af887c6; tick when it holds.
- [ ] T1: keys, #/livetv?td=guide, ▼ to channel 10, ▶ twice (a later programme), OK, Back: focus is on that programme of
      channel 10. A gap about a day ahead: OK, Back: the same gap. Log the guide's memory before OK and after Back.
- [ ] Coverage: pads and keys reach a season, a song and the four preference pages on #242's follow-up walker (with
      W-Q, W-R and W-T), and no screen is still queued at the end.
- [ ] U1: the replay above, and a fix where it hangs.
- [ ] U2, U3, U4: the replays above.
- [ ] Optional polish: the panel's tabs carry `aria-selected`; the rail's current section carries `aria-current`.
- [ ] The open rechecks carried from tide-2.md that need data or a person: the guide's current cell and Left from a long
      programme (data now present), the Watch together row (a group made by another user), the settings focus on return
      by pad (after U2), Favourite and Mark as watched keep focus (by hand), the overlay's focus look on "Play on" (by
      eye), a preference page's saved value after a tab press.

Tide's third pass is done; its phase A walks are complete, and its review waits for the end of the automated walks.
