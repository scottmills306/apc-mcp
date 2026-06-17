# Security

apc-mcp runs local system commands (cmake, ctest, clang-format, pluginval, clap-validator) on the projects you point it at. It does not make network requests, collect telemetry, or communicate with any external service except the MCP client it's connected to.

## Reporting a vulnerability

Open an issue at https://github.com/scottmills306/apc-mcp/issues with the `security` label. For sensitive disclosures, reach out directly via the repository owner's GitHub profile.
