#!/usr/bin/env node
// Validates the skills in plugins/mabl/skills/ against the constraints the
// install surfaces impose but no official validator checks:
//   1. Frontmatter `name` equals the folder name — a mismatched or prefixed
//      name silently fails to load in Copilot (see CLAUDE.md).
//   2. The resolved `description` fits in 1024 characters — OpenAI Codex hard-
//      truncates there, mid-word, so anything past it never reaches the matcher
//      that decides whether the skill fires.
//   3. Only the six frontmatter keys the Agent Skills spec allows.
//   4. A body that routes to a sibling skill first has the reader confirm that
//      skill is available — a skill can be installed on its own, and the skill
//      cannot know which of the five surfaces installed it, so it names the
//      missing skill rather than an install command.
// Exits non-zero with a clear message on any failure.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const skillsRoot = join(repoRoot, 'plugins', 'mabl', 'skills');
const errors = [];

// Codex truncates a skill description at this many characters.
const DESCRIPTION_LIMIT = 1024;

// The complete key list from the Agent Skills spec. Claude Code-only fields
// (`disable-model-invocation`, `user-invocable`, `model`, `context`, `hooks`)
// are deliberately NOT here: they make claude.ai skill upload, the Skills API,
// and package_skill.py fail with a hard "Unexpected key(s)" error, and a
// plugin-delivered skill carrying `disable-model-invocation` is invisible in
// Cursor.
const SPEC_KEYS = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'];

// The phrase a routing hand-off uses to make the reader check the sibling is
// there. A fixed marker keeps check 4 greppable without asking CI to understand
// prose.
const AVAILABILITY_MARKER = 'in your available skills';

// Every .md under a skill folder, recursively, so a route stated in references/
// is checked too.
function markdownFilesIn(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...markdownFilesIn(full));
    else if (entry.name.endsWith('.md')) found.push(full);
  }
  return found;
}

// Minimal frontmatter reader: enough for the flat `key: value` and block-scalar
// shape a SKILL.md uses, so this script stays dependency-free like its
// siblings. Returns the top-level keys in source order, each key's resolved
// string value, and the body after the closing delimiter.
function parseFrontmatter(raw) {
  const lines = raw.split('\n');
  if (lines[0]?.trim() !== '---') return null;
  const closing = lines.indexOf('---', 1);
  if (closing === -1) return null;

  const keys = [];
  const values = {};
  for (let i = 1; i < closing; i++) {
    // Continuation lines of a block scalar are indented, so they never match
    // this anchored pattern — the block-scalar branch below consumes them.
    const match = /^([A-Za-z0-9_-]+):(.*)$/.exec(lines[i]);
    if (!match) continue;
    const [, key, rest] = match;
    keys.push(key);
    const inline = rest.trim();

    if (/^[|>][-+]?\d*$/.test(inline)) {
      const block = [];
      let end = i + 1;
      for (; end < closing; end++) {
        if (lines[end].trim() === '' || /^\s/.test(lines[end])) block.push(lines[end].trim());
        else break;
      }
      // A YAML loader resolves a block scalar to ONE string — `>` folds the line
      // breaks to spaces, `|` keeps them as newlines — so what a consumer
      // measures is a single line either way. Measure that space-joined form;
      // measuring the raw source lines would count the indentation too.
      values[key] = block.filter(Boolean).join(' ');
      i = end - 1;
    } else if (inline === '') {
      // A nested mapping or list. Its indented lines belong to this key, so
      // consume them — none of the checked keys use that shape.
      values[key] = '';
      let end = i + 1;
      for (; end < closing; end++) {
        if (lines[end].trim() === '' || /^\s/.test(lines[end])) continue;
        break;
      }
      i = end - 1;
    } else {
      // A plain or quoted scalar can continue onto indented lines, which a YAML
      // loader folds into the value with single spaces. Fold them the same way —
      // measuring only the first line would silently pass a description far
      // over budget, which is the shape a contributor who doesn't know about
      // `|` writes most naturally.
      const parts = [inline];
      let end = i + 1;
      for (; end < closing; end++) {
        if (/^\s+\S/.test(lines[end])) parts.push(lines[end].trim());
        else break;
      }
      i = end - 1;
      values[key] = parts.join(' ').replace(/^['"]|['"]$/g, '');
    }
  }

  const body = lines.slice(closing + 1).join('\n');
  return { keys, values, body };
}

// Report a missing skills root the way the sibling validators report a missing
// file, rather than letting readdirSync throw a raw ENOENT stack trace.
const skillNames = existsSync(skillsRoot)
  ? readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];
if (!existsSync(skillsRoot)) {
  errors.push('plugins/mabl/skills/ is missing — the plugin has no skills to validate');
}

for (const folder of skillNames) {
  const rel = `plugins/mabl/skills/${folder}/SKILL.md`;
  const path = join(skillsRoot, folder, 'SKILL.md');
  if (!existsSync(path)) {
    errors.push(`${rel} is missing — every skill folder needs a SKILL.md`);
    continue;
  }

  const raw = readFileSync(path, 'utf8');
  const frontmatter = parseFrontmatter(raw);
  if (!frontmatter) {
    errors.push(`${rel}: no YAML frontmatter — the file must open with a "---" delimited block`);
    continue;
  }
  const { keys, values, body } = frontmatter;

  // SKILL.md contributes its body only (the description is exempt — see check
  // 4); every other markdown file in the folder contributes its whole text.
  const routableFiles = [[rel, body]];
  for (const file of markdownFilesIn(join(skillsRoot, folder))) {
    if (file === path) continue;
    const relFile = `plugins/mabl/skills/${folder}/${file.slice(join(skillsRoot, folder).length + 1)}`;
    routableFiles.push([relFile, readFileSync(file, 'utf8')]);
  }

  // 1. Folder name equality. CLAUDE.md: a mismatched or prefixed name silently
  // fails to load in Copilot, so this can't be left to review.
  if (!values.name) {
    errors.push(`${rel}: "name" is required`);
  } else if (!/^[a-z0-9-]+$/.test(values.name)) {
    errors.push(
      `${rel}: "name" must be lowercase letters, numbers and hyphens only, got "${values.name}" — a path or colon prefix ("mabl/debug", "mabl:debug") silently fails to load in Copilot`,
    );
  } else if (values.name !== folder) {
    errors.push(
      `${rel}: "name" is "${values.name}" but the folder is "${folder}" — they must match byte-for-byte or the skill silently fails to load in Copilot`,
    );
  }

  // 2. Description budget.
  if (!values.description) {
    errors.push(`${rel}: "description" is required`);
  } else if (values.description.length > DESCRIPTION_LIMIT) {
    errors.push(
      `${rel}: "description" resolves to ${values.description.length} characters, over the ${DESCRIPTION_LIMIT}-character budget — OpenAI Codex hard-truncates a skill description at ${DESCRIPTION_LIMIT} characters mid-word, so everything past that never reaches the matcher that decides whether the skill fires`,
    );
  }

  // 3. Spec-only frontmatter keys.
  for (const key of keys) {
    if (!SPEC_KEYS.includes(key)) {
      errors.push(
        `${rel}: unexpected frontmatter key "${key}" — the Agent Skills spec allows only ${SPEC_KEYS.join(', ')}, and anything else fails claude.ai skill upload, the Skills API, and package_skill.py with a hard "Unexpected key(s)" error`,
      );
    }
  }

  // 4. Every sibling skill a file routes to must come with an availability
  // check in THAT SAME FILE. A skill can be installed on its own, so a pointer
  // to a sibling dangles silently for anyone who has only this one. The check
  // must name the missing skill and must NOT name an install mechanism — the
  // skill cannot know which of the five surfaces the reader installed from.
  //
  // Scoped per file, not per folder: a references/ file is loaded on its own, so
  // an agent acting from one may not have SKILL.md in context. A route stated
  // there with the check back in SKILL.md is a check the reader never sees.
  // Routing belongs in SKILL.md anyway — a references/ file that trips this
  // usually wants rewording rather than a second copy of the check.
  //
  // The frontmatter description is exempt: it routes for the matcher and has a
  // 1024-character budget to keep.
  for (const [file, text] of routableFiles) {
    for (const sibling of skillNames) {
      if (sibling === folder) continue;
      const mention = new RegExp(`(?<![a-z0-9-])${sibling}(?![a-z0-9-])`);
      if (mention.test(text) && !text.includes(AVAILABILITY_MARKER)) {
        errors.push(
          `${file}: names the sibling skill "${sibling}" but never has the reader confirm it is available — a skill can be installed on its own, so that pointer dangles for anyone who has only "${folder}"; add a check in this file saying to confirm "${sibling}" is "${AVAILABILITY_MARKER}" and to name it if it is missing, or reword the mention so nothing routes there (routing belongs in SKILL.md)`,
        );
      }
    }
  }
}

if (errors.length) {
  console.error('Skill validation failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `All ${skillNames.length} skills in plugins/mabl/skills/ are valid: name matches folder, description within ${DESCRIPTION_LIMIT} characters, spec-only frontmatter keys, and an availability check for every sibling it routes to.`,
);
