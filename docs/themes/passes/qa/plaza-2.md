# plaza: QA pass 2 (D40, D41)

Phase A, pass 2 of 3. Started 2026-11-16 on main 46695eb5 and theme/plaza ac401cad, with every
fix from pass 1 (docs/themes/passes/qa/plaza-1.md). The walk: input_walk.py on the host, mouse, keyboard and all five pad
families, the Steam shortcut and nested Gamescope, each against stock Jellyfin-Web as the control.

## Findings

From the host walk (plaza-qa2-20261116-2227; build qa1.2 = main 46695eb5 with engine #200-#203, Plaza at 9ab309d2),
run with the crawler of 22:28 (before its fixes for stale snapshots, hover, redrawn elements, dialogs once per screen
and ancestors on top), so every finding below was checked against its trace and screenshot:
- [x] Steam scenarios, back-focus (59 shortcut, 55 Gamescope, 8 plain steam-env): nothing Steam-specific. No doubled
      presses and no other Back mapping (one `east` per Back in the traces, no broken-back in any Steam run). All but a
      few are jellyfin-web's Classic home (`/home?icefin=stock`): Back from an item focused the first row's scroll
      button ("Next"), as in every plain pad run (8-11 each); the shortcut and Gamescope runs spent more of their budget
      on that page (about 150 trace lines there, against 50-100). jellyfin-web redraws the rows as the page comes back,
      so the element it kept is gone, and the engine's arrival focus then took the page's first control. Framed pages
      now remember the control used on each history entry (its card's item, row, kind and label) and focus it again on
      Back (engine, fix/qa2-plaza-engine: capabilities.js). The stock control loses focus there altogether.
- [x] Keys, unreachable on the Classic home (Back, Home, Play on, Watch together, and cards Tab skipped): in desktop
      layout the keyboard's arrows went to jellyfin-web, which only scrolls, and the frame's buttons take no Tab stop.
      The arrows now drive a framed page's spatial navigation as the remote does (engine, themeEngine.js); fields,
      lists and sliders keep their arrows, a jellyfin-web dialog keeps all of them.
- [x] Back to a library's grid from an item on its second page or later (Blade Runner, Spider-Man, Star Trek, Star
      Wars, Awesome As Fuck, Justice League, the 8BitDo's Next Up album: back-focus on the first cell of page 1; items
      on page 1 returned fine). The page and the control were filed under the history entry the screen was mounted on,
      and a step jellyfin-web takes on its own (pushState fires no event) left that entry behind: the first page came
      back, or no entry at all. The same address now counts as the same visit (kit.js, `P.backFocus`).
- [x] Back from an episode to its series focused Play (DualSense: Book Two's first episode): the details screen always
      drew the next-up season's episodes, so the episode wasn't there to refocus. The season shown is kept per history
      entry (engine, detailsScreen.js).
- [x] Mouse, broken-back (9 on the home, 1 on Choose a server): the mouse's Back button goes to the web view's
      history, so with a channel's card open the home went back to the menu visited before it (`/home?pz=resume`).
      Engine #204 covers only the engine's overlay (the sheets); Plaza's channel card, a channel being moved and the
      sort panel are its own, and now take that Back and close, the screen staying (kit.js `P.layer`, plaza.js,
      menus.js). Choose a server's Add a server is an engine sheet (#204, not in that build).
- [x] Add a server, Connect with no address (mouse dead-control): the message was a toast at the foot of the screen,
      away from the card; it is now said in the card under the field (signin.js, styles.css).

Judged crawler noise or not Plaza's:
- Mouse dead-controls on the details pages (Play, Shuffle, Played, More, Series, Audio, Subtitles, an episode card;
  14): the clicks landed at the controls' old positions after the page redrew (Play at y 487, drawn at 650 in the
  screenshot): the crawler's stale references. Search's `s` key typed (the field shows it), `All` and the search
  field are already current, the home's `icefin` slot is the empty slot (pass 1), and "Continue Watching" in the card
  pass is the dialog pass reopening a card it had closed.
- Library A-Z panels, broken-back and back-focus (keys 1, switchpro 5, xbox 4, 8BitDo 3): the dialog pass picked an
  entry, then pressed Back once more with the panel closed and left the page (as in pass 1); the back-focus that
  follows is the walker's reload. Back on an open panel closes it and focuses its tab (menus.js).
- Back-focus with the opener's label changed (Resume · 16/15 min left, Subtitles English/Off, the server button after
  a redraw) is the same control. Mouse focus after Back on the disc rack and a chapter: the pointer left at the
  screen's centre over the disc (pointer-first focus follows it).
- Keys broken-back on the Classic home's More menu (Shuffle started playback; Escape didn't close jellyfin-web's
  action sheet): the stock control has the same. Its `Next` focus-lost after a press (the row's end disables the
  button) is jellyfin-web's too.
- Script errors: "Translation key is missing" (jellyfin-web's details, a cast member's role), "rejection: undefined"
  (jellyfin-web's Shuffle), Jellyfin Enhanced's reviews HTTP 400 (a plugin).
- Unreachable on the Classic home in the Steam runs (6 album and artist cards): each was focused during the run (its
  focus-look check is in the trace) or a later direct reach worked; the failed attempt looked up a redrawn row.
- No-focus-indicator (82-132 per run): not judged on this crawler (stale snapshots); the next walk's crawler has the fix.
