# Spike 2.7 (PLAN): icefin-theme: scheme vs CSP, and the Gamepad API inside Qt WebEngine. Standalone.
cmake_minimum_required(VERSION 3.16)
project(spike_scheme_csp CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_AUTOMOC ON)
find_package(Qt6 REQUIRED COMPONENTS Gui Quick Qml WebEngineQuick WebEngineCore)
add_executable(spike-scheme-csp main.cpp)
target_link_libraries(spike-scheme-csp Qt6::Gui Qt6::Quick Qt6::Qml Qt6::WebEngineQuick Qt6::WebEngineCore)
