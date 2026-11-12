# Icefin sources compiled into upstream's jmp_core library (added by an ICEFIN-HOOK in src/CMakeLists.txt).
add_sources(audio/Eld.cpp audio/Eld.h audio/Passthrough.cpp audio/Passthrough.h
            audio/AudioOutput.cpp audio/AudioOutput.h audio/AudioPolicy.cpp audio/AudioPolicy.h
            audio/Fallback.cpp audio/Fallback.h
            audio/DeviceReservation.cpp audio/DeviceReservation.h
            audio/AudioState.cpp audio/AudioState.h audio/DeviceDelay.cpp audio/DeviceDelay.h
            audio/AudioTest.cpp audio/AudioTest.h audio/Iec958Formats.cpp audio/Iec958Formats.h
            settings/SettingsMerge.cpp settings/SettingsMerge.h
            theme/Tokens.cpp theme/Tokens.h theme/ThemePackage.cpp theme/ThemePackage.h
            theme/ThemeComponent.cpp theme/ThemeComponent.h theme/ThemeScheme.cpp theme/ThemeScheme.h
            theme/CssSanitizer.cpp theme/CssSanitizer.h theme/Backdrop.cpp theme/Backdrop.h
            theme/ThemeInstall.cpp theme/ThemeInstall.h theme/UiSounds.cpp theme/UiSounds.h
            gpu/Hwdec.cpp gpu/Hwdec.h gpu/DecoderSelfTest.cpp gpu/DecoderSelfTest.h
            gpu/HardwareComponent.cpp gpu/HardwareComponent.h gpu/WebGpuStatus.cpp gpu/WebGpuStatus.h
            render/PlaybackRouter.cpp render/PlaybackRouter.h render/RouterComponent.cpp render/RouterComponent.h
            render/HdrCapabilityProbe.cpp render/HdrCapabilityProbe.h render/VulkanDevice.cpp render/VulkanDevice.h render/VulkanVideo.cpp render/VulkanVideo.h render/MpvTarget.cpp render/MpvTarget.h render/Compositing.cpp render/Compositing.h
            capability/CapabilityModel.cpp capability/CapabilityModel.h
            log/Redact.cpp log/Redact.h log/Recent.cpp log/Recent.h diag/Report.cpp diag/Report.h
            input/GamepadNames.cpp input/GamepadNames.h input/GamepadComponent.cpp input/GamepadComponent.h)

# Native backdrop (PLAN 8.4): Qt ShaderTools bakes built-in themes' GLSL backdrops at load. Optional: without it
# only precompiled .qsb backdrops load, and themes fall back to their web-layer effects.
# QShader and QShaderBaker are Qt's semi-public RHI API: their headers sit in the private include trees. Since Qt 6.10
# the private modules are separate packages (Qt6GuiPrivate, Qt6ShaderToolsPrivate); before that they come with the
# public ones. One find_package per component, so a missing one doesn't hide the others.
foreach(comp ShaderTools GuiPrivate ShaderToolsPrivate)
  find_package(Qt6 COMPONENTS ${comp} QUIET GLOBAL)
endforeach()
if(TARGET Qt6::ShaderTools AND TARGET Qt6::ShaderToolsPrivate AND TARGET Qt6::GuiPrivate)
  cmake_language(DEFER DIRECTORY ${CMAKE_SOURCE_DIR}/src CALL target_link_libraries jmp_core Qt6::ShaderTools Qt6::ShaderToolsPrivate Qt6::GuiPrivate)
  cmake_language(DEFER DIRECTORY ${CMAKE_SOURCE_DIR}/src CALL target_compile_definitions jmp_core PRIVATE ICEFIN_SHADERTOOLS)
  message(STATUS "Icefin: backdrop shader baking with Qt ShaderTools")
else()
  message(STATUS "Icefin: no Qt ShaderTools; backdrops need precompiled .qsb shaders")
  if(TARGET Qt6::GuiPrivate)
    cmake_language(DEFER DIRECTORY ${CMAKE_SOURCE_DIR}/src CALL target_link_libraries jmp_core Qt6::GuiPrivate)  # QShader (.qsb checks)
  endif()
endif()

# Theme install from file (PLAN 9.21) unpacks zips with QZipReader, in Qt Core's private headers (a separate
# Qt6CorePrivate package since Qt 6.10, part of Qt6Core before).
find_package(Qt6 COMPONENTS CorePrivate QUIET GLOBAL)
if(TARGET Qt6::CorePrivate)
  cmake_language(DEFER DIRECTORY ${CMAKE_SOURCE_DIR}/src CALL target_link_libraries jmp_core Qt6::CorePrivate)
endif()

# libpulse for the IEC958 format setting (PLAN 3.4; pipewire-pulse implements the same protocol).
find_package(PkgConfig REQUIRED)
pkg_check_modules(ICEFIN_PULSE REQUIRED IMPORTED_TARGET GLOBAL libpulse)
cmake_language(DEFER DIRECTORY ${CMAKE_SOURCE_DIR}/src CALL target_link_libraries jmp_core PkgConfig::ICEFIN_PULSE)

# wp_color_manager_v1 client bindings for the HDR capability probe (PLAN 6.1). Generated at configure time: jmp_core
# lives in another directory, so a custom command's output couldn't be attached to it.
find_program(ICEFIN_WAYLAND_SCANNER wayland-scanner)
pkg_check_modules(ICEFIN_WLC IMPORTED_TARGET GLOBAL wayland-client)
pkg_get_variable(ICEFIN_WP_DIR wayland-protocols pkgdatadir)
set(ICEFIN_CM_XML "${ICEFIN_WP_DIR}/staging/color-management/color-management-v1.xml")
if(ICEFIN_WAYLAND_SCANNER AND ICEFIN_WLC_FOUND AND EXISTS "${ICEFIN_CM_XML}")
  set(gen "${CMAKE_CURRENT_BINARY_DIR}")  # already on jmp_core's include path
  execute_process(COMMAND ${ICEFIN_WAYLAND_SCANNER} client-header "${ICEFIN_CM_XML}" "${gen}/color-management-v1-client-protocol.h" COMMAND_ERROR_IS_FATAL ANY)
  execute_process(COMMAND ${ICEFIN_WAYLAND_SCANNER} private-code "${ICEFIN_CM_XML}" "${gen}/color-management-v1-protocol.c" COMMAND_ERROR_IS_FATAL ANY)
  add_sources("${gen}/color-management-v1-protocol.c")
  cmake_language(DEFER DIRECTORY ${CMAKE_SOURCE_DIR}/src CALL target_link_libraries jmp_core PkgConfig::ICEFIN_WLC)
  cmake_language(DEFER DIRECTORY ${CMAKE_SOURCE_DIR}/src CALL target_compile_definitions jmp_core PRIVATE ICEFIN_WAYLAND_CM)
  message(STATUS "Icefin: HDR capability probe with wp_color_manager_v1")
else()
  message(STATUS "Icefin: HDR capability probe without wp_color_manager_v1 (wayland-scanner, wayland-client or wayland-protocols >= 1.41 missing)")
endif()

# SDL3 gamepad layer (PLAN 7.1). It replaces upstream's SDL2 InputSDL: SDL2 and SDL3 export the same symbol names, so
# they can't share a process. jmp_core is defined after this directory, so link and define through deferred calls.
option(ICEFIN_SDL3 "SDL3 gamepad layer replacing upstream's SDL2 InputSDL (needs -DENABLE_SDL2=OFF)" OFF)
if(ICEFIN_SDL3)
  if(ENABLE_SDL2)
    message(FATAL_ERROR "ICEFIN_SDL3 needs -DENABLE_SDL2=OFF: SDL2 and SDL3 can't share a process")
  endif()
  find_package(SDL3 REQUIRED CONFIG GLOBAL)  # GLOBAL: jmp_core links it from the src directory
  add_sources(input/GamepadService.cpp input/GamepadService.h)
  cmake_language(DEFER DIRECTORY ${CMAKE_SOURCE_DIR}/src CALL target_link_libraries jmp_core SDL3::SDL3)
  cmake_language(DEFER DIRECTORY ${CMAKE_SOURCE_DIR}/src CALL target_compile_definitions jmp_core PUBLIC ICEFIN_SDL3)
endif()

# Patched libmpv with the Vulkan render API (PLAN 5.2, external/mpv/README.md). The Vulkan video item (5.3) builds
# only with it; the Flatpak always bundles it, so a Flatpak build without it is an error.
if(MPV_INCLUDE_DIR AND EXISTS "${MPV_INCLUDE_DIR}/mpv/render_vk.h")
  cmake_language(DEFER DIRECTORY ${CMAKE_SOURCE_DIR}/src CALL target_compile_definitions jmp_core PUBLIC ICEFIN_MPV_VULKAN)
  message(STATUS "Icefin: libmpv has the Vulkan render API (${MPV_INCLUDE_DIR})")
elseif(ICEFIN_FLATPAK)
  message(FATAL_ERROR "Icefin: the Flatpak's libmpv lacks the Vulkan render API (mpv/render_vk.h): apply external/mpv/patches")
else()
  message(STATUS "Icefin: libmpv without the Vulkan render API; build external/mpv (build-lab.sh) for the Vulkan video path")
endif()
