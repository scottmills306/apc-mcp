# Security

## Threat model

apc-mcp runs local system commands (cmake, ctest, clang-format, pluginval, clap-validator) on projects you point it at. It does not make network requests, collect telemetry, or communicate with any external service except the MCP client it's connected to via stdio.

## Attack surface

| Vector | Risk | Mitigation |
|--------|------|------------|
| **Command injection** | An attacker controlling tool arguments (via LLM prompt injection) could execute arbitrary shell commands. | All commands use `spawnSync()` with argument arrays — no user input reaches a shell. Zod regex validation rejects metacharacters at the schema level. |
| **Path traversal** | Malicious `projectPath` or `target` could escape the intended directory. | `validatePath()` rejects shell metacharacters. `checkPluginPath()` ensures `audio_plugin_create` writes stay within the project boundary. |
| **Build log data leakage** | Build output may contain local paths, user names, or environment details. | Output is returned only to the connected MCP client, which already has filesystem access. No data is persisted or transmitted externally. |
| **Dependency supply chain** | Compromised npm packages could introduce vulnerabilities. | Only 2 direct dependencies (`@modelcontextprotocol/sdk`, `zod`), both widely used and Anthropic-maintained. `npm audit` shows 0 vulnerabilities. Dependabot runs weekly. |
| **Denial of service** | Large builds could exhaust memory. | `maxBuffer: 2MB` on all process output. Configurable timeouts on all commands (default 180s). |

## Dependency audit

- `npm audit`: 0 vulnerabilities (verified at v1.4.0)
- Direct dependencies: 2 (`@modelcontextprotocol/sdk`, `zod`)
- Total transitive packages: ~93
- Automated scanning: CodeQL analysis on every push/PR/weekly

## Reporting a vulnerability

Open an issue at https://github.com/scottmills306/apc-mcp/issues with the `security` label. For sensitive disclosures, reach out directly via the repository owner's GitHub profile.
