// The description budget is measured against whatever parseFrontmatter resolves,
// so its folding rules decide whether that check holds. It has failed open twice
// — once measuring only the first line of a plain scalar, once stopping at a
// blank line inside one — and both times the failure was a silent PASS. Each
// case below pins one resolution rule, so the next shape it can't see fails
// loudly here instead of quietly in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from './frontmatter.mjs';

const wrap = (frontmatter) => `---\n${frontmatter}\n---\nbody text\n`;

test('a plain scalar continuing onto indented lines folds with single spaces', () => {
  const { values } = parseFrontmatter(wrap('name: a\ndescription: one\n  two\n  three'));
  assert.equal(values.description, 'one two three');
});

test('a blank line inside a plain scalar is a fold point, not the end of the value', () => {
  // The regression: stopping here measured the first paragraph and let a
  // 2789-character description pass the budget check clean.
  const { values } = parseFrontmatter(wrap('name: a\ndescription: para one\n\n  para two\n  still two'));
  assert.match(values.description, /para one/);
  assert.match(values.description, /para two/, 'second paragraph must be measured');
  assert.ok(values.description.length > 'para one'.length);
});

test('a RUN of blank lines inside a plain scalar is still one value', () => {
  // A lookahead of exactly one line ends the value at a double-spaced
  // paragraph break, which reported a 2730-character description as being
  // within 1024 characters.
  const { values } = parseFrontmatter(wrap('name: a\ndescription: para one\n\n\n  para two'));
  assert.match(values.description, /para two/, 'text after a double blank must be measured');
  assert.equal(values.description, 'para one\n\npara two');
});

test('a `|` block keeps its line breaks and does not count source indentation', () => {
  const { values } = parseFrontmatter(wrap('name: a\ndescription: |\n  line one\n  line two'));
  assert.equal(values.description, 'line one\nline two\n');
});

test('a `>` block folds line breaks to SPACES, unlike `|`', () => {
  // The parser joined with \n for both indicators while its own comment claimed
  // otherwise. Length-neutral for a single break, so the budget check never
  // caught it — and the old test asserted the wrong string as correct.
  const { values } = parseFrontmatter(wrap('name: a\ndescription: >\n  line one\n  line two'));
  assert.equal(values.description, 'line one line two\n');
});

test('a `>` block turns a blank line into a newline, not a space', () => {
  const { values } = parseFrontmatter(wrap('name: a\ndescription: >\n  one\n\n  two'));
  assert.equal(values.description, 'one\ntwo\n');
});

test('a block scalar spends budget on its blank lines', () => {
  // filter(Boolean) used to drop these, undercounting a multi-paragraph
  // description by one character per break.
  const { values } = parseFrontmatter(wrap('name: a\ndescription: |\n  one\n\n  two'));
  assert.equal(values.description, 'one\n\ntwo\n');
});

test('clip chomping keeps exactly one trailing newline', () => {
  // The default for `|` and `>`. Stripping it measured every block-scalar
  // description one character short of what a loader resolves.
  assert.equal(parseFrontmatter(wrap('name: a\ndescription: |\n  one\n')).values.description, 'one\n');
});

test('the `-` and `+` chomping indicators override clip', () => {
  assert.equal(parseFrontmatter(wrap('name: a\ndescription: |-\n  one')).values.description, 'one');
  assert.equal(parseFrontmatter(wrap('name: a\ndescription: |+\n  one\n\n')).values.description, 'one\n\n');
});

test('quotes are stripped only as a matching pair', () => {
  // Stripping each end independently ate the closing quote off any description
  // ending in a quoted word — shortening the string the budget is measured on.
  const { values } = parseFrontmatter(wrap('name: a\ndescription: fire when the user says "hello"'));
  assert.equal(values.description, 'fire when the user says "hello"');
  assert.equal(parseFrontmatter(wrap("name: a\ndescription: it belongs to the users'")).values.description,
    "it belongs to the users'");
});

test('an inline # comment is not part of the value', () => {
  // check 1 compares `name` to the folder byte-for-byte, so a contributor
  // writing an ordinary YAML comment used to fail CI on valid YAML.
  assert.equal(parseFrontmatter(wrap('name: mabl-debug  # a comment')).values.name, 'mabl-debug');
  assert.equal(parseFrontmatter(wrap('name: a\ndescription: fix issue #123')).values.description, 'fix issue');
});

test('a # inside quotes or a block scalar stays literal', () => {
  assert.equal(parseFrontmatter(wrap('name: a\ndescription: "keeps # this"')).values.description, 'keeps # this');
  assert.equal(parseFrontmatter(wrap('name: a\ndescription: |\n  a # literal hash')).values.description,
    'a # literal hash\n');
});

test('a comment after a closing quote is dropped', () => {
  assert.equal(parseFrontmatter(wrap('name: a\ndescription: "quoted"  # real comment')).values.description,
    'quoted');
});

test('a flush-left --- ends the block scalar, matching a real loader', () => {
  // Not a truncation bug: block content must be indented past its key, so a
  // pasted flush-left horizontal rule is outside the scalar for PyYAML too.
  const { values } = parseFrontmatter('---\nname: a\ndescription: |\n  intro\n---\n  more\n---\nbody\n');
  assert.equal(values.description, 'intro\n');
});

test('a quoted scalar loses its quotes', () => {
  const { values } = parseFrontmatter(wrap('name: a\ndescription: "quoted value"'));
  assert.equal(values.description, 'quoted value');
});

test('CRLF line endings still resolve every key', () => {
  // git's default on Windows. \r is a line terminator to a JS regex, so this
  // used to report a valid file as having no frontmatter at all.
  const raw = '---\r\nname: mabl-init\r\ndescription: set up mabl\r\n---\r\nbody\r\n';
  const parsed = parseFrontmatter(raw);
  assert.notEqual(parsed, null, 'CRLF frontmatter must parse');
  assert.equal(parsed.values.name, 'mabl-init');
  assert.equal(parsed.values.description, 'set up mabl');
});

test('a nested mapping is recorded as a key without swallowing the key after it', () => {
  const { keys, values } = parseFrontmatter(
    wrap('name: a\nmetadata:\n  nested: value\ndescription: after the mapping'),
  );
  assert.ok(keys.includes('metadata'), 'the nested key is still reported for the spec-key check');
  assert.equal(values.description, 'after the mapping');
});

test('a colon inside a block scalar is not read as a new key', () => {
  const { keys } = parseFrontmatter(wrap('name: a\ndescription: |\n  fire when: the user asks'));
  assert.deepEqual(keys, ['name', 'description']);
});

test('a colon inside a one-line plain scalar is not read as a new key', () => {
  // The block-scalar case above never reaches the key pattern — the block branch
  // consumes those lines. This is the shape that does reach it, and the shape a
  // description is most often written in, so it is what pins the anchor.
  const { keys, values } = parseFrontmatter(wrap('name: a\ndescription: use this when: the user asks'));
  assert.deepEqual(keys, ['name', 'description']);
  assert.equal(values.description, 'use this when: the user asks');
});

test('a key AFTER a block scalar is still reported', () => {
  // The only survivor of this suite that failed OPEN: consuming one line too
  // many swallows the following key, and check 3 reads `keys` to reject the
  // Claude-only frontmatter that breaks claude.ai upload. A swallowed `model`
  // is a skill that validates green and then fails on the surface.
  const { keys, values } = parseFrontmatter(wrap('name: a\ndescription: |\n  a block\n  of text\nmodel: opus'));
  assert.deepEqual(keys, ['name', 'description', 'model']);
  assert.equal(values.model, 'opus');
});

test('no opening delimiter resolves to null', () => {
  assert.equal(parseFrontmatter('name: a\ndescription: b\n'), null);
  // With no `---` anywhere, the closing search returns null on its own and the
  // opening check is never what answers. A `---` further down — a horizontal
  // rule in a file that simply has no frontmatter — is what actually exercises
  // it, and must not be read as the close of a block that never opened.
  assert.equal(parseFrontmatter('intro prose\nname: sneaky\n---\nafter\n'), null);
});

test('an unclosed frontmatter block resolves to null', () => {
  assert.equal(parseFrontmatter('---\nname: a\ndescription: b\n'), null);
});

test('the body starts after the closing delimiter', () => {
  const { body } = parseFrontmatter(wrap('name: a\ndescription: b'));
  assert.match(body, /^body text/);
});
