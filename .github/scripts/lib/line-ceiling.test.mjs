import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LINE_CEILING, checkLineCount, countLines, staleCeilings } from './line-ceiling.mjs';

const ceilings = { 'big-skill': 700 };

test('counts lines the way wc -l does', () => {
  assert.equal(countLines('one\ntwo\n'), 2);
  assert.equal(countLines('no trailing newline'), 0);
  assert.equal(countLines(''), 0);
});

test('an unlisted skill passes at the default ceiling and fails one line over it', () => {
  assert.equal(checkLineCount('new-skill', DEFAULT_LINE_CEILING, ceilings), null);
  assert.match(checkLineCount('new-skill', DEFAULT_LINE_CEILING + 1, ceilings), /over the default ceiling of 500/);
});

test('an unlisted skill under the default ceiling passes', () => {
  assert.equal(checkLineCount('new-skill', 10, ceilings), null);
});

test('a listed skill passes exactly at its ceiling, even above the default', () => {
  assert.equal(checkLineCount('big-skill', 700, ceilings), null);
});

test('a listed skill over its ceiling fails, and the message says the ceiling only goes down', () => {
  const error = checkLineCount('big-skill', 701, ceilings);
  assert.match(error, /over its ceiling of 700/);
  assert.match(error, /can be lowered but not raised/);
});

test('a listed skill under its ceiling fails until the entry is lowered to match', () => {
  assert.match(checkLineCount('big-skill', 690, ceilings), /under its ceiling of 700; lower the entry .* to 690/);
  assert.match(checkLineCount('small-skill', 299, { 'small-skill': 300 }), /under its ceiling of 300/);
});

test('an inherited object key is not a ceiling', () => {
  assert.match(checkLineCount('constructor', DEFAULT_LINE_CEILING + 1, {}), /default ceiling/);
});

test('an entry with no skill folder is reported, and a present one is not', () => {
  assert.deepEqual(staleCeilings(['big-skill'], ceilings), []);
  const [error, ...rest] = staleCeilings(['renamed-skill'], ceilings);
  assert.equal(rest.length, 0);
  assert.match(error, /no skill named "big-skill"; remove the entry, or rename it with the skill/);
});
