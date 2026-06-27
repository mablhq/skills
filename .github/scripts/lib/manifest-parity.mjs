// Shared helpers for the per-surface manifest validators (Copilot, Cursor).
// The parity field list lives here once so the validators that enforce "every
// surface's manifest matches the Claude manifest" can't themselves drift apart.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Returns a `readJson(rel)` bound to this repo root and error sink: it reads and
// parses a JSON file relative to `repoRoot`, pushing a clear message to `errors`
// (and returning null) when the file is missing or malformed.
export function createJsonReader(repoRoot, errors) {
  return function readJson(rel) {
    const path = resolve(repoRoot, rel);
    if (!existsSync(path)) {
      errors.push(`${rel} is missing`);
      return null;
    }
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      errors.push(`${rel} is not valid JSON: ${err.message}`);
      return null;
    }
  };
}

// The fields CLAUDE.md tells contributors to keep aligned across every plugin
// manifest. Declared once so both surface validators check the same contract.
const PARITY_FIELDS = ['name', 'version', 'description'];
const AUTHOR_PARITY_FIELDS = ['name', 'email', 'url'];

// Assert that `manifest` (referred to as `manifestLabel` in messages) agrees
// with `claudeManifest` on the parity fields, pushing any mismatch to `errors`.
export function checkManifestParity(manifest, claudeManifest, manifestLabel, errors) {
  for (const field of PARITY_FIELDS) {
    if (manifest[field] !== claudeManifest[field]) {
      errors.push(
        `${manifestLabel} and .claude-plugin/plugin.json disagree on "${field}": ` +
          `"${manifest[field]}" vs "${claudeManifest[field]}"`,
      );
    }
  }
  // author is an object; compare its fields explicitly so a harmless key reorder
  // doesn't false-positive the way a serialized compare would.
  for (const authorField of AUTHOR_PARITY_FIELDS) {
    if (manifest.author?.[authorField] !== claudeManifest.author?.[authorField]) {
      errors.push(`${manifestLabel} and .claude-plugin/plugin.json disagree on "author.${authorField}"`);
    }
  }
}
