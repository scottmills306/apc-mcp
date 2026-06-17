# Changelog

## [1.0.0] — 2026-06-16

### Added
- Initial release of apc-mcp — Audio Plugin Coder MCP Server
- `audio_plugin_build` — CMake configure + build with structured error/warning output
- `audio_plugin_configure` — CMake configure with custom generator and flags
- `audio_plugin_test` — ctest runner with pass/fail summary
- `audio_plugin_lint` — clang-format check/auto-fix on C++ sources
- `audio_plugin_plugins` — List project plugins with metadata (text or JSON format)
- `audio_plugin_validate` — Run pluginval (VST3) and clap-validator on built binaries
- `audio_plugin_create` — Scaffold new CLAP or JUCE plugins from templates

### Features
- **Project config**: Drop `apc-mcp.json` in your project root for per-project defaults (generator, buildDir, validateFormats, etc.)
- **CWD auto-detection**: No `projectPath` needed when running from a project that has `apc-mcp.json`
- **Structured output**: Build/test results include parsed error/warning counts, validation results are per-format
- **CLAP and JUCE templates**: `audio_plugin_create` scaffolds working plugin stubs with proper CMake integration
- **MIT licensed**
