# Icefin branding (PLAN 1.3, SPEC "Fork, branding and upstream sync").
# Included from CMakeModules/NameConfiguration.cmake (ICEFIN-HOOK) before Names.cpp is configured, so
# the binary, data/cache/log directories and socket names all become icefin-player.
set(ICEFIN_APP_ID io.github.stealthx3.IcefinPlayer)
set(ICEFIN_DISPLAY_NAME "Icefin Player")
set(ICEFIN_ORG_DOMAIN stealthx3.github.io)
set(ICEFIN_USER_AGENT_PRODUCT IcefinPlayer)
file(READ "${CMAKE_SOURCE_DIR}/src/icefin/VERSION" ICEFIN_VERSION)
string(STRIP "${ICEFIN_VERSION}" ICEFIN_VERSION)
file(READ "${CMAKE_SOURCE_DIR}/VERSION" ICEFIN_UPSTREAM_VERSION)   # upstream jellyfin-desktop base
string(STRIP "${ICEFIN_UPSTREAM_VERSION}" ICEFIN_UPSTREAM_VERSION)

# Upstream internal names (MAIN_TARGET, Konvergo, settings keys) stay; only output/data names change.
set(MAIN_NAME icefin-player)
set(DATA_NAME icefin-player)

# Flatpak builds (PLAN 1.6): Flatpak handles updates, so drop upstream's GitHub release check and its plugin.
option(ICEFIN_FLATPAK "Build for the Icefin Flatpak (no update check)" OFF)
if(ICEFIN_FLATPAK)
  add_definitions(-DICEFIN_FLATPAK -DDISABLE_UPDATE_CHECK)
  set(ICEFIN_FLATPAK_BOOL true)
else()
  set(ICEFIN_FLATPAK_BOOL false)
endif()

configure_file("${CMAKE_SOURCE_DIR}/src/icefin/Branding.h.in" "${CMAKE_BINARY_DIR}/src/icefin/Branding.h" @ONLY)
include_directories("${CMAKE_BINARY_DIR}/src/icefin")

# Files served from qrc under :/icefin/ (mapped in src/CMakeLists.txt, ICEFIN-HOOK)
file(GLOB_RECURSE ICEFIN_RESOURCE_FILES "${CMAKE_SOURCE_DIR}/src/icefin/resources/*" "${CMAKE_SOURCE_DIR}/themes/*" "${CMAKE_SOURCE_DIR}/src/icefin/inputmaps/*")  # bundled themes and input maps too (PLAN 8.1, 7.2)
message(STATUS "Icefin: ${ICEFIN_DISPLAY_NAME} ${ICEFIN_VERSION} (${ICEFIN_APP_ID}), upstream base ${ICEFIN_UPSTREAM_VERSION}")
