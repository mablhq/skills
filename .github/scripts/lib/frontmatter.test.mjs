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

test('a `|` block resolves to one string and does not count source indentation', () => {
  const { values } = parseFrontmatter(wrap('name: a\ndescription: |\n  line one\n  line two'));
  assert.equal(values.description, 'line one\nline two');
});

test('a `>` block folds to a single measurable string', () => {
  const { values } = parseFrontmatter(wrap('name: a\ndescription: >\n  line one\n  line two'));
  assert.equal(values.description, 'line one\nline two');
});

test('a block scalar spends budget on its blank lines', () => {
  // filter(Boolean) used to drop these, undercounting a multi-paragraph
  // description by one character per break.
  const { values } = parseFrontmatter(wrap('name: a\ndescription: |\n  one\n\n  two'));
  assert.equal(values.description, 'one\n\ntwo');
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

test('no opening delimiter resolves to null', () => {
  assert.equal(parseFrontmatter('name: a\ndescription: b\n'), null);
});

test('an unclosed frontmatter block resolves to null', () => {
  assert.equal(parseFrontmatter('---\nname: a\ndescription: b\n'), null);
});

test('the body starts after the closing delimiter', () => {
  const { body } = parseFrontmatter(wrap('name: a\ndescription: b'));
  assert.match(body, /^body text/);
});
