import {test} from 'claude-code/testing';

import {assert, stubJsx} from './assert';

import type {MablEntity} from '../types';
import type {EntityUpdate} from '../core/util';
import type {Actions, Els, Ops, Settings, ToolResult} from '../core/feature';
import {
  answerCall,
  captureAuthoring,
  pauseOf,
  authoringFeature,
  withPause,
} from '../features/authoring';
import type {AuthoringDetail} from '../features/authoring';

test('authoring-answer', async () => {
  stubJsx();
  type Node = {
    tag: string;
    props: Record<string, unknown>;
    children: unknown[];
  };
  const nodes = (tree: unknown, tag: string): Node[] => {
    if (!tree || typeof tree !== 'object') {
      return [];
    }
    const node = tree as Node;
    const own = node.tag === tag ? [node] : [];

    return [
      ...own,
      ...(node.children ?? []).flatMap((child) => nodes(child, tag)),
    ];
  };
  const text = (tree: unknown): string =>
    typeof tree === 'string' || typeof tree === 'number'
      ? String(tree)
      : tree && typeof tree === 'object'
        ? ((tree as Node).children ?? []).map(text).join('')
        : '';

  const PAUSED = {
    sessionStatus: 'needs_attention',
    question: 'Which user should log in?',
    loopNumber: 2,
    reClarification: true,
    planDiffSummary: 'Added login',
  };
  const result = (structured: unknown, isError = false): ToolResult => ({
    isError,
    structured,
    text: JSON.stringify(structured),
  });

  // pauseOf / withPause
  assert.deepEqual(pauseOf(PAUSED), {
    question: 'Which user should log in?',
    loopNumber: 2,
    reClarification: true,
    planDiffSummary: 'Added login',
  });
  assert.equal(
    pauseOf({sessionStatus: 'running', question: 'stale'}),
    undefined,
  );
  const paused: AuthoringDetail = withPause({}, pauseOf(PAUSED));
  assert.equal(paused.pause?.loopNumber, 2);
  assert.equal(
    withPause(paused, pauseOf(PAUSED)),
    paused,
    'same pause keeps the same object',
  );
  assert.deepEqual(withPause(paused, undefined), {});

  // answerCall
  const entity: MablEntity = {
    kind: 'authoring',
    id: 's1-as',
    status: 'needs_attention',
    mcpServer: 'mabl-alt',
    updatedAt: 1,
  };
  assert.deepEqual(answerCall(entity, paused.pause, '  alice  ', 'mabl-alt'), {
    server: 'mabl-alt',
    args: {sessionId: 's1-as', text: 'alice', expectedLoopNumber: 2},
  });
  assert.equal(answerCall(entity, paused.pause, '   ', 'mabl-alt'), undefined);
  assert.equal(
    answerCall(entity, {question: 'q'}, 'x', 'mabl-alt'),
    undefined,
    'no loop number, no answer',
  );
  assert.equal(
    answerCall(
      {...entity, mcpServer: undefined, cli: 'mabl'},
      paused.pause,
      'x',
      'plugin:mabl:mabl',
    )?.server,
    'plugin:mabl:mabl',
  );

  // The answer tool's results, MCP and CLI
  const answered = (structured: unknown, textOut = ''): EntityUpdate[] =>
    captureAuthoring({
      tool: 'mcp__mabl-alt__mabl_authoring_answer',
      args: {sessionId: 's1-as', text: 'a', expectedLoopNumber: 2},
      text: textOut,
      structured,
    });
  assert.equal(
    answered({outcome: 'resumed', sessionStatus: 'queued'})[0]?.status,
    'queued',
  );
  assert.equal(
    answered({outcome: 're_clarification', question: 'More?'})[0]?.status,
    undefined,
    're-clarification keeps needs_attention',
  );
  assert.equal(
    answered(undefined, 'resumed (status: running)')[0]?.status,
    'running',
  );
  const [cliAnswer] = captureAuthoring({
    tool: 'Bash',
    args: {
      command: 'mabl agent authoring answer --session-id s1-as --text alice',
    },
    text: '{"outcome":"resumed","sessionStatus":"queued"}',
  });
  assert.equal(cliAnswer?.status, 'queued');
  const [cliStatus] = captureAuthoring({
    tool: 'Bash',
    args: {command: 'mabl agent authoring status --session-id s1-as'},
    text: '{"sessionStatus":"running","branchName":"feat-x"}',
  });
  assert.equal(cliStatus?.branch, 'feat-x');

  // Polls with a fake ops
  const STEPS = {
    sessionStatus: 'needs_attention',
    stepCount: 1,
    steps: [{path: '1', text: 'Visit', kind: 'step'}],
  };
  const fakeOps = (answers: Record<string, unknown>, calls: string[]): Ops => ({
    callTool: async (_server, tool) => {
      calls.push(tool);

      return result(answers[tool]);
    },
    run: async () => ({
      exitCode: 0,
      stdout: JSON.stringify(PAUSED),
      stderr: '',
    }),
    mtime: async () => undefined,
    read: async () => undefined,
    home: '/home',
    serverFor: (entity: {mcpServer?: string}) => entity.mcpServer ?? 'mabl',
    now: async () => 100,
  });
  const steps: Settings = {showSessionSteps: true, stepsPollMs: 15_000};
  const status: Settings = {showSessionSteps: false, stepsPollMs: 15_000};

  const main = async (): Promise<void> => {
    const calls: string[] = [];
    const first = await authoringFeature.poll!(
      fakeOps(
        {get_mabl_authoring_steps: STEPS, mabl_authoring_status: PAUSED},
        calls,
      ),
      entity,
      undefined,
      steps,
    );
    assert.deepEqual(calls, [
      'get_mabl_authoring_steps',
      'mabl_authoring_status',
    ]);
    const firstDetail = first.detail as AuthoringDetail;
    assert.equal(firstDetail.pause?.question, PAUSED.question);
    assert.equal(firstDetail.steps?.stepCount, 1);

    const again = await authoringFeature.poll!(
      fakeOps(
        {get_mabl_authoring_steps: STEPS, mabl_authoring_status: PAUSED},
        [],
      ),
      entity,
      firstDetail,
      steps,
    );
    assert.equal(again.detail, undefined, 'nothing changed, no new detail');

    const followUp = {...PAUSED, question: 'And the password?', loopNumber: 3};
    const asked = await authoringFeature.poll!(
      fakeOps(
        {get_mabl_authoring_steps: STEPS, mabl_authoring_status: followUp},
        [],
      ),
      entity,
      firstDetail,
      steps,
    );
    assert.equal(
      (asked.detail as AuthoringDetail).pause?.loopNumber,
      3,
      'a re-clarification replaces the question',
    );

    const failing: Ops = {
      ...fakeOps({get_mabl_authoring_steps: STEPS}, []),
      callTool: async (_s, tool) =>
        result(
          tool === 'mabl_authoring_status' ? {} : STEPS,
          tool === 'mabl_authoring_status',
        ),
    };
    const kept = await authoringFeature.poll!(
      failing,
      entity,
      firstDetail,
      steps,
    );
    assert.equal(
      kept.detail,
      undefined,
      'a failed status call keeps the stored question',
    );

    const resumedCalls: string[] = [];
    const resumed = await authoringFeature.poll!(
      fakeOps(
        {get_mabl_authoring_steps: {...STEPS, sessionStatus: 'running'}},
        resumedCalls,
      ),
      {...entity, status: 'running'},
      firstDetail,
      steps,
    );
    assert.deepEqual(resumedCalls, ['get_mabl_authoring_steps']);
    assert.equal(
      (resumed.detail as AuthoringDetail).pause,
      undefined,
      'question cleared once running',
    );
    assert.equal((resumed.detail as AuthoringDetail).steps?.stepCount, 1);

    const viaStatus = await authoringFeature.poll!(
      fakeOps({mabl_authoring_status: PAUSED}, []),
      entity,
      undefined,
      status,
    );
    assert.equal((viaStatus.detail as AuthoringDetail).pause?.loopNumber, 2);
    const cliEntity: MablEntity = {
      kind: 'authoring',
      id: 's2-as',
      status: 'needs_attention',
      cli: 'mabl',
      updatedAt: 1,
    };
    const viaCli = await authoringFeature.poll!(
      fakeOps({}, []),
      cliEntity,
      undefined,
      status,
    );
    assert.equal(
      (viaCli.detail as AuthoringDetail).pause?.question,
      PAUSED.question,
    );
    assert.equal(viaCli.updates[0]?.status, 'needs_attention');
    const cleared = await authoringFeature.poll!(
      fakeOps({mabl_authoring_status: {sessionStatus: 'running'}}, []),
      entity,
      firstDetail,
      status,
    );
    assert.equal((cleared.detail as AuthoringDetail).pause, undefined);
    assert.ok(
      (cleared.detail as AuthoringDetail).steps,
      'clearing the question keeps the steps',
    );

    // Render
    const els = {
      Box: function Box() {},
      Text: function Text() {},
      Button: function Button() {},
      Link: function Link() {},
      Input: function Input() {},
    } as unknown as Els;
    const sent: {
      server: string;
      tool: string;
      args: Record<string, unknown>;
    }[] = [];
    const filled: string[] = [];
    const polled: string[] = [];
    const actions: Actions = {
      fillPrompt: (value) => void filled.push(value),
      callTool: async (server, tool, args) => {
        sent.push({server, tool, args});

        return result({outcome: 'resumed', sessionStatus: 'queued'});
      },
      track: () => {},
      pollNow: (id) => void polled.push(id),
      openTab: () => {},
      openUrl: () => {},
      notify: () => undefined,
      setView: () => undefined,
      serverFor: (entity: {mcpServer?: string}) => entity.mcpServer ?? 'mabl',
      updateDetail: () => {},
    };
    const context = {
      entity,
      detail: firstDetail,
      entities: {[entity.id]: entity},
      rows: 30,
      columns: 100,
      settings: steps,
      actions,
    };
    const tree = authoringFeature.render(els, context);
    assert.match(
      text(tree),
      /Question \(follow-up\):Which user should log in\?/,
    );
    const [input] = nodes(tree, 'Input');
    assert.equal(input?.props.key, 'answer-s1-as-2');
    assert.equal(input?.props.label, 'Your answer');
    assert.equal(input?.props.submitLabel, 'Send');
    (input?.props.onSubmit as (value: string) => void)('alice');
    for (let tick = 0; tick < 10; tick++) await Promise.resolve();
    assert.deepEqual(sent, [
      {
        server: 'mabl-alt',
        tool: 'mabl_authoring_answer',
        args: {sessionId: 's1-as', text: 'alice', expectedLoopNumber: 2},
      },
    ]);
    assert.deepEqual(polled, ['s1-as']);
    const [ask] = nodes(tree, 'Button');
    (ask?.props.onPress as () => void)();
    assert.deepEqual(filled, [
      'Read the open question on mabl test authoring session s1-as with mabl_authoring_status, then answer it with mabl_authoring_answer. My guidance: ',
    ]);

    const {Input: _input, ...mobile} = els;
    const mobileTree = authoringFeature.render(mobile as Els, context);
    assert.equal(nodes(mobileTree, 'Input').length, 0);
    assert.equal(nodes(mobileTree, 'Button').length, 1);

    const running = authoringFeature.render(els, {
      ...context,
      entity: {...entity, status: 'running'},
    });
    assert.equal(
      nodes(running, 'Input').length + nodes(running, 'Button').length,
      0,
      'no question once running',
    );
  };

  await main();
});

test('CLI answers and initiations name their session and test', () => {
  const [answered] = captureAuthoring({
    tool: 'Bash',
    args: {
      command: 'mabl agent authoring answer s9-as "use the staging login"',
    },
    text: '{"sessionStatus":"queued"}',
  });
  assert.equal(answered?.id, 's9-as', 'the session id is positional');
  const [initiated] = captureAuthoring({
    tool: 'Bash',
    args: {
      command: `mabl agent authoring initiate --test-information '{"test_id":"t7-j","test_case":"x; y"}'`,
    },
    text: '{"sessionId":"s7-as"}',
  });
  assert.equal(
    initiated?.testId,
    't7-j',
    'the test id sits inside quoted JSON',
  );
});
