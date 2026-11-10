# Spike 2.8 (not part of the app build): built by build.sh against the Flatpak SDK.
cmake_minimum_required(VERSION 3.21)
project(icefin_spike_28 LANGUAGES CXX)
find_package(Qt6 REQUIRED COMPONENTS Gui GuiPrivate Quick)  # QRhi is semi-public: GuiPrivate exposes <rhi/qrhi.h>
add_executable(qtswapchain qtswapchain.cpp)
target_link_libraries(qtswapchain Qt6::Gui Qt6::GuiPrivate Qt6::Quick)
