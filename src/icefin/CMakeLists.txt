# Icefin sources compiled into upstream's jmp_core library (added by an ICEFIN-HOOK in src/CMakeLists.txt).
add_sources(audio/Eld.cpp audio/Eld.h audio/Passthrough.cpp audio/Passthrough.h
            audio/AudioOutput.cpp audio/AudioOutput.h audio/AudioPolicy.cpp audio/AudioPolicy.h
            audio/Fallback.cpp audio/Fallback.h)
