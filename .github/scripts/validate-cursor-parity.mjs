#!/usr/bin/env node
// The official Cursor validator (scripts/validate-template.mjs) checks the
// Cursor manifests in isolation. It can't know about the repo's other surfaces,
// so this script asserts the two cross-surface invariants that keep them honest
// (everything lives in the single plugin home, plugins/mabl/):
//   1. plugins/mabl/mcp.json (Cursor) is a byte-identical copy of
//      plugins/mabl/.mcp.json (Claude/Copilot/Codex).
//   2. plugins/mabl/.cursor-plugin/plugin.json stays in sync with
//      plugins/mabl/.claude-plugin/plugin.json on the fields CLAUDE.md says to
//      keep aligned across manifests.
// Exits non-zero with a clear message on any failure.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJsonReader, checkManifestParity } from './lib/manifest-parity.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const errors = [];
const readJson = createJsonReader(repoRoot, errors);

// 1. MCP parity: Cursor only reads `mcp.json`; Claude/Copilot read `.mcp.json`.
// They must be byte-identical copies. Parse both first so malformed JSON fails
// with a clear message, then compare the raw bytes — anything but an exact copy
// (a stray edit, a reformat of one file) means the two surfaces could drift.
const cursorMcp = readJson('plugins/mabl/mcp.json');
const sharedMcp = readJson('plugins/mabl/.mcp.json');
if (cursorMcp && sharedMcp) {
  const cursorMcpRaw = readFileSync(resolve(repoRoot, 'plugins/mabl/mcp.json'), 'utf8');
  const sharedMcpRaw = readFileSync(resolve(repoRoot, 'plugins/mabl/.mcp.json'), 'utf8');
  if (cursorMcpRaw !== sharedMcpRaw) {
    errors.push('plugins/mabl/mcp.json and plugins/mabl/.mcp.json are not byte-identical — keep mcp.json an exact copy of .mcp.json so Cursor and Claude/Copilot/Codex see the same MCP servers');
  }
}

// 2. Manifest parity with the Claude plugin manifest.
const cursorManifest = readJson('plugins/mabl/.cursor-plugin/plugin.json');
const claudeManifest = readJson('plugins/mabl/.claude-plugin/plugin.json');
if (cursorManifest && claudeManifest) {
  checkManifestParity(cursorManifest, claudeManifest, 'plugins/mabl/.cursor-plugin/plugin.json', errors);
}

if (errors.length) {
  console.error('Cursor cross-surface parity validation failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('Cursor surface is in sync with the Claude manifest and shared MCP config.');
