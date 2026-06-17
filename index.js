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

function run(cmd, opts = {}) {
  return execSync(cmd, {
    timeout: (opts.timeout ?? 180) * 1000,
    stdio: 'pipe',
    encoding: 'utf-8',
    ...opts,
  });
}

const server = new McpServer({
  name: 'apc-mcp',
  version: '1.0.0',
});

// ─── audio_plugin_build ────────────────────────────────────────────
server.tool(
  'audio_plugin_build',
  {
    projectPath: z.string().describe('Path to audio plugin project root'),
    config: z.enum(['Debug', 'Release']).default('Debug').describe('Build configuration'),
    target: z.string().optional().describe('Specific CMake target to build'),
    clean: z.boolean().default(false).describe('Clean build (cmake --build --clean-first)'),
  },
  async ({ projectPath: proj, config, target, clean }) => {
    const buildDir = path.join(proj, 'build');
    if (!fs.existsSync(path.join(buildDir, 'CMakeCache.txt'))) {
      fs.mkdirSync(buildDir, { recursive: true });
      run(`cmake -B "${buildDir}" -DCMAKE_BUILD_TYPE=${config}`, { cwd: proj, timeout: 120 });
    }
    const cleanFlag = clean ? '--clean-first' : '';
    const targetFlag = target ? `--target ${target}` : '';
    const output = run(`cmake --build "${buildDir}" --parallel ${cleanFlag} ${targetFlag}`, { cwd: proj });
    return { content: [{ type: 'text', text: output || 'Build succeeded (no output).' }] };
  }
);

// ─── audio_plugin_configure ────────────────────────────────────────
server.tool(
  'audio_plugin_configure',
  {
    projectPath: z.string().describe('Path to audio plugin project root'),
    config: z.enum(['Debug', 'Release']).default('Debug').describe('Build configuration'),
    generator: z.string().default('Unix Makefiles').describe('CMake generator (e.g. "Ninja", "Unix Makefiles")'),
    options: z.string().optional().describe('Additional CMake flags (e.g. -DAPC_ENABLE_VISAGE=ON)'),
  },
  async ({ projectPath: proj, config, generator, options }) => {
    const buildDir = path.join(proj, 'build');
    fs.mkdirSync(buildDir, { recursive: true });
    const extra = options ?? '';
    const output = run(`cmake -B "${buildDir}" -G "${generator}" -DCMAKE_BUILD_TYPE=${config} ${extra}`, {
      cwd: proj, timeout: 120,
    });
    return { content: [{ type: 'text', text: output || 'Configure succeeded.' }] };
  }
);

// ─── audio_plugin_test ─────────────────────────────────────────────
server.tool(
  'audio_plugin_test',
  {
    projectPath: z.string().describe('Path to audio plugin project root'),
    config: z.enum(['Debug', 'Release']).default('Debug').describe('Build configuration'),
    testName: z.string().optional().describe('Test name pattern (regex)'),
  },
  async ({ projectPath: proj, config, testName }) => {
    const buildDir = path.join(proj, 'build');
    const filter = testName ? `--tests-regex "${testName}"` : '';
    const output = run(`ctest --test-dir "${buildDir}" -C ${config} --output-on-failure ${filter}`, {
      cwd: proj, timeout: 300,
    });
    return { content: [{ type: 'text', text: output || 'Tests passed.' }] };
  }
);

// ─── audio_plugin_lint ─────────────────────────────────────────────
server.tool(
  'audio_plugin_lint',
  {
    projectPath: z.string().describe('Path to audio plugin project root'),
    fix: z.boolean().default(false).describe('Auto-fix formatting in place'),
    target: z.string().optional().describe('Specific file or subdirectory (relative to project root)'),
  },
  async ({ projectPath: proj, fix, target: targetPath }) => {
    const fixFlag = fix ? '-i' : '--dry-run -Werror';
    const searchRoot = targetPath ? path.join(proj, targetPath) : proj;
    if (!fs.existsSync(searchRoot)) {
      return { content: [{ type: 'text', text: `Path not found: ${searchRoot}` }], isError: true };
    }
    try {
      const output = run(
        `find "${searchRoot}" -name '*.cpp' -o -name '*.cc' -o -name '*.cxx' -o -name '*.h' -o -name '*.hpp' | xargs clang-format ${fixFlag}`,
        { cwd: proj, timeout: 60 }
      );
      return { content: [{ type: 'text', text: output || 'No issues found.' }] };
    } catch (e) {
      return { content: [{ type: 'text', text: e.stderr || e.message }], isError: true };
    }
  }
);

// ─── audio_plugin_plugins ──────────────────────────────────────────
server.tool(
  'audio_plugin_plugins',
  {
    projectPath: z.string().describe('Path to audio plugin project root'),
  },
  async ({ projectPath: proj }) => {
    const pluginsDir = path.join(proj, 'plugins');
    if (!fs.existsSync(pluginsDir)) {
      return { content: [{ type: 'text', text: 'No plugins/ directory found in project.' }] };
    }
    const plugins = fs.readdirSync(pluginsDir).filter((p) => {
      const pdir = path.join(pluginsDir, p);
      return fs.statSync(pdir).isDirectory() && fs.existsSync(path.join(pdir, 'CMakeLists.txt'));
    });
    if (plugins.length === 0) {
      return { content: [{ type: 'text', text: 'No plugin subdirectories with CMakeLists.txt found.' }] };
    }
    const details = plugins.map((name) => {
      const statusPath = path.join(pluginsDir, name, 'status.json');
      let status = {};
      if (fs.existsSync(statusPath)) {
        try { status = JSON.parse(fs.readFileSync(statusPath, 'utf-8')); } catch {}
      }
      return { name, ...status };
    });
    const text = details
      .map((d) => {
        const parts = [d.name];
        if (d.type) parts.push(`type: ${d.type}`);
        if (d.status) parts.push(`status: ${d.status}`);
        return parts.join(' — ');
      })
      .join('\n');
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
