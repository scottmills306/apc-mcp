# Changelog

## [1.1.1] — 2026-06-16

### Changed
- Primary install method now uses `npx github:scottmills306/apc-mcp` — no npm account needed
- Updated README, AGENTS_REFERENCE, meta-orchestrator to reflect GitHub-based install
- Switched local opencode config to `npx github:` method

## [1.1.0] — 2026-06-16

### Added
- `audio_plugin_create` — Scaffold new CLAP or JUCE plugins from templates
- `audio_plugin_validate` — Run pluginval (VST3) and clap-validator on built binaries
- Config system: `apc-mcp.json` per-project defaults for generator, buildDir, validateFormats, etc.
- CWD auto-detection: `projectPath` optional when `apc-mcp.json` present
- Structured output: parsed error/warning counts, test pass/fail summary, `format=json` for plugins
- Test suite: 11 tests using Node `node:test` — zero dependencies
- CHANGELOG.md, CONTRIBUTING.md
- Updated CI workflow with proper test step

## [1.0.0] — 2026-06-16

### Added
- Initial release
- `audio_plugin_build` — CMake configure + build
- `audio_plugin_configure` — CMake configure with custom generator/flags
- `audio_plugin_test` — ctest runner
- `audio_plugin_lint` — clang-format check/auto-fix
- `audio_plugin_plugins` — List project plugins with metadata
- MIT licensed**
