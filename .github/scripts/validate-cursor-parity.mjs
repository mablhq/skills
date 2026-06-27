#!/usr/bin/env node
// The official Cursor validator (scripts/validate-template.mjs) checks the
// Cursor manifests in isolation. It can't know about the repo's other surfaces,
// so this script asserts the two cross-surface invariants that keep them honest:
//   1. mcp.json (Cursor) and .mcp.json (Claude/Copilot) describe the same servers.
//   2. .cursor-plugin/plugin.json stays in sync with .claude-plugin/plugin.json
//      on the fields CLAUDE.md says to keep aligned across manifests.
// Exits non-zero with a clear message on any failure.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJsonReader, checkManifestParity } from './lib/manifest-parity.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const errors = [];
const readJson = createJsonReader(repoRoot, errors);

// 1. MCP parity: Cursor only reads `mcp.json`; Claude/Copilot read `.mcp.json`.
// They must agree (compared as parsed JSON so formatting alone never trips it).
const cursorMcp = readJson('mcp.json');
const sharedMcp = readJson('.mcp.json');
if (cursorMcp && sharedMcp && JSON.stringify(cursorMcp) !== JSON.stringify(sharedMcp)) {
  errors.push('mcp.json and .mcp.json have diverged — Cursor and Claude/Copilot would see different MCP servers');
}

// 2. Manifest parity with the Claude plugin manifest.
const cursorManifest = readJson('.cursor-plugin/plugin.json');
const claudeManifest = readJson('.claude-plugin/plugin.json');
if (cursorManifest && claudeManifest) {
  checkManifestParity(cursorManifest, claudeManifest, '.cursor-plugin/plugin.json', errors);
}

if (errors.length) {
  console.error('Cursor cross-surface parity validation failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('Cursor surface is in sync with the Claude manifest and shared MCP config.');
