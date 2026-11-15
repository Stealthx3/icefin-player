# Icefin desktop entry, AppStream metadata and icon (PLAN 1.3). Replaces upstream's
# InstallLinuxDesktopFile.cmake via an ICEFIN-HOOK in CMakeModules/LinuxConfiguration.cmake.
set(_m "${CMAKE_SOURCE_DIR}/src/icefin/meta")
install(FILES "${_m}/${ICEFIN_APP_ID}.desktop" DESTINATION ${CMAKE_INSTALL_FULL_DATAROOTDIR}/applications)
install(FILES "${_m}/${ICEFIN_APP_ID}.metainfo.xml" DESTINATION ${CMAKE_INSTALL_FULL_DATAROOTDIR}/metainfo)
# App icon: the Progress ring mark (IceSuite art kit, FIN-P1), flat cut. The scalable icon is also the window
# icon in the qrc (src/icefin/resources/icon.svg); the sized PNGs and the symbolic icon are in src/icefin/icons/.
# All of them are exported from the art kit; don't edit them by hand (docs/brand/README.md).
set(_icons "${CMAKE_SOURCE_DIR}/src/icefin/icons/hicolor")
install(FILES "${CMAKE_SOURCE_DIR}/src/icefin/resources/icon.svg"
        DESTINATION ${CMAKE_INSTALL_FULL_DATAROOTDIR}/icons/hicolor/scalable/apps RENAME ${ICEFIN_APP_ID}.svg)
foreach(_size 16 24 32 48 64 128 256 512)
  install(FILES "${_icons}/${_size}x${_size}/apps/${ICEFIN_APP_ID}.png"
          DESTINATION ${CMAKE_INSTALL_FULL_DATAROOTDIR}/icons/hicolor/${_size}x${_size}/apps)
endforeach()
install(FILES "${_icons}/symbolic/apps/${ICEFIN_APP_ID}-symbolic.svg"
        DESTINATION ${CMAKE_INSTALL_FULL_DATAROOTDIR}/icons/hicolor/symbolic/apps)
