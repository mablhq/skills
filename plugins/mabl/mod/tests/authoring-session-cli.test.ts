import {test} from 'claude-code/testing';

import {assert} from './assert';

import {mergeEntities} from '../core/util';
import type {EntityUpdate} from '../core/util';
import {captureAuthoring} from '../features/authoring';

const bash = (command: string, text: string): EntityUpdate[] =>
  captureAuthoring({tool: 'Bash', args: {command}, text});

test('mabl agent session reads status and the created test', () => {
  const [running] = bash(
    'mabl agent session s1-as',
    JSON.stringify(
      {sessionId: 's1-as', agentType: 'test_authoring', status: 'running'},
      undefined,
      2,
    ),
  );
  assert.equal(running?.id, 's1-as');
  assert.equal(running?.status, 'running');

  const [session, test] = bash(
    'mabl agent session s1-as --progress',
    JSON.stringify(
      {
        sessionId: 's1-as',
        agentType: 'test_authoring',
        status: 'completed',
        progress: {stepCount: 1, steps: [], createdTestId: 't1-j'},
      },
      undefined,
      2,
    ),
  );
  assert.equal(session?.status, 'completed');
  assert.equal(session?.testId, 't1-j');
  assert.equal(test?.kind, 'test');
  assert.equal(test?.id, 't1-j');

  const [flagged] = bash(
    'mabl agent session --session-id s3-as --messages 20 --since-last-prompt',
    '{"sessionId":"s3-as","agentType":"flow_authoring","status":"needs_attention"}',
  );
  assert.equal(flagged?.id, 's3-as');
  assert.equal(flagged?.status, 'needs_attention');

  assert.deepEqual(
    bash(
      'mabl agent session a1-as',
      '{"sessionId":"a1-as","agentType":"workspace_assistant","status":"running"}',
    ),
    [],
    'only authoring sessions are tracked',
  );
  assert.deepEqual(
    bash('mabl agent session s1-as', 'Error: not found'),
    [],
    'a failed read changes nothing',
  );
});

test('mabl agent message marks a tracked session as woken', () => {
  const [sent] = bash(
    'mabl agent message s1-as "Use the Webapp user credential"',
    '{"delivered":true,"messageId":"m1"}',
  );
  assert.equal(sent?.id, 's1-as');
  assert.equal(sent?.status, 'queued');

  const paused = {
    's1-as': {
      kind: 'authoring' as const,
      id: 's1-as',
      status: 'needs_attention',
      updatedAt: 1,
    },
  };
  assert.equal(
    mergeEntities(paused, sent ? [sent] : [], 2)['s1-as']?.status,
    'queued',
  );
  assert.deepEqual(
    mergeEntities({}, sent ? [sent] : [], 2),
    {},
    'a message to an untracked session, such as the assistant, adds nothing',
  );

  const [fromFile] = bash(
    'mabl agent message s2-as --file answer.txt --idempotency-key k1',
    '{"delivered":true,"messageId":"m2"}',
  );
  assert.equal(fromFile?.id, 's2-as');
  assert.deepEqual(
    bash('mabl agent message s1-as "hi"', 'Error: forbidden'),
    [],
    'an undelivered message changes nothing',
  );
});
