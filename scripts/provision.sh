#!/usr/bin/env bash
# provision.sh — install Icefin Player build/test deps in a lab guest (Debian 13). Idempotent.
# Usage (host): scripts/lab.sh run 'bash scripts/provision.sh'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
# Native dev build (upstream README deps; Debian 13 ships libmpv-dev, so no mpv-build needed)
sudo apt-get install -y -qq --no-install-recommends \
  build-essential cmake ninja-build pkg-config git curl unzip python3 meson \
  libasound2-dev libcec-dev libegl1-mesa-dev libgl1-mesa-dev libpulse-dev libsdl2-dev \
  libva-dev libvdpau-dev libx11-dev libxrandr-dev libicu-dev libmpv-dev \
  qt6-base-dev qt6-base-private-dev qt6-declarative-dev qt6-webengine-dev qt6-webengine-private-dev \
  qt6-webchannel-dev qt6-wayland qml6-module-qtqml-workerscript qml6-module-qtquick-controls \
  qml6-module-qtquick-templates qml6-module-qtquick-window qml6-module-qtwebchannel \
  qml6-module-qtwebengine qml6-module-qtwebengine-controlsdelegates qml6-module-qtwebview \
  xvfb xauth x11-utils python3-evdev pipewire pipewire-pulse pipewire-alsa wireplumber pipewire-bin alsa-utils psmisc weston kwin-wayland mutter wayland-utils mesa-vulkan-drivers libvulkan-dev vulkan-tools shellcheck ffmpeg python3-websocket xdotool python3-pil qt6-multimedia-dev qt6-shadertools-dev libsdl3-dev
# Patched libmpv / libplacebo builds (spike 2.2, task 5.2)
sudo apt-get install -y -qq --no-install-recommends \
  glslang-dev glslang-tools spirv-tools python3-jinja2 python3-glad liblcms2-dev libdovi-dev libunwind-dev \
  libavcodec-dev libavformat-dev libavutil-dev libswscale-dev libswresample-dev libavfilter-dev libavdevice-dev \
  libass-dev libwayland-dev wayland-protocols libxkbcommon-dev libpipewire-0.3-dev libjack-jackd2-dev libuchardet-dev \
  libdrm-dev libegl-dev libgbm-dev libxext-dev libxpresent-dev libxss-dev libxinerama-dev libxv-dev libjpeg-dev zlib1g-dev
# Full kernel (the cloud kernel lacks uinput, needed for virtual gamepads in controller tests); takes effect after reboot
sudo apt-get install -y -qq --no-install-recommends linux-image-amd64
echo uinput | sudo tee /etc/modules-load.d/uinput.conf >/dev/null
# Flatpak packaging (task 1.5) and containerized Jellyfin servers (task 1.7)
sudo apt-get install -y -qq --no-install-recommends flatpak flatpak-builder elfutils appstream librsvg2-common podman uidmap slirp4netns passt
sudo loginctl enable-linger "$(id -un)"   # rootless podman without a login session
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
echo "provision: OK ($(qmake6 -query QT_VERSION 2>/dev/null || echo 'qt?'), mpv $(pkg-config --modversion mpv), flatpak $(flatpak --version | cut -d' ' -f2))"
