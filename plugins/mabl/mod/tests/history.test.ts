import {test} from 'claude-code/testing';

import {assert} from './assert';

import type {MablEntities} from '../types';
import {
  HISTORY_KEY,
  HISTORY_LIMIT,
  mergeHistory,
  recentItems,
} from '../features/history';

test('history', async () => {
  assert.equal(HISTORY_KEY, 'history');
  assert.equal(HISTORY_LIMIT, 50);

  const entities: MablEntities = {
    't1-j': {
      kind: 'test',
      id: 't1-j',
      name: 'Login',
      status: 'created',
      updatedAt: 200,
    },
    's1-as': {
      kind: 'authoring',
      id: 's1-as',
      status: 'running',
      updatedAt: 300,
    },
  };

  // Junk in the store is dropped, valid items are kept
  const stored = [
    null,
    'text',
    {kind: 'nope', id: 'x', seenAt: 1},
    {kind: 'test', id: '', seenAt: 1},
    {kind: 'test', id: 'no-seen-at'},
    {kind: 'run', id: 'r1-jr', name: 42, status: 'passed', seenAt: 50},
    {kind: 'run', id: 'r1-jr', status: 'failed', seenAt: 40},
    {kind: 'test', id: 't1-j', name: 'Old login', seenAt: 100},
  ];
  assert.deepEqual(mergeHistory('not an array', {}, 1), []);
  const merged = mergeHistory(stored, entities, 999);
  assert.deepEqual(
    merged.map((item) => [item.id, item.seenAt]),
    [
      ['s1-as', 300],
      ['t1-j', 200],
      ['r1-jr', 50],
    ],
  );
  assert.equal(
    merged.find((item) => item.id === 't1-j')?.name,
    'Login',
    'current entity replaces the stored copy',
  );
  assert.equal(
    merged.find((item) => item.id === 'r1-jr')?.name,
    undefined,
    'a non-string name is dropped',
  );
  assert.equal(
    merged.find((item) => item.id === 'r1-jr')?.status,
    'passed',
    'the newest duplicate wins',
  );

  // Unchanged entities give the same contents
  assert.deepEqual(mergeHistory(merged, entities, 1000), merged);

  // The newest seenAt is kept when the store is ahead of the entity
  assert.equal(
    mergeHistory([{kind: 'test', id: 't1-j', seenAt: 500}], entities, 1).find(
      (item) => item.id === 't1-j',
    )?.seenAt,
    500,
  );

  // Capped at the limit, newest first
  const many = Array.from({length: 70}, (_, index) => ({
    kind: 'test',
    id: `t${index}-j`,
    seenAt: index,
  }));
  const capped = mergeHistory(many, {}, 1);
  assert.equal(capped.length, HISTORY_LIMIT);
  assert.equal(capped[0]?.id, 't69-j');

  // Recent: only items not tracked now, newest first
  assert.deepEqual(
    recentItems(merged, entities).map((item) => item.id),
    ['r1-jr'],
  );
  assert.deepEqual(recentItems(undefined, entities), []);
  assert.deepEqual(
    recentItems(stored, {}).map((item) => item.id),
    ['t1-j', 'r1-jr'],
  );
});
