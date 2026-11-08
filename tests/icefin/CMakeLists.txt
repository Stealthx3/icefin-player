# Icefin tests (added by an ICEFIN-HOOK in tests/CMakeLists.txt). servers/ and web/ are lab tooling, not CMake.
add_subdirectory(unit)
add_executable(icefin-reserve-tool tools/reserve_tool.cpp)
target_link_libraries(icefin-reserve-tool jmp_core)
target_include_directories(icefin-reserve-tool PRIVATE ${CMAKE_SOURCE_DIR}/src)
