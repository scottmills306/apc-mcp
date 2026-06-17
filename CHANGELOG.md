# Changelog

## [1.3.0] — 2026-06-16

### UX improvements
- **Smart project discovery**: walks up parent directories looking for `apc-mcp.json` or `CMakeLists.txt`. Run from any subdirectory in your project.
- **Prerequisite checking**: when cmake/clang-format/pluginval/clap-validator are missing, the tool tells you exactly how to install them instead of throwing a cryptic error.
- **Better error messages**: `tryRun` distinguishes "command not found" from "command failed" and gives actionable instructions.
- **Safe file finding**: lint uses `find -print0 | xargs -0` to handle filenames with spaces.
- **Richer tool descriptions**: every parameter has a detailed description so the LLM understands what it does without guessing.

### Changed
- Server version bumped to 1.3.0

## [1.2.0] — 2026-06-16

### Added
- **Logo**: SVG banner in README with dark/light mode support
- **.editorconfig**: Standardized editor settings
- **Issue templates**: Bug report + feature request templates in `.github/ISSUE_TEMPLATE/`
- **Dependabot**: Weekly automated dependency updates for npm + GitHub Actions
- **CodeQL**: Security analysis workflow
- **SECURITY.md**: Vulnerability reporting policy
- **CI matrix**: Tests run on Node 18, 20, and 22 in parallel
- **Lint step**: `node --check index.js` in CI to catch syntax errors
- **FAQ / Troubleshooting** section in README
- **Semantic versioning** policy documented

### Changed
- README restructured with banner, badges, nav links, and cleaner tool docs
- CI workflow renamed to "CI" (was "CI / Publish"), publish step uses `continue-on-error`
- package.json: added `lint` script

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
