# Installing Icefin Player

Icefin Player ships as a Flatpak (app ID `io.github.stealthx3.IcefinPlayer`) and runs on Linux, Wayland first. It
installs alongside Flathub's Jellyfin Desktop: separate app ID, separate settings and data.

> **Status, November 2026:** Icefin is in alpha. Install it from the test repository below, or download a bundle
> from the [releases page](https://github.com/Stealthx3/icefin-player/releases) (the latest alpha, or the rolling
> *Nightly* build of `main`). Signed `stable` and `nightly` repositories with one-click `.flatpakref`
> files come later (PLAN 12.1).

## Install from the test repository
The test repository is a signed Flatpak remote with the current alpha and test builds, served by GitHub Pages
(<https://stealthx3.github.io/icefin-flatpak-test/>). `flatpak update` then keeps Icefin current.
```bash
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak remote-add --user --if-not-exists icefin-test https://stealthx3.github.io/icefin-flatpak-test/icefin-test.flatpakrepo
flatpak install --user icefin-test io.github.stealthx3.IcefinPlayer
```
A build installed from a bundle switches to the remote with
`flatpak install --user --reinstall icefin-test io.github.stealthx3.IcefinPlayer`; settings and sign-in stay.

## Install a bundle
```bash
flatpak install --user icefin-player.flatpak
flatpak run io.github.stealthx3.IcefinPlayer
```
The KDE runtime it needs comes from Flathub; add Flathub first if you don't have it:
```bash
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
```

## Before the first sign-in: device approval
A fresh install has a new device ID. If your server only lets approved devices sign in, an administrator has to allow
Icefin Player once (Dashboard → Devices). Sessions, device lists and Playback Reporting show the app as *Icefin Player*.

## Controllers: udev rules and drivers
Icefin reads controllers through SDL3 (Client Settings → Controllers shows what it finds).
- **PlayStation, Nintendo and Steam controllers** need read access to `/dev/hidraw*`. Install your distribution's
  `steam-devices` package (Fedora, Bazzite, Arch, Debian and Ubuntu all have it), or Steam's udev rules.
- **Xbox Wireless Adapter (USB dongle)**: needs the `xone` driver on the host. Xbox pads over USB or Bluetooth work
  with the kernel's own drivers.
- **Steam Deck** and **Steam Input**: when Icefin runs from Steam (game mode, or a non-Steam shortcut on the
  desktop), Steam takes the physical pad and offers a virtual one, so each press arrives once. Button prompts follow
  the pad Steam took over (PlayStation, Nintendo, Steam Deck or Xbox shapes).
- **Steam running on the desktop, Icefin started from the app menu**: Steam's desktop layout also turns pad presses
  into keys (D-pad to arrows, A to Enter, B to Escape). Icefin notices a key and the same pad press arriving together
  and drops the second one, so nothing happens twice; typing on a keyboard is never affected.
- **Recommended Steam layout** for Icefin as a non-Steam game: in its controller settings, pick Steam's *Gamepad with
  Mouse Trackpad* template (the Deck's right trackpad becomes the mouse), then bind the back grips: L4 to **View**
  (Home in Icefin; hold it for the theme's overlay panel) and R4 to **X** (the menu, with the item's details and
  options). Leave the Steam/Guide button to Steam.
- **Wii Remote**: meant to work as a pointer through the kernel's `hid-wiimote` driver. Not tested yet.

## Audio passthrough to a receiver
Passthrough sends Dolby and DTS bitstreams to an AV receiver unchanged. Turn it on in Client Settings → Audio
(device type HDMI, then the formats your receiver supports), and check it with Client Settings → Audio test.
- **PipeWire and PulseAudio:** Icefin sets the HDMI output's bitstream formats itself while a passthrough track plays,
  and restores them afterwards.
- **If the Audio test says the output didn't accept a format:** your sound server is keeping the HDMI output to PCM.
  The Audio test shows a WirePlumber rule for that output, with a copy button. Save it as
  `~/.config/wireplumber/wireplumber.conf.d/51-icefin-passthrough.conf`, then run
  `systemctl --user restart wireplumber`.
- **TrueHD and DTS-HD MA** are most reliable with Audio Backend → ALSA. Icefin then reserves the HDMI device from the
  sound server while it plays and hands it back afterwards.
- **A receiver on the TV's eARC/ARC:** your computer sees what the TV reports, which may leave out TrueHD. Icefin then
  sends TrueHD as multichannel PCM.
- **Receiver in standby or off when a track starts:** Linux can't send a bitstream properly until the receiver is
  ready, so Icefin plays PCM and switches to the bitstream about 4 seconds after the receiver wakes (a short audio
  gap). Client Settings → Audio → Receiver in Standby can make it *Always PCM*, or *Keep Bitstream* for a receiver
  that reports standby wrongly but still decodes.
- Icefin never plays silently: if the output fails, it retries as PCM, then on the default device, and only then shows
  a notice.

## HDR
On KDE Plasma (6.3 or newer) and GNOME (48 or newer), turn on HDR for the display in the desktop's settings. Icefin
reads the display state through the Wayland color-management protocol (Client Settings → Hardware shows it).
HDR output itself arrives with the Vulkan renderer (PLAN 5.x). Until then, HDR video is tone-mapped to SDR, and sources
that can't be shown correctly (Dolby Vision 5 and 8) ask what to do.

## Permissions and why
| Permission | Why |
|---|---|
| Wayland socket; X11 only as a fallback | Wayland desktops. X11 is used under Gamescope's XWayland |
| `--device=all` | GPU, exclusive ALSA, USB CEC adapters, LIRC remotes and game controllers. Flatpak has no narrower option for sound or serial devices |
| Network | Talking to your Jellyfin server |
| PulseAudio socket, PipeWire socket | Audio output, and the bitstream format setting for passthrough |
| `org.freedesktop.ReserveDevice1.*` | Taking the HDMI device from the sound server for exclusive ALSA |
| `org.mpris.MediaPlayer2.icefin_player` | Desktop media keys and remotes |
| `/run/lirc` (read-only) | LIRC remotes |

## Themes
Client Settings → Theme picks the look: Off (stock), Baseline, Media Center, or a theme you installed. Your choice is
saved for your user on the server, so it follows you to other Icefin devices. To install a theme, put its folder in
`~/.var/app/io.github.stealthx3.IcefinPlayer/data/icefin-player/themes/`. Installed themes can't run scripts until you
trust them, and their stylesheets can't reach the network (`docs/themes/PACKAGE.md`).

## Compatibility
What has been tested, and where. "Lab" means the virtual machines in `docs/LAB.md`, which have no GPU and no sound card,
so they test logic and the web UI, not picture or sound. "HTPC" means the real-hardware tier (D16).

| Area | Status |
|---|---|
| Jellyfin server 10.11 (jellyfin-web 10.11) | Lab: full suite, plugin three-way runs |
| Jellyfin server 12.x (jellyfin-web 10.12+) | Lab: full suite, plugin three-way runs |
| KDE Plasma (Wayland) | Lab: headless KWin (display probe). HTPC: pending (PLAN 1.10) |
| GNOME (Wayland) | Lab: headless Mutter in the spikes. No full run yet |
| Gamescope / Steam Deck game mode | HTPC: pending (PLAN 1.10, 2.4) |
| AMD GPU | HTPC (RX 9070 XT): pending (PLAN 1.10, 4.5) |
| Intel and NVIDIA GPUs | Not tested yet (PLAN 4.5, 2.8) |
| PipeWire passthrough | Lab: logic and format setting. Receiver: pending (PLAN 3.8) |
| Exclusive ALSA | Lab: device reservation against PipeWire. Receiver: pending (PLAN 3.8) |
| Xbox-style controllers | Lab: virtual pad through SDL3 |
| PlayStation, Nintendo, Steam Deck controllers | Not tested yet (PLAN 7.6) |
| Steam Input (virtual pad glyphs, desktop-layout guard) | Lab: virtual Steam pad and simulated desktop layout; real Steam in the beta (C2, C3, C5) |
| Plugins: Playback Reporting, Home Screen Sections, Plugin Pages, JavaScript Injector, File Transformation, Intro Skipper, Trakt, LDAP | Lab: present and unchanged with the theme engine off, Baseline, and a styled theme |
| SSO Authentication | Lab on 10.11; no build for 12.4 yet |
