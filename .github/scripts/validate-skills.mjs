#!/usr/bin/env node
// Validates the skills in plugins/mabl/skills/ against the constraints the
// install surfaces impose but no official validator checks:
//   1. Frontmatter `name` equals the folder name — a mismatched or prefixed
//      name silently fails to load in Copilot (see CLAUDE.md).
//   2. The resolved `description` fits in 1024 characters — OpenAI Codex hard-
//      truncates there, mid-word, so anything past it never reaches the matcher
//      that decides whether the skill fires.
//   3. Only the six frontmatter keys the Agent Skills spec allows.
//   4. A file that routes to a sibling skill declares it with
//      "**Requires `<name>`.**" — a skill can be installed on its own, and it
//      cannot know which of the five surfaces installed it, so it names the
//      skill it needs rather than an install command.
// Exits non-zero with a clear message on any failure.
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './lib/frontmatter.mjs';

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

// A hand-off declares its dependency with this token, naming the skill it needs.
// A structural declaration rather than a sentence: CI can verify it exactly, it
// reads as prose, it names the skill so the error message is right, and every
// other word around it stays free to edit. What CI cannot verify is that the
// fallback beside it is correct — that stays a review item.
const requiresDeclaration = (sibling) => `**Requires \`${sibling}\`.**`;

// A skill name — folder or frontmatter — is lowercase letters, numbers, hyphens.
const SKILL_NAME = /^[a-z0-9-]+$/;

// A folder name reaches `new RegExp` below, and on a public repo anyone can open
// a PR that adds a folder. An unbalanced bracket throws a raw SyntaxError before
// any collected error prints; `(a+)+$` backtracks forever against any .md body,
// which with no job timeout is a free six-hour runner. Gate, then escape.
const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every .md under a skill folder, recursively, so a route stated in references/
// is checked too.
function markdownFilesIn(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Vendored and tooling trees are not ours to lint: a skill folder may ship
    // scripts with their own dependencies, and a third-party README naming a
    // mabl skill is not a hand-off anyone here can fix.
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    // Never follow a symlink. `gh skill install` copies the folder, so a link
    // out of it arrives broken on the reader's machine anyway.
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) found.push(...markdownFilesIn(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(full);
  }
  return found;
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
} else if (skillNames.length === 0) {
  // Otherwise a wiped-out skills directory reports "All 0 skills are valid".
  errors.push('plugins/mabl/skills/ has no skill folders — the plugin ships no skills');
}

// Report a folder name that can't be a skill name, and drop it before it is
// used as one. Check 1 constrains the FRONTMATTER name; the FOLDER name is what
// reaches the pattern below.
const validSkillNames = skillNames.filter((folder) => {
  if (SKILL_NAME.test(folder)) return true;
  // JSON.stringify, not the raw name: this is the one place a rejected name is
  // still printed, and a directory name may contain a newline, which would put
  // attacker text at the start of a log line where Actions reads `::` commands.
  errors.push(`plugins/mabl/skills/${JSON.stringify(folder)}: folder name must be lowercase letters, numbers and hyphens only`);
  return false;
});

// One pattern per sibling, compiled once from a name already proven clean.
const mentionPatterns = new Map(
  validSkillNames.map((name) => [name, new RegExp(`(?<![a-z0-9-])${escapeForRegExp(name)}(?![a-z0-9-])`)]),
);

for (const folder of validSkillNames) {
  const rel = `plugins/mabl/skills/${folder}/SKILL.md`;
  const path = join(skillsRoot, folder, 'SKILL.md');
  // lstat, so a symlink reports as itself rather than as its target. Same rule
  // markdownFilesIn applies to the rest of the folder, and it binds harder here:
  // a linked SKILL.md is the file `gh skill install` must copy, so a link out of
  // the folder ships broken to every surface while validating green. Reading one
  // would also let a PR aim this at any path on the runner, or at a FIFO that
  // blocks until the job timeout.
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) {
    errors.push(`${rel} is missing — every skill folder needs a SKILL.md`);
    continue;
  }
  if (!stat.isFile()) {
    errors.push(`${rel} must be a regular file — a symlink or pipe here is not copied by \`gh skill install\``);
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
    for (const [sibling, mention] of mentionPatterns) {
      if (sibling === folder) continue;
      if (mention.test(text) && !text.includes(requiresDeclaration(sibling))) {
        errors.push(
          `${file}: names the sibling skill "${sibling}" but never declares it as a dependency — a skill can be installed on its own, so that pointer dangles for anyone who has only "${folder}"; add "${requiresDeclaration(sibling)}" in this file at the hand-off, followed by what to do when the skill isn't there, or reword the mention so nothing routes there (routing belongs in SKILL.md)`,
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
  `All ${validSkillNames.length} skills in plugins/mabl/skills/ are valid: name matches folder, description within ${DESCRIPTION_LIMIT} characters, spec-only frontmatter keys, and a declared dependency for every sibling it routes to.`,
);
