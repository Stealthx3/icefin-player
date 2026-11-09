# Icefin sources compiled into upstream's jmp_core library (added by an ICEFIN-HOOK in src/CMakeLists.txt).
add_sources(audio/Eld.cpp audio/Eld.h audio/Passthrough.cpp audio/Passthrough.h
            audio/AudioOutput.cpp audio/AudioOutput.h audio/AudioPolicy.cpp audio/AudioPolicy.h
            audio/Fallback.cpp audio/Fallback.h
            audio/DeviceReservation.cpp audio/DeviceReservation.h
            audio/AudioState.cpp audio/AudioState.h audio/DeviceDelay.cpp audio/DeviceDelay.h
            settings/SettingsMerge.cpp settings/SettingsMerge.h
            theme/Tokens.cpp theme/Tokens.h theme/ThemePackage.cpp theme/ThemePackage.h
            theme/ThemeComponent.cpp theme/ThemeComponent.h)
