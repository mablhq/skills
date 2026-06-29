#!/usr/bin/env node
// Codex consumes this repo as a plugin in plugins/mabl/, listed by
// .agents/plugins/marketplace.json. plugins/mabl/ is the single home for the
// skills and MCP config every surface shares, so there is nothing to copy or
// keep in sync — only a few cross-surface invariants to assert:
//   1. plugins/mabl/.codex-plugin/plugin.json stays in parity with the Claude
//      manifest on the fields CLAUDE.md says to keep aligned.
//   2. The manifest's path pointers (skills, mcpServers, interface.logo) resolve
//      inside the plugin dir — Codex copies only this subdir on install, so
//      anything outside it would be dropped.
//   3. .agents/plugins/marketplace.json points at plugins/mabl with a matching name.
// Exits non-zero with a clear message on any failure.
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJsonReader, checkManifestParity } from './lib/manifest-parity.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const codexPluginDir = join(repoRoot, 'plugins', 'mabl');
const errors = [];
const readJson = createJsonReader(repoRoot, errors);

// Assert a manifest path pointer resolves to an existing file INSIDE the plugin
// dir. The "inside" part matters: Codex copies only plugins/mabl/ on install, so
// a pointer that escapes it (e.g. "../foo") would be dropped — and a bare
// existsSync would still pass if that outside path happened to exist.
function checkPluginPath(field, value) {
  if (typeof value !== 'string') return;
  const resolved = resolve(codexPluginDir, value);
  const relativeToPluginDir = relative(codexPluginDir, resolved);
  if (relativeToPluginDir.startsWith('..') || isAbsolute(relativeToPluginDir)) {
    errors.push(`plugins/mabl/.codex-plugin/plugin.json: "${field}" path "${value}" resolves outside the plugin dir — Codex copies only plugins/mabl/ on install, so it would be dropped`);
  } else if (!existsSync(resolved)) {
    errors.push(`plugins/mabl/.codex-plugin/plugin.json: "${field}" path "${value}" does not exist in the plugin dir`);
  }
}

// 1. Manifest parity with the Claude manifest, and 2. path pointers resolve
// inside the plugin dir.
const codexManifest = readJson('plugins/mabl/.codex-plugin/plugin.json');
const claudeManifest = readJson('plugins/mabl/.claude-plugin/plugin.json');
if (codexManifest && claudeManifest) {
  checkManifestParity(codexManifest, claudeManifest, 'plugins/mabl/.codex-plugin/plugin.json', errors);

  for (const field of ['skills', 'mcpServers']) {
    checkPluginPath(field, codexManifest[field]);
  }
  checkPluginPath('interface.logo', codexManifest.interface?.logo);
}

// 3. The Codex marketplace points at this plugin.
const marketplace = readJson('.agents/plugins/marketplace.json');
if (marketplace) {
  const mablEntry = Array.isArray(marketplace.plugins)
    ? marketplace.plugins.find((p) => p?.name === 'mabl')
    : null;
  if (!mablEntry) {
    errors.push('.agents/plugins/marketplace.json: no plugin entry named "mabl"');
  } else {
    const sourcePath = mablEntry.source?.path;
    const resolvedSource = sourcePath ? resolve(repoRoot, sourcePath) : null;
    if (resolvedSource !== codexPluginDir) {
      errors.push(`.agents/plugins/marketplace.json: plugin "mabl" source.path must point to ./plugins/mabl (got "${sourcePath}")`);
    }
    if (!existsSync(join(codexPluginDir, '.codex-plugin', 'plugin.json'))) {
      errors.push('.agents/plugins/marketplace.json: plugins/mabl has no .codex-plugin/plugin.json');
    }
  }
}

if (errors.length) {
  console.error('Codex cross-surface parity validation failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('Codex plugin manifest is in parity with the Claude manifest and the marketplace points at plugins/mabl.');
