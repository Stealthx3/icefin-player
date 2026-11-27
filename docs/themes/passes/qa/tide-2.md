# tide: QA pass 2 (D40, D41)

Phase A, pass 2 of 3, in the VM lab (D42) as a parallel walk (D44). Walked 2026-11-27 on the lab guest: build
5b32846881478656 (main with the engine fixes of #236), 60 minutes a run, 7 runs (keys, mouse, Xbox, DualSense, Switch
Pro, 8BitDo, Steam Virtual Gamepad), Tide against stock Jellyfin-Web, whose own control was walked first because the
build is new (D47). The walker is as of #238 (with #234, #235 and #238; not #239 or #241). It was restarted once at its
start, for #238's played-switch rule. Tide 98 + 20 findings (pass 1: 154 + 12), 67 + 16 left to triage after the judged
list. Continues `tide-1.md`.

How to read Tide's screenshots: as in pass 1, the page is transparent over the native backdrop and the capture paints it
white, so most `finding_*.png` are blank. The findings were judged from the traces and each report's JSON.

## Coverage

Tide reached 73 screens in the union of the runs (pass 1: 73). Every run still missed a series, season, episode and
song, and four of the six pad and keys runs also missed an album or an artist. The mouse had budget left and missed
them too, so the budget is not the main cause. Tide behaved correctly throughout; the cause is five faults in the walker
(A to E in the triage), found by tracing the runs:
- A, an in-place level is named after the first empty one on its route (all inputs; the main cause): a level's own
  controls counted its "Back to <screen>" and "Go back ›", which every level of the route shows, so All shows, Albums,
  Artists and Songs were taken for the empty Continue watching or Playlists level and never queued.
- B, keys going dead after a reload (pads and keys): a reload moved the theme root from the body's 10th child to its
  9th, so every key recorded before it stopped matching, and the walker failed without a trace line.
- C, a failed level left open (pads and keys): when a level was not confirmed the walker marked it unreachable without
  pressing Back, and Tide's column memory (by design) reopened it when the route was set again.
- D, the per-kind limit: round one tries two entries per kind and all of a Tide column's entries are one kind, so it
  opened three empty levels (every show is played in the lab) and All shows waited for round two, 8 minutes before the
  end.
- E, the season never counted: a season's level has no item type for the walker, because Tide's entries carried no
  `data-id`. The theme gives them one now (below).

Fixed in walker PR #241 (W-A to W-D and W-F; W-E, the opener test, only logs for now). Mosaic's pass 2 tests it first;
Tide's third pass walks on it. Two coverage gaps are the lab's data, not faults: "now playing" for pads (Tide shows its
Now playing entry only while music plays, and the songs are 15-second clips) and the mouse's "preferences: home" (W-F).

## Verdicts

83 findings: 13 real (theme), 47 judged (35 of them made unnecessary by marking Tide's trail and no-screen categories as
the pointer's way), 17 walker, 6 unsure. The stock control: 425 + 111 (plain and Steam environment).

## Findings fixed

Theme (theme/tide, commit 2da145ee):
- [x] T1, Back from the player landed on the first channel of the guide (back-focus, all 7 runs): F6 made a gap
      pressable, so OK on it plays the channel, but the guide remounted on row 0. It keeps its row per history entry now,
      so Back from the player lands on the channel left.
- [x] T2, pass 1's F4 was ineffective (dead-control, mouse, 5): the idle Now playing test treated the engine's state as
      null when idle, but it is never null, only `active: false`. It tests `active` now, so the transport buttons say
      "Nothing is playing".
- [x] T3, Shuffle under the details' facts block (obscured, mouse, 1): the facts block took the click. It takes no
      clicks now (it has no controls).
- [x] The trail and the cross bar's categories without a screen are marked as the pointer's way (`data-icefin-pointer-only`):
      the walker leaves them out of its direct try (J1, J2 below).
- [x] Entries carry `data-id`: jellyfin-web's own convention for a card's item, so the walker types a season's level
      (coverage E).

## Judged not Tide's, or the walker's

Walker (fixed in #241, or noted):
- W1, required screens missed (budget 6, required-missing 5; 11): the coverage faults above. "Preferences: display,
  playback, subtitles" on pads is #241's (Tide's Settings column labels them "Display, language, …" and "Playback, …
  skipping intros", which the walker skipped as a persisting choice and a PIN; #241 matches the name before the comma).
- W2, the "Watch together" row (dead-control, mouse, 5): with #238 the mouse pressed "New group" and made a SyncPlay
  group, so every later panel showed "You are in" as a checked row, which has no action. #241 puts "new group" on the
  denylist. Optional theme polish: draw that row as a label.
- W3, "More options…" on an album (unreachable-by-input, Xbox, 1): Tide's column appends entries that come into its
  window, so one entry has two DOM indexes and the walker saw it twice. Not fixed: dedupe by label within a screen.
- Noted, not needed for the required screens: pads never open Tide's hub entry "Client settings", whose label has no
  comma for #241's split to use.

Judged (rules in `qa-judged.json`):
- J1 and J2 (35 findings): the trail's "Back to <level>" (27) and the cross bar's "Users" and "Servers" on /selectserver
  (8) are the pointer's way. A pad pops a level with Back or ◀ and steps a category with ◀ ▶. Marking them
  `data-icefin-pointer-only` makes the proposed rules unnecessary, so none is added.
- J3 (10): the server line under the clock ("<server>: online; choose a server") on a level, where ▲ ▼ step the column
  and only the pointer reaches it. A pad chooses a server from Settings › "Server: … choose another", the same action.
  Rule for Tide: unreachable-by-input, pad and keys, element `: (online|not answering); choose a server$`.
- J4 (1): "Now playing: E660; open the queue" dead on the mouse: the 15-second clip ended between the hover and the
  click, and the line hides. The same click 8 s earlier opened /queue. Almanac's judged rule moves to `*`.
- J5 (1): the Audio test's "Play PCM 7.1" pressed while a clip plays; the DTS and Dolby ones were already filtered. The
  `*` rule `^Play (DTS|Dolby)` gains `PCM`.

## Unsure

- U1 (4, with DualSense and 8BitDo folded): the settings hub's "Your profile and preferences" is not reached by pads and
  keys from Server Settings. In Tide's list layout the engine puts the link under the entries; ▼ never lands on it
  (25 presses on keys), though geometry says it should. Likely the engine's `pick` or the hub's layout. Needs a lab
  replay: #/mypreferencesmenu, ▼ ×3, with the focus read after each press. Pads have other ways to their preferences.
- U2 (1): the preferences' section rail "Item Details" does nothing on the mouse. It is the last section, already in
  view, and perhaps without a visible control for this user. Replay to see which controls the section has.
- U3 (1): `Cannot set properties of null (setting 'innerHTML')` on Subtitles → Playback, pass 1's error from the other
  side. The suspected cause is unchanged (the hub moves the form into its host while jellyfin-web's controller writes
  into its view); the stock control never shows it. Replay with the rejection's `reason.stack` recorded.

## To recheck in pass 3

Each is replayed in the lab on the build with theme commit 2da145ee and the walker of #241; tick when it holds. Checked
by pass 3's walk (`tide-3.md`, 2026-11-27).
- [ ] T1: keys, #/livetv?td=guide, ▼ to channel 3, OK, the player opens, Back: focus is on channel 3's cell. Open: pass 3
      had 6 back-focus findings. The row was kept, not the time (the opener was a gap a day ahead, on the 7th row), and
      the row looked wrong too. Fixed in theme/tide 7af887c6 (channel id and programme start per history entry); needs
      the replay.
- [x] T2: mouse, #/queue with nothing playing → Shuffle, Previous, Play or pause, Next and Repeat show "Nothing is
      playing" with the error sound. With a song playing, Next moves on. Closed: all five are in-place on the mouse
      (pass 2: 5 dead). The sound is a by-ear check, listed for review.
- [x] T3: mouse, a playlist's details, focus E660, click Shuffle above it: "Shuffling …". Closed: Shuffle on the
      playlist's details is in-place with the hover focus true.
- [x] Pointer marks: pad and keys runs leave no "Back to <level>" finding and none for /selectserver's Users and
      Servers; the mouse still pops a level with the trail. Closed: no such finding on any pad or keys run; the mouse
      still pops a level ("Back to Live TV", in-place).
- [ ] `data-id`: a season's level counts as a Season in the walker's report. Open, not exercised: pads never opened a
      season level (budget), and the mouse's "Season 1" press was refused by #241's deck test. A season's page came
      through Options › Go to season.
- [ ] Coverage: pads and keys reach a series, a season, an episode, an album and a song on the walker of #241
      (`screen /details [Series]`, `> Season`, `[Episode]`, `[MusicAlbum]`, `[Audio]` in the traces). Partly: a series,
      an episode, an album and an artist on every pad and keys run; a season and a song not (the guide ate 14 minutes,
      and the deck test refused Tide's levels).
- [x] F3 (from tide-1.md): Options with nothing to offer. Closed: Options on the empty Series timers level answered in
      place (pass 2: never exercised). The notice and its sound are a by-ear check.
- [ ] The guide's current cell and Left from a long programme. Open, now testable: the guide has programmes. The walk's
      ◀ on window-start cells did not move, which fits paging back inside a 2-hour programme; a person should look.
- [ ] The Watch together row (a group made by another user). Open: no group by another user.
- [ ] The settings focus on return by pad (after U1). Blocked: the hub's link is still not reachable by pad or keys.
- [ ] Favourite and Mark as watched keep focus (by hand; danger words for the walker).
- [ ] The overlay's focus look on the current "Play on" tab (by eye).
- [ ] U1 to U3 as above; also the preference page's saved value after a tab press. Open: U1 (the hub's link) and U3 (the
      script error) reproduce unchanged, and U2 now includes the Localization entry; the saved value is not checkable
      from traces.

Tide's second pass is done; its third walks on the walker of #241.
