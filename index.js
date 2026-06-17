#!/usr/bin/env node
// apc-mcp — Audio Plugin Coder MCP Server
// Model Context Protocol server for audio plugin development workflows.
// Run: npx @scottmills306/apc-mcp

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
      const user = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return { ...defaultConfig, ...user };
    } catch (e) {
      console.error(`[apc-mcp] Warning: invalid ${CONFIG_FILE}: ${e.message}`);
    }
  }
  return { ...defaultConfig };
}

function resolveProjectPath(provided) {
  if (provided) return path.resolve(provided);
  const cwdConfig = path.join(process.cwd(), CONFIG_FILE);
  if (fs.existsSync(cwdConfig)) return process.cwd();
  return null;
}

function requireProjectPath(provided) {
  const proj = resolveProjectPath(provided);
  if (!proj) throw new Error(
    'projectPath is required. Either pass it explicitly or create an apc-mcp.json in your project root.'
  );
  return proj;
}

// ─── Helpers ────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  return execSync(cmd, {
    timeout: (opts.timeout ?? 180) * 1000,
    stdio: 'pipe',
    encoding: 'utf-8',
    ...opts,
  });
}

function tryRun(cmd, opts = {}) {
  try {
    return { ok: true, output: run(cmd, opts) };
  } catch (e) {
    return { ok: false, output: e.stdout || '', stderr: e.stderr || e.message };
  }
}

function parseBuildOutput(text) {
  const errors = [];
  const warnings = [];
  const lines = text.split('\n');
  let errorCount = 0;
  let warningCount = 0;

  for (const line of lines) {
    if (line.includes(': error:') || line.match(/: error\d*\s*\(/)) {
      errors.push(line.trim());
      errorCount++;
    } else if (line.includes(': warning:') || line.includes('warning:')) {
      warnings.push(line.trim());
      warningCount++;
    }
  }

  return { errorCount, warningCount, errors, warnings };
}

function parseTestOutput(text) {
  const passed = (text.match(/\bPassed\b/gi) || []).length;
  const failed = (text.match(/\bFailed\b/gi) || []).length;
  const total = (text.match(/^tests? (\d+)/im) || [])[1] || (passed + failed);
  return { total: parseInt(total) || passed + failed, passed, failed };
}

function findPluginBinaries(projectPath, config, buildDir, formats) {
  const outDir = path.join(buildDir, `plugins`);
  if (!fs.existsSync(outDir)) return [];

  const results = [];
  const plugins = fs.readdirSync(outDir).filter(p =>
    fs.statSync(path.join(outDir, p)).isDirectory()
  );

  for (const plugin of plugins) {
    for (const fmt of formats) {
      if (fmt === 'VST3') {
        const vst3 = path.join(outDir, plugin, `${plugin}_artefacts`, config, 'VST3', `${plugin}.vst3`);
        if (fs.existsSync(vst3)) results.push({ plugin, format: 'VST3', path: vst3 });
      } else if (fmt === 'CLAP') {
        const clapDir = path.join(outDir, plugin, `${plugin}_artefacts`, config, 'CLAP');
        if (fs.existsSync(clapDir)) {
          const files = fs.readdirSync(clapDir).filter(f => f.endsWith('.clap'));
          for (const f of files) results.push({ plugin, format: 'CLAP', path: path.join(clapDir, f) });
        }
      } else if (fmt === 'LV2') {
        const lv2 = path.join(outDir, plugin, `${plugin}_artefacts`, config, 'LV2');
        if (fs.existsSync(lv2)) results.push({ plugin, format: 'LV2', path: lv2 });
      } else if (fmt === 'Standalone') {
        const sa = path.join(outDir, plugin, `${plugin}_artefacts`, config, 'Standalone');
        if (fs.existsSync(sa)) results.push({ plugin, format: 'Standalone', path: sa });
      } else if (fmt === 'AudioUnit') {
        const au = path.join(outDir, plugin, `${plugin}_artefacts`, config, 'AudioUnit', `${plugin}.component`);
        if (fs.existsSync(au)) results.push({ plugin, format: 'AudioUnit', path: au });
      }
    }
  }
  return results;
}

function validatePlugin(binary, fmt, validateCommand, clapValidatorCommand) {
  if (fmt === 'VST3') {
    return tryRun(`"${validateCommand}" --strictness 10 --validate-in-new-process "${binary}"`, { timeout: 120 });
  }
  if (fmt === 'CLAP') {
    return tryRun(`"${clapValidatorCommand}" "${binary}"`, { timeout: 120 });
  }
  return { ok: false, output: '', stderr: `No validator configured for ${fmt}` };
}

function replaceTemplateVars(content, vars) {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{{${key}}}`;
    result = result.split(placeholder).join(String(value));
  }
  return result;
}

function mapPluginType(type) {
  switch (type) {
    case 'clap': return { template: 'clap', formats: 'CLAP', classPrefix: '' };
    case 'vst3': return { template: 'juce', formats: 'VST3', classPrefix: 'juce::' };
    case 'juce': return { template: 'juce', formats: 'VST3;LV2;Standalone', classPrefix: 'juce::' };
    case 'ara': return { template: 'juce', formats: 'ARA', classPrefix: 'juce::' };
    default: return { template: 'juce', formats: 'VST3;LV2;Standalone', classPrefix: 'juce::' };
  }
}

function slugName(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '').replace(/^(\d)/, '_$1');
}
function displayName(name) {
  return name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
}

// ─── Server ─────────────────────────────────────────────────────────
const server = new McpServer({
  name: 'apc-mcp',
  version: '1.0.0',
});

// ─── audio_plugin_build ────────────────────────────────────────────
server.tool(
  'audio_plugin_build',
  {
    projectPath: z.string().optional().describe('Path to audio plugin project (auto-detected from CWD if omitted)'),
    config: z.enum(['Debug', 'Release']).default('Debug').describe('Build configuration'),
    target: z.string().optional().describe('Specific CMake target to build'),
    clean: z.boolean().default(false).describe('Clean build (cmake --build --clean-first)'),
  },
  async (params) => {
    const proj = requireProjectPath(params.projectPath);
    const cfg = loadProjectConfig(proj);
    const config = params.config || cfg.config;
    const buildDir = path.join(proj, cfg.buildDir);

    if (!fs.existsSync(path.join(buildDir, 'CMakeCache.txt'))) {
      fs.mkdirSync(buildDir, { recursive: true });
      const r = tryRun(`cmake -B "${buildDir}" -G "${cfg.generator}" -DCMAKE_BUILD_TYPE=${config}`, { cwd: proj, timeout: 120 });
      if (!r.ok) return { content: [{ type: 'text', text: r.stderr }], isError: true };
    }

    const cleanFlag = params.clean ? '--clean-first' : '';
    const targetFlag = params.target ? `--target ${params.target}` : '';
    const r = tryRun(`cmake --build "${buildDir}" --parallel ${cleanFlag} ${targetFlag}`, { cwd: proj });

    const parsed = parseBuildOutput(r.output);
    const summary = {
      status: r.ok ? 'success' : 'failed',
      config,
      target: params.target || null,
      errorCount: parsed.errorCount,
      warningCount: parsed.warningCount,
      errors: parsed.errors.slice(0, 20),
      warnings: parsed.warnings.slice(0, 20),
      truncated: parsed.errors.length > 20 || parsed.warnings.length > 20,
    };

    const text = [
      `## Build ${r.ok ? 'succeeded' : 'failed'}`,
      `Config: ${config}`,
      `Errors: ${parsed.errorCount}, Warnings: ${parsed.warningCount}`,
      ...(parsed.errors.length ? ['', '### Errors', ...parsed.errors.slice(0, 20)] : []),
      ...(parsed.warnings.length ? ['', '### Warnings', ...parsed.warnings.slice(0, 20)] : []),
      '',
      `_raw output:_ ${r.output.length > 100 ? r.output.slice(-500) : r.output}`,
    ].join('\n');

    return { content: [{ type: 'text', text }], isError: !r.ok };
  }
);

// ─── audio_plugin_configure ────────────────────────────────────────
server.tool(
  'audio_plugin_configure',
  {
    projectPath: z.string().optional().describe('Path to audio plugin project (auto-detected from CWD if omitted)'),
    config: z.enum(['Debug', 'Release']).default('Debug').describe('Build configuration'),
    generator: z.string().optional().describe('CMake generator (default from apc-mcp.json or "Unix Makefiles")'),
    options: z.string().optional().describe('Additional CMake flags (e.g. -DAPC_ENABLE_VISAGE=ON)'),
  },
  async (params) => {
    const proj = requireProjectPath(params.projectPath);
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
    projectPath: z.string().optional().describe('Path to audio plugin project (auto-detected from CWD if omitted)'),
    config: z.enum(['Debug', 'Release']).default('Debug').describe('Build configuration'),
    testName: z.string().optional().describe('Test name pattern (regex)'),
  },
  async (params) => {
    const proj = requireProjectPath(params.projectPath);
    const cfg = loadProjectConfig(proj);
    const config = params.config || cfg.config;
    const buildDir = path.join(proj, cfg.buildDir);
    const filter = params.testName ? `--tests-regex "${params.testName}"` : '';
    const r = tryRun(`ctest --test-dir "${buildDir}" -C ${config} --output-on-failure ${filter}`, { cwd: proj, timeout: 300 });
    const parsed = parseTestOutput(r.output);
    const text = [
      `## Tests ${r.ok ? 'passed' : 'failed'}`,
      `Passed: ${parsed.passed}, Failed: ${parsed.failed}, Total: ${parsed.total}`,
      '',
      r.output.slice(-2000),
    ].join('\n');
    return { content: [{ type: 'text', text }], isError: !r.ok };
  }
);

// ─── audio_plugin_lint ─────────────────────────────────────────────
server.tool(
  'audio_plugin_lint',
  {
    projectPath: z.string().optional().describe('Path to audio plugin project (auto-detected from CWD if omitted)'),
    fix: z.boolean().default(false).describe('Auto-fix formatting in place'),
    target: z.string().optional().describe('Specific file or subdirectory (relative to project root)'),
  },
  async (params) => {
    const proj = requireProjectPath(params.projectPath);
    const searchRoot = params.target ? path.join(proj, params.target) : proj;
    if (!fs.existsSync(searchRoot)) {
      return { content: [{ type: 'text', text: `Path not found: ${searchRoot}` }], isError: true };
    }
    const fixFlag = params.fix ? '-i' : '--dry-run -Werror';
    const r = tryRun(
      `find "${searchRoot}" -name '*.cpp' -o -name '*.cc' -o -name '*.cxx' -o -name '*.h' -o -name '*.hpp' | xargs clang-format ${fixFlag}`,
      { cwd: proj, timeout: 60 }
    );
    if (!r.ok && !params.fix) {
      const files = r.stderr.match(/(\/[^\s:]+)/g) || [];
      const text = [
        '## Lint found issues',
        `Files with problems: ${files.length}`,
        '',
        r.stderr.slice(0, 2000),
      ].join('\n');
      return { content: [{ type: 'text', text }], isError: true };
    }
    return { content: [{ type: 'text', text: r.ok ? 'No issues found.' : r.stderr }], isError: !r.ok };
  }
);

// ─── audio_plugin_plugins ──────────────────────────────────────────
server.tool(
  'audio_plugin_plugins',
  {
    projectPath: z.string().optional().describe('Path to audio plugin project (auto-detected from CWD if omitted)'),
    format: z.enum(['text', 'json']).default('text').describe('Output format'),
  },
  async (params) => {
    const proj = requireProjectPath(params.projectPath);
    const cfg = loadProjectConfig(proj);
    const pluginsDir = path.join(proj, cfg.pluginsDir);
    if (!fs.existsSync(pluginsDir)) {
      return { content: [{ type: 'text', text: `No ${cfg.pluginsDir}/ directory found.` }] };
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

    const text = details.length
      ? details.map(d => {
          const parts = [d.name];
          if (d.type) parts.push(`type: ${d.type}`);
          if (d.status) parts.push(`status: ${d.status}`);
          return `- ${parts.join(' — ')}`;
        }).join('\n')
      : `No plugin directories with CMakeLists.txt found in ${cfg.pluginsDir}/.`;
    return { content: [{ type: 'text', text }] };
  }
);

// ─── audio_plugin_validate ─────────────────────────────────────────
server.tool(
  'audio_plugin_validate',
  {
    projectPath: z.string().optional().describe('Path to audio plugin project (auto-detected from CWD if omitted)'),
    config: z.enum(['Debug', 'Release']).default('Debug').describe('Build configuration'),
    format: z.enum(['VST3', 'CLAP', 'all']).default('all').describe('Plugin format to validate'),
  },
  async (params) => {
    const proj = requireProjectPath(params.projectPath);
    const cfg = loadProjectConfig(proj);
    const config = params.config || cfg.config;
    const buildDir = path.join(proj, cfg.buildDir);

    const formats = params.format === 'all' ? cfg.validateFormats : [params.format];
    const binaries = findPluginBinaries(proj, config, buildDir, formats);

    if (binaries.length === 0) {
      return {
        content: [{ type: 'text', text: `No plugin binaries found for formats: ${formats.join(', ')}.\nMake sure you've built the project first.` }],
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
        output: r.ok ? 'Validation passed.' : (r.stderr || r.output.slice(0, 500)),
      });
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    const text = [
      `## Validation results`,
      `Passed: ${passed}, Failed: ${failed}`,
      '',
      ...results.map(r => [
        `### ${r.plugin} [${r.format}] — ${r.passed ? '✅ PASS' : '❌ FAIL'}`,
        `${r.path}`,
        r.passed ? '' : `\`\`\`\n${r.output}\n\`\`\``,
      ].join('\n')),
    ].join('\n');

    return { content: [{ type: 'text', text }], isError: failed > 0 };
  }
);

// ─── audio_plugin_create ───────────────────────────────────────────
server.tool(
  'audio_plugin_create',
  {
    projectPath: z.string().optional().describe('Parent project path (auto-detected from CWD if omitted)'),
    name: z.string().min(1).describe('Plugin name (e.g. "Phaser9000" or "my-delay")'),
    type: z.enum(['clap', 'vst3', 'juce', 'ara']).default('clap').describe('Plugin format'),
    vendor: z.string().default('apc-mcp').describe('Vendor name'),
    description: z.string().default('An audio plugin').describe('Plugin description'),
    formats: z.string().optional().describe('JUCE formats override (e.g. "VST3;AU;Standalone") — only for juce/ara types'),
  },
  async (params) => {
    const proj = requireProjectPath(params.projectPath);
    const cfg = loadProjectConfig(proj);
    const typeInfo = mapPluginType(params.type);
    const pluginDir = path.join(proj, cfg.pluginsDir, params.name);

    if (fs.existsSync(pluginDir)) {
      return { content: [{ type: 'text', text: `Plugin directory already exists: ${pluginDir}` }], isError: true };
    }

    const templateDir = path.join(TEMPLATES_DIR, typeInfo.template);
    if (!fs.existsSync(templateDir)) {
      return { content: [{ type: 'text', text: `Template not found: ${templateDir}` }], isError: true };
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

    // Recursively copy template directory
    function copyDir(src, dest) {
      fs.mkdirSync(dest, { recursive: true });
      for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          copyDir(srcPath, destPath);
        } else if (entry.isFile()) {
          let content = fs.readFileSync(srcPath, 'utf-8');
          content = replaceTemplateVars(content, vars);
          fs.writeFileSync(destPath, content, 'utf-8');
        }
      }
    }

    try {
      copyDir(templateDir, pluginDir);
    } catch (e) {
      return { content: [{ type: 'text', text: `Failed to scaffold plugin: ${e.message}` }], isError: true };
    }

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
