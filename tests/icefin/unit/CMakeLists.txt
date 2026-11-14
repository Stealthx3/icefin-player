find_package(Qt6 REQUIRED COMPONENTS Test)
add_executable(test_icefin_audio test_audio.cpp)
target_link_libraries(test_icefin_audio jmp_core Qt6::Test)
target_include_directories(test_icefin_audio PRIVATE ${CMAKE_SOURCE_DIR}/src)
target_compile_definitions(test_icefin_audio PRIVATE ICEFIN_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
add_test(NAME test_icefin_audio COMMAND test_icefin_audio)

add_executable(test_icefin_theme test_theme.cpp)
target_link_libraries(test_icefin_theme jmp_core Qt6::Test)
target_include_directories(test_icefin_theme PRIVATE ${CMAKE_SOURCE_DIR}/src)
target_compile_definitions(test_icefin_theme PRIVATE ICEFIN_THEMES="${CMAKE_SOURCE_DIR}/tests/icefin/themes")
add_test(NAME test_icefin_theme COMMAND test_icefin_theme)

add_executable(test_icefin_gpu test_gpu.cpp)
target_link_libraries(test_icefin_gpu jmp_core Qt6::Test)
target_include_directories(test_icefin_gpu PRIVATE ${CMAKE_SOURCE_DIR}/src ${CMAKE_SOURCE_DIR}/src/core)  # HardwareComponent's frame summary
target_compile_definitions(test_icefin_gpu PRIVATE ICEFIN_TESTMEDIA="${CMAKE_SOURCE_DIR}/src/icefin/resources/testmedia")
add_test(NAME test_icefin_gpu COMMAND test_icefin_gpu)

add_executable(test_icefin_router test_router.cpp)
target_link_libraries(test_icefin_router jmp_core Qt6::Test)
target_include_directories(test_icefin_router PRIVATE ${CMAKE_SOURCE_DIR}/src)
add_test(NAME test_icefin_router COMMAND test_icefin_router)

add_executable(test_icefin_log test_log.cpp)
target_link_libraries(test_icefin_log jmp_core Qt6::Test)
target_include_directories(test_icefin_log PRIVATE ${CMAKE_SOURCE_DIR}/src)
add_test(NAME test_icefin_log COMMAND test_icefin_log)

add_executable(test_icefin_gamepad test_gamepad.cpp)
target_link_libraries(test_icefin_gamepad jmp_core Qt6::Test)
target_include_directories(test_icefin_gamepad PRIVATE ${CMAKE_SOURCE_DIR}/src ${CMAKE_SOURCE_DIR}/src/core ${CMAKE_SOURCE_DIR}/src/input)  # LircKeys uses InputBase
add_test(NAME test_icefin_gamepad COMMAND test_icefin_gamepad)

add_executable(test_icefin_iec958 test_iec958.cpp)
target_link_libraries(test_icefin_iec958 jmp_core Qt6::Test)
target_include_directories(test_icefin_iec958 PRIVATE ${CMAKE_SOURCE_DIR}/src)
add_test(NAME test_icefin_iec958 COMMAND test_icefin_iec958)

add_executable(test_icefin_compositing test_compositing.cpp)
target_link_libraries(test_icefin_compositing jmp_core Qt6::Test)
target_include_directories(test_icefin_compositing PRIVATE ${CMAKE_SOURCE_DIR}/src)
add_test(NAME test_icefin_compositing COMMAND test_icefin_compositing)

add_executable(test_icefin_capability test_capability.cpp)
target_link_libraries(test_icefin_capability jmp_core Qt6::Test)
target_include_directories(test_icefin_capability PRIVATE ${CMAKE_SOURCE_DIR}/src)
add_test(NAME test_icefin_capability COMMAND test_icefin_capability)

add_executable(test_icefin_diag test_diag.cpp)
target_link_libraries(test_icefin_diag jmp_core Qt6::Test)
target_include_directories(test_icefin_diag PRIVATE ${CMAKE_SOURCE_DIR}/src)
add_test(NAME test_icefin_diag COMMAND test_icefin_diag)
