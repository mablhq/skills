import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitAllowedTools, unpairedMcpEntries } from './allowed-tools.mjs';

const servers = ['mabl', 'chrome-for-mabl', 'chrome-devtools'];

test('splits a comma list and drops empty entries', () => {
  assert.deepEqual(splitAllowedTools('Bash, Read,, mcp__mabl__x '), ['Bash', 'Read', 'mcp__mabl__x']);
  assert.deepEqual(splitAllowedTools(undefined), []);
});

test('a tool listed under both names passes', () => {
  assert.deepEqual(unpairedMcpEntries(['Bash', 'mcp__mabl__get_x', 'mcp__plugin_mabl_mabl__get_x'], servers), []);
});

test('a direct entry without its plugin form fails', () => {
  assert.deepEqual(unpairedMcpEntries(['mcp__mabl__get_x'], servers), [
    '"mcp__mabl__get_x" has no matching "mcp__plugin_mabl_mabl__get_x"',
  ]);
});

test('a plugin entry without its direct form fails', () => {
  assert.deepEqual(unpairedMcpEntries(['mcp__plugin_mabl_mabl__get_x'], servers), [
    '"mcp__plugin_mabl_mabl__get_x" has no matching "mcp__mabl__get_x"',
  ]);
});

test('hyphenated server names and wildcards pair the same way', () => {
  assert.deepEqual(
    unpairedMcpEntries(['mcp__chrome-for-mabl__*', 'mcp__plugin_mabl_chrome-for-mabl__*'], servers),
    [],
  );
  assert.equal(unpairedMcpEntries(['mcp__chrome-devtools__*'], servers).length, 1);
});

test('a server the plugin does not ship is not checked', () => {
  assert.deepEqual(unpairedMcpEntries(['mcp__other__tool'], servers), []);
});
