# apc-mcp — Audio Plugin Coder MCP Server

[![npm](https://img.shields.io/npm/v/%40scottmills306%2Fapc-mcp)](https://www.npmjs.com/package/@scottmills306/apc-mcp)
[![CI](https://github.com/scottmills306/apc-mcp/actions/workflows/publish.yml/badge.svg)](https://github.com/scottmills306/apc-mcp/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**apc-mcp** is a [Model Context Protocol](https://modelcontextprotocol.io) server that brings audio plugin development workflows into any MCP-compatible client (Claude Code, OpenCode, VS Code with MCP, etc.).

It wraps **CMake**, **ctest**, **clang-format**, **pluginval**, and **clap-validator** into a clean tool interface for building, testing, linting, validating, and scaffolding JUCE, CLAP, VST3, and ARA plugin projects.

## Tools

| Tool | What it does |
|------|-------------|
| `audio_plugin_build` | CMake configure + build with structured error/warning output |
| `audio_plugin_configure` | CMake configure with custom generator and flags |
| `audio_plugin_test` | Run ctest with pass/fail summary |
| `audio_plugin_lint` | clang-format check/auto-fix on `.cpp`/`.h`/`.hpp` sources |
| `audio_plugin_plugins` | List project plugins with metadata (text or JSON) |
| `audio_plugin_validate` | Run pluginval (VST3) and clap-validator on built binaries |
| `audio_plugin_create` | Scaffold new CLAP or JUCE plugins from templates |

## Quick Start

### Prerequisites

- **Node.js 18+**
- **CMake 3.22+** — for build/configure tools
- **clang-format** — for lint tool (optional)
- **pluginval** (optional) — for VST3 validation
- **clap-validator** (optional) — for CLAP validation
- A JUCE/CLAP/VST3 audio plugin project with a `plugins/` directory

### Installation

```json
{
  "mcp": {
    "apc-mcp": {
      "type": "local",
      "command": ["npx", "-y", "@scottmills306/apc-mcp"],
      "enabled": true
    }
  }
}
```

Or clone locally:

```sh
git clone https://github.com/scottmills306/apc-mcp.git
cd apc-mcp
npm install
# then point config to: node /path/to/apc-mcp/index.js
```

## Project Config

Drop an `apc-mcp.json` in your project root to set per-project defaults:

```json
{
  "generator": "Ninja",
  "config": "Release",
  "buildDir": "build",
  "pluginsDir": "plugins",
  "validateFormats": ["VST3", "CLAP"],
  "validateCommand": "pluginval",
  "clapValidatorCommand": "clap-validator"
}
```

When this file is present, **`projectPath` is optional** in tool calls — the server auto-detects your project from the working directory.

## Usage Examples

### Build

```
audio_plugin_build()
audio_plugin_build(config="Release", clean=true)
audio_plugin_build(projectPath="/path/to/other-plugin", target="MyPlugin_Standalone")
```

Build output includes parsed error/warning counts.

### Configure

```
audio_plugin_configure(generator="Ninja")
audio_plugin_configure(options="-DAPC_ENABLE_VISAGE=ON")
```

### Test

```
audio_plugin_test()
audio_plugin_test(config="Release", testName="MyPluginTest")
```

### Lint

```
audio_plugin_lint()
audio_plugin_lint(fix=true)
audio_plugin_lint(target="plugins/Foo/Source")
```

### List plugins

```
audio_plugin_plugins(format="json")
```

Returns structured JSON when `format="json"`, or human-readable text by default.

### Validate built binaries

```
audio_plugin_validate()
audio_plugin_validate(format="VST3")
audio_plugin_validate(format="CLAP")
```

Scans the build directory for plugin binaries and runs the appropriate validator on each.

### Scaffold a new plugin

```
audio_plugin_create(name="Phaser9000", type="clap")
audio_plugin_create(name="MyVerb", type="juce", vendor="MyCompany", formats="VST3;AU")
audio_plugin_create(name="SimpleDelay", type="clap", vendor="MyCompany", description="A simple delay effect")
```

Creates a working plugin stub with CMakeLists.txt, source files, and proper CLAP or JUCE structure.

## Project Structure

```
my-plugin/
├── apc-mcp.json              # Per-project config (optional)
├── CMakeLists.txt            # Root CMake project
├── plugins/
│   ├── MyPlugin/
│   │   ├── CMakeLists.txt    # Per-plugin CMake
│   │   ├── Source/
│   │   └── status.json       # Optional metadata
│   └── ...
├── common/                   # Shared sources (optional)
└── build/                    # Build directory (auto-created)
```

## Development

```sh
git clone https://github.com/scottmills306/apc-mcp.git
cd apc-mcp
npm install
npm test
```

Tests use Node's built-in `node:test` runner — zero test dependencies.

## Why apc-mcp?

- **Project-agnostic** — works with any audio plugin repo, no hardcoded paths
- **Configurable** — drop `apc-mcp.json` for per-project defaults, or pass everything explicitly
- **Structured output** — tools return parsed error/warning counts, pass/fail summaries, and optional JSON
- **Plugin scaffolding** — `audio_plugin_create` generates working CLAP and JUCE stubs from templates
- **Validation** — runs pluginval and clap-validator on your built binaries
- **Leverages your existing toolchain** — wraps cmake, ctest, clang-format instead of reinventing them
- **MIT licensed**

## Publishing to npm

The CI/CD pipeline publishes to npm automatically when a `v*` tag is pushed:

```sh
git tag v1.0.1 && git push origin v1.0.1
```

Requires `NPM_TOKEN` secret on the repository.

## License

MIT © 2026 Scott Mills
