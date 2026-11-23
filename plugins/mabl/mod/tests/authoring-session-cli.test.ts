import {test} from 'claude-code/testing';

import {assert} from './assert';

import {mergeEntities} from '../core/util';
import type {EntityUpdate} from '../core/util';
import type {MablEntities} from '../types';
import {captureAuthoring, positionalId} from '../features/authoring';

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

  const [beforeId] = bash(
    'mabl agent session --progress s4-as',
    '{"agentType":"test_authoring","status":"running"}',
  );
  assert.equal(beforeId?.id, 's4-as', 'a flag before the id is not the id');
  const [afterValue] = bash(
    'mabl agent session --messages 20 "s5-as" --since-last-prompt',
    '{"agentType":"test_authoring","status":"running"}',
  );
  assert.equal(
    afterValue?.id,
    's5-as',
    'a flag value is skipped, quotes removed',
  );
  const [fromOutput] = bash(
    'mabl agent session --progress s6-as',
    '{"sessionId":"s7-as","agentType":"test_authoring","status":"running"}',
  );
  assert.equal(fromOutput?.id, 's7-as', 'the output names the session');
  assert.equal(
    positionalId("agent message --file a.txt 's8-as' text"),
    's8-as',
  );
  assert.equal(positionalId('agent session --progress'), undefined);

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

test('mabl agent message wakes only a paused cloud session', () => {
  const [sent] = bash(
    'mabl agent message s1-as "Use the Webapp user credential"',
    '{"delivered":true,"messageId":"m1"}',
  );
  assert.equal(sent?.id, 's1-as');
  assert.equal(sent?.status, 'queued');
  const tracked = (status: string, isLocal?: boolean): MablEntities => ({
    's1-as': {kind: 'authoring', id: 's1-as', status, isLocal, updatedAt: 1},
  });
  const apply = (current: MablEntities): MablEntities =>
    mergeEntities(current, sent ? [sent] : [], 2);

  assert.equal(apply(tracked('needs_attention'))['s1-as']?.status, 'queued');
  const completed = tracked('completed');
  assert.equal(apply(completed), completed, 'a completed session stays put');
  const running = tracked('running');
  assert.equal(apply(running), running);
  const local = tracked('needs_attention', true);
  assert.equal(apply(local), local, 'the inbox does not wake a local session');
  assert.deepEqual(
    apply({}),
    {},
    'a message to an untracked session, such as the assistant, adds nothing',
  );

  const [fromFile] = bash(
    'mabl agent message --file answer.txt --idempotency-key k1 s2-as',
    '{"delivered":true,"messageId":"m2"}',
  );
  assert.equal(fromFile?.id, 's2-as');
  assert.deepEqual(
    bash('mabl agent message s1-as "hi"', 'Error: forbidden'),
    [],
    'an undelivered message changes nothing',
  );
});
