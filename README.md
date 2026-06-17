# apc-mcp — Audio Plugin Coder MCP Server

[![npm](https://img.shields.io/npm/v/%40scottmills306%2Fapc-mcp)](https://www.npmjs.com/package/@scottmills306/apc-mcp)
[![CI](https://github.com/scottmills306/apc-mcp/actions/workflows/publish.yml/badge.svg)](https://github.com/scottmills306/apc-mcp/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**apc-mcp** is a [Model Context Protocol](https://modelcontextprotocol.io) server that brings audio plugin development workflows into any MCP-compatible client (Claude Code, OpenCode, VS Code with MCP, etc.).

It wraps the tools you already use — **CMake**, **ctest**, **clang-format** — into a clean tool interface for building, testing, linting, and managing JUCE, CLAP, VST3, and ARA plugin projects.

## Tools

| Tool | What it does |
|------|-------------|
| `audio_plugin_build` | CMake configure + build (`cmake -B build && cmake --build`) |
| `audio_plugin_configure` | CMake configure with custom generator and flags |
| `audio_plugin_test` | Run ctest with optional test name filter |
| `audio_plugin_lint` | clang-format check/auto-fix on `.cpp`/`.h`/`.hpp` sources |
| `audio_plugin_plugins` | List plugins in a project with type/status metadata |

## Quick Start

### Prerequisites

- **Node.js 18+**
- **CMake 3.22+** — for build/configure tools
- **clang-format** — for lint tool (optional)
- A JUCE/CLAP/VST3 audio plugin project with a `plugins/` directory

### Installation

#### Option 1: npm (once published)

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

#### Option 2: Clone and run locally

```sh
git clone https://github.com/scottmills306/apc-mcp.git
cd apc-mcp
npm install
```

Then add to your MCP config:

```json
{
  "mcp": {
    "apc-mcp": {
      "type": "local",
      "command": ["node", "/path/to/apc-mcp/index.js"],
      "enabled": true
    }
  }
}
```

#### Option 3: Install from GitHub (requires Node 20+)

```sh
npm install -g github:scottmills306/apc-mcp
```

Then add to config:

```json
{
  "mcp": {
    "apc-mcp": {
      "type": "local",
      "command": ["apc-mcp"],
      "enabled": true
    }
  }
}
```

## Usage Examples

### Build a plugin project

```
audio_plugin_build(projectPath="/path/to/my-plugin")
audio_plugin_build(projectPath="/path/to/my-plugin", config="Release", clean=true)
audio_plugin_build(projectPath="/path/to/my-plugin", target="MyPlugin_Standalone")
```

### Configure only

```
audio_plugin_configure(projectPath="/path/to/my-plugin", generator="Ninja")
audio_plugin_configure(projectPath="/path/to/my-plugin", options="-DAPC_ENABLE_VISAGE=ON")
```

### Run tests

```
audio_plugin_test(projectPath="/path/to/my-plugin")
audio_plugin_test(projectPath="/path/to/my-plugin", config="Release", testName="MyPluginTest")
```

### Lint sources

```
audio_plugin_lint(projectPath="/path/to/my-plugin")
audio_plugin_lint(projectPath="/path/to/my-plugin", fix=true)
audio_plugin_lint(projectPath="/path/to/my-plugin", target="plugins/Foo/Source")
```

### List plugins

```
audio_plugin_plugins(projectPath="/path/to/my-plugin")
```

Returns each plugin directory with metadata from its `status.json`, if present.

## Project Structure

The server assumes a conventional audio plugin project layout:

```
my-plugin/
├── CMakeLists.txt          # Root CMake project
├── plugins/
│   ├── MyPlugin/
│   │   ├── CMakeLists.txt  # Per-plugin CMake
│   │   ├── Source/
│   │   └── status.json     # Optional metadata
│   └── ...
├── common/                 # Shared sources (optional)
└── build/                  # Build directory (auto-created)
```

## Development

```sh
git clone https://github.com/scottmills306/apc-mcp.git
cd apc-mcp
npm install
node index.js
```

Test the server by sending a `tools/list` request:

```sh
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node index.js
```

## Why apc-mcp?

- **Project-agnostic** — no hardcoded paths, works with any audio plugin repo
- **Zero config for the common case** — `projectPath` is the only required parameter
- **Leverages your existing toolchain** — wraps cmake, ctest, clang-format rather than reinventing them
- **No ACP backend needed** — unlike earlier designs, this runs standalone with zero external dependencies beyond Node.js and your system build tools

## License

MIT © 2026 Scott Mills
