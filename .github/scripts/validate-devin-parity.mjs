#!/usr/bin/env node
// Devin installs this repo as a plugin from plugins/mabl/ (`owner/repo#subdir`).
// It reads .devin-plugin/plugin.json ahead of .claude-plugin/plugin.json, so the
// Devin manifest is the one that must stay aligned:
//   1. plugins/mabl/.devin-plugin/plugin.json stays in parity with the Claude
//      manifest on the fields CLAUDE.md says to keep aligned.
//   2. Its skills and mcpServers pointers resolve inside the plugin dir, since
//      an install from the subdirectory sees nothing outside it.
// Exits non-zero with a clear message on any failure.
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJsonReader, checkManifestParity } from './lib/manifest-parity.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pluginDir = join(repoRoot, 'plugins', 'mabl');
const manifestLabel = 'plugins/mabl/.devin-plugin/plugin.json';
const errors = [];
const readJson = createJsonReader(repoRoot, errors);

function checkPluginPath(field, value) {
  if (typeof value !== 'string') {
    errors.push(`${manifestLabel}: "${field}" must be a path string`);
    return;
  }
  const resolved = resolve(pluginDir, value);
  const relativeToPluginDir = relative(pluginDir, resolved);
  if (relativeToPluginDir.startsWith('..') || isAbsolute(relativeToPluginDir)) {
    errors.push(`${manifestLabel}: "${field}" path "${value}" resolves outside the plugin dir — a subdirectory install would not see it`);
  } else if (!existsSync(resolved)) {
    errors.push(`${manifestLabel}: "${field}" path "${value}" does not exist in the plugin dir`);
  }
}

const devinManifest = readJson(manifestLabel);
const claudeManifest = readJson('plugins/mabl/.claude-plugin/plugin.json');
if (devinManifest && claudeManifest) {
  checkManifestParity(devinManifest, claudeManifest, manifestLabel, errors);
  for (const field of ['skills', 'mcpServers']) {
    checkPluginPath(field, devinManifest[field]);
  }
}

if (errors.length) {
  console.error('Devin cross-surface parity validation failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('Devin plugin manifest is in parity with the Claude manifest and its paths resolve inside plugins/mabl.');
