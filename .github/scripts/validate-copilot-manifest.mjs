#!/usr/bin/env node
// Validates the root plugin.json (the GitHub Copilot / VS Code agent plugin
// manifest). There is no official Copilot manifest validator yet, so we assert
// the constraints the docs call out and keep it in parity with the Claude
// manifest. Exits non-zero with a clear message on any failure.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJsonReader, checkManifestParity } from './lib/manifest-parity.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const errors = [];
const readJson = createJsonReader(repoRoot, errors);

const copilotManifest = readJson('plugin.json');
const claudeManifest = readJson('.claude-plugin/plugin.json');

if (copilotManifest) {
  if (!copilotManifest.name) {
    errors.push('plugin.json: "name" is required');
  } else if (!/^[a-z0-9-]{1,64}$/.test(copilotManifest.name)) {
    // Invalid names silently fail to load in Copilot.
    errors.push(
      `plugin.json: "name" must be kebab-case (lowercase letters, numbers, hyphens, <=64 chars), got "${copilotManifest.name}"`,
    );
  }

  const skillsDir = copilotManifest.skills ?? 'skills/';
  if (!existsSync(resolve(repoRoot, skillsDir))) {
    errors.push(`plugin.json: "skills" path "${skillsDir}" does not exist`);
  }

  // Referenced MCP config must exist (when given as a path).
  if (typeof copilotManifest.mcpServers === 'string') {
    if (!existsSync(resolve(repoRoot, copilotManifest.mcpServers))) {
      errors.push(`plugin.json: "mcpServers" path "${copilotManifest.mcpServers}" does not exist`);
    }
  }

  // Parity with the Claude manifest so the two never drift.
  if (claudeManifest) {
    checkManifestParity(copilotManifest, claudeManifest, 'plugin.json', errors);
  }
}

if (errors.length) {
  console.error('Copilot plugin manifest validation failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('Copilot plugin manifest (plugin.json) is valid and in sync with the Claude manifest.');
