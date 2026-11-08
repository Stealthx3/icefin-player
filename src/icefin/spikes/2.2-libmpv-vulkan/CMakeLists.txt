# Spike 2.2 (PLAN): patched libmpv (gpu-next + Vulkan render API) rendering on Qt's shared Vulkan device.
# Configure with PKG_CONFIG_PATH pointing at the patched libmpv (lab: ~/vkpfx). Standalone; not part of the app.
cmake_minimum_required(VERSION 3.16)
project(spike_libmpv_vulkan CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_AUTOMOC ON)
find_package(Qt6 REQUIRED COMPONENTS Gui Quick)
find_package(PkgConfig REQUIRED)
pkg_check_modules(MPV REQUIRED IMPORTED_TARGET mpv)
find_package(Vulkan REQUIRED)
add_executable(spike-libmpv-vulkan main.cpp)
target_link_libraries(spike-libmpv-vulkan Qt6::Gui Qt6::Quick Qt6::GuiPrivate PkgConfig::MPV Vulkan::Vulkan)
set_target_properties(spike-libmpv-vulkan PROPERTIES BUILD_RPATH "${MPV_LIBRARY_DIRS}")
