# Icefin Player test lab: HTPC setup kit

This kit turns your Bazzite HTPC into the test machine for Icefin Player. After setup, the lab
workstation (**@WORKSTATION@**, @WORKSTATION_IP@) connects over SSH. It installs test builds of
Icefin, plays test media on your TV, and reads what the TV and receiver receive: the HDR signal and the audio
format.

Kit built @DATE@ from icefin-player @COMMIT@.

## What's in the kit

| File | What it is |
|---|---|
| `README.md` | This file |
| `icefin-htpc-setup.sh` | The setup script. Run it once on the HTPC |
| `workstation.pub` | The lab workstation's **public** SSH key (fingerprint `@FINGERPRINT@`). It can't be used to log in anywhere by itself |
| `probe.py` | The tool the lab uses to read the HDR signal and HDMI audio state. Setup runs it once as a check |

## What setup changes on the HTPC

- **Your user account only:** it adds the workstation key to `~/.ssh/authorized_keys`, tagged `icefin-lab-workstation`.
  The key is limited to logging in and the lab's tunnels; agent and X11 forwarding are off.
- **One system setting, only if you say yes:** it turns on the SSH server (`sshd`), using sudo.
- **Nothing else.** It installs no packages, never touches rpm-ostree, and leaves the Bazzite image alone.

Once the lab is running, it only ever writes:
- an Icefin Player test build, installed as a Flatpak for your user (`io.github.stealthx3.IcefinPlayer`, from a remote named `icefin-lab`);
- the KDE runtime it needs, which comes from Flathub;
- `~/.local/share/icefin-lab`;
- Icefin's own data in `~/.var/app/io.github.stealthx3.IcefinPlayer`.

It doesn't touch Flathub's Jellyfin apps or any Jellyfin server you run on the HTPC.

## Steps

1. **Copy the kit to the HTPC.** Use a USB stick, or download the zip in the HTPC's browser. Extract it anywhere
   (right-click → *Extract here* in Dolphin or Files, or `unzip icefin-htpc-kit.zip`), for example to
   `~/Downloads/icefin-htpc-kit`.
2. **Log in to the HTPC as the user that's on the TV.**
   - In **desktop mode**, open Konsole (KDE) or Console (GNOME).
   - In **game mode**, switch to desktop mode once for setup. Use the same user account.
3. **Turn on the TV and the receiver** so the HTPC can read their capabilities.
4. **Run the setup script** (not as root, no `sudo`):
   ```bash
   cd ~/Downloads/icefin-htpc-kit
   bash icefin-htpc-setup.sh
   ```
   It shows what it found: Bazzite image, GPU, session, displays and HDMI audio formats. It authorizes the
   workstation key, then asks before turning on the SSH server (type `y` and your password).
5. **Tell Claude** the hostname or IP address and the user name. The script prints both on its last line. Also say:
   - the hours the lab must leave the TV alone (for example 18:00–23:00);
   - whether it may switch between desktop and game mode (that logs the TV session out and back in);
   - your TV and receiver models.

   Claude reads the full report in `~/icefin-htpc-info.txt` over SSH.
6. **Optional, to watch tests from the workstation:** run `ujust setup-sunshine` on the HTPC, then pair Moonlight
   on the workstation.

To check the HTPC without changing anything, run `bash icefin-htpc-setup.sh --check`.

## House rules the lab follows

- Before taking over the TV, it checks whether a Steam game is running and whether it's inside your quiet hours. If either is true, it doesn't start.
- It switches between desktop and game mode only if you allowed it.
- Anything only you can confirm (the TV's HDR badge, the receiver's format display) is asked on your phone; the lab never guesses.
- It never installs system packages, uses rpm-ostree, or runs sudo on the HTPC.

## Undo everything

```bash
bash icefin-htpc-setup.sh --remove
```

This removes the workstation key, the Icefin test build, the `icefin-lab` remote and the lab files.
It then asks whether to turn the SSH server off as well. Shared Flatpak runtimes stay; to remove them:

```bash
flatpak --user uninstall --unused
```

## Troubleshooting

- **"no graphical session":** run the script as the user that is logged in on the TV, from that user's desktop.
- **The workstation can't connect:** check `systemctl status sshd`. Also make sure the firewall allows SSH:
  ```bash
  sudo firewall-cmd --permanent --add-service=ssh && sudo firewall-cmd --reload
  ```
- **No HDMI audio formats:** the TV or receiver was off or in standby. Turn them on and run `--check` again.
- **The HTPC's address changes:** give it a fixed address (DHCP reservation) on your router, or use its hostname.
