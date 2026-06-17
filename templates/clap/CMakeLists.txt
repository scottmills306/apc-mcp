cmake_minimum_required(VERSION 3.22)
project({{PLUGIN_NAME}} VERSION 1.0.0 LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)

find_package(CLAP CONFIG REQUIRED)

add_library(${PROJECT_NAME} SHARED
  Source/PluginEntry.cpp
  Source/PluginProcessor.cpp
)

target_link_libraries(${PROJECT_NAME} PRIVATE CLAP::clap)
target_include_directories(${PROJECT_NAME} PRIVATE Source)

set_target_properties(${PROJECT_NAME} PROPERTIES
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/${PROJECT_NAME}.clap"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/${PROJECT_NAME}.clap"
)
