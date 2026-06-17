#!/usr/bin/env node
// apc-mcp — Audio Plugin Coder MCP Server
// Model Context Protocol server for audio plugin development workflows.
// Install: npx github:scottmills306/apc-mcp

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ─── Paths ──────────────────────────────────────────────────────────
const PKG_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(PKG_DIR, 'templates');
const CONFIG_FILE = 'apc-mcp.json';

// ─── Prerequisite checking ─────────────────────────────────────────
const REQUIREMENTS = [
  { bin: 'cmake', for: 'build/configure', install: 'https://cmake.org/download or brew install cmake / apt install cmake' },
  { bin: 'ctest', for: 'test', install: 'Part of CMake — install cmake' },
  { bin: 'clang-format', for: 'lint', install: 'brew install clang-format / apt install clang-format' },
  { bin: 'pluginval', for: 'VST3 validation', install: 'Download from https://github.com/Tracktion/pluginval/releases' },
  { bin: 'clap-validator', for: 'CLAP validation', install: 'Download from https://github.com/CLAP-Workspace/clap-validator/releases' },
];

const _prereqCache = new Map();

function findBinary(bin) {
  if (_prereqCache.has(bin)) return _prereqCache.get(bin);
  try {
    execSync(`which "${bin}" 2>/dev/null || command -v "${bin}" 2>/dev/null`, { stdio: 'pipe', encoding: 'utf-8' });
    _prereqCache.set(bin, true);
    return true;
  } catch {
    _prereqCache.set(bin, false);
    return false;
  }
}

function requireTool(binName) {
  const req = REQUIREMENTS.find(r => r.bin === binName);
  if (!findBinary(binName)) {
    const hint = req ? `\n  Install: ${req.install}` : '';
    throw new Error(`'${binName}' not found.${hint}`);
  }
}

function checkOptionalTool(binName) {
  const req = REQUIREMENTS.find(r => r.bin === binName);
  const found = findBinary(binName);
  if (!found && req) {
    console.error(`[apc-mcp] Note: '${binName}' not found (needed for ${req.for}). ${req.install}`);
  }
  return found;
}

// ─── Config ──────────────────────────────────────────────────────────
const defaultConfig = {
  generator: 'Unix Makefiles',
  config: 'Debug',
  buildDir: 'build',
  pluginsDir: 'plugins',
  validateFormats: ['VST3', 'CLAP'],
  validateCommand: 'pluginval',
  clapValidatorCommand: 'clap-validator',
};

function loadProjectConfig(projectPath) {
  const configPath = path.join(projectPath, CONFIG_FILE);
  if (fs.existsSync(configPath)) {
    try {
      return { ...defaultConfig, ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) };
    } catch (e) {
      console.error(`[apc-mcp] Warning: invalid ${CONFIG_FILE}: ${e.message}`);
    }
  }
  return { ...defaultConfig };
}

// ─── Project discovery ──────────────────────────────────────────────
function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 20; i++) { // safety valve: max 20 parents
    if (fs.existsSync(path.join(dir, CONFIG_FILE))) return dir;
    if (fs.existsSync(path.join(dir, 'CMakeLists.txt'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // hit filesystem root
    dir = parent;
  }
  return null;
}

function resolveProjectPath(provided) {
  if (provided) return path.resolve(provided);
  const detected = findProjectRoot(process.cwd());
  if (detected) return detected;
  return null;
}

function requireProjectPath(provided) {
  const proj = resolveProjectPath(provided);
  if (!proj) throw new Error(
    'No project detected. Pass projectPath, create apc-mcp.json, ' +
    'or run from within (or under) a directory with CMakeLists.txt.'
  );
  return proj;
}

// ─── Helpers ────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  return execSync(cmd, {
    timeout: (opts.timeout ?? 180) * 1000,
    stdio: 'pipe',
    encoding: 'utf-8',
    maxBuffer: 2 * 1024 * 1024,
    ...opts,
  });
}

function tryRun(cmd, opts = {}) {
  try {
    return { ok: true, output: run(cmd, opts) };
  } catch (e) {
    // Detect missing command vs build failure
    const msg = e.stderr || e.message || '';
    if (e.code === 'ENOENT' || msg.includes('command not found') || msg.includes('not found')) {
      const bin = cmd.split(' ')[0];
      const req = REQUIREMENTS.find(r => r.bin === bin);
      const hint = req ? `\n  Install: ${req.install}` : '';
      return { ok: false, output: '', stderr: `'${bin}' not found.${hint}` };
    }
    return { ok: false, output: e.stdout || '', stderr: e.stderr || e.message };
  }
}

function stripAnsi(text) {
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function parseBuildOutput(text) {
  const clean = stripAnsi(text);
  const lines = clean.split('\n');
  const errors = [];
  const warnings = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.includes(': error:') || trimmed.match(/: error\d*\s*\(/)) {
      errors.push(trimmed);
    } else if (trimmed.includes(': warning:') || trimmed.match(/^.*warning:/)) {
      warnings.push(trimmed);
    }
  }

  return {
    errorCount: errors.length,
    warningCount: warnings.length,
    errors: errors.slice(0, 20),
    warnings: warnings.slice(0, 20),
    truncated: errors.length > 20 || warnings.length > 20,
  };
}

function parseTestOutput(text) {
  const clean = stripAnsi(text);
  const passed = (clean.match(/\bPassed\b/gi) || []).length;
  const failed = (clean.match(/\bFailed\b/gi) || []).length;
  const total = (clean.match(/^tests? (\d+)/im) || [])[1] || (passed + failed);
  return { total: parseInt(total) || passed + failed, passed, failed };
}

function findPluginBinaries(projectPath, config, buildDir, formats) {
  const outDir = path.join(buildDir, 'plugins');
  if (!fs.existsSync(outDir)) return [];

  const results = [];
  const plugins = fs.readdirSync(outDir).filter(p =>
    fs.statSync(path.join(outDir, p)).isDirectory()
  );

  for (const plugin of plugins) {
    const artDir = path.join(outDir, plugin, `${plugin}_artefacts`, config);
    if (!fs.existsSync(artDir)) continue;

    for (const fmt of formats) {
      if (fmt === 'VST3') {
        const p = path.join(artDir, 'VST3', `${plugin}.vst3`);
        if (fs.existsSync(p)) results.push({ plugin, format: 'VST3', path: p });
      } else if (fmt === 'CLAP') {
        const d = path.join(artDir, 'CLAP');
        if (fs.existsSync(d)) {
          for (const f of fs.readdirSync(d).filter(f => f.endsWith('.clap')))
            results.push({ plugin, format: 'CLAP', path: path.join(d, f) });
        }
      } else if (fmt === 'LV2') {
        const p = path.join(artDir, 'LV2');
        if (fs.existsSync(p)) results.push({ plugin, format: 'LV2', path: p });
      } else if (fmt === 'AudioUnit') {
        const p = path.join(artDir, 'AudioUnit', `${plugin}.component`);
        if (fs.existsSync(p)) results.push({ plugin, format: 'AudioUnit', path: p });
      } else if (fmt === 'Standalone') {
        const p = path.join(artDir, 'Standalone');
        if (fs.existsSync(p)) results.push({ plugin, format: 'Standalone', path: p });
      }
    }
  }
  return results;
}

function validatePlugin(binary, fmt, validateCommand, clapValidatorCommand) {
  if (fmt === 'VST3') {
    requireTool(validateCommand);
    return tryRun(`"${validateCommand}" --strictness 10 --validate-in-new-process "${binary}"`, { timeout: 120 });
  }
  if (fmt === 'CLAP') {
    requireTool(clapValidatorCommand);
    return tryRun(`"${clapValidatorCommand}" "${binary}"`, { timeout: 120 });
  }
  return { ok: false, output: '', stderr: `No validator configured for ${fmt}` };
}

function replaceTemplateVars(content, vars) {
  let result = content;
  for (const [key, value] of Object.entries(vars))
    result = result.split(`{{${key}}}`).join(String(value));
  return result;
}

function mapPluginType(type) {
  switch (type) {
    case 'clap': return { template: 'clap', formats: 'CLAP' };
    case 'vst3': return { template: 'juce', formats: 'VST3' };
    case 'juce': return { template: 'juce', formats: 'VST3;LV2;Standalone' };
    case 'ara': return { template: 'juce', formats: 'ARA' };
    default: return { template: 'juce', formats: 'VST3;LV2;Standalone' };
  }
}

function slugName(name) { return name.replace(/[^a-zA-Z0-9]/g, '').replace(/^(\d)/, '_$1'); }
function displayName(name) { return name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim(); }

// ─── Server ─────────────────────────────────────────────────────────
const server = new McpServer({
  name: 'apc-mcp',
  version: '1.3.0',
});

// ─── audio_plugin_build ────────────────────────────────────────────
server.tool(
  'audio_plugin_build',
  {
    projectPath: z.string().optional()
      .describe('Root of a CMake audio plugin project. Auto-detected from CWD if you have apc-mcp.json or CMakeLists.txt in a parent directory.'),
    config: z.enum(['Debug', 'Release']).default('Debug')
      .describe('Build configuration. Debug includes symbols and assertions; Release is optimized.'),
    target: z.string().optional()
      .describe('Build only this CMake target (e.g. "MyPlugin_VST3", "MyPlugin_Standalone"). Omit to build all.'),
    clean: z.boolean().default(false)
      .describe('Clean build: runs cmake --build --clean-first to rebuild everything from scratch.'),
  },
  async (params) => {
    const proj = requireProjectPath(params.projectPath);
    requireTool('cmake');
    const cfg = loadProjectConfig(proj);
    const config = params.config || cfg.config;
    const buildDir = path.join(proj, cfg.buildDir);

    // Auto-configure if needed
    if (!fs.existsSync(path.join(buildDir, 'CMakeCache.txt'))) {
      fs.mkdirSync(buildDir, { recursive: true });
      const r = tryRun(`cmake -B "${buildDir}" -G "${cfg.generator}" -DCMAKE_BUILD_TYPE=${config}`, { cwd: proj, timeout: 120 });
      if (!r.ok) {
        return { content: [{ type: 'text', text: `Configure failed:\n${r.stderr}` }], isError: true };
      }
    }

    const cleanFlag = params.clean ? '--clean-first' : '';
    const targetFlag = params.target ? `--target ${params.target}` : '';
    const r = tryRun(`cmake --build "${buildDir}" --parallel ${cleanFlag} ${targetFlag}`, { cwd: proj });

    const parsed = parseBuildOutput(r.output);

    const text = [
      `## Build ${r.ok ? 'succeeded' : 'failed'}`,
      `Config: ${config}${params.target ? ` | Target: ${params.target}` : ''}`,
      `Errors: ${parsed.errorCount}, Warnings: ${parsed.warningCount}`,
      ...(parsed.errors.length ? ['', '### Errors', ...parsed.errors] : []),
      ...(parsed.warnings.length ? ['', '### Warnings', ...parsed.warnings] : []),
      ...(parsed.truncated ? ['', `_(truncated to first 20 items)_`] : []),
    ].join('\n');

    return { content: [{ type: 'text', text }], isError: !r.ok };
  }
);

// ─── audio_plugin_configure ────────────────────────────────────────
server.tool(
  'audio_plugin_configure',
  {
    projectPath: z.string().optional()
      .describe('Root of a CMake audio plugin project. Auto-detected from CWD.'),
    config: z.enum(['Debug', 'Release']).default('Debug')
      .describe('Build configuration.'),
    generator: z.string().optional()
      .describe('CMake generator. Defaults to "Unix Makefiles" (or whatever is in apc-mcp.json). Common: "Ninja", "Unix Makefiles", "Xcode".'),
    options: z.string().optional()
      .describe('Extra CMake flags. Example: -DAPC_ENABLE_VISAGE=ON -DMY_FLAG=OFF'),
  },
  async (params) => {
    const proj = requireProjectPath(params.projectPath);
    requireTool('cmake');
    const cfg = loadProjectConfig(proj);
    const config = params.config || cfg.config;
    const generator = params.generator || cfg.generator;
    const buildDir = path.join(proj, cfg.buildDir);
    fs.mkdirSync(buildDir, { recursive: true });

    const extra = params.options ?? '';
    const r = tryRun(`cmake -B "${buildDir}" -G "${generator}" -DCMAKE_BUILD_TYPE=${config} ${extra}`, { cwd: proj, timeout: 120 });
    return { content: [{ type: 'text', text: r.ok ? 'Configure succeeded.' : r.stderr }], isError: !r.ok };
  }
);

// ─── audio_plugin_test ─────────────────────────────────────────────
server.tool(
  'audio_plugin_test',
  {
    projectPath: z.string().optional()
      .describe('Root of a CMake audio plugin project. Auto-detected from CWD.'),
    config: z.enum(['Debug', 'Release']).default('Debug')
      .describe('Build configuration for the test executable.'),
    testName: z.string().optional()
      .describe('Run only tests matching this regex. Example: "MyPluginTest.*" to run a subset.'),
  },
  async (params) => {
    const proj = requireProjectPath(params.projectPath);
    requireTool('ctest');
    const cfg = loadProjectConfig(proj);
    const config = params.config || cfg.config;
    const buildDir = path.join(proj, cfg.buildDir);

    const filter = params.testName ? `--tests-regex "${params.testName}"` : '';
    const r = tryRun(`ctest --test-dir "${buildDir}" -C ${config} --output-on-failure ${filter}`, { cwd: proj, timeout: 300 });

    const parsed = parseTestOutput(r.output);
    const text = [
      `## Tests ${r.ok ? 'passed' : 'failed'}`,
      `Passed: ${parsed.passed}, Failed: ${parsed.failed}, Total: ${parsed.total}`,
      ...(parsed.failed > 0 ? ['', '### Details', r.output.slice(-2000)] : []),
    ].join('\n');

    return { content: [{ type: 'text', text }], isError: !r.ok };
  }
);

// ─── audio_plugin_lint ─────────────────────────────────────────────
server.tool(
  'audio_plugin_lint',
  {
    projectPath: z.string().optional()
      .describe('Root of a CMake audio plugin project. Auto-detected from CWD.'),
    fix: z.boolean().default(false)
      .describe('Auto-fix formatting in place. Without this flag, runs as dry-run and reports files that would change.'),
    target: z.string().optional()
      .describe('Specific file or subdirectory to lint, relative to project root. Example: "plugins/Foo/Source". Lints the whole project if omitted.'),
  },
  async (params) => {
    const proj = requireProjectPath(params.projectPath);
    requireTool('clang-format');
    const searchRoot = params.target ? path.join(proj, params.target) : proj;
    if (!fs.existsSync(searchRoot)) {
      return { content: [{ type: 'text', text: `Path not found: ${searchRoot}` }], isError: true };
    }

    const fixFlag = params.fix ? '-i' : '--dry-run -Werror';
    // Use find -print0 | xargs -0 for safe space handling
    const r = tryRun(
      `find "${searchRoot}" -name '*.cpp' -o -name '*.cc' -o -name '*.cxx' -o -name '*.h' -o -name '*.hpp' -print0 | xargs -0 clang-format ${fixFlag}`,
      { cwd: proj, timeout: 60 }
    );

    if (!r.ok) {
      const files = (r.stderr.match(/(\/[^\s:]+)/g) || []).filter(f => f.endsWith('.cpp') || f.endsWith('.h') || f.endsWith('.hpp'));
      const text = [
        '## Lint found issues',
        `Files with problems: ${files.length}`,
        '',
        ...(files.length ? ['```', ...files.slice(0, 30).map(f => `  ${path.relative(proj, f)}`), '```'] : []),
        ...(!params.fix ? ['', 'Run with fix=true to auto-format.'] : []),
      ].join('\n');
      return { content: [{ type: 'text', text }], isError: true };
    }

    return { content: [{ type: 'text', text: params.target
      ? `No formatting issues in ${params.target}.`
      : 'No formatting issues found across project.'
    }] };
  }
);

// ─── audio_plugin_plugins ──────────────────────────────────────────
server.tool(
  'audio_plugin_plugins',
  {
    projectPath: z.string().optional()
      .describe('Root of a CMake audio plugin project. Auto-detected from CWD.'),
    format: z.enum(['text', 'json']).default('text')
      .describe('Output format. "json" returns structured data the LLM can process. "text" is human-readable.'),
  },
  async (params) => {
    const proj = requireProjectPath(params.projectPath);
    const cfg = loadProjectConfig(proj);
    const pluginsDir = path.join(proj, cfg.pluginsDir);
    if (!fs.existsSync(pluginsDir)) {
      return { content: [{ type: 'text', text: `No ${cfg.pluginsDir}/ directory found in project.` }] };
    }

    const plugins = fs.readdirSync(pluginsDir).filter(p => {
      const pdir = path.join(pluginsDir, p);
      return fs.statSync(pdir).isDirectory() && fs.existsSync(path.join(pdir, 'CMakeLists.txt'));
    });

    const details = plugins.map(name => {
      const statusPath = path.join(pluginsDir, name, 'status.json');
      let meta = { name };
      if (fs.existsSync(statusPath)) {
        try { meta = { ...meta, ...JSON.parse(fs.readFileSync(statusPath, 'utf-8')) }; } catch {}
      }
      return meta;
    });

    if (params.format === 'json') {
      return { content: [{ type: 'text', text: JSON.stringify(details, null, 2) }] };
    }

    if (!details.length) {
      return { content: [{ type: 'text', text: `Found ${cfg.pluginsDir}/ directory but no subdirectories with CMakeLists.txt.` }] };
    }

    const text = details.map(d => {
      const parts = [`- **${d.name}**`];
      if (d.type) parts.push(`type: ${d.type}`);
      if (d.status) parts.push(`status: ${d.status}`);
      return parts.join(' — ');
    }).join('\n');

    return { content: [{ type: 'text', text: `${details.length} plugin(s):\n${text}` }] };
  }
);

// ─── audio_plugin_validate ─────────────────────────────────────────
server.tool(
  'audio_plugin_validate',
  {
    projectPath: z.string().optional()
      .describe('Root of a CMake audio plugin project. Auto-detected from CWD.'),
    config: z.enum(['Debug', 'Release']).default('Debug')
      .describe('Build configuration (matches the build you ran).'),
    format: z.enum(['VST3', 'CLAP', 'all']).default('all')
      .describe('Which format to validate. "all" validates every format the project built for.'),
  },
  async (params) => {
    const proj = requireProjectPath(params.projectPath);
    const cfg = loadProjectConfig(proj);
    const config = params.config || cfg.config;
    const buildDir = path.join(proj, cfg.buildDir);

    const formats = params.format === 'all' ? cfg.validateFormats : [params.format];

    // Check at least one validator is available for requested formats
    for (const fmt of formats) {
      if (fmt === 'VST3') checkOptionalTool('pluginval');
      if (fmt === 'CLAP') checkOptionalTool('clap-validator');
    }

    const binaries = findPluginBinaries(proj, config, buildDir, formats);
    if (!binaries.length) {
      const builtFormats = fs.existsSync(buildDir)
        ? ''
        : ' (build directory not found — run audio_plugin_build first)';
      return {
        content: [{ type: 'text', text: `No plugin binaries found for format(s): ${formats.join(', ')}.${builtFormats}` }],
        isError: true,
      };
    }

    const results = [];
    for (const b of binaries) {
      const r = validatePlugin(b.path, b.format, cfg.validateCommand, cfg.clapValidatorCommand);
      results.push({
        plugin: b.plugin,
        format: b.format,
        path: b.path,
        passed: r.ok,
        output: r.ok ? '' : (r.stderr || r.output.slice(0, 1000)),
      });
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    const lines = [`## Validation results — ${passed} passed, ${failed} failed`];
    for (const r of results) {
      lines.push(`\n### ${r.plugin} [${r.format}] — ${r.passed ? 'PASS' : 'FAIL'}`);
      lines.push(`\`${r.path}\``);
      if (!r.passed) lines.push(`\`\`\`\n${r.output}\n\`\`\``);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }], isError: failed > 0 };
  }
);

// ─── audio_plugin_create ───────────────────────────────────────────
server.tool(
  'audio_plugin_create',
  {
    projectPath: z.string().optional()
      .describe('Parent project root where the plugins/ directory lives. Auto-detected from CWD.'),
    name: z.string().min(1)
      .describe('Plugin name. Use kebab-case, snake_case, or CamelCase — it gets cleaned up. Examples: "Phaser9000", "my-delay", "TapeEcho".'),
    type: z.enum(['clap', 'vst3', 'juce', 'ara']).default('clap')
      .describe('Plugin format. "clap" generates a standalone CLAP plugin. "juce" generates a JUCE AudioProcessor. "vst3" is a JUCE plugin targeting VST3. "ara" is a JUCE ARA plugin.'),
    vendor: z.string().default('apc-mcp')
      .describe('Vendor/company name embedded in the plugin metadata.'),
    description: z.string().default('An audio plugin')
      .describe('Short description for the plugin metadata.'),
    formats: z.string().optional()
      .describe('JUCE plugin formats override. Only applies to juce/vst3/ara types. Default: "VST3;LV2;Standalone". Example: "VST3;AU;Standalone"'),
  },
  async (params) => {
    const proj = requireProjectPath(params.projectPath);
    const cfg = loadProjectConfig(proj);
    const typeInfo = mapPluginType(params.type);
    const pluginDir = path.join(proj, cfg.pluginsDir, params.name);

    if (fs.existsSync(pluginDir)) {
      return { content: [{ type: 'text', text: `Already exists: ${pluginDir}` }], isError: true };
    }

    const templateDir = path.join(TEMPLATES_DIR, typeInfo.template);
    if (!fs.existsSync(templateDir)) {
      return { content: [{ type: 'text', text: `Template missing: ${typeInfo.template}. Reinstall apc-mcp.` }], isError: true };
    }

    const id = slugName(params.name);
    const vars = {
      PLUGIN_NAME: params.name,
      PLUGIN_ID: id,
      PLUGIN_CLASS_NAME: id + 'Processor',
      PLUGIN_DISPLAY_NAME: displayName(params.name),
      PLUGIN_DESCRIPTION: params.description,
      PLUGIN_FORMATS: params.formats || typeInfo.formats,
      VENDOR: params.vendor,
    };

    // Copy template with variable substitution
    function copyDir(src, dest) {
      fs.mkdirSync(dest, { recursive: true });
      for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          copyDir(srcPath, destPath);
        } else if (entry.isFile()) {
          const content = replaceTemplateVars(fs.readFileSync(srcPath, 'utf-8'), vars);
          fs.writeFileSync(destPath, content, 'utf-8');
        }
      }
    }

    try {
      copyDir(templateDir, pluginDir);
    } catch (e) {
      return { content: [{ type: 'text', text: `Failed to create plugin: ${e.message}` }], isError: true };
    }

    // Build file tree for output
    const tree = [];
    function listDir(dir, prefix = '') {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        tree.push(`${prefix}${entry.isDirectory() ? '📁 ' : '📄 '}${entry.name}`);
        if (entry.isDirectory()) listDir(path.join(dir, entry.name), prefix + '  ');
      }
    }
    listDir(pluginDir);

    const text = [
      `## Created ${params.type} plugin: ${params.name}`,
      `Location: ${pluginDir}`,
      '',
      ...tree,
    ].join('\n');

    return { content: [{ type: 'text', text }] };
  }
);

// ─── Start ─────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('[apc-mcp] Fatal:', err);
  process.exit(1);
});
