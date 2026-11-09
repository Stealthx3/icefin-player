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
            theme/CssSanitizer.cpp theme/CssSanitizer.h
            gpu/Hwdec.cpp gpu/Hwdec.h gpu/DecoderSelfTest.cpp gpu/DecoderSelfTest.h
            gpu/HardwareComponent.cpp gpu/HardwareComponent.h gpu/WebGpuStatus.cpp gpu/WebGpuStatus.h
            render/PlaybackRouter.cpp render/PlaybackRouter.h render/RouterComponent.cpp render/RouterComponent.h
            log/Redact.cpp log/Redact.h
            input/GamepadNames.cpp input/GamepadNames.h input/GamepadComponent.cpp input/GamepadComponent.h)

# libpulse for the IEC958 format setting (PLAN 3.4; pipewire-pulse implements the same protocol).
find_package(PkgConfig REQUIRED)
pkg_check_modules(ICEFIN_PULSE REQUIRED IMPORTED_TARGET GLOBAL libpulse)
cmake_language(DEFER DIRECTORY ${CMAKE_SOURCE_DIR}/src CALL target_link_libraries jmp_core PkgConfig::ICEFIN_PULSE)

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
