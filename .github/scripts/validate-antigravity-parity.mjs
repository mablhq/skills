#!/usr/bin/env node
// Antigravity installs this repo as a plugin from plugins/mabl/ and reads
// .antigravity-plugin/plugin.json. Its MCP file has its own shape (remote
// servers take `serverUrl`, not `type`/`url`), so it can't share .mcp.json:
//   1. The Antigravity manifest stays in parity with the Claude manifest.
//   2. Its skills and logo paths resolve inside the plugin dir.
//   3. mcp_config.json (the fixed name Antigravity loads; its manifest has no
//      mcpServers field) declares the same servers as .mcp.json, with the same
//      local commands and the same hosted URLs.
// Exits non-zero with a clear message on any failure.
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJsonReader, checkManifestParity } from './lib/manifest-parity.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pluginDir = join(repoRoot, 'plugins', 'mabl');
const manifestLabel = 'plugins/mabl/.antigravity-plugin/plugin.json';
const errors = [];
const readJson = createJsonReader(repoRoot, errors);

function checkPluginPath(field, value) {
  if (typeof value !== 'string') {
    errors.push(`${manifestLabel}: "${field}" must be a path string`);
    return null;
  }
  const resolved = resolve(pluginDir, value);
  const relativeToPluginDir = relative(pluginDir, resolved);
  if (relativeToPluginDir.startsWith('..') || isAbsolute(relativeToPluginDir)) {
    errors.push(`${manifestLabel}: "${field}" path "${value}" resolves outside the plugin dir — a subdirectory install would not see it`);
    return null;
  }
  if (!existsSync(resolved)) {
    errors.push(`${manifestLabel}: "${field}" path "${value}" does not exist in the plugin dir`);
    return null;
  }
  return relativeToPluginDir;
}

const manifest = readJson(manifestLabel);
const claudeManifest = readJson('plugins/mabl/.claude-plugin/plugin.json');
if (manifest && claudeManifest) {
  checkManifestParity(manifest, claudeManifest, manifestLabel, errors);
  if (!Array.isArray(manifest.skills) || manifest.skills.length === 0) {
    errors.push(`${manifestLabel}: "skills" must be a non-empty array of paths`);
  } else {
    manifest.skills.forEach((path, i) => checkPluginPath(`skills[${i}]`, path));
  }
  checkPluginPath('logo', manifest.logo);
  const prompts = manifest.suggestedPrompts;
  if (!Array.isArray(prompts) || prompts.length === 0 || prompts.length > 3) {
    errors.push(`${manifestLabel}: "suggestedPrompts" must list 1 to 3 prompts — Antigravity truncates past 3`);
  }

  if ('mcpServers' in manifest) {
    errors.push(`${manifestLabel}: Antigravity ignores "mcpServers" and always loads mcp_config.json — remove the field`);
  }
  const mcpPath = 'mcp_config.json';
  const antigravityMcp = readJson(join('plugins/mabl', mcpPath));
  const claudeMcp = readJson('plugins/mabl/.mcp.json');
  if (antigravityMcp && claudeMcp) {
    const ours = antigravityMcp.mcpServers ?? {};
    const theirs = claudeMcp.mcpServers ?? {};
    const names = new Set([...Object.keys(ours), ...Object.keys(theirs)]);
    for (const name of names) {
      const a = ours[name];
      const c = theirs[name];
      if (!a || !c) {
        errors.push(`MCP server "${name}" is in ${a ? mcpPath : '.mcp.json'} but not ${a ? '.mcp.json' : mcpPath}`);
      } else if (c.url !== undefined && a.serverUrl !== c.url) {
        errors.push(`MCP server "${name}": serverUrl "${a.serverUrl}" in ${mcpPath} differs from url "${c.url}" in .mcp.json`);
      } else if (c.url === undefined && JSON.stringify([a.command, a.args]) !== JSON.stringify([c.command, c.args])) {
        errors.push(`MCP server "${name}": command/args in ${mcpPath} differ from .mcp.json`);
      }
    }
  }
}

if (errors.length) {
  console.error('Antigravity cross-surface parity validation failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('Antigravity plugin manifest and MCP config are in parity with the Claude plugin, and their paths resolve inside plugins/mabl.');
