# Icefin desktop entry, AppStream metadata and icon (PLAN 1.3). Replaces upstream's
# InstallLinuxDesktopFile.cmake via an ICEFIN-HOOK in CMakeModules/LinuxConfiguration.cmake.
set(_m "${CMAKE_SOURCE_DIR}/src/icefin/meta")
install(FILES "${_m}/${ICEFIN_APP_ID}.desktop" DESTINATION ${CMAKE_INSTALL_FULL_DATAROOTDIR}/applications)
install(FILES "${_m}/${ICEFIN_APP_ID}.metainfo.xml" DESTINATION ${CMAKE_INSTALL_FULL_DATAROOTDIR}/metainfo)
install(FILES "${CMAKE_SOURCE_DIR}/src/icefin/resources/icon.svg"
        DESTINATION ${CMAKE_INSTALL_FULL_DATAROOTDIR}/icons/hicolor/scalable/apps RENAME ${ICEFIN_APP_ID}.svg)
