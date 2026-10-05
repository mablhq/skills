// Moves every exact-version pin of the packages below to npm's latest, bumps the
// plugin patch version, and adds a CHANGELOG entry. Writes `changed`, `title`, and
// `body_file` to $GITHUB_OUTPUT for the workflow that opens the PR.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = ['chrome-devtools-mcp', '@mablhq/mabl-cli'];
const MANIFESTS = [
  'plugin.json',
  'plugins/mabl/.claude-plugin/plugin.json',
  'plugins/mabl/.cursor-plugin/plugin.json',
  'plugins/mabl/.codex-plugin/plugin.json',
  'plugins/mabl/.devin-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  '.cursor-plugin/marketplace.json',
];
const SEMVER = /^\d+\.\d+\.\d+$/;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const pinPattern = (pkg) => new RegExp(`(?<![\\w@/.-])${escape(pkg)}@(\\d+\\.\\d+\\.\\d+)(?![\\w.-])`, 'g');
const compare = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(md|json)$/.test(f) && f !== 'CHANGELOG.md');
const contents = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

const bumps = [];
for (const pkg of PACKAGES) {
  const pattern = pinPattern(pkg);
  const found = new Set();
  for (const text of contents.values()) for (const m of text.matchAll(pattern)) found.add(m[1]);
  if (found.size === 0) fail(`No exact pin of ${pkg} found.`);
  if (found.size > 1) fail(`${pkg} is pinned at more than one version: ${[...found].join(', ')}. Make them agree first.`);
  const [current] = found;

  const latest = execFileSync('npm', ['view', pkg, 'version'], { encoding: 'utf8' }).trim();
  if (!SEMVER.test(latest)) fail(`npm returned an unexpected version for ${pkg}: ${latest}`);
  console.log(`${pkg}: pinned ${current}, latest ${latest}`);
  if (compare(latest, current) <= 0) continue;

  for (const [f, text] of contents) contents.set(f, text.replace(pattern, `${pkg}@${latest}`));
  bumps.push({ pkg, current, latest });
}

const output = (line) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
if (bumps.length === 0) {
  output('changed=false');
  process.exit(0);
}

const pluginVersion = JSON.parse(contents.get('plugins/mabl/.claude-plugin/plugin.json')).version;
const [major, minor, patch] = pluginVersion.split('.').map(Number);
const nextVersion = `${major}.${minor}.${patch + 1}`;
for (const f of MANIFESTS) {
  const text = contents.get(f);
  if (!text.includes(`"version": "${pluginVersion}"`)) fail(`${f} is not at plugin version ${pluginVersion}.`);
  contents.set(f, text.replaceAll(`"version": "${pluginVersion}"`, `"version": "${nextVersion}"`));
}

for (const [f, text] of contents) if (text !== readFileSync(f, 'utf8')) writeFileSync(f, text);

const today = new Date().toISOString().slice(0, 10);
const lines = bumps.map((b) => `- Pinned \`${b.pkg}\` moves from \`${b.current}\` to \`${b.latest}\`.`);
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const firstEntry = changelog.indexOf('\n## [');
if (firstEntry === -1) fail('CHANGELOG.md has no existing entry to insert above.');
writeFileSync(
  'CHANGELOG.md',
  `${changelog.slice(0, firstEntry)}\n## [${nextVersion}] - ${today}\n### Changed\n${lines.join('\n')}\n${changelog.slice(firstEntry)}`,
);

const title = `Bump ${bumps.map((b) => `${b.pkg} to ${b.latest}`).join(' and ')}`;
const body = [
  'The daily pin check found newer releases on npm:',
  '',
  ...bumps.map((b) => `- \`${b.pkg}\` ${b.current} → ${b.latest} ([npm](https://www.npmjs.com/package/${b.pkg}?activeTab=versions))`),
  '',
  `Every exact pin moves together, and the plugin goes to ${nextVersion}. Once merged, resubmit the plugin for directory review.`,
  '',
  'The next run rebuilds this branch from main, so put any fixes in a separate PR.',
].join('\n');
const bodyFile = join(process.env.RUNNER_TEMP ?? '.', 'bump-pins-body.md');
writeFileSync(bodyFile, `${body}\n`);

output('changed=true');
output(`title=${title}`);
output(`body_file=${bodyFile}`);
console.log(title);
